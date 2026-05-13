import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/site_footer.dart';
import '../../theme/app_theme.dart';

/// All packs listing.
///
/// Filter state lives entirely on the [AllPacksRoute] via its
/// `RouteQueryParameters` mixin — that means the URL (`/packs?cat=…&q=…`) is
/// always the source of truth, deep links work, browser back/forward works,
/// and the page rebuilds **only** the bits that depend on the changed query
/// via `route.selectorBuilder<T>(...)`.
class AllPacksPage extends StatefulWidget {
  const AllPacksPage({super.key, required this.route});
  final AllPacksRoute route;

  @override
  State<AllPacksPage> createState() => _AllPacksPageState();
}

class _AllPacksPageState extends State<AllPacksPage> {
  late final TextEditingController _filterController;

  @override
  void initState() {
    super.initState();
    _filterController =
        TextEditingController(text: widget.route.query('q') ?? '');
    // Keep the controller text in sync if queries change externally (e.g.
    // user navigates to /packs?q=foo or clears via category click).
    widget.route.queryNotifier.addListener(_onQueriesChanged);
  }

  @override
  void dispose() {
    widget.route.queryNotifier.removeListener(_onQueriesChanged);
    _filterController.dispose();
    super.dispose();
  }

  void _onQueriesChanged() {
    final q = widget.route.query('q') ?? '';
    if (_filterController.text != q) {
      _filterController.value = TextEditingValue(
        text: q,
        selection: TextSelection.collapsed(offset: q.length),
      );
    }
  }

  void _setCategory(String? slug) {
    final qs = Map<String, String>.from(widget.route.queries);
    if (slug == null) {
      qs.remove('cat');
    } else {
      qs['cat'] = slug;
    }
    widget.route.updateQueries(appCoordinator, queries: qs);
  }

