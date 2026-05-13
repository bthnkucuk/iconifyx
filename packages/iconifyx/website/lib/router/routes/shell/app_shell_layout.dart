import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_topbar.dart';
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
        return CallbackShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () =>
                appCoordinator.push(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.keyK, control: true): () =>
                appCoordinator.push(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.slash): () =>
                appCoordinator.push(SearchRoute()),
          },
          child: Focus(
            autofocus: true,
            child: Scaffold(
              body: Column(
                children: [
                  AppTopBar(showMenuButton: !isDesktop),
                  Expanded(child: buildPath(coordinator)),
                ],
              ),
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
  }) : slivers = null;

  /// Use when the page provides slivers directly (e.g. pages with big lazy
  /// grids). Each sliver must be a Sliver-class widget. The footer is auto-
  /// appended at the end.
  const PageContainer.slivers({
    super.key,
    required List<Widget> this.slivers,
    this.showFooter = true,
  }) : children = const [];

  final List<Widget> children;
  final List<Widget>? slivers;
  final bool showFooter;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: LayoutBuilder(
        builder: (context, c) {
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);
          if (slivers != null) {
            return CustomScrollView(
              slivers: [
                for (final s in slivers!)
                  SliverPadding(
                      padding:
                          EdgeInsets.symmetric(horizontal: pad), sliver: s),
                if (showFooter)
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: const SliverToBoxAdapter(child: SiteFooter()),
                  ),
              ],
            );
          }
          return CustomScrollView(
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
