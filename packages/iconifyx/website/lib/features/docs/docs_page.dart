import 'package:flutter/material.dart';

import '../../bootstrap/docs_loader.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/docs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/markdown_body.dart';
import '../../theme/app_theme.dart';

/// `/docs` and `/docs/<slug>`. When [slug] is null we render the index
/// (overview + TOC); otherwise we load the matching markdown file from
/// `assets/docs/<slug>.md` and render it inline.
class DocsPage extends StatefulWidget {
  const DocsPage({super.key, this.slug});

  final String? slug;

  @override
  State<DocsPage> createState() => _DocsPageState();
}

class _DocsPageState extends State<DocsPage> {
  late Future<String> _markdownFuture;

  @override
  void initState() {
    super.initState();
    _markdownFuture = _load();
  }

  @override
  void didUpdateWidget(covariant DocsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.slug != widget.slug) {
      _markdownFuture = _load();
    }
  }

  Future<String> _load() => DocsLoader.loadDoc(widget.slug ?? 'overview');

  @override
  Widget build(BuildContext context) {
    final slug = widget.slug;
    final entry = DocsLoader.entryFor(slug ?? 'overview');
    final fallbackTitle = slug == null ? 'Documentation' : (slug);
    final title = entry?.title ?? fallbackTitle;

    return PageContainer.slivers(
      slivers: [
        SliverToBoxAdapter(
          child: _DocsHeader(title: title, activeSlug: slug ?? 'overview'),
        ),
        SliverToBoxAdapter(
          child: LayoutBuilder(
            builder: (context, c) {
              // Constrain prose width — long lines of body text are
              // unreadable on a 1240-wide canvas. 760 keeps comfortable
              // measure (~75-90 chars at 15-16 px body).
              final contentMax = c.maxWidth < 760 ? c.maxWidth : 760.0;
              return Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 64),
                child: Align(
                  alignment: Alignment.topLeft,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: contentMax),
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
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          );
                        }
                        if (snap.hasError || !snap.hasData) {
                          return _DocsLoadError(
                            slug: slug,
                            error: snap.error?.toString() ?? 'Doc not found',
                          );
                        }
                        return MarkdownBody(snap.data!);
                      },
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _DocsHeader extends StatelessWidget {
  const _DocsHeader({required this.title, required this.activeSlug});

  final String title;
  final String activeSlug;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 36, 0, 12),
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
    final tabs = [
      const _TabSpec(slug: 'overview', label: 'Overview'),
      ...DocsLoader.entries
          .where((e) => e.slug != 'overview')
          .map((e) => _TabSpec(slug: e.slug, label: e.title)),
    ];
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final t in tabs)
          _DocsTab(
            label: t.label,
            active: t.slug == activeSlug,
            onTap: () => appCoordinator.navigate(
              DocsRoute(slug: t.slug == 'overview' ? null : t.slug),
            ),
          ),
      ],
    );
  }
}

class _TabSpec {
  const _TabSpec({required this.slug, required this.label});
  final String slug;
  final String label;
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
  final String? slug;
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
            slug == null
                ? 'Could not load the docs index.'
                : 'No doc found for "$slug".',
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
