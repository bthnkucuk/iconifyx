import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import 'modules/docs_module.dart';
import 'modules/home_module.dart';
import 'modules/pack_module.dart';
import 'modules/search_module.dart';
import 'route.dart';
import 'routes/not_found.dart';
import 'routes/shell/app_shell_layout.dart';
import 'url_history.dart';

/// Global, eagerly-constructed router singleton. Used directly anywhere
/// navigation is needed — no Provider/InheritedWidget required.
final AppCoordinator appCoordinator = AppCoordinator();

class AppCoordinator extends Coordinator<AppRoute>
    with CoordinatorModular<AppRoute> {
  AppCoordinator() {
    defineLayoutParent(AppShellLayout.new);
  }

  late final NavigationPath<AppRoute> shellStack =
      NavigationPath<AppRoute>.createWith(
    label: 'shell',
    coordinator: this,
  )..bindLayout(AppShellLayout.new);

  @override
  List<StackPath> get paths => [...super.paths, shellStack];

  @override
  Set<RouteModule<AppRoute>> defineModules() => {
        HomeModule(this),
        PackModule(this),
        SearchModule(this),
        DocsModule(this),
      };

  @override
  AppRoute notFoundRoute(Uri uri) => NotFoundRoute(uri: uri);

  /// Custom [RouteInformationProvider] that enforces the §27 universal
  /// invariant: query-only updates and pop-back transitions REPLACE the
  /// browser history entry instead of pushing a new one. See
  /// [HistoryAwareRouteInformationProvider] for the full rule.
  late final HistoryAwareRouteInformationProvider _historyAwareProvider =
      HistoryAwareRouteInformationProvider(coordinator: this);

  @override
  RouteInformationProvider get routeInformationProvider =>
      _historyAwareProvider;
}
