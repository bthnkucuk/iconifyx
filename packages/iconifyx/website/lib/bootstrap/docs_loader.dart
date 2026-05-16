import 'package:flutter/services.dart' show rootBundle;

/// Loads the long-form authoring docs that live in
/// `packages/iconifyx/doc/` (mirrored into the website's
/// `assets/docs/` so they bundle as `rootBundle` assets).
///
/// The website intentionally keeps a copy under `assets/docs/`
/// rather than reading directly from the `iconifyx` meta package —
/// Flutter assets must be inside the consuming package, and the
/// copies are small (<30 KB total). The source-of-truth files live
/// under `packages/iconifyx/doc/` and `packages/iconifyx/CHANGELOG.md`;
/// the website assets are a snapshot. See the parallel `doc/index.md`
/// for the canonical list.
class DocsLoader {
  DocsLoader._();

  /// Slug → asset path mapping. Slugs are what appear in the URL.
  /// The slug also drives the on-disk filename inside `assets/docs/`.
  static const Map<String, _DocAsset> _docs = {
    'overview': _DocAsset(
      slug: 'overview',
      title: 'Overview',
      blurb: 'Start here — what iconifyx is and how to use it.',
      path: 'assets/docs/index.md',
    ),
    'architecture': _DocAsset(
      slug: 'architecture',
      title: 'Architecture',
      blurb:
          'Tree-shake design, per-pack package layout, single-TTF-per-pack, determinism.',
      path: 'assets/docs/architecture.md',
    ),
    'duotone': _DocAsset(
      slug: 'duotone',
      title: 'Duotone rendering',
      blurb:
          'Three duotone kinds: hint-layer, paint-order, mask-internal. One widget.',
      path: 'assets/docs/duotone.md',
    ),
    'flutter-3-44-icondata': _DocAsset(
      slug: 'flutter-3-44-icondata',
      title: 'Flutter 3.44 and final class IconData',
      blurb:
          'Why the extension type pattern is forward-compatible with the upcoming IconData migration.',
      path: 'assets/docs/flutter-3-44-icondata.md',
    ),
    'pipeline': _DocAsset(
      slug: 'pipeline',
      title: 'Generator pipeline',
      blurb:
          'What the codegen actually does, in order — duotone split, rasterize, drop, validate, build, merge, emit.',
      path: 'assets/docs/pipeline.md',
    ),
    'backers': _DocAsset(
      slug: 'backers',
      title: 'Backers & credits',
      blurb:
          'Who maintains iconifyx and the upstream open-source work it leans on.',
      path: 'assets/docs/backers.md',
    ),
  };

  static const String _changelogPath = 'assets/docs/CHANGELOG.md';

  /// Every doc entry, in the order they should appear on the docs index.
  static Iterable<DocEntry> get entries =>
      _docs.values.map((d) => DocEntry(slug: d.slug, title: d.title, blurb: d.blurb));

  /// Returns the [DocEntry] for [slug], or null if unknown.
  static DocEntry? entryFor(String slug) {
    final a = _docs[slug];
    if (a == null) return null;
    return DocEntry(slug: a.slug, title: a.title, blurb: a.blurb);
  }

  /// Loads the markdown source for [slug] off the asset bundle.
  static Future<String> loadDoc(String slug) async {
    final asset = _docs[slug];
    if (asset == null) {
      throw ArgumentError.value(slug, 'slug', 'Unknown doc slug');
    }
    return rootBundle.loadString(asset.path);
  }

  /// Loads the changelog markdown.
  static Future<String> loadChangelog() =>
      rootBundle.loadString(_changelogPath);
}

class DocEntry {
  const DocEntry({required this.slug, required this.title, required this.blurb});
  final String slug;
  final String title;
  final String blurb;
}

class _DocAsset {
  const _DocAsset({
    required this.slug,
    required this.title,
    required this.blurb,
    required this.path,
  });
  final String slug;
  final String title;
  final String blurb;
  final String path;
}
