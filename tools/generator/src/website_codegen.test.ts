import { expect, test, describe } from 'bun:test';
import {
  buildPacksJson,
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

  test('deterministic output for the same input', () => {
    const a = buildCdnManifest({ iconifyJsonVersion: '2.2.300' });
    const b = buildCdnManifest({ iconifyJsonVersion: '2.2.300' });
    expect(b).toBe(a);
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
