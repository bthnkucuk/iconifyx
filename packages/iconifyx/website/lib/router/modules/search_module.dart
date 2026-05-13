import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/search_route.dart';

class SearchModule extends RouteModule<AppRoute> {
  SearchModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) {
    if (uri.pathSegments.length == 1 && uri.pathSegments.first == 'search') {
      return SearchRoute(query: uri.queryParameters['q'] ?? '');
    }
    return null;
  }
}
