import { expect, test, describe } from 'bun:test';
import {
  buildPacksJson,
  buildIconsIndexJson,
  buildIconShards,
  buildCdnManifest,
  type WebsiteCodegenInput,
} from './website_codegen.ts';
import type { Manifest } from './manifest.ts';

function freshManifest(prefix: string): Manifest {
  return {
    schemaVersion: 1,
    prefix,
    iconifyJsonVersion: '2.2.300',
    lastUpdated: '2026-05-16',
    category: 'General',
    subPackage: `iconifyx_${prefix.replace(/-/g, '_')}`,
    info: {
      name: prefix,
      author: null,
      license: { title: 'MIT' },
      total: 0,
    },
    fonts: [],
    icons: {},
  };
}

function makeInput(): WebsiteCodegenInput {
  const mdi = freshManifest('mdi');
  mdi.fonts = [{ family: 'Mdi', nextCodepoint: 0xe002, iconCount: 2 }];
  mdi.icons = {
    home: { codepoint: 0xe000, fontFamily: 'Mdi', identifier: 'home' },
    user: { codepoint: 0xe001, fontFamily: 'Mdi', identifier: 'user' },
  };

  const ph = freshManifest('ph');
  ph.fonts = [{ family: 'Ph', nextCodepoint: 0xe001, iconCount: 1 }];
  ph.icons = {
    'acorn-duotone': {
      codepoint: 0xe000,
      fontFamily: 'Ph',
      identifier: 'acornDuotone',
      duotone: true,
      duotoneKind: 'hint',
    },
  };

  return {
    iconifyJsonVersion: '2.2.300',
    entries: [
      { manifest: mdi, displayCategory: 'General' },
      { manifest: ph, displayCategory: 'General' },
    ],
  };
}

describe('buildIconShards', () => {
  test('emits one shard per pack at icons-index/v1/<prefix>.json', () => {
    const input = makeInput();
    const { shards, manifest } = buildIconShards(input);

    expect(Array.from(shards.keys()).sort()).toEqual([
      'icons-index/v1/mdi.json',
      'icons-index/v1/ph.json',
    ]);

    const mdiShard = JSON.parse(shards.get('icons-index/v1/mdi.json')!);
    expect(mdiShard.schemaVersion).toBe(1);
    expect(mdiShard.prefix).toBe('mdi');
    expect(mdiShard.fonts).toEqual(['Mdi']);
    expect(mdiShard.icons).toEqual([
      ['home', 0xe000, 0],
      ['user', 0xe001, 0],
    ]);

    const phShard = JSON.parse(shards.get('icons-index/v1/ph.json')!);
    expect(phShard.icons).toEqual([['acorn-duotone', 0xe000, 0, 1]]);

    const m = JSON.parse(manifest);
    expect(m.schemaVersion).toBe(1);
    expect(m.iconifyJsonVersion).toBe('2.2.300');
    expect(m.packs.map((p: { prefix: string }) => p.prefix)).toEqual([
      'mdi',
      'ph',
    ]);
    expect(m.packs[0].iconCount).toBe(2);
    expect(m.packs[1].iconCount).toBe(1);
    // SHA fields must be hex-256 (64 chars).
    expect(m.packs[0].shardSha).toMatch(/^[0-9a-f]{64}$/);
  });

  test('shard SHA equals SHA-256 of the shard body', async () => {
    const input = makeInput();
    const { shards, manifest } = buildIconShards(input);
    const m = JSON.parse(manifest);
    for (const pack of m.packs) {
      const body = shards.get(pack.path)!;
      const hash = new Bun.CryptoHasher('sha256').update(body).digest('hex');
      expect(hash).toBe(pack.shardSha);
    }
  });

  test('packs with no live icons are excluded from shards and the manifest', () => {
    const input = makeInput();
    const empty = freshManifest('empty');
    // No icons → no shard expected.
    input.entries.push({ manifest: empty, displayCategory: 'General' });
    const { shards, manifest } = buildIconShards(input);
    expect(shards.has('icons-index/v1/empty.json')).toBe(false);
    const m = JSON.parse(manifest);
    expect(m.packs.some((p: { prefix: string }) => p.prefix === 'empty')).toBe(
      false
    );
  });

  test('determinism: same input → byte-identical output across invocations', () => {
    const input = makeInput();
    const a = buildIconShards(input);
    const b = buildIconShards(input);
    for (const key of a.shards.keys()) {
      expect(b.shards.get(key)).toBe(a.shards.get(key)!);
    }
    expect(b.manifest).toBe(a.manifest);
  });

  test('determinism: input order does not affect output (packs sorted)', () => {
    const input = makeInput();
    // Reverse the entries; output must stay identical.
    const reversed: WebsiteCodegenInput = {
      ...input,
      entries: [...input.entries].reverse(),
    };
    const a = buildIconShards(input);
    const b = buildIconShards(reversed);
    expect(b.manifest).toBe(a.manifest);
    for (const key of a.shards.keys()) {
      expect(b.shards.get(key)).toBe(a.shards.get(key)!);
    }
  });
});

