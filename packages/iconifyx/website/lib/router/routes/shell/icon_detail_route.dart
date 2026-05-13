import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:stupid_simple_sheet/stupid_simple_sheet.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/icon_detail/icon_detail_page.dart';
import 'app_shell_layout.dart';

class IconDetailRoute extends AppRoute with RouteTransition {
  IconDetailRoute({required this.prefix, required this.name});

  final String prefix;
  final String name;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [prefix, name];

  @override
  Uri toUri() => Uri.parse('/pack/$prefix/icon/${Uri.encodeComponent(name)}');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      IconDetailPage(prefix: prefix, name: name);

  @override
  StackTransition<T> transition<T extends RouteUnique>(
    AppCoordinator coordinator,
  ) {
    return StackTransition.custom(
      builder: (context) => build(coordinator, context),
      pageBuilder: (context, routeKey, child) => _StupidSheetPage<T>(
        key: routeKey,
        child: child,
      ),
    );
  }
}

class _StupidSheetPage<T> extends Page<T> {
  const _StupidSheetPage({super.key, required this.child});

  final Widget child;

  @override
  Route<T> createRoute(BuildContext context) {
    return StupidSimpleSheetRoute<T>(
      settings: this,
      motion: const CupertinoMotion.smooth(),
      originateAboveBottomViewInset: true,
      backgroundSnapshotMode: RouteSnapshotMode.openAndForward,
      child: child,
    );
  }
}
