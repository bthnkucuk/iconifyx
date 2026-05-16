import 'package:flutter/widgets.dart';

import '../../../features/docs/docs_page.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'app_shell_layout.dart';

/// `/docs` — overview / index of available docs.
/// `/docs/<slug>` — a specific markdown doc, rendered inline.
///
/// Slug is one of: `architecture`, `duotone`, `flutter-3-44-icondata`,
/// `pipeline`. The `overview` slug is the implicit landing page when
/// no slug is provided in the URL; `DocsRoute()` with `slug: null`
/// renders the docs index.
class DocsRoute extends AppRoute {
  DocsRoute({this.slug});

  /// Doc slug. `null` means `/docs` (the overview / index page).
  final String? slug;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [slug];

  @override
  Uri toUri() {
    return slug == null
        ? Uri.parse('/docs')
        : Uri.parse('/docs/$slug');
  }

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      DocsPage(slug: slug);
}
