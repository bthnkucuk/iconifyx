import 'package:flutter/material.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/search/search_page.dart';
import 'app_shell_layout.dart';

/// /search is a transparent overlay route — when pushed, the previous page
/// stays mounted and visible underneath. Closing (pop / esc / backdrop tap)
/// returns to whichever route was active before.
class SearchRoute extends AppRoute with RouteTransition {
  SearchRoute({this.query = ''});

  final String query;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [query];

  @override
  Uri toUri() => query.isEmpty
      ? Uri.parse('/search')
      : Uri(path: '/search', queryParameters: {'q': query});

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      SearchPage(initialQuery: query);

  @override
  StackTransition<T> transition<T extends RouteUnique>(
    covariant CoordinatorCore coordinator,
  ) {
    return StackTransition<T>.custom(
      builder: (context) => SearchPage(initialQuery: query),
      pageBuilder: (context, routeKey, child) =>
          _OverlayPage<T>(key: routeKey, child: child),
    );
  }
}

/// Transparent page: previous route stays painted underneath, ours overlays
/// with a dim backdrop and a fade-in.
class _OverlayPage<T> extends Page<T> {
  const _OverlayPage({super.key, required this.child});

  final Widget child;

  @override
  Route<T> createRoute(BuildContext context) {
    return _OverlayRoute<T>(settings: this, child: child);
  }
}

class _OverlayRoute<T> extends PageRoute<T> {
  _OverlayRoute({super.settings, required this.child});

  final Widget child;

  @override
  bool get opaque => false;

  @override
  bool get maintainState => true;

  @override
  Color? get barrierColor => const Color(0x6B0E1320);

  @override
  bool get barrierDismissible => true;

  @override
  String? get barrierLabel => 'Close search';

  @override
  Duration get transitionDuration => const Duration(milliseconds: 160);

  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 140);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    final curve = CurvedAnimation(
      parent: animation,
      curve: const Cubic(.2, .7, .3, 1),
    );
    return FadeTransition(
      opacity: curve,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, -0.02),
          end: Offset.zero,
        ).animate(curve),
        child: child,
      ),
    );
  }
}
