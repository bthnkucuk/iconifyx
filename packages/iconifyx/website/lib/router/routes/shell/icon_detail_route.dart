import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:stupid_simple_sheet/stupid_simple_sheet.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/icon_detail/icon_detail_page.dart';
import 'app_shell_layout.dart';

/// `/pack/<prefix>/icon/<name>?size=&color=&secondary=&opacity=` —
/// icon-detail sheet route.
///
/// Carries the pack-detail page's slider state (size / colour / secondary
/// colour / opacity) forward via [RouteQueryParameters]. The icon-detail
/// page only READS these — there's no UI to mutate them inside the sheet.
/// Mutation lives on the pack-detail sidebar (see [PackDetailRoute]).
///
/// URL form: `/pack/mdi/icon/home?size=48&color=2563eb`. Hex colours are
/// no-`#`, lowercased.
class IconDetailRoute extends AppRoute
    with RouteTransition, RouteQueryParameters {
  IconDetailRoute({
    required this.prefix,
    required this.name,
    Map<String, String>? initialQueries,
  }) : queryNotifier = ValueNotifier(initialQueries ?? const {});

  final String prefix;
  final String name;

  @override
  final ValueNotifier<Map<String, String>> queryNotifier;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [prefix, name];

  @override
  Uri toUri() {
    final base = '/pack/$prefix/icon/${Uri.encodeComponent(name)}';
    return queries.isEmpty
        ? Uri.parse(base)
        : Uri(path: base, queryParameters: queries);
  }

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      IconDetailPage(route: this);

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
