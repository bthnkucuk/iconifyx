import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/home/all_packs_page.dart';
import 'app_shell_layout.dart';

/// `/packs?cat=<slug>&q=<text>` — all-packs listing with optional category +
/// pack-name filter encoded in the URL query.
///
/// Uses zenrouter's [RouteQueryParameters] mixin: the `queryNotifier` drives
/// targeted rebuilds inside the page via `selectorBuilder`, and
/// `updateQueries` keeps the URL bar in sync without re-navigating.
class AllPacksRoute extends AppRoute with RouteQueryParameters {
  AllPacksRoute({Map<String, String>? initialQueries})
      : queryNotifier = ValueNotifier(initialQueries ?? const {});

  @override
  final ValueNotifier<Map<String, String>> queryNotifier;

  @override
  Type get layout => AppShellLayout;

  @override
  Uri toUri() => queries.isEmpty
      ? Uri.parse('/packs')
      : Uri(path: '/packs', queryParameters: queries);

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      AllPacksPage(route: this);
}
