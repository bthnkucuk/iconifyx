import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/home/all_packs_page.dart';
import 'app_shell_layout.dart';

class AllPacksRoute extends AppRoute {
  @override
  Type get layout => AppShellLayout;

  @override
  Uri toUri() => Uri.parse('/packs');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      const AllPacksPage();
}
