import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/home/category_page.dart';
import 'app_shell_layout.dart';

class CategoryRoute extends AppRoute {
  CategoryRoute({required this.slug});

  final String slug;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [slug];

  @override
  Uri toUri() => Uri.parse('/categories/$slug');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      CategoryPage(slug: slug);
}
