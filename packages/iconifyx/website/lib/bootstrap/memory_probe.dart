import 'dart:async';

import 'package:flutter/foundation.dart';

import 'memory_probe_stub.dart'
    if (dart.library.js_interop) 'memory_probe_web.dart' as platform;

/// Periodic memory probe for Flutter web — surfaces a "refresh to reclaim
/// CanvasKit heap" hint when the JS heap (or the more accurate per-origin
/// measurement, when COOP/COEP is in force) grows past [thresholdBytes].
///
/// Implements the soft mitigation half of RESEARCH_PLAN §9:
/// Flutter's [FontLoader] has no public unregister, so the WASM font
/// registry grows monotonically across pack navigation. The hard fix
/// (post-build `FontManifest.json` rewrite) lives in
/// `tools/generator/src/website_codegen.ts`; this is the runtime-only
/// half — detect the dangerous condition and let the user reload.
///
/// Two heap sources, in order of preference:
///
/// 1. `performance.measureUserAgentSpecificMemory()` — accurate, includes
///    CanvasKit's WASM heap, but **requires COOP/COEP cross-origin
///    isolation** (`Cross-Origin-Opener-Policy: same-origin` +
///    `Cross-Origin-Embedder-Policy: require-corp`). GitHub Pages does
///    NOT set these headers today — see `docs/DEPLOYMENT.md` §"COOP/COEP
///    for memory probe (TODO)". So in production this path is currently
///    a no-op until we either (a) self-host with a CDN that lets us set
///    headers, or (b) add a service worker that injects them.
/// 2. `performance.memory.usedJSHeapSize` — Chromium-only legacy API,
///    underestimates the real cost (excludes WASM heap), but works on
///    plain GitHub Pages. Used as a fallback estimator.
///
/// When neither is available (Safari / Firefox), the probe degrades to
/// a pure visit-count signal: after [packVisitCountFallback] unique pack
/// navigations the snackbar fires unconditionally — UNLESS the page is
/// running on a host where we know the accurate API is unreachable (see
/// [unsupportedHostSuffixes]), in which case the visit-count signal is
/// suppressed entirely to avoid alarming the user during normal browsing.
class MemoryProbe {
  MemoryProbe({
    this.thresholdBytes = 350 * 1024 * 1024,
    this.packVisitCountFallback = 150,
    this.pollInterval = const Duration(seconds: 8),
    this.unsupportedHostSuffixes = const <String>['.github.io'],
    this.onThresholdCrossed,
  });

  /// JS-heap usage (bytes) above which the probe surfaces a hint. Default
  /// 350 MB — empirically the WASM font registry blow-up starts past
  /// ~400 MB on a 4 GB Chrome tab, see the website CLAUDE.md note.
  final int thresholdBytes;

  /// Visit-count fallback used when neither memory API is available.
  ///
  /// Raised from 20 → 150 (2026-05-16): the previous value was tuned for
  /// an environment where the accurate `measureUserAgentSpecificMemory()`
  /// API fires first and the visit count is purely a backstop. On GitHub
  /// Pages that API is unreachable (no COOP/COEP), so a 20-visit floor
  /// became the primary signal and routinely fired during normal
  /// browsing. 150 visits is well past any realistic "I'm browsing"
  /// session but still bounds catastrophic crawls.
  final int packVisitCountFallback;

  /// Hostname suffixes where we know the accurate heap API is unreachable
  /// (no COOP/COEP headers possible). On these hosts the visit-count
  /// fallback is **suppressed** — we'd rather show no warning than a
  /// false-positive. Defaults to `['.github.io']`.
  ///
  /// Leave empty (`const []`) to force the visit-count signal regardless
  /// of host — useful for development and CI smoke tests.
  final List<String> unsupportedHostSuffixes;

  /// How often to sample the heap. Each sample is ~1 ms of JS<->Dart
  /// interop; 8 s keeps the overhead well under 0.05 % CPU.
  final Duration pollInterval;

