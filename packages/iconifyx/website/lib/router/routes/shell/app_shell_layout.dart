import 'package:flutter/material.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_sidebar.dart';
import '../../../shared/widgets/app_topbar.dart';
import '../../../shared/widgets/site_footer.dart';
import '../../coordinator.dart';
import '../../route.dart';

/// Sticky frosted top nav + page content. Each page provides its own slivers
/// — [PageContainer.slivers] handles the 1240px max-width column + footer.
class AppShellLayout extends AppRoute with RouteLayout<AppRoute> {
  static const double desktopBreakpoint = 960;
  static const double pageMaxWidth = 1240;

  @override
  StackPath<RouteUnique> resolvePath(covariant AppCoordinator coordinator) =>
      coordinator.shellStack;

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= desktopBreakpoint;
        return Scaffold(
          drawer: isDesktop ? null : const Drawer(child: AppSidebar()),
          body: Column(
            children: [
              AppTopBar(showMenuButton: !isDesktop),
              Expanded(child: buildPath(coordinator)),
            ],
          ),
        );
      },
    );
  }
}

/// Centers page content in the 1240px max-width column via a CustomScrollView.
///
/// Pages provide a list of regular widgets via [children]; this wrapper places
/// them in a SliverList (so flex/Spacer in deeply-nested children still works
/// once each child gets a bounded box), centers the column horizontally, and
/// appends the [SiteFooter] at the bottom.
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
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: EdgeInsets.zero,
          sliver: SliverList(
            delegate: SliverChildListDelegate.fixed([
              _CenteredColumn(children: children),
              if (showFooter)
                const _CenteredColumn(children: [SiteFooter()]),
            ]),
          ),
        ),
      ],
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
