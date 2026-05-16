import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/changelog_route.dart';
import '../routes/shell/docs_route.dart';

class DocsModule extends RouteModule<AppRoute> {
  DocsModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) => switch (uri.pathSegments) {
        ['docs'] => DocsRoute(),
        ['docs', final slug] => DocsRoute(slug: slug),
        ['changelog'] => ChangelogRoute(),
        _ => null,
      };
}
