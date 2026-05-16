import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

import {
  hashIconBodies,
  hashConfigForPack,
  computePackInputHash,
  inputHashesEqual,
  buildSnapshot,
  materializeSnapshot,
  writeSnapshot,
  readSnapshot,
  snapshotPath,
  cleanSnapshotCache,
  PIPELINE_VERSION,
  type PackInputHash,
} from './incremental.ts';
import type { IconifyJson } from './load_iconify.ts';
import type { GeneratorConfig } from './group_sets.ts';
import type { Manifest } from './manifest.ts';

function mkSet(prefix: string, icons: Record<string, string>): IconifyJson {
  const iconBodies: IconifyJson['icons'] = {};
  for (const [name, body] of Object.entries(icons)) {
    iconBodies[name] = { body };
  }
  return {
    prefix,
    info: { name: prefix },
    icons: iconBodies,
    width: 24,
    height: 24,
  };
}

function mkConfig(overrides: Partial<GeneratorConfig> = {}): GeneratorConfig {
  return {
    excludedSets: [],
    strokeFillSets: [],
    multiWeightStrokeSets: {},
    colorMappedSets: [],
    vtracerSets: [],
    ...overrides,
  };
}

describe('hashIconBodies', () => {
  test('order-insensitive for icon names', () => {
    const a = mkSet('mdi', { home: '<path d="A"/>', user: '<path d="B"/>' });
    // Same content but different insertion order — simulated by rebuilding
    // the icons map with reversed keys.
    const reordered: IconifyJson = {
      prefix: 'mdi',
      info: { name: 'mdi' },
      icons: {
        user: { body: '<path d="B"/>' },
        home: { body: '<path d="A"/>' },
      },
      width: 24,
      height: 24,
    };
    expect(hashIconBodies(a)).toBe(hashIconBodies(reordered));
  });

  test('changing one body changes the hash', () => {
    const a = mkSet('x', { home: '<path d="A"/>' });
    const b = mkSet('x', { home: '<path d="B"/>' });
    expect(hashIconBodies(a)).not.toBe(hashIconBodies(b));
  });

  test('adding a new icon changes the hash', () => {
    const a = mkSet('x', { home: '<path d="A"/>' });
    const b = mkSet('x', { home: '<path d="A"/>', user: '<path d="B"/>' });
    expect(hashIconBodies(a)).not.toBe(hashIconBodies(b));
  });

  test('renaming an icon changes the hash', () => {
    const a = mkSet('x', { home: '<path d="A"/>' });
    const b = mkSet('x', { house: '<path d="A"/>' });
    expect(hashIconBodies(a)).not.toBe(hashIconBodies(b));
  });

  test('different prefix → different hash even with same icons', () => {
    const a = mkSet('mdi', { home: '<path d="A"/>' });
    const b = mkSet('tabler', { home: '<path d="A"/>' });
    expect(hashIconBodies(a)).not.toBe(hashIconBodies(b));
  });

  test('alias changes are captured', () => {
    const base: IconifyJson = {
      prefix: 'x',
      info: { name: 'x' },
      icons: { home: { body: '<path d="A"/>' } },
      aliases: { house: { parent: 'home' } },
      width: 24,
      height: 24,
    };
    const withDifferentAlias: IconifyJson = {
      ...base,
      aliases: { house2: { parent: 'home' } },
    };
    expect(hashIconBodies(base)).not.toBe(hashIconBodies(withDifferentAlias));
  });

  test('pack viewBox change affects hash', () => {
    const a = mkSet('x', { home: '<path d="A"/>' });
    const b: IconifyJson = { ...a, width: 32, height: 32 };
    expect(hashIconBodies(a)).not.toBe(hashIconBodies(b));
  });
});

