import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/search/search_page.dart';
import 'app_shell_layout.dart';

class SearchRoute extends AppRoute {
  SearchRoute({this.query = ''});

  final String query;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [query];

  @override
  Uri toUri() => query.isEmpty
      ? Uri.parse('/search')
      : Uri(path: '/search', queryParameters: {'q': query});

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      SearchPage(initialQuery: query);
}
