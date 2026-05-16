import 'package:flutter/widgets.dart';

import '../../../features/docs/docs_page.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'docs_route.dart';

/// One docs sub-tab — `/docs/<slug>`. Lives inside the [DocsRoute]'s
/// inner [IndexedStackPath] so tab switches preserve scroll position and
/// don't push a new entry per sub-tab visit.
///
/// `slug` is one of: `overview`, `architecture`, `duotone`,
/// `flutter-3-44-icondata`, `pipeline`, `backers`. URL `/docs` (no slug)
/// resolves to `DocsTabRoute(slug: 'overview')` so the indexed stack
/// always has a definitive active entry.
class DocsTabRoute extends AppRoute {
  DocsTabRoute({required this.slug});

  /// Doc slug. Always non-null inside the indexed stack — `/docs` maps to
  /// `overview` at URL parse time.
  final String slug;

  @override
  Type get layout => DocsRoute;

  @override
  List<Object?> get props => [slug];

  @override
  Uri toUri() =>
      slug == 'overview' ? Uri.parse('/docs') : Uri.parse('/docs/$slug');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      DocsTabBody(slug: slug);
}
