import 'package:zenrouter/zenrouter.dart';

import 'modules/home_module.dart';
import 'modules/pack_module.dart';
import 'modules/search_module.dart';
import 'route.dart';
import 'routes/not_found.dart';
import 'routes/shell/app_shell_layout.dart';

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
      };

  @override
  AppRoute notFoundRoute(Uri uri) => NotFoundRoute(uri: uri);
}
