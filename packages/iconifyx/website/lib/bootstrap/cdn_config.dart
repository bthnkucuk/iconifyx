import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

/// CDN-aware loader infrastructure for the website's metadata
/// (`packs.json` + per-pack `icons-index/<prefix>.json` shards).
///
/// See `docs/RESEARCH_PLAN.md` §11 + §12 for the design. Phase 1 ships
/// the infrastructure — `kUseCdn = false` keeps the legacy bundled-asset
/// loader in `icon_catalog.dart`. A follow-up PR flips the flag once the
/// CDN URLs are stable.

/// Feature flag. When `true`, both `PackIndex.load()` and
/// `IconCatalog.load()` route their network reads through the CDN
/// manifest below; on any failure (timeout / non-200 / parse error) they
/// fall back to the bundled `rootBundle` copy and log a warning.
///
/// **Driven at build time by `--dart-define=ICONIFYX_USE_CDN=true`**, so
/// the same compiled bundle can be deployed in either mode without a
/// source edit:
///
/// ```bash
/// # CDN mode (jsDelivr → fallback to bundled copy on any failure):
/// fvm flutter build web --release \
///   --dart-define=ICONIFYX_USE_CDN=true
///
/// # Default (no define) → false → reads bundled lib/data/*.json:
/// fvm flutter build web --release
/// ```
///
/// See `docs/DEPLOYMENT.md` for the SHA-pinning recommendation when
/// flipping this on for production.
const bool kUseCdn = bool.fromEnvironment(
  'ICONIFYX_USE_CDN',
  defaultValue: false,
);

/// Per-request timeout for any CDN GET. Larger than typical jsDelivr
/// edge TTFB (~30 ms) by enough margin to tolerate a cold cache pull
/// against a 9 MB monolithic icons_index.json.
const Duration kCdnRequestTimeout = Duration(seconds: 15);

/// Routing manifest committed at `lib/data/cdn_manifest.json` and bundled
/// as a Flutter asset. Always loaded first — even with `kUseCdn = false`
/// — but the values are only acted upon when the flag is true.
///
/// Schema (mirrors `tools/generator/src/website_codegen.ts:buildCdnManifest`):
///   - schemaVersion: 1
///   - version: "v1"               — CDN path version tag
///   - iconifyJsonVersion: string  — @iconify/json release the data was built from
///   - baseUrl: string             — root of the CDN tree (no trailing slash)
///   - packsPath: string           — relative path to packs.json
///   - iconsIndexPath: string      — relative dir for per-pack shards
///   - iconsIndexManifestPath: ... — relative path to index.json
@immutable
class CdnManifest {
  const CdnManifest({
    required this.schemaVersion,
    required this.version,
    required this.iconifyJsonVersion,
    required this.baseUrl,
    required this.packsPath,
    required this.iconsIndexPath,
    required this.iconsIndexManifestPath,
  });

  final int schemaVersion;
  final String version;
  final String iconifyJsonVersion;
  final String baseUrl;
  final String packsPath;
  final String iconsIndexPath;
  final String iconsIndexManifestPath;

  /// Absolute URL for the `packs.json` CDN copy.
  String get packsJsonUrl => _join(baseUrl, packsPath);

  /// Absolute URL for the shard-index manifest.
  String get iconsIndexManifestUrl => _join(baseUrl, iconsIndexManifestPath);

  /// Absolute URL for a single per-pack shard.
  String shardUrl(String prefix) =>
      _join(baseUrl, '$iconsIndexPath/$prefix.json');

  static String _join(String base, String relative) {
    if (base.endsWith('/')) base = base.substring(0, base.length - 1);
    if (relative.startsWith('/')) relative = relative.substring(1);
    return '$base/$relative';
  }

  static CdnManifest fromJson(Map<String, dynamic> doc) {
    return CdnManifest(
      schemaVersion: doc['schemaVersion'] as int? ?? 1,
      version: doc['version'] as String? ?? 'v1',
      iconifyJsonVersion: doc['iconifyJsonVersion'] as String? ?? '',
      baseUrl: doc['baseUrl'] as String? ?? '',
      packsPath: doc['packsPath'] as String? ?? 'packs/v1/packs.json',
      iconsIndexPath:
          doc['iconsIndexPath'] as String? ?? 'icons-index/v1',
      iconsIndexManifestPath:
          doc['iconsIndexManifestPath'] as String? ??
              'icons-index/v1/index.json',
    );
  }

  /// Load the bundled manifest from rootBundle. Returns null if the
  /// asset is missing (e.g. running an older Flutter bundle that
  /// predates §12) so callers can fall back cleanly to bundled JSONs.
  static Future<CdnManifest?> loadFromBundle() async {
    try {
      final raw = await rootBundle.loadString('lib/data/cdn_manifest.json');
      return fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}

/// Minimal HTTP client wrapper used by both `PackIndex` and
/// `IconCatalog` loaders. Lives here so we have ONE place to inject
/// timeouts / a mock client during tests.
class CdnHttpClient {
  CdnHttpClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// GET the body at [url] as UTF-8 text. Throws [CdnFetchException] on
  /// any non-200 response, timeout, or socket error.
  Future<String> getString(String url) async {
    try {
      final response =
          await _client.get(Uri.parse(url)).timeout(kCdnRequestTimeout);
      if (response.statusCode != 200) {
        throw CdnFetchException(
          url: url,
          statusCode: response.statusCode,
          message: 'non-200 status',
        );
      }
      return utf8.decode(response.bodyBytes);
    } on TimeoutException catch (e) {
      throw CdnFetchException(url: url, message: 'timeout: $e');
    } on CdnFetchException {
      rethrow;
    } catch (e) {
      throw CdnFetchException(url: url, message: 'transport error: $e');
    }
  }

  void close() => _client.close();
}

/// Raised by [CdnHttpClient] on any failure. Callers catch this and fall
/// back to the bundled-asset path.
class CdnFetchException implements Exception {
  CdnFetchException({
    required this.url,
    this.statusCode,
    required this.message,
  });

  final String url;
  final int? statusCode;
  final String message;

  @override
  String toString() {
    final code = statusCode == null ? '' : ' [HTTP $statusCode]';
    return 'CdnFetchException: $url$code — $message';
  }
}
