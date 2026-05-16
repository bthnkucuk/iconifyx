import 'package:flutter/material.dart';

import '../../bootstrap/docs_loader.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/docs_route.dart';
import '../../router/routes/shell/docs_tab_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/markdown_body.dart';
import '../../shared/widgets/site_footer.dart';
import '../../theme/app_theme.dart';

/// Docs shell — pinned title + sub-tab strip on top, the active sub-tab's
/// markdown body underneath (rendered by [DocsRoute]'s inner
/// [IndexedStackPath] via `layout.buildPath`). Switching sub-tabs swaps the
/// body only, leaving each tab's scroll position untouched.
///
/// Built once per `DocsRoute` activation; rebuilds when the indexed stack's
/// active index changes (via [ListenableBuilder] on the path).
class DocsShellPage extends StatelessWidget {
  const DocsShellPage({super.key, required this.layout});

  final DocsRoute layout;

  @override
  Widget build(BuildContext context) {
    final scaffoldBg = Theme.of(context).scaffoldBackgroundColor;
    return Material(
      color: scaffoldBg,
      child: LayoutBuilder(
        builder: (context, c) {
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListenableBuilder(
                listenable: appCoordinator.docsTabsStack,
                builder: (ctx, _) {
                  final active = appCoordinator.docsTabsStack.activeRoute;
                  final activeSlug =
                      active is DocsTabRoute ? active.slug : 'overview';
                  return Padding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    child: _DocsHeader(activeSlug: activeSlug),
                  );
                },
              ),
              Expanded(child: layout.buildPath(appCoordinator)),
            ],
          );
        },
      ),
    );
  }
}

/// The body rendered inside the indexed stack for one doc slug. Each
/// instance owns its own `Future<String>` + scroll view, so per-tab scroll
/// position survives tab switches (the IndexedStack keeps every tab body
/// mounted).
class DocsTabBody extends StatefulWidget {
  const DocsTabBody({super.key, required this.slug});

  final String slug;

  @override
  State<DocsTabBody> createState() => _DocsTabBodyState();
}

class _DocsTabBodyState extends State<DocsTabBody> {
  // IndexedStack keeps all six tab widgets mounted, so this future fires
  // exactly once per tab — the markdown text is cached for the lifetime
  // of the surrounding [DocsRoute] activation.
  late final Future<String> _markdownFuture =
      DocsLoader.loadDoc(widget.slug);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
            .clamp(0.0, double.infinity);
        // Match `PackDetailPage`'s content column inset (28 px) so the
        // markdown body lines up with the rest of the site. Vertical pad
        // adds breathing room above the first heading and below the last
        // paragraph before the footer rule.
        final contentMaxWidth =
            (c.maxWidth - 2 * pad - 56) < 760 ? double.infinity : 760.0;
        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(pad + 28, 32, pad + 28, 32),
              sliver: SliverToBoxAdapter(
                child: Align(
                  alignment: Alignment.topLeft,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: contentMaxWidth),
                    child: FutureBuilder<String>(
                      future: _markdownFuture,
                      builder: (context, snap) {
                        if (snap.connectionState != ConnectionState.done) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 64),
                            child: Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                          );
                        }
                        if (snap.hasError || !snap.hasData) {
                          return _DocsLoadError(
                            slug: widget.slug,
                            error:
                                snap.error?.toString() ?? 'Doc not found',
                          );
                        }
                        return MarkdownBody(snap.data!);
                      },
                    ),
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.symmetric(horizontal: pad),
              sliver: const SliverToBoxAdapter(child: SiteFooter()),
            ),
          ],
        );
      },
    );
  }
}

class _DocsHeader extends StatelessWidget {
  const _DocsHeader({required this.activeSlug});

  final String activeSlug;

  @override
  Widget build(BuildContext context) {
    final entry = DocsLoader.entryFor(activeSlug);
    final title = entry?.title ?? 'Documentation';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final tt = Theme.of(context).textTheme;
    return Padding(
      // 28 px horizontal inset matches `_PinnedTitleDelegate` / pack detail
      // breadcrumb. 36/12 vertical leaves a comfortable hero band above
      // the tab strip.
      padding: const EdgeInsets.fromLTRB(28, 36, 28, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'DOCUMENTATION',
            style: AppTheme.mono(
              size: 11,
              color: muted,
              weight: FontWeight.w700,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: (tt.headlineLarge ?? const TextStyle()).copyWith(
              color: ink,
              fontSize: 36,
              height: 1.08,
            ),
          ),
          const SizedBox(height: 24),
          _DocsTabs(activeSlug: activeSlug),
          const SizedBox(height: 16),
          Divider(
            color: isDark ? AppTheme.ruleDark : AppTheme.rule,
            height: 1,
          ),
        ],
      ),
    );
  }
}

class _DocsTabs extends StatelessWidget {
  const _DocsTabs({required this.activeSlug});

  final String activeSlug;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final t in DocsLoader.entries)
          _DocsTab(
            label: t.title,
            active: t.slug == activeSlug,
            onTap: () =>
                appCoordinator.navigate(DocsTabRoute(slug: t.slug)),
          ),
      ],
    );
  }
}

class _DocsTab extends StatelessWidget {
  const _DocsTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return HoverBox(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      borderRadius: 8,
      bg: active ? coralSoft : Colors.transparent,
      hoverBg: active ? coralSoft : paper2,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: active ? AppTheme.coral : ink2,
        ),
      ),
    );
  }
}

class _DocsLoadError extends StatelessWidget {
  const _DocsLoadError({required this.slug, required this.error});
  final String slug;
  final String error;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'No doc found for "$slug".',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            error,
            style: AppTheme.mono(size: 12, color: muted),
          ),
        ],
      ),
    );
  }
}
