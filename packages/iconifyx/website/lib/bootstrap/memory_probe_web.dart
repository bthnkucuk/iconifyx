import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'memory_probe.dart' show MemorySample;

/// Web implementation of the memory probe sampler. See
/// [MemoryProbe] for the contract.
///
/// Two browser APIs tried in priority order:
///
/// 1. **`performance.measureUserAgentSpecificMemory()`** — preferred when
///    available. Returns a Promise resolving to `{bytes, breakdown}`
///    where `bytes` is the total reachable JS+WASM memory for this
///    origin. Requires the page to be in a cross-origin-isolated state,
///    which means the server must set:
///        Cross-Origin-Opener-Policy: same-origin
///        Cross-Origin-Embedder-Policy: require-corp
///    GitHub Pages does not (yet) ship these headers — see
///    `docs/DEPLOYMENT.md` §"COOP/COEP for memory probe".
///
/// 2. **`performance.memory.usedJSHeapSize`** — Chromium-only legacy API,
///    no header requirement. Underestimates the real cost (CanvasKit's
///    WASM heap lives in a separate ArrayBuffer that this number does
///    not include), so we use it as a coarse signal only.
///
/// Both calls are wrapped in a try/catch — neither is in any web standard
/// yet, and we'd rather degrade silently than crash on browsers that
/// throw rather than return `undefined` for the missing methods.
Future<MemorySample?> sampleMemoryBytes() async {
  // Prefer the accurate API when cross-origin isolation is on.
  try {
    final perf = _globalThis.getProperty<JSObject?>('performance'.toJS);
    if (perf != null) {
      final coi = _globalThis.getProperty<JSBoolean?>(
              'crossOriginIsolated'.toJS) ??
          false.toJS;
      if (coi.toDart && perf.has('measureUserAgentSpecificMemory')) {
        final p = perf.callMethod<JSPromise<JSAny?>>(
            'measureUserAgentSpecificMemory'.toJS);
        final result = await p.toDart;
        if (result != null) {
          final obj = result as JSObject;
          final bytes = obj.getProperty<JSNumber?>('bytes'.toJS);
          if (bytes != null) {
            return MemorySample(
              bytes: bytes.toDartInt,
              source: 'perf',
            );
          }
        }
      }
      // Fallback: Chrome's legacy non-standard performance.memory.
      final mem = perf.getProperty<JSObject?>('memory'.toJS);
      if (mem != null) {
        final used = mem.getProperty<JSNumber?>('usedJSHeapSize'.toJS);
        if (used != null) {
          return MemorySample(
            bytes: used.toDartInt,
            source: 'jsheap',
          );
        }
      }
    }
  } catch (_) {
    // Either the API threw, the COOP/COEP guard tripped, or a browser
    // returned `undefined`. Treat as unavailable; the probe falls back
    // to its visit-count signal.
  }
  return null;
}

@JS('globalThis')
external JSObject get _globalThis;
