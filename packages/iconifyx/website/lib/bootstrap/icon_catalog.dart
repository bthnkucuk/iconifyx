// IconData here is constructed from runtime JSON. Tree-shake-icons is
// deliberately disabled for the website (we want every font available),
// so the const-arg requirement does not apply.
// ignore_for_file: non_const_argument_for_const_parameter

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import 'cdn_config.dart';
import 'trigram_index.dart';

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
    required this.fontFamilies,
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

  /// Bare font-family names declared by this pack — e.g. `["Mdi", "Mdi_2"]`
  /// for split sets, or `["AntDesign", "AntDesignSecondary"]` when duotone
  /// variants exist. Sourced from `packs.json`'s `fonts[].family` array
  /// (which `website_codegen.ts` emits including secondaries).
  ///
  /// Used by [FontLoaderService] to compute the per-pack asset paths
  /// (`packages/<packageName>/assets/fonts/<family>.ttf`) and the
  /// `FontLoader` family keys (`packages/<packageName>/<family>`) that
  /// match what `IconData(..., fontFamily, fontPackage)` resolves to at
  /// paint time.
  final List<String> fontFamilies;
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

  /// Load the bootstrap manifest.
  ///
  /// With [kUseCdn] = false (default) this is identical to the legacy
  /// behaviour: read the bundled Flutter asset and parse synchronously.
  ///
  /// With [kUseCdn] = true the CDN copy at `<baseUrl>/<packsPath>` is
  /// tried first; on any network / parse failure we fall back to the
  /// bundled asset and log a warning. The bundled asset stays committed
  /// alongside the CDN tree so the fallback is always available — see
  /// RESEARCH_PLAN §12 for the rationale.
  static Future<PackIndex> load() async {
    String raw;
    if (kUseCdn) {
      raw = await _loadPacksJsonViaCdn();
    } else {
      raw = await rootBundle.loadString('lib/data/packs.json');
    }
    return _parsePacksJson(raw);
  }

  /// Try the CDN copy first; fall back to the bundled asset on any
  /// failure. Exposed at file scope so future callers (e.g. an explicit
  /// refresh button) can reuse the same fallback semantics.
  static Future<String> _loadPacksJsonViaCdn() async {
    final manifest = await CdnManifest.loadFromBundle();
    if (manifest == null || manifest.baseUrl.isEmpty) {
      debugPrint(
        '[iconifyx/website] cdn_manifest.json missing or empty — '
        'falling back to bundled packs.json',
      );
      return rootBundle.loadString('lib/data/packs.json');
    }
    final client = CdnHttpClient();
    try {
      return await client.getString(manifest.packsJsonUrl);
    } on CdnFetchException catch (e) {
      debugPrint(
        '[iconifyx/website] CDN packs.json fetch failed: $e — falling '
        'back to bundled copy',
      );
      return rootBundle.loadString('lib/data/packs.json');
    } finally {
      client.close();
    }
  }

  static PackIndex _parsePacksJson(String raw) {
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
  final fontFamilies = ((p['fonts'] as List?) ?? const [])
      .map((f) => (f as Map<String, dynamic>)['family'] as String)
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
    fontFamilies: fontFamilies,
  );
}

/// Full icon catalog. Loaded lazily from `icons_index.json` (~10 MB) after
/// boot via [compute] — keeps the homepage interactive while the index parses
/// in a background isolate (Web Worker on Flutter web).
@immutable
class IconCatalog {
  const IconCatalog._(
    this.icons,
    this.lowerNames,
    this.byPrefix,
    this._trigrams,
  );

  /// Flat icon list. Order is stable: pack prefix asc, then icon name asc.
  final List<IconRecord> icons;

  /// Parallel array of `icons[i].name.toLowerCase()` — pre-lowercased once at
  /// parse time so the search hot loop avoids per-call `toLowerCase()`.
  final List<String> lowerNames;

  /// Per-pack icon lists (same order as `icons`).
  final Map<String, List<IconRecord>> byPrefix;

  /// Trigram posting-list index built in the same isolate as the JSON parse.
  /// Drives [searchIndices] for `q.length >= 3`; null only on platforms /
  /// failure modes where the build threw (defensive — we currently always
  /// build it).
  final TrigramIndex? _trigrams;

  /// Approximate retained bytes for the trigram index (logging only).
  int get trigramIndexBytes => _trigrams?.estimatedBytes ?? 0;

  /// Run a substring search across [lowerNames] and return matching icon
  /// indices in ascending order. For `q.length >= 3` this consults the
  /// trigram index then verifies survivors with a real `contains(q)` so
  /// false-positives from byte-folding / overlapping windows are filtered
  /// out (zero false-negatives by construction).
  ///
  /// For `q.length < 3` falls through to a linear scan — the result set is
  /// always small enough (≤ 36² = 1,296 unique digraphs across the corpus)
  /// that this stays acceptable.
  ///
  /// Pass [limit] to stop scanning once that many matches have been
  /// captured; the function still returns sorted indices but may not visit
  /// the full candidate set.
  List<int> searchIndices(String q, {int? limit}) {
    if (q.isEmpty) return const <int>[];
    final out = <int>[];
    final cap = limit ?? -1;
    final cands = _trigrams?.candidates(q);
    if (cands != null) {
      // Trigram path — verify each candidate. The candidate list is already
      // sorted ascending so we can append in order.
      for (var k = 0; k < cands.length; k++) {
        final i = cands[k];
        if (lowerNames[i].contains(q)) {
          out.add(i);
          if (cap >= 0 && out.length >= cap) return out;
        }
      }
      return out;
    }
    // Fallback linear scan (q.length < 3 OR index unavailable).
    for (var i = 0; i < lowerNames.length; i++) {
      if (lowerNames[i].contains(q)) {
        out.add(i);
        if (cap >= 0 && out.length >= cap) return out;
      }
    }
    return out;
  }