  void _setFilter(String text) {
    final qs = Map<String, String>.from(widget.route.queries);
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      qs.remove('q');
    } else {
      qs['q'] = trimmed;
    }
    widget.route.updateQueries(appCoordinator, queries: qs);
  }

  List<PackSummary> _visible(PackIndex packs, String? slug, String q) {
    final base = slug == null
        ? packs.packs
        : () {
            final cat = packs.categories.firstWhere(
              (c) => c.slug == slug,
              orElse: () => CategoryEntry(
                  slug: slug, name: slug, packPrefixes: const []),
            );
            return [
              for (final p in cat.packPrefixes)
                if (packs.byPrefix[p] != null) packs.byPrefix[p]!,
            ];
          }();
    final query = q.trim().toLowerCase();
    if (query.isEmpty) return base;
    return base
        .where((p) =>
            p.name.toLowerCase().contains(query) ||
            p.prefix.toLowerCase().contains(query) ||
            p.category.toLowerCase().contains(query))
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapPacksReady) {
          return const Center(
              child: CircularProgressIndicator(color: AppTheme.coral));
        }
        final packs = state.packs;
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;

        return Material(
          color: Theme.of(context).scaffoldBackgroundColor,
          child: LayoutBuilder(
            builder: (context, c) {
              final wide = c.maxWidth >= 900;
              final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
                  .clamp(0.0, double.infinity);

              // Sidebar is a query-driven selectorBuilder — only rebuilds
              // when the `cat` query changes.
              final sidebarWidget = widget.route.selectorBuilder<String?>(
                selector: (q) => q['cat'],
                builder: (ctx, selected) => _CategorySidebar(
                  packs: packs,
                  selected: selected,
                  onSelect: _setCategory,
                ),
              );

              // Main column rebuilds via a selectorBuilder over the FULL
              // query map (only 2 keys, so still cheap and consistent).
              final mainWidget = widget.route.selectorBuilder<_QueryState>(
                selector: (q) =>
                    _QueryState(cat: q['cat'], filter: q['q'] ?? ''),
                builder: (ctx, qs) {
                  final filtered = _visible(packs, qs.cat, qs.filter);
                  final activeCat = qs.cat == null
                      ? null
                      : packs.categories.firstWhere(
                          (c) => c.slug == qs.cat,
                          orElse: () => CategoryEntry(
                              slug: qs.cat!,
                              name: qs.cat!,
                              packPrefixes: const []),
                        );
                  final emptyMessage = filtered.isEmpty
                      ? (qs.filter.trim().isEmpty
                          ? 'No packs in this category.'
                          : 'No packs matched "${qs.filter.trim()}".')
                      : null;
                  return _MainContent(
                    titleText: activeCat?.name ?? 'All packs',
                    countText:
                        '${_fmt(filtered.length)} of ${_fmt(packs.packs.length)} packs',
                    filterController: _filterController,
                    onFilterChanged: _setFilter,
                    emptyMessage: emptyMessage,
                    filteredPacks: filtered,
                    wide: wide,
                    horizontalPadding: pad,
                  );
                },
              );

              final breadcrumb = Padding(
                padding: const EdgeInsets.fromLTRB(28, 28, 28, 16),
                child: Row(
                  children: [
                    _CrumbLink(
                        label: 'iconifyx',
                        onTap: () => appCoordinator.navigate(HomeRoute())),
                    Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                    Text('packs',
                        style: AppTheme.mono(
                            size: 12, color: muted, weight: FontWeight.w600)),
                  ],
                ),
              );

              if (wide) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(pad + 28, 28, 24, 40),
                      child: SizedBox(width: 240, child: sidebarWidget),
                    ),
                    Expanded(
                      child: CustomScrollView(
                        slivers: [
                          SliverToBoxAdapter(child: breadcrumb),
                          SliverToBoxAdapter(child: mainWidget),
                          SliverPadding(
                            padding: EdgeInsets.only(right: pad),
                            sliver: const SliverToBoxAdapter(
                              child: SiteFooter(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              }
              // Narrow: stacked single scroll.
              return CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: SliverToBoxAdapter(child: breadcrumb),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(28 + pad, 0, 28 + pad, 16),
                    sliver: SliverToBoxAdapter(child: sidebarWidget),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: SliverToBoxAdapter(child: mainWidget),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: pad),
                    sliver: const SliverToBoxAdapter(child: SiteFooter()),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

@immutable
class _QueryState {
  const _QueryState({required this.cat, required this.filter});
  final String? cat;
  final String filter;
  @override
  bool operator ==(Object other) =>
      other is _QueryState && other.cat == cat && other.filter == filter;
  @override
  int get hashCode => Object.hash(cat, filter);
}

// ─── Main content (title + filter + grid) ───────────────────────────────────
class _MainContent extends StatelessWidget {
  const _MainContent({
    required this.titleText,
    required this.countText,
    required this.filterController,
    required this.onFilterChanged,
    required this.emptyMessage,
    required this.filteredPacks,
    required this.wide,
    required this.horizontalPadding,
  });

  final String titleText;
  final String countText;
  final TextEditingController filterController;
  final ValueChanged<String> onFilterChanged;
  final String? emptyMessage;
  final List<PackSummary> filteredPacks;
  final bool wide;
  final double horizontalPadding;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return CustomScrollView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 0, 28, 18),
            child: _TitleBar(
              title: titleText,
              countText: countText,
              filterController: filterController,
              onFilterChanged: onFilterChanged,
            ),
          ),
        ),
        if (emptyMessage != null)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(28, 0, 28, 64),
            sliver: SliverToBoxAdapter(
              child: Center(
                child: Text(emptyMessage!, style: TextStyle(color: muted)),
              ),
            ),
          )
        else
          _PackGridSliver(packs: filteredPacks),
      ],
    );
  }
}

// ─── Title bar (h2 + count pill + filter input) ─────────────────────────────
class _TitleBar extends StatelessWidget {
  const _TitleBar({
    required this.title,
    required this.countText,
    required this.filterController,
    required this.onFilterChanged,
  });

  final String title;
  final String countText;
  final TextEditingController filterController;
  final ValueChanged<String> onFilterChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return LayoutBuilder(
      builder: (context, c) {
        final wide = c.maxWidth >= 560;
        final titleRow = Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Flexible(
              child: Text(title,
                  style: Theme.of(context).textTheme.headlineMedium,
                  overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(countText,
                  style: AppTheme.mono(size: 11, color: muted)),
            ),
          ],
        );
        final filter = SizedBox(
          width: wide ? 240 : double.infinity,
          child: TextField(
            controller: filterController,
            onChanged: onFilterChanged,
            decoration: InputDecoration(
              hintText: 'Filter packs…',
              prefixIcon: Icon(Icons.search, size: 16, color: muted),
              prefixIconConstraints:
                  const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
          ),
        );
        if (wide) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [titleRow, filter],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            titleRow,
            const SizedBox(height: 10),
            filter,
          ],
        );
      },
    );
  }
}

