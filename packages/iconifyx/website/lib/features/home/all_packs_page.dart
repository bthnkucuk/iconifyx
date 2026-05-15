import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../shared/widgets/collapsible_section.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/pack_tile.dart';
import '../../theme/app_theme.dart';

/// All packs page.
///
/// URL = source of truth via [AllPacksRoute]'s [RouteQueryParameters]:
///   `/packs?cat=<slug>&q=<text>`
///
/// **The masonry grid is a TOP-LEVEL sliver in the outer CustomScrollView.**
/// Previously the grid was nested inside `CustomScrollView(shrinkWrap: true)`
/// which forced full inflation up-front — that's what made `/packs` open
/// slowly. With the masonry as a direct sliver, only rows that overlap the
/// outer viewport are materialised.
class AllPacksPage extends StatefulWidget {
  const AllPacksPage({super.key, required this.route});
  final AllPacksRoute route;

  @override
  State<AllPacksPage> createState() => _AllPacksPageState();
}

class _AllPacksPageState extends State<AllPacksPage> {
  late final TextEditingController _filterController;
  Timer? _filterDebounce;
  static const _filterDebounceDuration = Duration(milliseconds: 60);

  @override
  void initState() {
    super.initState();
    _filterController =
        TextEditingController(text: widget.route.query('q') ?? '');
    widget.route.queryNotifier.addListener(_onQueriesChanged);
  }

  @override
  void dispose() {
    widget.route.queryNotifier.removeListener(_onQueriesChanged);
    _filterDebounce?.cancel();
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
    // Debounce keystrokes so a burst of typing produces a single route
    // update instead of one per character (see RESEARCH_PLAN.md §23 #3).
    _filterDebounce?.cancel();
    _filterDebounce = Timer(_filterDebounceDuration, () {
      // Store the user's LITERAL text in the URL. Trimming here used to wipe
      // any trailing space the user just typed — the round-trip listener then
      // overwrote the controller with the trimmed value, eating every space.
      // See RESEARCH_PLAN.md §19. The `_visible` consumer already trims.
      final qs = Map<String, String>.from(widget.route.queries);
      if (text.isEmpty) {
        qs.remove('q');
      } else {
        qs['q'] = text;
      }
      widget.route.updateQueries(appCoordinator, queries: qs);
    });
  }

  List<PackSummary> _visible(PackIndex packs, String? slug, String q) {
    final base = slug == null
        ? packs.packs
        : () {
            final cat = packs.categories.firstWhere(
              (c) => c.slug == slug,
              orElse: () =>
                  CategoryEntry(slug: slug, name: slug, packPrefixes: const []),
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
        return LayoutBuilder(
          builder: (context, c) {
            final wide = c.maxWidth >= 900;
            // Derive the masonry's eventual crossAxisExtent from the box
            // LayoutBuilder once — passing the resulting `cols` down means
            // the masonry sliver doesn't need a SliverLayoutBuilder, so the
            // grid does NOT rebuild every scroll frame.
            final pageColumnWidth =
                wide ? (c.maxWidth - 240 - 28 - 24) : c.maxWidth;
            final pageContainerPad =
                ((pageColumnWidth - AppShellLayout.pageMaxWidth) / 2)
                    .clamp(0.0, double.infinity);
            final contentW =
                (pageColumnWidth - 2 * pageContainerPad - 56)
                    .clamp(0.0, double.infinity);
            final cols = contentW >= 1240
                ? 4
                : contentW >= 900
                    ? 3
                    : contentW >= 560
                        ? 2
                        : 1;
            return ValueListenableBuilder<Map<String, String>>(
              valueListenable: widget.route.queryNotifier,
              builder: (context, queries, _) {
                final cat = queries['cat'];
                final q = queries['q'] ?? '';
                final filtered = _visible(packs, cat, q);
                final activeCat = cat == null
                    ? null
                    : packs.categories.firstWhere(
                        (c) => c.slug == cat,
                        orElse: () => CategoryEntry(
                            slug: cat,
                            name: cat,
                            packPrefixes: const []),
                      );
                return wide
                    ? _WideLayout(
                        packs: packs,
                        activeCat: activeCat,
                        filtered: filtered,
                        allCount: packs.packs.length,
                        filter: q,
                        filterController: _filterController,
                        onSelectCat: _setCategory,
                        onFilter: _setFilter,
                        selectedSlug: cat,
                        cols: cols,
                      )
                    : _NarrowLayout(
                        packs: packs,
                        activeCat: activeCat,
                        filtered: filtered,
                        allCount: packs.packs.length,
                        filter: q,
                        filterController: _filterController,
                        onSelectCat: _setCategory,
                        onFilter: _setFilter,
                        selectedSlug: cat,
                        cols: cols,
                      );
              },
            );
          },
        );
      },
    );
  }
}

