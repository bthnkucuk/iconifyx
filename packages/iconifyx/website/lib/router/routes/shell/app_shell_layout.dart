import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:zenrouter/zenrouter.dart';

import '../../../shared/widgets/app_topbar.dart';
import '../../../shared/widgets/site_footer.dart';
import '../../coordinator.dart';
import '../../route.dart';
import 'search_route.dart';

/// Sticky frosted top nav + page content. Pages render via [PageContainer]
/// (regular children) or [PageContainer.slivers] (when a large lazy grid is
/// needed — pack detail / all-packs).
class AppShellLayout extends AppRoute with RouteLayout<AppRoute> {
  static const double desktopBreakpoint = 900;
  static const double pageMaxWidth = 1240;

  @override
  StackPath<RouteUnique> resolvePath(covariant AppCoordinator coordinator) =>
      coordinator.shellStack;

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= desktopBreakpoint;
        // Hand-rolled `CallbackShortcuts` replacement. The plain `/`
        // activator must NOT fire when the user is typing in a text field
        // — otherwise the slash gets eaten by the shortcut callback before
        // the TextField sees it, AND the bare-character matcher in
        // Flutter's shortcut tree can swallow seemingly-unrelated keys
        // (notably space) when the surrounding key-event chain is wired
        // through ancestor `Focus` widgets. Filtering here unconditionally
        // skips bindings while an `EditableText` holds primary focus,
        // which is exactly the safety net the bug ticket asked for.
        return _ShellShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () =>
                appCoordinator.push(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.keyK, control: true): () =>
                appCoordinator.push(SearchRoute()),
            const SingleActivator(LogicalKeyboardKey.slash): () =>
                appCoordinator.push(SearchRoute()),
          },
          child: Scaffold(
            body: Column(
              children: [
                AppTopBar(showMenuButton: !isDesktop),
                Expanded(child: buildPath(coordinator)),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Drop-in replacement for [CallbackShortcuts] that ignores key events
/// while an [EditableText] holds primary focus.
///
/// Two motivations:
///
/// 1. The shell-level `LogicalKeyboardKey.slash` activator has no modifier.
///    If we let it fire while a TextField is focused, every `/` keystroke
///    pushes a new SearchRoute on top of the user's typing.
/// 2. On Flutter web (3.44+) we observed plain-character shortcuts in the
///    ancestor focus chain swallowing the `space` key inside text inputs
///    (the search palette and the pack-detail filter). Even when no
///    binding actually matches `space`, the way `CallbackShortcuts`
///    inserts a non-traversable `Focus(onKeyEvent: …)` above the editor
///    can interfere with how the engine routes the space character to
///    the underlying editing surface. Bailing out of the shortcut path
///    entirely whenever the focused widget is an [EditableText] keeps the
///    palette / filter behaviour the same as a normal `TextField`.
///
/// Modifier-bearing shortcuts (`Cmd+K`, `Ctrl+K`) intentionally stay
/// active inside text fields — they're the user's escape hatch out of an
/// input.
class _ShellShortcuts extends StatelessWidget {
  const _ShellShortcuts({required this.bindings, required this.child});

  final Map<ShortcutActivator, VoidCallback> bindings;
  final Widget child;

  bool _isTextFieldFocused() {
    final node = FocusManager.instance.primaryFocus;
    final widget = node?.context?.widget;
    return widget is EditableText;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onKeyEvent: (node, event) {
        if (_isTextFieldFocused()) {
          // Defer entirely to the focused editor.
          return KeyEventResult.ignored;
        }
        KeyEventResult result = KeyEventResult.ignored;
        for (final activator in bindings.keys) {
          if (activator.accepts(event, HardwareKeyboard.instance)) {
            bindings[activator]!.call();
            result = KeyEventResult.handled;
          }
        }
        return result;
      },
      child: child,
    );
  }
}

/// Centers a page in the 1240px max-width column inside a [CustomScrollView].
///
/// Two construction modes:
/// - `PageContainer(children: [...])` — wraps regular widgets in slivers; the
///   default. Footer is auto-appended.
/// - `PageContainer.slivers(slivers: [...])` — when the page already provides
///   slivers (lazy `SliverGrid.builder`s for thousands of icons). Each sliver
///   is centered in the 1240 max-width column via a `SliverConstrainedCross
///   Axis`-style alignment achieved by horizontal padding from the viewport.
class PageContainer extends StatelessWidget {
  const PageContainer({
    super.key,
    required this.children,
    this.showFooter = true,
    this.cacheExtent,
  }) : slivers = null;

  /// Use when the page provides slivers directly (e.g. pages with big lazy
  /// grids). Each sliver must be a Sliver-class widget. The footer is auto-
  /// appended at the end.
  ///
  /// [cacheExtent] (pixels) — passed through to the inner [CustomScrollView]
  /// so heavy lazy grids (pack detail's 15k-icon `SliverGrid.builder`) can
  /// pre-warm cells above/below the viewport. Default is Flutter's 250 px;
  /// pages with expensive per-cell builds should pass something larger so
  /// scrolling stays smooth.
  const PageContainer.slivers({
    super.key,
    required List<Widget> this.slivers,
    this.showFooter = true,
    this.cacheExtent,
  }) : children = const [];

  final List<Widget> children;
  final List<Widget>? slivers;
  final bool showFooter;
  final double? cacheExtent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: LayoutBuilder(
        builder: (context, c) {
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);
          final scrollCache = cacheExtent == null
              ? null
              : ScrollCacheExtent.pixels(cacheExtent!);
          if (slivers != null) {
            return CustomScrollView(
              scrollCacheExtent: scrollCache,
              slivers: [
                for (final s in slivers!)
                  SliverPadding(
                      padding: EdgeInsets.symmetric(horizontal: pad),
                      sliver: s),
                if (showFooter)
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: const SliverToBoxAdapter(child: SiteFooter()),
                  ),
              ],
            );
          }
          return CustomScrollView(
            scrollCacheExtent: scrollCache,
            slivers: [
              SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: pad),
                sliver: SliverList(
                  delegate: SliverChildListDelegate.fixed([
                    Column(mainAxisSize: MainAxisSize.min, children: children),
                    if (showFooter) const SiteFooter(),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