describe('hashConfigForPack', () => {
  test('changing strokeFillSets for THIS prefix changes the hash', () => {
    const a = hashConfigForPack('mdi', mkConfig({ strokeFillSets: [] }));
    const b = hashConfigForPack('mdi', mkConfig({ strokeFillSets: ['mdi'] }));
    expect(a).not.toBe(b);
  });

  test("changing strokeFillSets for ANOTHER prefix doesn't change THIS hash", () => {
    const a = hashConfigForPack('mdi', mkConfig({ strokeFillSets: [] }));
    const b = hashConfigForPack(
      'mdi',
      mkConfig({ strokeFillSets: ['lucide'] })
    );
    expect(a).toBe(b);
  });

  test('per-pack weight synthesis is captured', () => {
    const a = hashConfigForPack(
      'lucide',
      mkConfig({ multiWeightStrokeSets: { lucide: { thin: 1.0 } } })
    );
    const b = hashConfigForPack(
      'lucide',
      mkConfig({ multiWeightStrokeSets: { lucide: { thin: 1.5 } } })
    );
    expect(a).not.toBe(b);
  });

  test('colorMappedSets membership matters', () => {
    const a = hashConfigForPack(
      'catppuccin',
      mkConfig({ colorMappedSets: [] })
    );
    const b = hashConfigForPack(
      'catppuccin',
      mkConfig({ colorMappedSets: ['catppuccin'] })
    );
    expect(a).not.toBe(b);
  });

  test('vtracerSets membership matters', () => {
    const a = hashConfigForPack('twemoji', mkConfig({ vtracerSets: [] }));
    const b = hashConfigForPack(
      'twemoji',
      mkConfig({ vtracerSets: ['twemoji'] })
    );
    expect(a).not.toBe(b);
  });

  test('excludedSets membership matters', () => {
    const a = hashConfigForPack('foo', mkConfig({ excludedSets: [] }));
    const b = hashConfigForPack('foo', mkConfig({ excludedSets: ['foo'] }));
    expect(a).not.toBe(b);
  });
});