// ─── Wide layout (sidebar | main scroll) ────────────────────────────────────
class _WideLayout extends StatelessWidget {
  const _WideLayout({
    required this.packs,
    required this.activeCat,
    required this.filtered,
    required this.allCount,
    required this.filter,
    required this.filterController,
    required this.onSelectCat,
    required this.onFilter,
    required this.selectedSlug,
    required this.cols,
  });

  final int cols;
  final PackIndex packs;
  final CategoryEntry? activeCat;
  final List<PackSummary> filtered;
  final int allCount;
  final String filter;
  final TextEditingController filterController;
  final ValueChanged<String?> onSelectCat;
  final ValueChanged<String> onFilter;
  final String? selectedSlug;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 28, 24, 40),
            child: SizedBox(
              width: 240,
              child: _CategorySidebar(
                packs: packs,
                selected: selectedSlug,
                onSelect: onSelectCat,
              ),
            ),
          ),
          Expanded(
            child: PageContainer.slivers(
              slivers: _buildPageSlivers(
                context: context,
                activeCat: activeCat,
                filtered: filtered,
                allCount: allCount,
                filter: filter,
                filterController: filterController,
                onFilter: onFilter,
                inlineSidebar: null,
                cols: cols,
                useRowLayout: true,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Narrow layout (stacked single scroll) ──────────────────────────────────
class _NarrowLayout extends StatelessWidget {
  const _NarrowLayout({
    required this.packs,
    required this.activeCat,
    required this.filtered,
    required this.allCount,
    required this.filter,
    required this.filterController,
    required this.onSelectCat,
    required this.onFilter,
    required this.selectedSlug,
    required this.cols,
  });

  final int cols;
  final PackIndex packs;
  final CategoryEntry? activeCat;
  final List<PackSummary> filtered;
  final int allCount;
  final String filter;
  final TextEditingController filterController;
  final ValueChanged<String?> onSelectCat;
  final ValueChanged<String> onFilter;
  final String? selectedSlug;

  @override
  Widget build(BuildContext context) {
    return PageContainer.slivers(
      slivers: _buildPageSlivers(
        context: context,
        activeCat: activeCat,
        filtered: filtered,
        allCount: allCount,
        filter: filter,
        filterController: filterController,
        onFilter: onFilter,
        inlineSidebar: CollapsibleSection(
          title: 'CATEGORIES',
          child: _CategorySidebar(
            packs: packs,
            selected: selectedSlug,
            onSelect: onSelectCat,
            showHeading: false,
          ),
        ),
        cols: cols,
        useRowLayout: false,
      ),
    );
  }
}

// ─── Slivers shared by both layouts ─────────────────────────────────────────
//
// Returns the page's content as a list of top-level slivers, ready to be
// handed to [PageContainer.slivers]. The masonry is a TOP-LEVEL sliver
// (SliverPadding > SliverMasonryGrid.count) — `cols` is computed once by
// the parent's box LayoutBuilder, NOT here via SliverLayoutBuilder, because
// SliverConstraints change every scroll frame and would rebuild the whole
// grid mid-scroll.
List<Widget> _buildPageSlivers({
  required BuildContext context,
  required CategoryEntry? activeCat,
  required List<PackSummary> filtered,
  required int allCount,
  required String filter,
  required TextEditingController filterController,
  required ValueChanged<String> onFilter,
  required Widget? inlineSidebar,
  required int cols,
  required bool useRowLayout,
}) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
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
  final titleBar = Padding(
    padding: const EdgeInsets.symmetric(horizontal: 28),
    child: _TitleBar(
      title: activeCat?.name ?? 'All packs',
      countText: '${_fmt(filtered.length)} of ${_fmt(allCount)} packs',
      controller: filterController,
      onChanged: onFilter,
      useRowLayout: useRowLayout,
    ),
  );

  return [
    SliverToBoxAdapter(child: breadcrumb),
    if (inlineSidebar != null)
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(28, 0, 28, 16),
        sliver: SliverToBoxAdapter(child: inlineSidebar),
      ),
    SliverPersistentHeader(
      pinned: true,
      delegate: _PinnedTitleDelegate(
        // Match the app top bar (58px) on wide. Narrow stacks the filter
        // under the title so it needs a bit more room.
        height: useRowLayout ? 58 : 96,
        background: Theme.of(context).scaffoldBackgroundColor,
        child: titleBar,
      ),
    ),
    if (filtered.isEmpty)
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(28, 0, 28, 64),
        sliver: SliverToBoxAdapter(
          child: Center(
            child: Text(
              filter.trim().isEmpty
                  ? 'No packs in this category.'
                  : 'No packs matched "${filter.trim()}".',
              style: TextStyle(color: muted),
            ),
          ),
        ),
      )
    else
      // Top-level masonry sliver → SliverChildBuilderDelegate only inflates
      // visible tiles. `cols` comes pre-computed from the outer box
      // LayoutBuilder so this sliver doesn't rebuild during scroll.
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
        sliver: SliverMasonryGrid.count(
          crossAxisCount: cols,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childCount: filtered.length,
          itemBuilder: (context, i) => PackTile(summary: filtered[i]),
        ),
      ),
  ];
}

