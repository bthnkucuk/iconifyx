import 'package:flutter/foundation.dart';

/// Metadata describing the license and authorship of an Iconify icon set.
///
/// Each generated `iconifyx_*` per-set package exposes an `iconSetLicense`
/// const of this type so applications can programmatically display
/// attributions.
///
/// As of §22 Rec 5, this type is preserved verbatim for back-compat but the
/// preferred entry point is [PackInfo.license] (`packInfo` const), which
/// also surfaces author + per-pack capability flags (duotone / paint-order /
/// icon counts / Iconify upstream version).
@immutable
class IconSetLicense {
  final String prefix;
  final String name;
  final String? author;
  final String? authorUrl;
  final String licenseTitle;
  final String? licenseSpdx;
  final String? licenseUrl;
  final String? sourceUrl;
  final int iconCount;

  const IconSetLicense({
    required this.prefix,
    required this.name,
    this.author,
    this.authorUrl,
    required this.licenseTitle,
    this.licenseSpdx,
    this.licenseUrl,
    this.sourceUrl,
    required this.iconCount,
  });
}

/// Author / vendor of an Iconify icon set.
///
/// Pulled from the upstream `info.author` field on the @iconify/json
/// collection JSON. [url] is the project / vendor's homepage (typically
/// GitHub) and may be `null` for legacy sets that ship author name only.
@immutable
class IconAuthor {
  final String name;
  final String? url;

  const IconAuthor({required this.name, this.url});
}

/// Compile-time pack capability + identity metadata.
///
/// Each generated `iconifyx_*` per-set package exposes a `packInfo` const
/// of this type so consumers can programmatically introspect pack-level
/// data without reading the website's 9.8 MB icons index. Useful for
/// picker UIs (e.g. "filter to duotone-capable packs"), about / license
/// surfaces, and reproducibility checks (`iconifyJsonVersion`).
///
/// One const per pack — the tree-shake invariant is preserved (the type
/// contains only metadata, no [IconData] references). See `CLAUDE.md` §1.
///
/// Back-compat: [license] is the same value previously exposed as the
/// `iconSetLicense` const, and that const is still emitted by the
/// generator pointing at `packInfo.license`. New code should prefer
/// `packInfo.license` directly.
@immutable
class PackInfo {
  /// Iconify upstream prefix (e.g. `mdi`, `material-symbols`,
  /// `fa6-solid`). Same as [IconSetLicense.prefix].
  final String prefix;

  /// Human-readable pack name from Iconify upstream
  /// (e.g. "Material Design Icons").
  final String name;

  /// Display category — Iconify upstream `info.category` (e.g.
  /// "General", "Brands / Social", "Emoji"), passed through any local
  /// alias map. May be `null` for packs without a category.
  final String? category;

  /// Iconify upstream `info.tags`. Empty list for sets that don't
  /// declare any. Surfaced as-is for picker / search use cases.
  final List<String> tags;

  /// Count of LIVE (non-deprecated) icons in this pack as of the manifest
  /// snapshot. Mirrors `manifest.info.total`.
  final int iconCount;

  /// `true` if this pack contains at least one duotone icon (any flavour
  /// — hint, paint-order or mask-internal). Drives picker UIs.
  final bool hasDuotone;

  /// `true` if this pack contains at least one paint-order duotone
  /// (logos / cryptocurrency-color / fluent-emoji-flat / twemoji / noto
  /// / vscode-icons / gcp / token-branded family). Subset of [hasDuotone].
  final bool hasPaintOrder;

  /// @iconify/json version this pack was built against. Useful for
  /// reproducibility checks and supply-chain audit.
  final String iconifyJsonVersion;

  /// License metadata. Convenience getter for the value also exposed
  /// as the (back-compat) `iconSetLicense` const.
  final IconSetLicense license;

  /// Author / vendor. `null` for legacy upstream sets that don't ship
  /// author info.
  final IconAuthor? author;

  const PackInfo({
    required this.prefix,
    required this.name,
    this.category,
    this.tags = const <String>[],
    required this.iconCount,
    this.hasDuotone = false,
    this.hasPaintOrder = false,
    required this.iconifyJsonVersion,
    required this.license,
    this.author,
  });
}
