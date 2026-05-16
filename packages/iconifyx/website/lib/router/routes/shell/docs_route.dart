import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../features/docs/docs_page.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'shell_tabs_layout.dart';

/// `/docs` and `/docs/<slug>` — the docs landing surface.
///
/// `DocsRoute` is the **layout** for the inner docs tab strip; the actual
/// markdown body for the active sub-tab is rendered by `DocsTabRoute`
/// instances that live inside [AppCoordinator.docsTabsStack]. Switching
/// between docs sub-tabs (Overview / Architecture / Duotone / Flutter 3.44
/// IconData / Pipeline / Backers) toggles the indexed stack's `activeIndex`
/// rather than pushing — so browser back from `/docs/architecture` lands
/// on the previous tab (not all the way out of `/docs`), and scroll
/// position is preserved per tab.
///
/// Note: `props` is `const []` so all `DocsRoute` instances are equal
/// for the outer [ShellTabsLayout]'s [IndexedStackPath] — slug routing
/// happens one layer deeper via `DocsTabRoute`.
class DocsRoute extends AppRoute with RouteLayout<AppRoute> {
  @override
  Type get layout => ShellTabsLayout;

  @override
  List<Object?> get props => const [];

  @override
  Uri toUri() => appCoordinator.docsTabsStack.activeRoute.toUri();

  @override
  IndexedStackPath<AppRoute> resolvePath(
    covariant AppCoordinator coordinator,
  ) =>
      coordinator.docsTabsStack;

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) =>
      DocsShellPage(layout: this);
}