describe('computePackInputHash', () => {
  test('iconify version bump invalidates the hash', () => {
    const set = mkSet('x', { home: '<path d="A"/>' });
    const cfg = mkConfig();
    const a = computePackInputHash({
      prefix: 'x',
      set,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    const b = computePackInputHash({
      prefix: 'x',
      set,
      iconifyVersion: '2.2.473',
      config: cfg,
    });
    expect(inputHashesEqual(a, b)).toBe(false);
    expect(a.iconBodiesSha1).toBe(b.iconBodiesSha1);
    expect(a.iconifyVersion).not.toBe(b.iconifyVersion);
  });

  test('PIPELINE_VERSION is always stamped onto the hash', () => {
    const set = mkSet('x', { home: '<path d="A"/>' });
    const cfg = mkConfig();
    const h = computePackInputHash({
      prefix: 'x',
      set,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    expect(h.pipelineVersion).toBe(PIPELINE_VERSION);
  });

  test('inputHashesEqual is strict structural equality', () => {
    const base: PackInputHash = {
      prefix: 'x',
      iconifyVersion: '2.2.472',
      iconBodiesSha1: 'aaa',
      configSha1: 'bbb',
      generatorGitSha: 'ccc',
      pipelineVersion: PIPELINE_VERSION,
    };
    expect(inputHashesEqual(base, { ...base })).toBe(true);
    expect(inputHashesEqual(base, { ...base, iconBodiesSha1: 'aab' })).toBe(false);
    expect(inputHashesEqual(base, { ...base, configSha1: 'bbc' })).toBe(false);
    expect(inputHashesEqual(base, { ...base, generatorGitSha: 'ccd' })).toBe(false);
    expect(inputHashesEqual(base, { ...base, iconifyVersion: 'x' })).toBe(false);
    expect(inputHashesEqual(base, { ...base, pipelineVersion: 'vX' })).toBe(false);
  });
});

describe('snapshot round-trip', () => {
  test('build → materialize is byte-identical', () => {
    const inputHash: PackInputHash = {
      prefix: 'x',
      iconifyVersion: '2.2.472',
      iconBodiesSha1: 'a'.repeat(40),
      configSha1: 'b'.repeat(40),
      generatorGitSha: 'c'.repeat(40),
      pipelineVersion: PIPELINE_VERSION,
    };
    const manifest = {
      schemaVersion: 1,
      prefix: 'x',
      iconifyJsonVersion: '2.2.472',
      lastUpdated: '2026-05-16',
      category: null,
      subPackage: 'iconifyx_x',
      // Manifest type only declares scalar fields; the runtime carries
      // fonts/icons/info too. Snapshot persistence treats this as opaque
      // — we round-trip via JSON.parse(JSON.stringify(...)).
      // @ts-expect-error runtime fields
      fonts: [],
      icons: {},
      info: { name: 'x', license: { title: 'MIT' }, total: 0 },
    } as unknown as Manifest;

    const ttf = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const ttfs = new Map<string, Buffer>([['X', ttf]]);

    const snapshot = buildSnapshot({
      inputHash,
      manifest,
      manifestJson: JSON.stringify(manifest, null, 2),
      dartSrc: '// dart',
      aliasesDartSrc: null,
      categoriesDartSrc: '// cats',
      librarySrc: '// lib',
      pubspecSrc: 'name: iconifyx_x\n',
      licenseDartSrc: '// license',
      license3rdPartyMd: '# 3rd-party',
      ttfs,
    });

    const restored = materializeSnapshot(snapshot);
    expect(restored.prefix).toBe('x');
    expect(restored.dartSource).toBe('// dart');
    expect(restored.aliasesDart).toBe(null);
    expect(restored.categoriesDart).toBe('// cats');
    expect(restored.librarySrc).toBe('// lib');
    expect(restored.pubspecSrc).toBe('name: iconifyx_x\n');
    expect(restored.licenseDartSrc).toBe('// license');
    expect(restored.license3rdPartyMd).toBe('# 3rd-party');
    expect(restored.ttfs.size).toBe(1);
    const got = restored.ttfs.get('X')!;
    expect(Buffer.compare(got, ttf)).toBe(0);
  });

  test('on-disk round-trip preserves inputHash + outputs', async () => {
    // Use a temp directory to avoid polluting the real manifests/.cache.
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'incremental-test-'));
    try {
      // We can't easily redirect CACHE_DIR (module-level const), so we
      // write directly to the snapshot path and read it back via the
      // module's helpers. The test verifies the JSON shape survives a
      // disk round-trip, which is what writeSnapshot/readSnapshot do.
      // To stay isolated we mkdir the real cache dir lazily AND clean it
      // up at the end if we created it; the assertions only touch our
      // own prefix.
      void tmp; // tmp dir kept for symmetry with other tests
      const prefix = `__incremental_test_${process.pid}_${Date.now()}`;

      const inputHash: PackInputHash = {
        prefix,
        iconifyVersion: '2.2.472',
        iconBodiesSha1: 'aa',
        configSha1: 'bb',
        generatorGitSha: 'cc',
        pipelineVersion: PIPELINE_VERSION,
      };
      const snap = buildSnapshot({
        inputHash,
        manifest: { prefix } as unknown as Manifest,
        manifestJson: '{"prefix":"' + prefix + '"}',
        dartSrc: '// d',
        aliasesDartSrc: null,
        categoriesDartSrc: null,
        librarySrc: '// l',
        pubspecSrc: 'p',
        licenseDartSrc: '// li',
        license3rdPartyMd: '# m',
        ttfs: new Map([['F', Buffer.from('hello')]]),
      });

      await writeSnapshot(snap);
      try {
        const read = await readSnapshot(prefix);
        expect(read).not.toBeNull();
        expect(read!.inputHash).toEqual(inputHash);
        expect(read!.outputs.dartSrc).toBe('// d');
        // Base64-encoded buffer survives.
        expect(read!.outputs.ttfsBase64.F).toBe(Buffer.from('hello').toString('base64'));
      } finally {
        // Clean only our test snapshot — keep developer state intact.
        await rm(snapshotPath(prefix), { force: true });
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('reading a missing snapshot returns null', async () => {
    const prefix = `__incremental_missing_${process.pid}_${Date.now()}`;
    const r = await readSnapshot(prefix);
    expect(r).toBeNull();
  });

  test('reading a malformed snapshot returns null', async () => {
    const prefix = `__incremental_bad_${process.pid}_${Date.now()}`;
    const p = snapshotPath(prefix);
    // ensure parent exists
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, 'not json{', 'utf8');
    try {
      const r = await readSnapshot(prefix);
      expect(r).toBeNull();
    } finally {
      await rm(p, { force: true });
    }
  });
});

describe('--incremental skip semantics (integration shape)', () => {
  test('matching input hash → snapshot eligible for replay', () => {
    const set = mkSet('x', { home: '<path d="A"/>' });
    const cfg = mkConfig();
    const h1 = computePackInputHash({
      prefix: 'x',
      set,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    const h2 = computePackInputHash({
      prefix: 'x',
      set,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    expect(inputHashesEqual(h1, h2)).toBe(true);
  });

  test('mismatched input hash → snapshot eligible for rebuild', () => {
    const setA = mkSet('x', { home: '<path d="A"/>' });
    const setB = mkSet('x', { home: '<path d="B"/>' });
    const cfg = mkConfig();
    const h1 = computePackInputHash({
      prefix: 'x',
      set: setA,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    const h2 = computePackInputHash({
      prefix: 'x',
      set: setB,
      iconifyVersion: '2.2.472',
      config: cfg,
    });
    expect(inputHashesEqual(h1, h2)).toBe(false);
  });
});

// Sanity: cleanSnapshotCache exists and is callable, no assertion on result
// (the cache dir may or may not exist at this point in the dev workflow).
describe('cleanSnapshotCache', () => {
  test('callable without error', async () => {
    await cleanSnapshotCache();
  });
});
