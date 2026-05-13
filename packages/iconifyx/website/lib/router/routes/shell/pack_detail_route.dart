import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/pack/pack_detail_page.dart';
import 'app_shell_layout.dart';

class PackDetailRoute extends AppRoute {
  PackDetailRoute({required this.prefix});

  final String prefix;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [prefix];

  @override
  Uri toUri() => Uri.parse('/pack/$prefix');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      PackDetailPage(prefix: prefix);
}
