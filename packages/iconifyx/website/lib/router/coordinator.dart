import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import '../bootstrap/docs_loader.dart';
import 'modules/docs_module.dart';
import 'modules/home_module.dart';
import 'modules/pack_module.dart';
import 'modules/search_module.dart';
import 'route.dart';
import 'routes/not_found.dart';
import 'routes/shell/all_packs_route.dart';
import 'routes/shell/app_shell_layout.dart';
import 'routes/shell/changelog_route.dart';
import 'routes/shell/docs_route.dart';
import 'routes/shell/docs_tab_route.dart';
import 'routes/shell/home_route.dart';
import 'routes/shell/shell_tabs_layout.dart';
import 'url_history.dart';

/// Global, eagerly-constructed router singleton. Used directly anywhere
/// navigation is needed — no Provider/InheritedWidget required.
final AppCoordinator appCoordinator = AppCoordinator();

class AppCoordinator extends Coordinator<AppRoute>
    with CoordinatorModular<AppRoute> {
  AppCoordinator() {
    defineLayoutParent(AppShellLayout.new);
  }

  /// Outer shell `NavigationPath`. Holds [ShellTabsLayout] at the bottom of
  /// its stack, plus any route pushed on top of the tabs (pack detail,
  /// icon detail, search overlay).
  late final NavigationPath<AppRoute> shellStack =
      NavigationPath<AppRoute>.createWith(
    label: 'shell',
    coordinator: this,
  )..bindLayout(AppShellLayout.new);

  /// Top-bar tab strip — Home / All Packs / Docs / Changelog. Routes here
  /// stay mounted via [IndexedStack] so switching tabs preserves per-tab
  /// scroll position.
  late final IndexedStackPath<AppRoute> tabsStack =
      IndexedStackPath<AppRoute>.createWith(
    [
      HomeRoute(),
      AllPacksRoute(),
      DocsRoute(),
      ChangelogRoute(),
    ],
    label: 'tabs',
    coordinator: this,
  )..bindLayout(ShellTabsLayout.new);

  /// Inner docs tab strip — one entry per known doc slug (overview,
  /// architecture, duotone, flutter-3-44-icondata, pipeline, backers).
  /// Lives behind [DocsRoute]'s layout so switching sub-tabs preserves
  /// scroll position without pushing new history entries per tab.
  late final IndexedStackPath<AppRoute> docsTabsStack =
      IndexedStackPath<AppRoute>.createWith(
    [
      for (final entry in DocsLoader.entries)
        DocsTabRoute(slug: entry.slug),
    ],
    label: 'docs',
    coordinator: this,
  )..bindLayout(DocsRoute.new);

  @override
  List<StackPath> get paths => [
        ...super.paths,
        shellStack,
        tabsStack,
        docsTabsStack,
      ];

  @override
  Set<RouteModule<AppRoute>> defineModules() => {
        HomeModule(this),
        PackModule(this),
        SearchModule(this),
        DocsModule(this),
      };

  @override
  AppRoute notFoundRoute(Uri uri) => NotFoundRoute(uri: uri);

  /// Custom [RouteInformationProvider] that enforces the §27 universal
  /// invariant: query-only updates, pop-back transitions, and sibling
  /// icon-detail swaps REPLACE the browser history entry instead of
  /// pushing a new one. See [HistoryAwareRouteInformationProvider].
  late final HistoryAwareRouteInformationProvider _historyAwareProvider =
      HistoryAwareRouteInformationProvider(coordinator: this);

  @override
  RouteInformationProvider get routeInformationProvider =>
      _historyAwareProvider;
}
