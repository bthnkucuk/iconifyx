import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_topbar.dart';
import '../../../shared/widgets/site_footer.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'search_route.dart';

/// Sticky frosted top nav + page content. Each page provides its content via
/// [PageContainer]. The mobile drawer is shown via [MobileDrawer.show], not
/// the Scaffold drawer, so it slides DOWN from below the nav.
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
class PageContainer extends StatelessWidget {
  const PageContainer({
    super.key,
    required this.children,
    this.showFooter = true,
  });

  final List<Widget> children;
  final bool showFooter;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: EdgeInsets.zero,
            sliver: SliverList(
              delegate: SliverChildListDelegate.fixed([
                _CenteredColumn(children: children),
                if (showFooter) const _CenteredColumn(children: [SiteFooter()]),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _CenteredColumn extends StatelessWidget {
  const _CenteredColumn({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints:
            const BoxConstraints(maxWidth: AppShellLayout.pageMaxWidth),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: children,
        ),
      ),
    );
  }
}
