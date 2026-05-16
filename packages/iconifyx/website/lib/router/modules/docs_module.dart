import 'dart:async';

import 'package:zenrouter_core/zenrouter_core.dart';

import '../route.dart';
import '../routes/shell/changelog_route.dart';
import '../routes/shell/docs_tab_route.dart';

class DocsModule extends RouteModule<AppRoute> {
  DocsModule(super.coordinator);

  @override
  FutureOr<AppRoute?> parseRouteFromUri(Uri uri) => switch (uri.pathSegments) {
        // `/docs` lands on the overview sub-tab. Routing always resolves to
        // a concrete `DocsTabRoute` so the inner `IndexedStackPath` has a
        // definitive active entry; `DocsRoute` itself is the layout shell.
        ['docs'] => DocsTabRoute(slug: 'overview'),
        ['docs', final slug] => DocsTabRoute(slug: slug),
        ['changelog'] => ChangelogRoute(),
        _ => null,
      };
}
