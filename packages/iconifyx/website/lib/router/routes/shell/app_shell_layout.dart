import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_topbar.dart';
import '../../../shared/widgets/selection_tray.dart';
import '../../../shared/widgets/site_footer.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'search_route.dart';

/// Sticky frosted top nav + page content. Pages render via [PageContainer]
/// (regular children) or [PageContainer.slivers] (when a large lazy grid is
/// needed — pack detail / all-packs).
class AppShellLayout extends AppRoute with RouteLayout<AppRoute> {
  static const double desktopBreakpoint = 900;
  static const double pageMaxWidth = 1240;

  @override
  StackPath<RouteUnique> resolvePath(covariant AppCoordinator coordinator) =>
      coordinator.shellStack;

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= desktopBreakpoint;
        // App-level keyboard shortcuts. The bare `/` activator is filtered
        // by Flutter's own shortcut machinery: a focused `EditableText`
        // installs a higher-priority `Actions` block that consumes character
        // keys before they reach this layer, so `/` inside a text field
        // still inserts a literal slash and does NOT open the palette.
        return CallbackShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () =>
                appCoordinator.pushOrMoveToTop(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.keyK, control: true): () =>
                appCoordinator.pushOrMoveToTop(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.slash): () =>
                appCoordinator.pushOrMoveToTop(SearchRoute()),
          },
          child: Scaffold(
            body: Column(
              children: [
                AppTopBar(showMenuButton: !isDesktop),
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(child: buildPath(coordinator)),
                      // Sticky bottom selection tray — only mounted when the
                      // SelectionCubit's set is non-empty. See §10 in
                      // `docs/RESEARCH_PLAN.md` for the full spec.
                      const Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: SelectionTray(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Centers a page in the 1240px max-width column inside a [CustomScrollView].
///
/// Two construction modes:
/// - `PageContainer(children: [...])` — wraps regular widgets in slivers; the
///   default. Footer is auto-appended.
/// - `PageContainer.slivers(slivers: [...])` — when the page already provides
///   slivers (lazy `SliverGrid.builder`s for thousands of icons). Each sliver
///   is centered in the 1240 max-width column via a `SliverConstrainedCross
///   Axis`-style alignment achieved by horizontal padding from the viewport.
class PageContainer extends StatelessWidget {
  const PageContainer({
    super.key,
    required this.children,
    this.showFooter = true,
    this.cacheExtent,
  }) : slivers = null;

  /// Use when the page provides slivers directly (e.g. pages with big lazy
  /// grids). Each sliver must be a Sliver-class widget. The footer is auto-
  /// appended at the end.
  ///
  /// [cacheExtent] (pixels) — passed through to the inner [CustomScrollView]
  /// so heavy lazy grids (pack detail's 15k-icon `SliverGrid.builder`) can
  /// pre-warm cells above/below the viewport. Default is Flutter's 250 px;
  /// pages with expensive per-cell builds should pass something larger so
  /// scrolling stays smooth.
  const PageContainer.slivers({
    super.key,
    required List<Widget> this.slivers,
    this.showFooter = true,
    this.cacheExtent,
  }) : children = const [];

  final List<Widget> children;
  final List<Widget>? slivers;
  final bool showFooter;
  final double? cacheExtent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: LayoutBuilder(
        builder: (context, c) {
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);
          final scrollCache = cacheExtent == null
              ? null
              : ScrollCacheExtent.pixels(cacheExtent!);
          if (slivers != null) {
            return CustomScrollView(
              scrollCacheExtent: scrollCache,
              slivers: [
                for (final s in slivers!)
                  SliverPadding(
                      padding: EdgeInsets.symmetric(horizontal: pad),
                      sliver: s),
                if (showFooter)
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: const SliverToBoxAdapter(child: SiteFooter()),
                  ),
              ],
            );
          }
          return CustomScrollView(
            scrollCacheExtent: scrollCache,
            slivers: [
              SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: pad),
                sliver: SliverList(
                  delegate: SliverChildListDelegate.fixed([
                    Column(mainAxisSize: MainAxisSize.min, children: children),
                    if (showFooter) const SiteFooter(),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
