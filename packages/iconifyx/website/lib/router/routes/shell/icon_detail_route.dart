import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/icon_detail/icon_detail_page.dart';
import 'app_shell_layout.dart';

class IconDetailRoute extends AppRoute {
  IconDetailRoute({required this.prefix, required this.name});

  final String prefix;
  final String name;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [prefix, name];

  @override
  Uri toUri() => Uri.parse('/pack/$prefix/icon/${Uri.encodeComponent(name)}');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      IconDetailPage(prefix: prefix, name: name);
}