// ─── Sidebar (category filter list) ─────────────────────────────────────────
class _CategorySidebar extends StatelessWidget {
  const _CategorySidebar({
    required this.packs,
    required this.selected,
    required this.onSelect,
  });

  final PackIndex packs;
  final String? selected;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ranked = [...packs.categories]
      ..sort((a, b) => b.packPrefixes.length.compareTo(a.packPrefixes.length));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
          child: Text(
            'CATEGORIES',
            style: AppTheme.mono(
              size: 10,
              color: muted,
              weight: FontWeight.w700,
              letterSpacing: 1.0,
            ),
          ),
        ),
        _CategoryRow(
          label: 'All packs',
          count: packs.packs.length,
          active: selected == null,
          onTap: () => onSelect(null),
        ),
        for (final cat in ranked)
          _CategoryRow(
            label: cat.name,
            count: cat.packPrefixes.length,
            active: cat.slug == selected,
            onTap: () => onSelect(cat.slug),
          ),
      ],
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final fg = active ? AppTheme.coral : ink;
    final countFg = active ? AppTheme.coral : muted;
    return HoverBox(
      onTap: onTap,
      bg: active ? coralSoft : Colors.transparent,
      hoverBg: active ? coralSoft : paper2,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      borderRadius: 8,
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: fg,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: active
                  ? Colors.transparent
                  : (isDark ? AppTheme.paper2Dark : AppTheme.paper2),
              border: Border.all(
                color: active ? AppTheme.coral : Colors.transparent,
              ),
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              '$count',
              style: AppTheme.mono(size: 10, color: countFg),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Sliver pack grid (LAZY, only builds visible tiles) ─────────────────────
class _PackGridSliver extends StatelessWidget {
  const _PackGridSliver({required this.packs});
  final List<PackSummary> packs;
  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
      sliver: SliverLayoutBuilder(
        builder: (context, constraints) {
          final w = constraints.crossAxisExtent;
          final cols = w >= 1240
              ? 4
              : w >= 900
                  ? 3
                  : w >= 560
                      ? 2
                      : 1;
          return SliverGrid.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: cols,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              childAspectRatio: 1.4,
            ),
            itemCount: packs.length,
            itemBuilder: (context, i) => _PackTile(summary: packs[i]),
          );
        },
      ),
    );
  }
}

class _PackTile extends StatelessWidget {
  const _PackTile({required this.summary});
  final PackSummary summary;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;

    final samples = [...summary.preview.take(4)];
    while (samples.length < 4 && summary.preview.isNotEmpty) {
      samples.add(summary.preview.first);
    }

    return HoverBuilder(
      onTap: () =>
          appCoordinator.navigate(PackDetailRoute(prefix: summary.prefix)),
      builder: (ctx, hovered) => AnimatedSlide(
        duration: const Duration(milliseconds: 150),
        offset: Offset(0, hovered ? -2 / 64 : 0),
        child: Container(
          decoration: BoxDecoration(
            color: card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: hovered ? AppTheme.coral : rule),
            boxShadow: hovered
                ? const [
                    BoxShadow(
                      color: Color(0x140E1320),
                      blurRadius: 30,
                      offset: Offset(0, 12),
                    ),
                  ]
                : null,
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  for (var i = 0; i < 4; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    if (i < samples.length)
                      _SampleCell(
                        record: samples[i],
                        bg: i == 0 ? coralSoft : paper2,
                        color: i == 0 ? AppTheme.coral : ink2,
                      )
                    else
                      _EmptyCell(bg: paper2),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(summary.name,
                            style: Theme.of(context).textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(
                          '${summary.category} · ${summary.license}',
                          style: TextStyle(fontSize: 12, color: muted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: paper2,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(_fmt(summary.iconCount),
                        style: AppTheme.mono(size: 11, color: ink2)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SampleCell extends StatelessWidget {
  const _SampleCell(
      {required this.record, required this.bg, required this.color});
  final IconRecord record;
  final Color bg;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Center(
        child: IconifyIcon(record.toIconifyData(), size: 20, color: color),
      ),
    );
  }
}

class _EmptyCell extends StatelessWidget {
  const _EmptyCell({required this.bg});
  final Color bg;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
    );
  }
}

class _CrumbLink extends StatelessWidget {
  const _CrumbLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return HoverBuilder(
      onTap: onTap,
      builder: (ctx, hovered) => Text(
        label,
        style: AppTheme.mono(
          size: 12,
          color: hovered ? AppTheme.coral : muted,
        ),
      ),
    );
  }
}

String _fmt(int n) => n.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
