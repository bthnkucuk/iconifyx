import 'package:zenrouter/zenrouter.dart';

import '../../coordinator.dart';
import '../../route.dart';
import 'app_shell_layout.dart';

/// Inner layout sitting BENEATH [AppShellLayout] (the top bar) that owns
/// the four primary tab routes — Home / All Packs / Docs / Changelog — via
/// an [IndexedStackPath].
///
/// Why this exists: zenrouter's [IndexedStackPath] gives the four tabs
/// "indexed-stack" semantics — each tab stays mounted, switching is instant,
/// scroll position is preserved across tab switches. Routes pushed on top of
/// a tab (e.g. `PackDetailRoute`, `IconDetailRoute`, the search overlay) keep
/// using the outer [AppShellLayout]'s shell `NavigationPath` so they layer
/// over the entire tab strip exactly as before.
///
/// URL semantics for tab routes are unchanged: `/`, `/packs`, `/docs`,
/// `/changelog` (plus `/docs/<slug>` for the inner docs tab strip) all
/// still deep-link, parse, and reverse-toUri correctly. The IndexedStackPath
/// is only an internal rendering / state-preservation detail.
class ShellTabsLayout extends AppRoute with RouteLayout<AppRoute> {
  @override
  Type get layout => AppShellLayout;

  @override
  IndexedStackPath<AppRoute> resolvePath(
    covariant AppCoordinator coordinator,
  ) =>
      coordinator.tabsStack;
}
