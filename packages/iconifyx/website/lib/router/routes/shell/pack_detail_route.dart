import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/pack/pack_detail_page.dart';
import 'app_shell_layout.dart';

/// `/pack/:prefix?style=<suffix>&q=<text>` — pack detail page.
/// Style and in-pack filter live in URL via [RouteQueryParameters].
class PackDetailRoute extends AppRoute with RouteQueryParameters {
  PackDetailRoute({required this.prefix, Map<String, String>? initialQueries})
      : queryNotifier = ValueNotifier(initialQueries ?? const {});

  final String prefix;

  @override
  final ValueNotifier<Map<String, String>> queryNotifier;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [prefix];

  @override
  Uri toUri() {
    final base = '/pack/$prefix';
    return queries.isEmpty
        ? Uri.parse(base)
        : Uri(path: base, queryParameters: queries);
  }

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      PackDetailPage(route: this);
}
