import 'package:flutter/widgets.dart';

import '../../../features/docs/changelog_page.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'app_shell_layout.dart';

/// `/changelog` — renders `packages/iconifyx/CHANGELOG.md` (mirrored
/// into the website's `assets/docs/CHANGELOG.md`) as themed markdown.
class ChangelogRoute extends AppRoute {
  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => const [];

  @override
  Uri toUri() => Uri.parse('/changelog');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      const ChangelogPage();
}
