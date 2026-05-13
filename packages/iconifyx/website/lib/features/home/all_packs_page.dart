import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
import '../../theme/app_theme.dart';

/// All packs listing — every iconifyx_* pack with a left category filter
/// sidebar and a right-side pack-name filter input in the toolbar.
class AllPacksPage extends StatefulWidget {
  const AllPacksPage({super.key});

  @override
  State<AllPacksPage> createState() => _AllPacksPageState();
}

class _AllPacksPageState extends State<AllPacksPage> {
  /// `null` = show every pack.
  String? _categorySlug;
  String _filter = '';
  late final TextEditingController _filterController;

  @override
  void initState() {
    super.initState();
    _filterController = TextEditingController();
  }

  @override
  void dispose() {
    _filterController.dispose();
    super.dispose();
  }

  List<PackSummary> _visiblePacks(PackIndex packs) {
    final base = _categorySlug == null
        ? packs.packs
        : () {
            final cat = packs.categories.firstWhere(
              (c) => c.slug == _categorySlug,
              orElse: () => CategoryEntry(
                  slug: _categorySlug!,
                  name: _categorySlug!,
                  packPrefixes: const []),
            );
            return [
              for (final p in cat.packPrefixes)
                if (packs.byPrefix[p] != null) packs.byPrefix[p]!,
            ];
          }();
    final q = _filter.trim().toLowerCase();
    if (q.isEmpty) return base;
    return base
        .where((p) =>
            p.name.toLowerCase().contains(q) ||
            p.prefix.toLowerCase().contains(q) ||
            p.category.toLowerCase().contains(q))
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
        final filtered = _visiblePacks(packs);
        final activeCat = _categorySlug == null
            ? null
            : packs.categories.firstWhere(
                (c) => c.slug == _categorySlug,
                orElse: () => CategoryEntry(
                    slug: _categorySlug!,
                    name: _categorySlug!,
                    packPrefixes: const []),
              );
        return PageContainer(
          children: [
            // Breadcrumb.
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
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
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: LayoutBuilder(
                builder: (context, c) {
                  final wide = c.maxWidth >= 900;
                  final sidebar = _CategorySidebar(
                    packs: packs,
                    selected: _categorySlug,
                    onSelect: (slug) => setState(() => _categorySlug = slug),
                  );
                  final main = Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _TitleBar(
                        title: activeCat?.name ?? 'All packs',
                        countText:
                            '${_fmt(filtered.length)} of ${_fmt(packs.packs.length)} packs',
                        filterController: _filterController,
                        onFilterChanged: (v) => setState(() => _filter = v),
                      ),
                      const SizedBox(height: 18),
                      if (filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 64),
                          child: Center(
                            child: Text(
                              _filter.trim().isEmpty
                                  ? 'No packs in this category.'
                                  : 'No packs matched "${_filter.trim()}".',
                              style: TextStyle(color: muted),
                            ),
                          ),
                        )
                      else
                        _PackGrid(packs: filtered),
                    ],
                  );
                  if (wide) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: 240, child: sidebar),
                        const SizedBox(width: 32),
                        Expanded(child: main),
                      ],
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      sidebar,
                      const SizedBox(height: 24),
                      main,
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 40),
          ],
        );
      },
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
              child:
                  Text(countText, style: AppTheme.mono(size: 11, color: muted)),
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

// ─── Pack grid using the category-card visual ───────────────────────────────
class _PackGrid extends StatelessWidget {
  const _PackGrid({required this.packs});
  final List<PackSummary> packs;
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth;
        final cols = w >= 1240
            ? 4
            : w >= 900
                ? 3
                : w >= 560
                    ? 2
                    : 1;
        return MasonryGridView.count(
          crossAxisCount: cols,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          itemCount: packs.length,
          itemBuilder: (context, i) => _PackTile(summary: packs[i]),
        );
      },
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

    // 4 sample icons from this pack's preview (pad with first if <4).
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

String _fmt(int n) => n
    .toString()
    .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