  /// Fires once per session, the first time any signal (heap or visit
  /// count) crosses [thresholdBytes]. The caller wires this to a
  /// `SnackBar` / banner that nudges the user to refresh.
  final VoidCallback? onThresholdCrossed;

  Timer? _timer;
  bool _fired = false;
  bool? _visitCountSuppressed;

  /// Most recent sample, if available. Useful for a debug overlay.
  int? lastSampleBytes;

  /// Most recent source label — `"perf"` / `"jsheap"` / `"visit-count"`
  /// / `"unavailable"`. Useful for a debug overlay.
  String lastSampleSource = 'unavailable';

  /// Hostname captured on first probe tick, e.g. `"bthnkucuk.github.io"`.
  /// Surfaced for debugging.
  String? lastHostname;

  /// Number of unique packs visited this session. Bumped by the page
  /// router after each successful `FontLoaderService.ensurePack`.
  int visitedPackCount = 0;

  /// True when the current host matches one of [unsupportedHostSuffixes]
  /// and the visit-count fallback is being suppressed. Populated on the
  /// first `_tick()`; `null` until then.
  bool? get visitCountSuppressed => _visitCountSuppressed;

  /// Start the periodic probe. Safe to call repeatedly — subsequent
  /// calls are no-ops while a timer is already active. No-op outside
  /// Flutter web (the stub `_sample()` always returns `null`).
  void start() {
    if (!kIsWeb) return;
    _timer ??= Timer.periodic(pollInterval, (_) => _tick());
  }

  /// Stop the probe; releases the timer.
  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// Update the visited-pack count. The probe uses this as a fallback
  /// signal when the platform doesn't expose a heap API.
  void noteVisit(int count) {
    visitedPackCount = count;
    _tick();
  }

  Future<void> _tick() async {
    if (_fired) return;
    // Resolve hostname suppression once (cached for the rest of the
    // session). Cheap JS interop call; returns null off-web.
    _visitCountSuppressed ??= _resolveVisitCountSuppression();
    final sample = await platform.sampleMemoryBytes();
    if (sample != null) {
      lastSampleBytes = sample.bytes;
      lastSampleSource = sample.source;
      if (sample.bytes >= thresholdBytes) {
        _fire();
        return;
      }
    } else {
      lastSampleSource = 'unavailable';
    }
    // Visit-count fallback fires only when we're NOT on a host where the
    // accurate API is known to be unreachable. On GitHub Pages we suppress
    // it entirely — the count-based heuristic has no real heap evidence
    // behind it and would otherwise pop up during normal browsing.
    if (_visitCountSuppressed == true) return;
    if (visitedPackCount >= packVisitCountFallback) {
      lastSampleSource = 'visit-count';
      _fire();
    }
  }

  bool _resolveVisitCountSuppression() {
    final host = platform.currentHostname();
    lastHostname = host;
    if (host == null || host.isEmpty) return false;
    for (final suffix in unsupportedHostSuffixes) {
      if (host == suffix.replaceFirst(RegExp(r'^\.'), '') ||
          host.endsWith(suffix)) {
        return true;
      }
    }
    return false;
  }

  void _fire() {
    if (_fired) return;
    _fired = true;
    final cb = onThresholdCrossed;
    if (cb != null) cb();
  }
}

/// Result of a single memory sample. Returned by the platform-specific
/// `sampleMemoryBytes()` (in `memory_probe_web.dart`) or `null` on
/// non-web / unsupported browsers (stub).
@immutable
class MemorySample {
  const MemorySample({required this.bytes, required this.source});

  /// Sampled bytes — interpretation depends on [source].
  final int bytes;

  /// One of `"perf"` (measureUserAgentSpecificMemory), `"jsheap"`
  /// (Chromium-only performance.memory.usedJSHeapSize). Surfaced for
  /// debugging.
  final String source;
}
