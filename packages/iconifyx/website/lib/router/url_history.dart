import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

/// Custom [RouteInformationProvider] that enforces the universal invariant
/// documented in `docs/RESEARCH_PLAN.md` §27 — Sheet back-button routing bug.
///
/// **The invariant:**
///
/// > A path-stack mutation that does not change the URL's path segments
/// > (only changes queries, or shrinks back to a parent path previously on
/// > the stack) MUST report with [RouteInformationReportingType.neglect]
/// > (= browser `history.replaceState`). Only strictly forward navigation
/// > (new path segments first encountered) should push.
///
/// Without this, every keystroke in a filter `TextField` and every sheet
/// dismiss creates a new browser history entry. Browser-back then has to
/// step through all of them, and — worse — pressing back after closing a
/// sheet re-opens it (because the post-close "push" recorded the parent
/// URL as a brand new history entry that, when traversed back to, makes
/// the URL parser re-construct the sheet).
///
/// **How it works**
///
/// On every [routerReportsNewRouteInformation] call, we compare the new
/// URI's path segments with the previously-reported URI's path segments:
///
/// - Same path segments → query-only update → force `neglect` (replace).
/// - New path is a prefix of the previous → popping back to a parent →
///   force `neglect` (replace).
/// - Otherwise → strictly-forward navigation → keep the caller's intent
///   (defaults to push).
///
/// Path-segments comparison ignores trailing empty segments so `/packs`
/// and `/packs/` are treated as identical.
class HistoryAwareRouteInformationProvider
    extends CoordinatorRouteInformationProvider {
  HistoryAwareRouteInformationProvider({required super.coordinator});

  Uri? _lastReportedUri;

  @override
  void routerReportsNewRouteInformation(
    RouteInformation routeInformation, {
    RouteInformationReportingType type = RouteInformationReportingType.none,
  }) {
    final newUri = routeInformation.uri;
    final prevUri = _lastReportedUri;
    _lastReportedUri = newUri;

    // The router's explicit intentions (`navigate`, `neglect`) win — we
    // only intervene when the router's intention is `none`. This keeps
    // imperative `Router.navigate(...)` / `Router.neglect(...)` calls
    // honoured exactly as written.
    var effectiveType = type;
    if (type == RouteInformationReportingType.none && prevUri != null) {
      if (_shouldReplace(prevUri, newUri)) {
        effectiveType = RouteInformationReportingType.neglect;
      }
    }
    super.routerReportsNewRouteInformation(
      routeInformation,
      type: effectiveType,
    );
  }

  /// `true` when transitioning from [prev] to [next] should REPLACE the
  /// current browser history entry rather than push a new one.
  ///
  /// Rule of thumb:
  /// - Same path segments → query-only mutation → replace.
  /// - [next] is a "prefix" of [prev] (popping back) → replace.
  ///
  /// Everything else → push (default behaviour preserved).
  static bool _shouldReplace(Uri prev, Uri next) {
    final prevSegs = _normalize(prev.pathSegments);
    final nextSegs = _normalize(next.pathSegments);

    // Equal path segments — only the query / fragment changed.
    if (_listEquals(prevSegs, nextSegs)) return true;

    // Popping back to a parent route (e.g. `/pack/mdi/icon/home` → `/pack/
    // mdi`). The new path is a proper prefix of the old one.
    if (nextSegs.length < prevSegs.length) {
      for (var i = 0; i < nextSegs.length; i++) {
        if (nextSegs[i] != prevSegs[i]) return false;
      }
      return true;
    }

    return false;
  }

  static List<String> _normalize(List<String> segs) {
    if (segs.isEmpty) return segs;
    final last = segs.length - 1;
    if (segs[last].isEmpty) return segs.sublist(0, last);
    return segs;
  }

  static bool _listEquals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
