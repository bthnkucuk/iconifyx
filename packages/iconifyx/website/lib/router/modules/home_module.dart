import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/all_packs_route.dart';
import '../routes/shell/home_route.dart';

class HomeModule extends RouteModule<AppRoute> {
  HomeModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) => switch (uri.pathSegments) {
        [] => HomeRoute(),
        ['packs'] => AllPacksRoute(
            initialQueries: Map<String, String>.from(uri.queryParameters),
          ),
        _ => null,
      };
}
