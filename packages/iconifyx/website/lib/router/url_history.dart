import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

/// Custom [RouteInformationProvider] that enforces the universal invariant
/// documented in `docs/RESEARCH_PLAN.md` §27 — Sheet back-button routing bug.
///
/// **The invariant:**
///
/// > A path-stack mutation that does not change the URL's path segments
/// > (only changes queries, or shrinks back to a parent path previously on
/// > the stack, or swaps sibling routes that differ only in a trailing
/// > segment) MUST report with [RouteInformationReportingType.neglect]
/// > (= browser `history.replaceState`). Only strictly forward navigation
/// > (genuinely new path segments first encountered) should push.
///
/// Without this, every keystroke in a filter `TextField`, every sheet
/// dismiss, and every icon click on the pack-detail page creates a NEW
/// browser history entry. Browser-back then has to step through all of
/// them — typing "home" in the filter consumes 4 back presses; opening
/// 3 icons in a row before dismissing the sheet requires 4 back presses
/// to leave the pack page (one to close the sheet, three to undo the
/// pushed `/pack/foo/icon/X` URLs).
///
/// **How it works**
///
/// On every [routerReportsNewRouteInformation] call, we compare the new
/// URI's path segments with the previously-reported URI's path segments:
///
/// - Same path segments → query-only update → force `neglect` (replace).
/// - New path is a prefix of the previous → popping back to a parent →
///   force `neglect` (replace).
/// - New path differs only in its LAST segment AND the previous URI
///   matched the `/pack/<prefix>/icon/<name>` shape → switching between
///   sibling icon-detail routes on the same pack → force `neglect`
///   (replace). This is the icon-detail sheet sibling-swap case.
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
  /// - Sibling swap within the icon-detail sheet (`/pack/<p>/icon/A` →
  ///   `/pack/<p>/icon/B`) → replace.
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

    // Sibling swap within the icon-detail sheet:
    //   `/pack/<prefix>/icon/<a>` → `/pack/<prefix>/icon/<b>`
    // Both URIs have the same length and identical prefix, differing only
    // in the LAST segment. Opening another icon-detail sheet while one is
    // already on top should REPLACE the top entry rather than push a new
    // one — otherwise N icon clicks during one sheet session each leak a
    // history entry that the user has to back-step through after dismiss.
    if (nextSegs.length == prevSegs.length && nextSegs.length >= 2) {
      var allButLastEqual = true;
      for (var i = 0; i < nextSegs.length - 1; i++) {
        if (nextSegs[i] != prevSegs[i]) {
          allButLastEqual = false;
          break;
        }
      }
      if (allButLastEqual) return true;
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
