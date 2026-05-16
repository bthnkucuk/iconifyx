import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildTrigramShards,
  bucketLetter,
  writeTrigramShards,
} from './trigram_shard_codegen.ts';

const SAMPLE: Array<{ prefix: string; name: string }> = [
  { prefix: 'mdi', name: 'home' },
  { prefix: 'mdi', name: 'home-outline' },
  { prefix: 'mdi', name: 'house' },
  { prefix: 'ph', name: 'house-bold' },
  { prefix: 'ph', name: 'acorn' },
  { prefix: 'lucide', name: 'arrow-down' },
  { prefix: 'lucide', name: 'a' }, // < 3 chars — skipped
  { prefix: 'lucide', name: '01-circle' }, // digit-leading bucket
  { prefix: 'lucide', name: '-private' }, // separator-leading bucket
];

describe('bucketLetter', () => {
  test('lowercase letters map to themselves', () => {
    expect(bucketLetter('a')).toBe('a');
    expect(bucketLetter('z')).toBe('z');
  });
  test('uppercase letters lowercase', () => {
    expect(bucketLetter('H')).toBe('h');
  });
  test('digits keep their identity', () => {
    expect(bucketLetter('0')).toBe('0');
    expect(bucketLetter('9')).toBe('9');
  });
  test('separators are valid', () => {
    expect(bucketLetter('-')).toBe('-');
    expect(bucketLetter('_')).toBe('_');
  });
  test('other chars drop', () => {
    expect(bucketLetter(' ')).toBeNull();
    expect(bucketLetter('+')).toBeNull();
    expect(bucketLetter('')).toBeNull();
    expect(bucketLetter('ab')).toBeNull();
  });
});

describe('buildTrigramShards', () => {
  test('short names produce no trigrams', () => {
    const { shards } = buildTrigramShards([
      { prefix: 'x', name: 'ab' },
      { prefix: 'x', name: 'a' },
    ]);
    expect(shards.size).toBe(0);
  });

  test('emits one bucket per distinct first-char-of-trigram', () => {
    const { buckets } = buildTrigramShards(SAMPLE);
    // "home" → hom (h), ome (o), "house" → hou (h), ous (o), use (u), …
    // "acorn" → aco (a), cor (c), orn (o), …
    // "arrow-down" → arr (a), rro (r), … 'w-d' (w), '-do' (-), 'dow' (d), …
    // "01-circle" → '01-' (0), '1-c' (1), '-ci' (-), 'cir' (c), …
    // "-private" → '-pr' (-), 'pri' (p), 'riv' (r), …
    for (const b of ['a', 'c', 'd', 'h', 'o', 'p', 'r', 'u', '0', '1', '-']) {
      expect(buckets).toContain(b);
    }
  });

  test('iconTable indices in posting list resolve to right icons', () => {
    const { shards } = buildTrigramShards(SAMPLE);
    const h = shards.get('h');
    expect(h).toBeDefined();
    // "hom" trigram is in h-bucket; it covers mdi:home + mdi:home-outline.
    const homPosting = h!.trigrams['hom'];
    expect(homPosting).toBeDefined();
    const resolved = new Set(homPosting!.map((i) => h!.iconTable[i]!.join(':')));
    expect(resolved.has('mdi:home')).toBe(true);
    expect(resolved.has('mdi:home-outline')).toBe(true);
    // "hou" covers mdi:house + ph:house-bold.
    const houPosting = h!.trigrams['hou'];
    expect(houPosting).toBeDefined();
    const resolvedHou = new Set(
      houPosting!.map((i) => h!.iconTable[i]!.join(':'))
    );
    expect(resolvedHou.has('mdi:house')).toBe(true);
    expect(resolvedHou.has('ph:house-bold')).toBe(true);
  });

  test('posting lists are sorted ascending', () => {
    const { shards } = buildTrigramShards(SAMPLE);
    for (const shard of shards.values()) {
      for (const posting of Object.values(shard.trigrams)) {
        for (let i = 1; i < posting.length; i++) {
          expect(posting[i]!).toBeGreaterThan(posting[i - 1]!);
        }
      }
    }
  });

  test('intersection matches in-memory baseline', () => {
    const { shards } = buildTrigramShards(SAMPLE);
    // Query "home" → trigrams hom (h), ome (o). Expected matches: any
    // name that contains BOTH "hom" and "ome" — i.e. "home" + "home-outline".
    const hShard = shards.get('h')!;
    const oShard = shards.get('o')!;
    const hom = new Set(
      (hShard.trigrams['hom'] ?? []).map(
        (i) => hShard.iconTable[i]!.join(':')
      )
    );
    const ome = new Set(
      (oShard.trigrams['ome'] ?? []).map(
        (i) => oShard.iconTable[i]!.join(':')
      )
    );
    const inter = [...hom].filter((x) => ome.has(x));
    expect(new Set(inter)).toEqual(
      new Set(['mdi:home', 'mdi:home-outline'])
    );
    // Baseline: linear scan
    const baseline = SAMPLE.filter(
      (r) => r.name.toLowerCase().includes('home')
    ).map((r) => `${r.prefix}:${r.name}`);
    expect(new Set(baseline)).toEqual(new Set(inter));
  });

  test('deduplicates trigrams within a single icon name', () => {
    // "ababab" → trigrams aba, bab, aba, bab — should only contribute
    // each posting-list entry ONCE.
    const { shards } = buildTrigramShards([{ prefix: 'x', name: 'ababab' }]);
    const a = shards.get('a')!;
    const aba = a.trigrams['aba']!;
    expect(aba.length).toBe(1);
  });
});

describe('writeTrigramShards', () => {
  test('emits one file per bucket + manifest.json', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tri-shard-'));
    const res = await writeTrigramShards(SAMPLE, dir);
    expect(res.totalBytes).toBeGreaterThan(0);
    const files = await readdir(dir);
    expect(files).toContain('manifest.json');
    expect(files).toContain('h.json');
    expect(files).toContain('a.json');
    // Manifest cross-check: every listed bucket exists on disk.
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'manifest.json'), 'utf8')
    );
    expect(manifest.schemaVersion).toBe(1);
    for (const b of manifest.buckets) {
      expect(files).toContain(`${b}.json`);
    }
  });

  test('on-disk shard intersection matches in-memory baseline', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tri-shard-'));
    await writeTrigramShards(SAMPLE, dir);
    const hShard = JSON.parse(
      await readFile(path.join(dir, 'h.json'), 'utf8')
    );
    const oShard = JSON.parse(
      await readFile(path.join(dir, 'o.json'), 'utf8')
    );
    const hom = new Set<string>(
      (hShard.trigrams.hom as number[]).map(
        (i) => (hShard.iconTable as Array<[string, string]>)[i]!.join(':')
      )
    );
    const ome = new Set<string>(
      (oShard.trigrams.ome as number[]).map(
        (i) => (oShard.iconTable as Array<[string, string]>)[i]!.join(':')
      )
    );
    const inter = [...hom].filter((x) => ome.has(x)).sort();
    expect(inter).toEqual(['mdi:home', 'mdi:home-outline']);
  });

  test('overwrites stale buckets between regens', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tri-shard-'));
    await writeTrigramShards(
      [{ prefix: 'x', name: 'zzzcanary' }], // 'zzz' in z-bucket
      dir
    );
    let files = await readdir(dir);
    expect(files).toContain('z.json');
    // Regen with no z-bucket entries — old z.json should be gone.
    await writeTrigramShards([{ prefix: 'x', name: 'home' }], dir);
    files = await readdir(dir);
    expect(files).not.toContain('z.json');
    expect(files).toContain('h.json');
  });
});
