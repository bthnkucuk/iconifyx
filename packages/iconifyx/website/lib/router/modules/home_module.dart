import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/category_route.dart';
import '../routes/shell/home_route.dart';

class HomeModule extends RouteModule<AppRoute> {
  HomeModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) => switch (uri.pathSegments) {
        [] => HomeRoute(),
        ['categories', final slug] => CategoryRoute(slug: slug),
        _ => null,
      };
}
