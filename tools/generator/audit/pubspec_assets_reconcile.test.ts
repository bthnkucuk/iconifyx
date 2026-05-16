import { describe, expect, test } from 'bun:test';
import {
  parsePubspecFontFamilies,
  reconcile,
  stripPubspecFamilies,
} from './pubspec_assets_reconcile.ts';

function buildManifest(opts: {
  prefix: string;
  fonts: { family: string; nextCodepoint: number; iconCount: number }[];
  icons?: { name: string; fontFamily: string; codepoint: number; deprecated?: boolean; duotone?: boolean }[];
}) {
  return {
    schemaVersion: 1 as const,
    prefix: opts.prefix,
    iconifyJsonVersion: '0.0.0',
    lastUpdated: '2026-05-16',
    category: null,
    subPackage: `iconifyx_${opts.prefix}`,
    info: { name: opts.prefix, license: { title: 'MIT' }, total: 0 },
    fonts: opts.fonts,
    icons: Object.fromEntries(
      (opts.icons ?? []).map((i) => [i.name, i])
    ),
  } as any;
}

describe('parsePubspecFontFamilies', () => {
  test('extracts family declarations from flutter.fonts block', () => {
    const yaml = `name: pkg
flutter:
  uses-material-design: false
  fonts:
    - family: Ph
      fonts:
        - asset: assets/fonts/Ph.ttf
    - family: PhSecondary
      fonts:
        - asset: assets/fonts/PhSecondary.ttf
`;
    const families = parsePubspecFontFamilies(yaml);
    expect([...families].sort()).toEqual(['Ph', 'PhSecondary']);
  });

  test('ignores family-like tokens outside flutter.fonts', () => {
    const yaml = `name: pkg
description: family: Nope is in the description
flutter:
  fonts:
    - family: Real
      fonts:
        - asset: assets/fonts/Real.ttf
`;
    const families = parsePubspecFontFamilies(yaml);
    expect([...families]).toEqual(['Real']);
  });

  test('handles missing flutter.fonts block (empty result)', () => {
    expect(parsePubspecFontFamilies('name: pkg\nversion: 1.0.0\n').size).toBe(0);
  });
});

describe('reconcile', () => {
  test('happy path — no issues', () => {
    const manifest = buildManifest({
      prefix: 'tiny',
      fonts: [{ family: 'Tiny', nextCodepoint: 0xe000, iconCount: 3 }],
    });
    const issues = reconcile({
      prefix: 'tiny',
      onDisk: new Set(['Tiny']),
      inPubspec: new Set(['Tiny']),
      inManifest: new Map([['Tiny', { family: 'Tiny', nextCodepoint: 0xe000, iconCount: 3 }]]),
      manifest,
    });
    expect(issues).toEqual([]);
  });

  test('flags orphan-on-disk TTF', () => {
    const manifest = buildManifest({
      prefix: 'mdi',
      fonts: [{ family: 'Mdi', nextCodepoint: 0xe000, iconCount: 100 }],
    });
    const issues = reconcile({
      prefix: 'mdi',
      onDisk: new Set(['Mdi', 'Mdi_2']),
      inPubspec: new Set(['Mdi']),
      inManifest: new Map([['Mdi', { family: 'Mdi', nextCodepoint: 0xe000, iconCount: 100 }]]),
      manifest,
    });
    expect(issues.map((i) => i.code)).toContain('orphan-on-disk');
    expect(issues.find((i) => i.code === 'orphan-on-disk')!.family).toBe('Mdi_2');
  });

  test('flags pubspec-orphan when ttf is missing', () => {
    const manifest = buildManifest({
      prefix: 'brk',
      fonts: [{ family: 'Brk', nextCodepoint: 0xe000, iconCount: 10 }],
    });
    const issues = reconcile({
      prefix: 'brk',
      onDisk: new Set(),
      inPubspec: new Set(['Brk']),
      inManifest: new Map([['Brk', { family: 'Brk', nextCodepoint: 0xe000, iconCount: 10 }]]),
      manifest,
    });
    expect(issues.find((i) => i.code === 'pubspec-orphan')!.family).toBe('Brk');
  });

  test('flags manifest-only when pubspec missing', () => {
    const manifest = buildManifest({
      prefix: 'ph',
      fonts: [{ family: 'Ph', nextCodepoint: 0xe000, iconCount: 50 }],
    });
    const issues = reconcile({
      prefix: 'ph',
      onDisk: new Set(['Ph']),
      inPubspec: new Set(),
      inManifest: new Map([['Ph', { family: 'Ph', nextCodepoint: 0xe000, iconCount: 50 }]]),
      manifest,
    });
    expect(issues.find((i) => i.code === 'manifest-only')!.family).toBe('Ph');
  });

  test('manifest-only does NOT flag iconCount=0 families (pruned intentionally)', () => {
    const manifest = buildManifest({
      prefix: 'empty',
      fonts: [{ family: 'Empty', nextCodepoint: 0xe000, iconCount: 0 }],
    });
    const issues = reconcile({
      prefix: 'empty',
      onDisk: new Set(),
      inPubspec: new Set(),
      inManifest: new Map([['Empty', { family: 'Empty', nextCodepoint: 0xe000, iconCount: 0 }]]),
      manifest,
    });
    // iconCount=0 + nothing on disk + nothing in pubspec is the clean
    // pruned-empty-font state. No issue.
    expect(issues).toEqual([]);
  });

  test('flags manifest-zero-on-disk when an iconCount=0 ttf is still shipping', () => {
    const manifest = buildManifest({
      prefix: 'lingering',
      fonts: [{ family: 'Lingering', nextCodepoint: 0xe000, iconCount: 0 }],
    });
    const issues = reconcile({
      prefix: 'lingering',
      onDisk: new Set(['Lingering']),
      inPubspec: new Set(['Lingering']),
      inManifest: new Map([['Lingering', { family: 'Lingering', nextCodepoint: 0xe000, iconCount: 0 }]]),
      manifest,
    });
    expect(issues.find((i) => i.code === 'manifest-zero-on-disk')!.family).toBe(
      'Lingering'
    );
  });
});

describe('stripPubspecFamilies', () => {
  test('removes a named family block', () => {
    const yaml = `flutter:
  uses-material-design: false
  fonts:
    - family: Keep
      fonts:
        - asset: assets/fonts/Keep.ttf
    - family: Drop
      fonts:
        - asset: assets/fonts/Drop.ttf
`;
    const { yaml: next, stripped } = stripPubspecFamilies(yaml, new Set(['Drop']));
    expect(stripped).toBe(1);
    expect(parsePubspecFontFamilies(next)).toEqual(new Set(['Keep']));
  });

  test('returns input unchanged when nothing matches', () => {
    const yaml = `flutter:
  fonts:
    - family: Mdi
      fonts:
        - asset: assets/fonts/Mdi.ttf
`;
    const { yaml: next, stripped } = stripPubspecFamilies(yaml, new Set(['Nope']));
    expect(stripped).toBe(0);
    expect(next).toBe(yaml);
  });
});
