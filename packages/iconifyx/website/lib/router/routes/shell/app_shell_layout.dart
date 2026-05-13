import 'package:flutter/material.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_sidebar.dart';
import '../../../shared/widgets/app_topbar.dart';
import '../../../shared/widgets/site_footer.dart';
import '../../coordinator.dart';
import '../../route.dart';

/// Sticky frosted top nav + page content. Each page handles its own scrolling
/// (and can use [PageContainer] for the standard 1240px max-width + footer).
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

/// Centers a page in the 1240px max-width column inside a SingleChildScrollView.
/// Optionally appends [SiteFooter] inside the same scroll view.
class PageContainer extends StatelessWidget {
  const PageContainer({
    super.key,
    required this.child,
    this.showFooter = true,
  });

  final Widget child;
  final bool showFooter;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Center(
        child: ConstrainedBox(
          constraints:
              const BoxConstraints(maxWidth: AppShellLayout.pageMaxWidth),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              child,
              if (showFooter) const SiteFooter(),
            ],
          ),
        ),
      ),
    );
  }
}
