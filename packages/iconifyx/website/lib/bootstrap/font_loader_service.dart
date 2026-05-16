import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show FontLoader, rootBundle;

import 'icon_catalog.dart';

/// Lazy per-pack TTF registration to bound CanvasKit's WASM-heap font growth.
///
/// Implements RESEARCH_PLAN §9 — "Lazy `FontLoader` per pack". The website
/// depends on every `iconifyx_*` package, so each pack's TTF is in
/// `flutter_assets/packages/iconifyx_<prefix>/assets/fonts/<family>.ttf` and
/// declared in `FontManifest.json`. Flutter web's CanvasKit engine fetches
/// and registers a font on first glyph reference and never unloads it; over
/// a long session of pack-hopping the heap grows monotonically until
/// `RuntimeError: memory access out of bounds` — see [website CLAUDE.md
/// §Icon font budget](../../CLAUDE.md).
///
/// This service:
///
/// 1. Exposes [ensurePack] — fetch `rootBundle.load()` for each TTF in the
///    pack's `fontFamilies` and register via [FontLoader.load], in parallel.
///    Idempotent (tracked in [_loaded]). Calls are awaited by callers
///    (pack-detail page, icon-detail sheet) before they render icons, so
///    we never paint a glyph against an unregistered font.
/// 2. Tracks load-order in [_loadOrder] so a future eviction / refresh
///    prompt can target the oldest packs first.
/// 3. Counts unique packs visited so the memory probe can offer a refresh
///    suggestion when usage crosses a threshold.
///
/// **Why this isn't an unload mechanism.** Flutter's [FontLoader] API has
/// no public `unload` / `unregister`. Once CanvasKit accepts a font into
/// its registry the WASM heap pages stay allocated. The only escape is
/// `window.location.reload()`, which the companion `MemoryProbe` surfaces
/// as a user-facing snackbar when `performance.measureUserAgentSpecificMemory()`
/// crosses [MemoryProbe.thresholdBytes].
class FontLoaderService {
  FontLoaderService._();

  static final FontLoaderService instance = FontLoaderService._();

  /// Prefixes whose fonts have completed registration. Reads & writes are
  /// on the platform thread (Flutter web is single-threaded), so a plain
  /// [Set] is enough.
  final Set<String> _loaded = <String>{};

  /// In-flight futures keyed by prefix. Multiple callers awaiting the
  /// same pack share the same load, so we never fire two parallel
  /// [FontLoader.load] calls for the same TTF.
  final Map<String, Future<void>> _inFlight = <String, Future<void>>{};

  /// Load order — newest at the end. The memory-probe UX uses [length]
  /// as a coarse "packs visited" counter alongside its heap probe.
  final List<String> _loadOrder = <String>[];

  /// Read-only view of [_loadOrder] for the probe / debug UI.
  List<String> get loadedPacks => List<String>.unmodifiable(_loadOrder);

  /// Returns `true` once every TTF declared by [pack] is registered.
  bool isLoaded(String prefix) => _loaded.contains(prefix);

  /// Ensure every font family declared by [pack] is registered before
  /// returning. Idempotent and concurrency-safe.
  ///
  /// Resolution path per family:
  ///   asset = `packages/<pack.packageName>/assets/fonts/<family>.ttf`
  ///   loader family key = `packages/<pack.packageName>/<family>`
  ///
  /// The loader-family key matches what Flutter resolves
  /// `IconData(cp, fontFamily: <family>, fontPackage: <pack.packageName>)`
  /// to at paint time, so subsequent [TextPainter.paint] calls find the
  /// glyph data we just registered.
  Future<void> ensurePack(PackSummary pack) {
    final prefix = pack.prefix;
    if (_loaded.contains(prefix)) return Future<void>.value();
    final inFlight = _inFlight[prefix];
    if (inFlight != null) return inFlight;
    final future = _loadPack(pack).whenComplete(() {
      _inFlight.remove(prefix);
    });
    _inFlight[prefix] = future;
    return future;
  }

  Future<void> _loadPack(PackSummary pack) async {
    if (pack.fontFamilies.isEmpty) {
      _loaded.add(pack.prefix);
      _loadOrder.add(pack.prefix);
      return;
    }
    try {
      await Future.wait([
        for (final family in pack.fontFamilies)
          _loadOne(pack.packageName, family),
      ]);
      _loaded.add(pack.prefix);
      _loadOrder.add(pack.prefix);
    } catch (err, st) {
      // A single TTF failure shouldn't poison the rest of the session.
      // Surface in debug; release builds silently fall back to the missing-
      // glyph tofu so the page still renders.
      debugPrint('[FontLoaderService] pack=${pack.prefix} failed: $err\n$st');
      // Mark as "attempted" so we don't retry on every nav — a transient
      // 404 / network blip can resolve on next full reload.
      _loaded.add(pack.prefix);
      _loadOrder.add(pack.prefix);
    }
  }

  Future<void> _loadOne(String packageName, String family) async {
    final asset = 'packages/$packageName/assets/fonts/$family.ttf';
    final familyKey = 'packages/$packageName/$family';
    final data = await rootBundle.load(asset);
    final loader = FontLoader(familyKey)
      ..addFont(Future<ByteData>.value(data));
    await loader.load();
  }

  /// Number of unique packs whose fonts have been registered this session.
  /// Used by the memory probe to decide when to surface a refresh hint.
  int get loadedPackCount => _loadOrder.length;
}
