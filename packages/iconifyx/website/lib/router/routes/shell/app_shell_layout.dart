import 'package:flutter/material.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../shared/widgets/app_sidebar.dart';
import '../../../shared/widgets/app_topbar.dart';

class AppShellLayout extends AppRoute with RouteLayout<AppRoute> {
  static const double desktopBreakpoint = 960;

  @override
  StackPath<RouteUnique> resolvePath(covariant AppCoordinator coordinator) =>
      coordinator.shellStack;

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= desktopBreakpoint;
        if (isDesktop) {
          return Scaffold(
            body: Column(
              children: [
                const AppTopBar(showMenuButton: false),
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(width: 280, child: AppSidebar()),
                      const VerticalDivider(width: 1),
                      Expanded(child: buildPath(coordinator)),
                    ],
                  ),
                ),
              ],
            ),
          );
        }
        return Scaffold(
          drawer: const Drawer(child: AppSidebar()),
          body: Column(
            children: [
              const AppTopBar(showMenuButton: true),
              Expanded(child: buildPath(coordinator)),
            ],
          ),
        );
      },
    );
  }
}
