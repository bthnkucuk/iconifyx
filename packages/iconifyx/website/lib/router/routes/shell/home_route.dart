import 'package:flutter/widgets.dart';

import '../../coordinator.dart';
import '../../route.dart';
import '../../../features/home/home_page.dart';
import 'shell_tabs_layout.dart';

/// `/` — the home tab. Lives inside the [ShellTabsLayout]'s
/// [IndexedStackPath] so switching to other top-bar tabs preserves the
/// home page's scroll position.
class HomeRoute extends AppRoute {
  @override
  Type get layout => ShellTabsLayout;

  @override
  Uri toUri() => Uri.parse('/');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      const HomePage();
}
