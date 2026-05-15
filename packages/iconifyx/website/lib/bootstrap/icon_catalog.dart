// IconData here is constructed from runtime JSON. Tree-shake-icons is
// deliberately disabled for the website (we want every font available),
// so the const-arg requirement does not apply.
// ignore_for_file: non_const_argument_for_const_parameter

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// One icon, reconstructed at runtime from `icons_index.json`. We rebuild
/// `IconifyIconData` here instead of importing the 215 per-set Dart packages
/// (that approach generated a 25 MB Dart file and was slow to compile).
@immutable
class IconRecord {
  const IconRecord({
    required this.name,
    required this.prefix,
    required this.codepoint,
    required this.fontFamily,
    required this.fontPackage,
    required this.duotone,
    required this.duotoneKindCode,
  });

  final String name;
  final String prefix;
  final int codepoint;
  final String fontFamily;
  final String fontPackage;
  final bool duotone;

  /// Encoded `IconifyIconData.kind*` value (`kindSolo` = 0, `kindHint` = 1,
  /// `kindPaintOrder` = 2, `kindMaskInternal` = 3). Comes from the
  /// `icons_index.json` tuple's 4th slot; missing in the JSON means solo.
  /// The bug this field exists to fix: before this was wired, every
  /// duotone got constructed at runtime via the bare `IconifyIconData.duo`
  /// call (which defaults to `kindHint`), so paint-order packs (logos,
  /// crypto-color, fluent-emoji-flat, …) rendered with their foreground
  /// at 40% opacity BEHIND the primary tile — invisible.
  final int duotoneKindCode;

  /// Reconstruct an [IconifyIconData] for rendering with [IconifyIcon].
  /// Mirrors the constructor calls emitted by `dart_codegen.ts`: the
  /// secondary glyph (when present) shares the codepoint with the primary
  /// and lives in `<primary>Secondary` in the same package. The
  /// [duotoneKindCode] is forwarded so `IconifyIcon` composes the layers
  /// in the right order with the right secondary defaults.
  IconifyIconData toIconifyData() {
    final primary = IconData(
      codepoint,
      fontFamily: fontFamily,
      fontPackage: fontPackage,
    );
    if (!duotone) return IconifyIconData.solo(primary);
    final secondary = IconData(
      codepoint,
      fontFamily: '${fontFamily}Secondary',
      fontPackage: fontPackage,
    );
    return IconifyIconData.duo(primary, secondary, kind: duotoneKindCode);
  }
}

@immutable
class PackSummary {
  const PackSummary({
    required this.prefix,
    required this.packageName,
    required this.name,
    required this.category,
    required this.license,
    required this.licenseSpdx,
    required this.licenseUrl,
    required this.author,
    required this.iconCount,
    required this.duotoneCount,
    required this.preview,
  });

  final String prefix;
  final String packageName;
  final String name;
  final String category;
  final String license;
  final String? licenseSpdx;
  final String? licenseUrl;
  final String? author;
  final int iconCount;
  final int duotoneCount;
  final List<IconRecord> preview;
}

@immutable
class CategoryEntry {
  const CategoryEntry({
    required this.slug,
    required this.name,
    required this.packPrefixes,
  });

  final String slug;
  final String name;
  final List<String> packPrefixes;
}

/// Bootstrap manifest. Loaded synchronously from `packs.json` (~200 KB) on
/// app start. Drives the home grid + sidebar without touching the 10 MB
/// icon index.
@immutable
class PackIndex {
  const PackIndex({
    required this.iconifyJsonVersion,
    required this.totalIcons,
    required this.packs,
    required this.byPrefix,
    required this.categories,
  });

  final String iconifyJsonVersion;
  final int totalIcons;
  final List<PackSummary> packs;
  final Map<String, PackSummary> byPrefix;
  final List<CategoryEntry> categories;

  static Future<PackIndex> load() async {
    final raw = await rootBundle.loadString('lib/data/packs.json');
    final doc = jsonDecode(raw) as Map<String, dynamic>;
    final packs = (doc['packs'] as List)
        .map((p) => _parsePack(p as Map<String, dynamic>))
        .toList(growable: false);
    final categories = (doc['categories'] as List)
        .map((c) {
          final m = c as Map<String, dynamic>;
          return CategoryEntry(
            slug: m['slug'] as String,
            name: m['name'] as String,
            packPrefixes:
                (m['packPrefixes'] as List).cast<String>().toList(growable: false),
          );
        })
        .toList(growable: false);
    return PackIndex(
      iconifyJsonVersion: doc['iconifyJsonVersion'] as String,
      totalIcons: doc['totalIcons'] as int,
      packs: packs,
      byPrefix: {for (final p in packs) p.prefix: p},
      categories: categories,
    );
  }
}