// ─── Title bar (h2 + count pill + filter input) ─────────────────────────────
class _TitleBar extends StatelessWidget {
  const _TitleBar({
    required this.title,
    required this.countText,
    required this.controller,
    required this.onChanged,
    required this.useRowLayout,
  });

  final String title;
  final String countText;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  /// When true, title + count and filter input live on one row (wide
  /// viewports). When false, filter input wraps to a second row. Driven by
  /// the parent (page-level wide flag) so that the pinned header above can
  /// reserve a fixed extent.
  final bool useRowLayout;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final titleRow = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Flexible(
          child: Text(
            title,
            style: Theme.of(context)
                .textTheme
                .headlineMedium
                ?.copyWith(fontSize: 20, height: 1.1, letterSpacing: -0.4),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(countText, style: AppTheme.mono(size: 10, color: muted)),
        ),
      ],
    );
    final filter = SizedBox(
      width: useRowLayout ? 240 : double.infinity,
      height: 36,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textAlignVertical: TextAlignVertical.center,
        style: TextStyle(fontSize: 13, color: ink),
        decoration: InputDecoration(
          hintText: 'Filter packs…',
          isDense: true,
          hintStyle: TextStyle(fontSize: 13, color: muted),
          prefixIcon: Icon(Icons.search, size: 14, color: muted),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 28, minHeight: 28),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        ),
      ),
    );
    if (useRowLayout) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [titleRow, filter],
      );
    }
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [titleRow, const SizedBox(height: 8), filter],
    );
  }
}

/// Fixed-height pinned header. Wraps content in [Material] so scrolling
/// content underneath doesn't bleed through.
class _PinnedTitleDelegate extends SliverPersistentHeaderDelegate {
  _PinnedTitleDelegate({
    required this.height,
    required this.background,
    required this.child,
  });

  final double height;
  final Color background;
  final Widget child;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Material(
      color: background,
      child: Padding(
        // Slim bottom breathing room — the row itself now matches the top
        // bar so we don't need 18px of dead space underneath.
        padding: const EdgeInsets.only(bottom: 8),
        child: child,
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _PinnedTitleDelegate old) =>
      old.height != height ||
      old.background != background ||
      !identical(old.child, child);
}

// ─── Sidebar (category filter list) ─────────────────────────────────────────
class _CategorySidebar extends StatelessWidget {
  const _CategorySidebar({
    required this.packs,
    required this.selected,
    required this.onSelect,
    this.showHeading = true,
  });

  final PackIndex packs;
  final String? selected;
  final ValueChanged<String?> onSelect;

  /// Wide layout shows the "CATEGORIES" label inline; narrow layout wraps
  /// this widget in [CollapsibleSection] whose own header already carries
  /// the label, so we hide ours to avoid the duplicate row.
  final bool showHeading;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ranked = [...packs.categories]
      ..sort((a, b) => b.packPrefixes.length.compareTo(a.packPrefixes.length));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showHeading)
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
