import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/icon_detail_route.dart';
import '../routes/shell/pack_detail_route.dart';

class PackModule extends RouteModule<AppRoute> {
  PackModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) => switch (uri.pathSegments) {
        ['pack', final prefix] => PackDetailRoute(
            prefix: prefix,
            initialQueries: Map<String, String>.from(uri.queryParameters),
          ),
        ['pack', final prefix, 'icon', final name] => IconDetailRoute(
            prefix: prefix,
            name: Uri.decodeComponent(name),
            initialQueries: Map<String, String>.from(uri.queryParameters),
          ),
        _ => null,
      };
}
