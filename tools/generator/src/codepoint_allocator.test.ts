import { expect, test, describe } from 'bun:test';
import {
  allocateCodepoints,
  PUA_START,
  ICONS_PER_FONT_SOFT_CAP,
  formatCodepoint,
} from './codepoint_allocator.ts';
import type { Manifest } from './manifest.ts';

function freshManifest(prefix: string): Manifest {
  return {
    schemaVersion: 1,
    prefix,
    iconifyJsonVersion: '2.2.300',
    lastUpdated: '2026-05-12',
    category: 'General',
    subPackage: 'general',
    info: {
      name: 'Test',
      author: null,
      license: { title: 'MIT' },
      total: 0,
    },
    fonts: [],
    icons: {},
  };
}

describe('allocateCodepoints', () => {
  test('first-time allocation: assigns 0xE000+ sequentially in alpha order', () => {
    const { fonts, icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home', 'arrow-left', 'zoo'],
      previous: null,
    });

    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.family).toBe('Test');
    expect(fonts[0]!.iconCount).toBe(3);

    // Sorted: arrow-left, home, zoo
    expect(icons['arrow-left']!.codepoint).toBe(0xe000);
    expect(icons['home']!.codepoint).toBe(0xe001);
    expect(icons['zoo']!.codepoint).toBe(0xe002);

    expect(icons['arrow-left']!.identifier).toBe('arrowLeft');
    expect(icons['home']!.identifier).toBe('home');
    expect(icons['zoo']!.identifier).toBe('zoo');
  });

  test('preserves existing codepoints across re-run', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe003, iconCount: 3 }];
    prev.icons = {
      'arrow-left': { codepoint: 0xe000, fontFamily: 'Test', identifier: 'arrowLeft' },
      home: { codepoint: 0xe001, fontFamily: 'Test', identifier: 'home' },
      zoo: { codepoint: 0xe002, fontFamily: 'Test', identifier: 'zoo' },
    };

    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home', 'arrow-left', 'zoo', 'new-icon'],
      previous: prev,
    });

    expect(icons['arrow-left']!.codepoint).toBe(0xe000);
    expect(icons['home']!.codepoint).toBe(0xe001);
    expect(icons['zoo']!.codepoint).toBe(0xe002);
    expect(icons['new-icon']!.codepoint).toBe(0xe003);
    expect(icons['new-icon']!.identifier).toBe('newIcon');
  });

  test('flags removed upstream icons as deprecated', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe002, iconCount: 2 }];
    prev.icons = {
      home: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'home' },
      'removed-thing': { codepoint: 0xe001, fontFamily: 'Test', identifier: 'removedThing' },
    };

    const { icons, fonts } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home'],
      previous: prev,
    });

    expect(icons['removed-thing']!.deprecated).toBe(true);
    expect(icons['removed-thing']!.codepoint).toBe(0xe001);
    // §16-A8: freshly-detected "no longer in upstream" defaults to the
    // upstream-removed bucket. The pipeline can later overwrite this with
    // a more precise reason at a specific drop site (validator / panic /
    // paint-order).
    expect(icons['removed-thing']!.deprecatedReason).toBe('upstream-removed');
    expect(icons['home']!.deprecated).toBeUndefined();
    expect(icons['home']!.deprecatedReason).toBeUndefined();
    expect(fonts[0]!.iconCount).toBe(1);
  });

  test('preserves a previously-recorded deprecatedReason', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe002, iconCount: 1 }];
    prev.icons = {
      home: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'home' },
      'broken-old': {
        codepoint: 0xe001,
        fontFamily: 'Test',
        identifier: 'brokenOld',
        deprecated: true,
        deprecatedSince: '2024-03-01',
        deprecatedReason: 'validator-rejected',
      },
    };

    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home'],
      previous: prev,
    });

    expect(icons['broken-old']!.deprecated).toBe(true);
    expect(icons['broken-old']!.deprecatedSince).toBe('2024-03-01');
    expect(icons['broken-old']!.deprecatedReason).toBe('validator-rejected');
  });

  test('keeps existing deprecation date when re-running', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe002, iconCount: 1 }];
    prev.icons = {
      home: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'home' },
      old: {
        codepoint: 0xe001,
        fontFamily: 'Test',
        identifier: 'old',
        deprecated: true,
        deprecatedSince: '2024-01-01',
      },
    };

    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home'],
      previous: prev,
    });

    expect(icons['old']!.deprecatedSince).toBe('2024-01-01');
  });

  test('auto-splits into multiple fonts past soft cap', () => {
    // Generate 6005 unique names to push past the 6000 soft cap.
    const names = Array.from({ length: 6005 }, (_, i) => `icon-${i.toString().padStart(5, '0')}`);

    const { fonts, icons } = allocateCodepoints({
      prefix: 'big',
      fontFamilyBase: 'Big',
      iconNames: names,
      previous: null,
    });

    expect(fonts).toHaveLength(2);
    expect(fonts[0]!.family).toBe('Big');
    expect(fonts[1]!.family).toBe('Big_2');
    expect(fonts[0]!.iconCount).toBe(6000);
    expect(fonts[1]!.iconCount).toBe(5);

    // Last icon in first font:
    expect(icons['icon-05999']!.fontFamily).toBe('Big');
    expect(icons['icon-05999']!.codepoint).toBe(PUA_START + 5999);
    // First icon in second font:
    expect(icons['icon-06000']!.fontFamily).toBe('Big_2');
    expect(icons['icon-06000']!.codepoint).toBe(PUA_START);
  });

  test('determinism: two runs produce identical output', () => {
    const names = ['z-end', 'apple', 'banana', 'cherry'];
    const a = allocateCodepoints({
      prefix: 'fruit',
      fontFamilyBase: 'Fruit',
      iconNames: names,
      previous: null,
    });
    const b = allocateCodepoints({
      prefix: 'fruit',
      fontFamilyBase: 'Fruit',
      iconNames: [...names].reverse(),
      previous: null,
    });
    expect(a.icons).toEqual(b.icons);
    expect(a.fonts).toEqual(b.fonts);
  });

  test('new icons added after existing ones land in current font (not deprecated slots)', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe003, iconCount: 2 }];
    prev.icons = {
      a: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'a' },
      'b-old': {
        codepoint: 0xe001,
        fontFamily: 'Test',
        identifier: 'bOld',
        deprecated: true,
        deprecatedSince: '2024-01-01',
      },
      c: { codepoint: 0xe002, fontFamily: 'Test', identifier: 'c' },
    };
    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['a', 'c', 'd-new'],
      previous: prev,
    });
    expect(icons['d-new']!.codepoint).toBe(0xe003);
    expect(icons['b-old']!.codepoint).toBe(0xe001); // deprecated, codepoint still reserved
  });

  test('§22 Rec 1: aliases get the canonical\'s codepoint and an aliasOf field', () => {
    const { fonts, icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home', '1-2-3', '123'],
      aliasOf: { '1-2-3': 'home', '123': 'home' },
      previous: null,
    });

    // Only `home` consumes font space — the two aliases share its codepoint.
    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.iconCount).toBe(1);

    const canonical = icons['home']!;
    expect(canonical.codepoint).toBe(0xe000);
    expect(canonical.aliasOf).toBeUndefined();

    expect(icons['1-2-3']!.codepoint).toBe(canonical.codepoint);
    expect(icons['1-2-3']!.aliasOf).toBe('home');
    expect(icons['1-2-3']!.fontFamily).toBe(canonical.fontFamily);

    expect(icons['123']!.codepoint).toBe(canonical.codepoint);
    expect(icons['123']!.aliasOf).toBe('home');
  });

  test('§22 Rec 1: orphan alias (canonical missing) is dropped silently', () => {
    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['lonely-alias'],
      aliasOf: { 'lonely-alias': 'missing-canonical' },
      previous: null,
    });
    // The alias has no canonical to point at, so it's not emitted.
    expect(icons['lonely-alias']).toBeUndefined();
  });

  test('§22 Rec 1: previously-canonical alias is re-allocated to canonical\'s codepoint', () => {
    // Simulate a pre-Rec-1 manifest where the alias had its own codepoint.
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe002, iconCount: 2 }];
    prev.icons = {
      home: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'home' },
      'home-alt': { codepoint: 0xe001, fontFamily: 'Test', identifier: 'homeAlt' },
    };

    const { fonts, icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home', 'home-alt'],
      aliasOf: { 'home-alt': 'home' },
      previous: prev,
    });

    // Canonical keeps its old codepoint (stability invariant).
    expect(icons['home']!.codepoint).toBe(0xe000);
    // Alias is migrated onto the canonical's codepoint.
    expect(icons['home-alt']!.codepoint).toBe(0xe000);
    expect(icons['home-alt']!.aliasOf).toBe('home');
    expect(fonts[0]!.iconCount).toBe(1);
  });

  test('§22 Rec 1: alias identifier preserved across runs when no collision', () => {
    const prev = freshManifest('test');
    prev.fonts = [{ family: 'Test', nextCodepoint: 0xe001, iconCount: 1 }];
    prev.icons = {
      home: { codepoint: 0xe000, fontFamily: 'Test', identifier: 'home' },
      'house-alias': {
        codepoint: 0xe000,
        fontFamily: 'Test',
        identifier: 'houseAlias',
        aliasOf: 'home',
      },
    };

    const { icons } = allocateCodepoints({
      prefix: 'test',
      fontFamilyBase: 'Test',
      iconNames: ['home', 'house-alias'],
      aliasOf: { 'house-alias': 'home' },
      previous: prev,
    });
    expect(icons['house-alias']!.identifier).toBe('houseAlias');
  });

  test('§22 Rec 1: aliases do not count toward font cap', () => {
    // Create 5,999 canonicals + a couple thousand aliases. Aliases must
    // NOT push the canonical-only count above the soft cap. Result:
    // single font, no _2 spawn.
    const canonicals = Array.from({ length: 5999 }, (_, i) =>
      `icon-${i.toString().padStart(5, '0')}`
    );
    const aliases = Array.from({ length: 2000 }, (_, i) =>
      `alias-${i.toString().padStart(5, '0')}`
    );
    const aliasOf: Record<string, string> = {};
    for (let i = 0; i < aliases.length; i++) {
      aliasOf[aliases[i]!] = canonicals[i % canonicals.length]!;
    }
    const { fonts } = allocateCodepoints({
      prefix: 'big',
      fontFamilyBase: 'Big',
      iconNames: [...canonicals, ...aliases],
      aliasOf,
      previous: null,
    });
    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.iconCount).toBe(5999);
  });

  test('formatCodepoint pads correctly', () => {
    expect(formatCodepoint(0xe000)).toBe('0xe000');
    expect(formatCodepoint(0xf8ff)).toBe('0xf8ff');
    expect(formatCodepoint(0xe01a)).toBe('0xe01a');
  });
});
