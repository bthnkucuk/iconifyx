import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/search/search_page.dart';
import 'app_shell_layout.dart';

/// /search is a transparent overlay route — when pushed, the previous page
/// stays mounted and visible (now blurred) underneath. Closing (pop / esc /
/// backdrop tap) returns to whichever route was active before.
///
/// The current `q` query parameter is tracked via [RouteQueryParameters] so
/// keystrokes in the palette update the URL live (and the URL is the source
/// of truth on direct/refresh navigation). [lastQuery] additionally caches
/// the most recently typed value in-memory so that re-opening the palette
/// (e.g. via ⌘K from another route) restores what the user was last typing.
class SearchRoute extends AppRoute with RouteQueryParameters, RouteTransition {
  SearchRoute({Map<String, String>? initialQueries})
      : queryNotifier = ValueNotifier(
          initialQueries == null || initialQueries.isEmpty
              ? (lastQuery.isEmpty ? const {} : {'q': lastQuery})
              : initialQueries,
        ) {
    // Mirror the live query into the static [lastQuery] so the next push
    // (cmd-K from elsewhere) can seed itself with what the user was typing.
    queryNotifier.addListener(() {
      lastQuery = queryNotifier.value['q'] ?? '';
    });
  }

  /// In-memory cache of the last typed query, used to restore the input
  /// when the palette is re-opened without an explicit `?q=...` URL.
  static String lastQuery = '';

  @override
  final ValueNotifier<Map<String, String>> queryNotifier;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [];

  @override
  Uri toUri() {
    return queries.isEmpty
        ? Uri.parse('/search')
        : Uri(path: '/search', queryParameters: queries);
  }

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      SearchPage(route: this);

  @override
  StackTransition<T> transition<T extends RouteUnique>(
    AppCoordinator coordinator,
  ) {
    return StackTransition<T>.custom(
      builder: (context) => build(coordinator, context),
      pageBuilder: (context, routeKey, child) =>
          _OverlayPage<T>(key: routeKey, child: child),
    );
  }
}

/// Transparent page: previous route stays painted underneath, ours overlays
/// with a blurred dim backdrop and a fade-in.
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
      // A full-frame BackdropFilter beneath the palette content. It applies a
      // Gaussian blur to whatever's painted in the layer below this route —
      // i.e. the underlying page — so the palette sits on a frosted scrim
      // instead of a flat tint.
      child: Stack(
        children: [
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 2, sigmaY: 2),
              child: const ColoredBox(color: Colors.transparent),
            ),
          ),
          SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, -0.02),
              end: Offset.zero,
            ).animate(curve),
            child: child,
          ),
        ],
      ),
    );
  }
}