PackSummary _parsePack(Map<String, dynamic> p) {
  final prefix = p['prefix'] as String;
  final pkg = p['package'] as String;
  final preview = ((p['preview'] as List?) ?? const [])
      .map((row) {
        final m = row as Map<String, dynamic>;
        // `d` holds the IconifyIconData.kind* code (1=hint, 2=paintOrder,
        // 3=maskInternal). Absent / 0 = solo. See website_codegen.ts.
        final kindCode = (m['d'] as int?) ?? 0;
        return IconRecord(
          name: m['n'] as String,
          prefix: prefix,
          codepoint: m['c'] as int,
          fontFamily: m['f'] as String,
          fontPackage: pkg,
          duotone: kindCode != 0,
          duotoneKindCode: kindCode,
        );
      })
      .toList(growable: false);
  return PackSummary(
    prefix: prefix,
    packageName: pkg,
    name: p['name'] as String,
    category: p['category'] as String,
    license: p['license'] as String,
    licenseSpdx: p['licenseSpdx'] as String?,
    licenseUrl: p['licenseUrl'] as String?,
    author: p['author'] as String?,
    iconCount: p['iconCount'] as int,
    duotoneCount: p['duotoneCount'] as int,
    preview: preview,
  );
}

/// Full icon catalog. Loaded lazily from `icons_index.json` (~10 MB) after
/// boot via [compute] — keeps the homepage interactive while the index parses
/// in a background isolate (Web Worker on Flutter web).
@immutable
class IconCatalog {
  const IconCatalog._(this.icons, this.lowerNames, this.byPrefix);

  /// Flat icon list. Order is stable: pack prefix asc, then icon name asc.
  final List<IconRecord> icons;

  /// Parallel array of `icons[i].name.toLowerCase()` — pre-lowercased once at
  /// parse time so the search hot loop avoids per-call `toLowerCase()`.
  final List<String> lowerNames;

  /// Per-pack icon lists (same order as `icons`).
  final Map<String, List<IconRecord>> byPrefix;

  static Future<IconCatalog> load(Map<String, PackSummary> packsByPrefix) async {
    final raw = await rootBundle.loadString('lib/data/icons_index.json');
    return await compute(_parse, _ParseInput(raw, packsByPrefix));
  }

  static IconCatalog _parse(_ParseInput input) {
    final doc = jsonDecode(input.raw) as Map<String, dynamic>;
    final packs = doc['packs'] as Map<String, dynamic>;
    final flat = <IconRecord>[];
    final lower = <String>[];
    final byPrefix = <String, List<IconRecord>>{};
    final keys = packs.keys.toList()..sort();
    for (final prefix in keys) {
      final packData = packs[prefix] as Map<String, dynamic>;
      final pkg = input.packsByPrefix[prefix]?.packageName ??
          'iconifyx_${prefix.replaceAll('-', '_')}';
      final fonts = (packData['fonts'] as List).cast<String>();
      final list = <IconRecord>[];
      for (final row in packData['icons'] as List) {
        final r = row as List;
        final name = r[0] as String;
        final cp = r[1] as int;
        final fIdx = r[2] as int;
        // Tuple's 4th slot is `IconifyIconData.kind*`: absent → solo,
        // 1 → hint, 2 → paintOrder, 3 → maskInternal. See
        // `tools/generator/src/website_codegen.ts:buildIconsIndexJson`.
        final kindCode = r.length > 3 ? r[3] as int : 0;
        final duo = kindCode != 0;
        final rec = IconRecord(
          name: name,
          prefix: prefix,
          codepoint: cp,
          fontFamily: fonts[fIdx],
          fontPackage: pkg,
          duotone: duo,
          duotoneKindCode: kindCode,
        );
        list.add(rec);
        flat.add(rec);
        lower.add(name.toLowerCase());
      }
      byPrefix[prefix] = List<IconRecord>.unmodifiable(list);
    }
    return IconCatalog._(
      List<IconRecord>.unmodifiable(flat),
      List<String>.unmodifiable(lower),
      Map<String, List<IconRecord>>.unmodifiable(byPrefix),
    );
  }
}

class _ParseInput {
  const _ParseInput(this.raw, this.packsByPrefix);
  final String raw;
  final Map<String, PackSummary> packsByPrefix;
}
