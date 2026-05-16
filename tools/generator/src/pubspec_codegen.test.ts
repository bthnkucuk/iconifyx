import { describe, it, expect } from 'bun:test';

import {
  categoryMetaPackageName,
  emitCategoryMetaPubspec,
  emitCategoryMetaLibraryFile,
} from './pubspec_codegen.ts';

describe('categoryMetaPackageName', () => {
  it('maps known categories to short suffixes', () => {
    expect(categoryMetaPackageName('Material')).toBe('iconifyx_material_meta');
    expect(categoryMetaPackageName('Logos')).toBe('iconifyx_logos_meta');
    expect(categoryMetaPackageName('Emoji')).toBe('iconifyx_emoji_meta');
    expect(categoryMetaPackageName('Programming')).toBe('iconifyx_programming_meta');
    expect(categoryMetaPackageName('Thematic')).toBe('iconifyx_thematic_meta');
    expect(categoryMetaPackageName('Flags / Maps')).toBe('iconifyx_flags_meta');
    expect(categoryMetaPackageName('Archive / Unmaintained')).toBe('iconifyx_archive_meta');
    expect(categoryMetaPackageName('UI 24px')).toBe('iconifyx_ui_24_meta');
    expect(categoryMetaPackageName('UI 16px / 32px')).toBe('iconifyx_ui_compact_meta');
    expect(categoryMetaPackageName('UI Other / Mixed Grid')).toBe('iconifyx_ui_mixed_meta');
    expect(categoryMetaPackageName('UI Multicolor')).toBe('iconifyx_ui_multicolor_meta');
  });

  it('falls back to a slug for unknown categories', () => {
    expect(categoryMetaPackageName('Made Up Category')).toBe(
      'iconifyx_made_up_category_meta'
    );
  });

  it('prefixes c_ when slug starts with a digit', () => {
    // Defensive — none of the canonical categories start with a digit,
    // but slugifyCategory has the rule to satisfy Dart's package-name
    // regex.
    expect(categoryMetaPackageName('123 Category')).toBe('iconifyx_c_123_category_meta');
  });

  it('does NOT collide with any existing iconifyx_<set> package name', () => {
    // The `logos` Iconify prefix produces `iconifyx_logos`. The Logos
    // category-meta pack uses `_meta` suffix to avoid collision.
    expect(categoryMetaPackageName('Logos')).not.toBe('iconifyx_logos');
  });
});

describe('emitCategoryMetaPubspec', () => {
  it('emits a valid pubspec with the right name, version, and path deps', () => {
    const yaml = emitCategoryMetaPubspec({
      category: 'Logos',
      memberPackages: ['iconifyx_logos', 'iconifyx_simple_icons', 'iconifyx_cib'],
      version: '0.1.0',
    });
    expect(yaml).toContain('name: iconifyx_logos_meta');
    expect(yaml).toContain('version: 0.1.0');
    expect(yaml).toContain('iconifyx_logos:\n    path: ../iconifyx_logos');
    expect(yaml).toContain('iconifyx_simple_icons:\n    path: ../iconifyx_simple_icons');
    expect(yaml).toContain('iconifyx_cib:\n    path: ../iconifyx_cib');
    expect(yaml).toContain('iconifyx_core:\n    path: ../iconifyx_core');
    expect(yaml).toMatch(/sdk:\s+\^3\.3\.0/);
  });

  it('mentions the member count in the description', () => {
    const yaml = emitCategoryMetaPubspec({
      category: 'Emoji',
      memberPackages: ['iconifyx_twemoji', 'iconifyx_noto', 'iconifyx_openmoji'],
      version: '0.1.0',
    });
    expect(yaml).toContain('3 members');
  });
});

describe('emitCategoryMetaLibraryFile', () => {
  it('exports each member package and iconifyx_core', () => {
    const dart = emitCategoryMetaLibraryFile({
      category: 'Emoji',
      memberPackages: ['iconifyx_twemoji', 'iconifyx_noto'],
    });
    expect(dart).toContain("export 'package:iconifyx_core/iconifyx_core.dart';");
    expect(dart).toContain("export 'package:iconifyx_twemoji/iconifyx_twemoji.dart';");
    expect(dart).toContain("export 'package:iconifyx_noto/iconifyx_noto.dart';");
    expect(dart).toContain('library;');
  });

  it('mentions the category and member packages in the library doc-comment', () => {
    const dart = emitCategoryMetaLibraryFile({
      category: 'Material',
      memberPackages: ['iconifyx_mdi', 'iconifyx_mdi_light', 'iconifyx_material_symbols'],
    });
    expect(dart).toContain('"Material"');
    expect(dart).toMatch(/Members \(3\)/);
  });

  it('exports are sorted', () => {
    const dart = emitCategoryMetaLibraryFile({
      category: 'Emoji',
      memberPackages: ['iconifyx_twemoji', 'iconifyx_noto', 'iconifyx_emojione'],
    });
    const exportLines = dart
      .split('\n')
      .filter((l) => l.startsWith("export 'package:iconifyx_") && !l.includes('_core'));
    const sortedCopy = [...exportLines].sort();
    expect(exportLines).toEqual(sortedCopy);
  });
});
