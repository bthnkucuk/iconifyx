import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/home/home_page.dart';
import 'app_shell_layout.dart';

class HomeRoute extends AppRoute {
  @override
  Type get layout => AppShellLayout;

  @override
  Uri toUri() => Uri.parse('/');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      const HomePage();
}