  /// Load the full icon catalog.
  ///
  /// With [kUseCdn] = false (default) this is identical to the legacy
  /// behaviour: read the bundled ~10 MB `icons_index.json` from
  /// rootBundle and parse it in a background isolate.
  ///
  /// With [kUseCdn] = true we:
  ///   1. Fetch the per-pack shard manifest (`<base>/icons-index/v1/index.json`)
  ///   2. Fan-out fetch every shard in parallel (HTTP/2 multiplexing makes
  ///      this competitive with one big GET for the same total bytes;
  ///      jsDelivr's edge cache + brotli further compress).
  ///   3. Assemble a single in-memory `IconCatalog` byte-equivalent to
  ///      what the monolithic parser would have produced.
  ///   4. On ANY failure (missing manifest, network error, parse error)
  ///      fall back to the bundled monolithic `icons_index.json` and log
  ///      a warning. The bundled copy stays committed for safety.
  ///
  /// The shard fetch happens before [compute] so individual shard JSON
  /// reads can be inspected by the dev-tools network panel; the heavy
  /// parse + record assembly still runs in a worker isolate.
  static Future<IconCatalog> load(Map<String, PackSummary> packsByPrefix) async {
    if (kUseCdn) {
      final cdn = await _tryLoadViaCdn(packsByPrefix);
      if (cdn != null) return cdn;
      // Fall through to the bundled path.
    }
    final raw = await rootBundle.loadString('lib/data/icons_index.json');
    final catalog = await compute(_parse, _ParseInput(raw, packsByPrefix));
    // Log boot diagnostics once. The build runs INSIDE the worker via
    // `_parse` so the cold-start "first paint" main isolate is never
    // blocked by the trigram pass; we only see the result here.
    debugPrint(
      '[trigram] index built · ${catalog.icons.length} icons · '
      '${(catalog.trigramIndexBytes / 1024 / 1024).toStringAsFixed(2)} MB '
      'retained',
    );
    return catalog;
  }

  /// Best-effort CDN load. Returns null on any failure so the caller
  /// falls back to the bundled monolithic JSON.
  static Future<IconCatalog?> _tryLoadViaCdn(
    Map<String, PackSummary> packsByPrefix,
  ) async {
    final manifest = await CdnManifest.loadFromBundle();
    if (manifest == null || manifest.baseUrl.isEmpty) {
      debugPrint(
        '[iconifyx/website] cdn_manifest.json missing or empty — '
        'falling back to bundled icons_index.json',
      );
      return null;
    }
    final client = CdnHttpClient();
    try {
      // Step 1: shard manifest.
      final shardManifestRaw =
          await client.getString(manifest.iconsIndexManifestUrl);
      final shardManifest =
          jsonDecode(shardManifestRaw) as Map<String, dynamic>;
      final entries = (shardManifest['packs'] as List).cast<Map<String, dynamic>>();

      // Step 2: parallel fetch all shards (HTTP/2 multiplexed against
      // jsDelivr). The order matters for determinism: we sort by prefix
      // before iteration so the resulting `icons` flat list is byte-
      // equivalent to the monolithic loader's output.
      final sortedEntries = [...entries]
        ..sort((a, b) =>
            (a['prefix'] as String).compareTo(b['prefix'] as String));

      final shardBodies = await Future.wait(
        sortedEntries.map((e) async {
          final prefix = e['prefix'] as String;
          return MapEntry(prefix, await client.getString(manifest.shardUrl(prefix)));
        }),
      );

      // Step 3: assemble a synthetic monolithic JSON the existing
      // [_parse] entry point can consume. This keeps the heavy parsing +
      // record allocation inside the worker isolate (no duplicated
      // parser surface across the two modes). The synthetic JSON
      // matches the monolithic schema:
      //   { schemaVersion, packs: { <prefix>: { fonts, icons } } }
      final synthetic = <String, dynamic>{
        'schemaVersion': shardManifest['schemaVersion'] ?? 1,
        'packs': <String, dynamic>{},
      };
      final synthPacks = synthetic['packs'] as Map<String, dynamic>;
      for (final entry in shardBodies) {
        final shard = jsonDecode(entry.value) as Map<String, dynamic>;
        synthPacks[entry.key] = <String, dynamic>{
          'fonts': shard['fonts'],
          'icons': shard['icons'],
        };
      }
      final raw = jsonEncode(synthetic);
      return await compute(_parse, _ParseInput(raw, packsByPrefix));
    } on CdnFetchException catch (e) {
      debugPrint(
        '[iconifyx/website] CDN icons-index load failed: $e — falling '
        'back to bundled icons_index.json',
      );
      return null;
    } catch (e) {
      debugPrint(
        '[iconifyx/website] CDN icons-index parse failed: $e — falling '
        'back to bundled icons_index.json',
      );
      return null;
    } finally {
      client.close();
    }
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
    // Build the trigram index while we're still in the worker isolate —
    // the main isolate stays responsive throughout the ~10 MB JSON parse
    // and the ~2 M-posting trigram build (~0.5-1 s release). Logging the
    // built-bytes happens on the main side once `compute` returns.
    final trigrams = TrigramIndex.build(lower);
    return IconCatalog._(
      List<IconRecord>.unmodifiable(flat),
      List<String>.unmodifiable(lower),
      Map<String, List<IconRecord>>.unmodifiable(byPrefix),
      trigrams,
    );
  }
}

class _ParseInput {
  const _ParseInput(this.raw, this.packsByPrefix);
  final String raw;
  final Map<String, PackSummary> packsByPrefix;
}