describe('monolithic / shard parity', () => {
  test('monolithic icons_index.json packs[prefix].icons equals shard icons', () => {
    const input = makeInput();
    const mono = JSON.parse(buildIconsIndexJson(input));
    const { shards } = buildIconShards(input);
    for (const prefix of Object.keys(mono.packs)) {
      const shard = JSON.parse(shards.get(`icons-index/v1/${prefix}.json`)!);
      expect(shard.icons).toEqual(mono.packs[prefix].icons);
      expect(shard.fonts).toEqual(mono.packs[prefix].fonts);
    }
  });
});

describe('buildCdnManifest', () => {
  test('default baseUrl points at jsDelivr gh path', () => {
    const body = buildCdnManifest({ iconifyJsonVersion: '2.2.300' });
    const m = JSON.parse(body);
    expect(m.schemaVersion).toBe(1);
    expect(m.version).toBe('v1');
    expect(m.iconifyJsonVersion).toBe('2.2.300');
    expect(m.baseUrl).toContain('cdn.jsdelivr.net');
    expect(m.baseUrl).toContain('iconify-2.2.300');
    expect(m.packsPath).toBe('packs/v1/packs.json');
    expect(m.iconsIndexPath).toBe('icons-index/v1');
    expect(m.iconsIndexManifestPath).toBe('icons-index/v1/index.json');
  });

  test('explicit baseUrl wins over default', () => {
    const body = buildCdnManifest({
      iconifyJsonVersion: '2.2.300',
      baseUrl: 'http://localhost:8765/cdn',
    });
    const m = JSON.parse(body);
    expect(m.baseUrl).toBe('http://localhost:8765/cdn');
  });

  test('ICONIFYX_CDN_BASE_URL env var overrides default but not explicit input', () => {
    const prev = process.env.ICONIFYX_CDN_BASE_URL;
    try {
      process.env.ICONIFYX_CDN_BASE_URL =
        'https://cdn.example.com/icons@deadbeef/cdn';
      // No baseUrl arg → env wins.
      const envBody = buildCdnManifest({ iconifyJsonVersion: '2.2.300' });
      const env = JSON.parse(envBody);
      expect(env.baseUrl).toBe('https://cdn.example.com/icons@deadbeef/cdn');

      // Explicit baseUrl arg → wins over env.
      const explicitBody = buildCdnManifest({
        iconifyJsonVersion: '2.2.300',
        baseUrl: 'http://localhost:8765/cdn',
      });
      expect(JSON.parse(explicitBody).baseUrl).toBe(
        'http://localhost:8765/cdn'
      );
    } finally {
      if (prev === undefined) delete process.env.ICONIFYX_CDN_BASE_URL;
      else process.env.ICONIFYX_CDN_BASE_URL = prev;
    }
  });
});

describe('packs.json still includes preview', () => {
  test('preview tuple format unchanged (back-compat with bundled loader)', () => {
    const input = makeInput();
    const body = JSON.parse(buildPacksJson(input));
    const mdi = body.packs.find((p: { prefix: string }) => p.prefix === 'mdi');
    expect(mdi.iconCount).toBe(2);
    expect(mdi.duotoneCount).toBe(0);
    expect(mdi.preview).toEqual([
      { n: 'home', c: 0xe000, f: 'Mdi' },
      { n: 'user', c: 0xe001, f: 'Mdi' },
    ]);
    const ph = body.packs.find((p: { prefix: string }) => p.prefix === 'ph');
    expect(ph.preview).toEqual([
      { n: 'acorn-duotone', c: 0xe000, f: 'Ph', d: 1 },
    ]);
  });
});
