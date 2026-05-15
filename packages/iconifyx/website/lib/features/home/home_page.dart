import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/iconify_thumb.dart';
import '../../shared/widgets/pack_tile.dart';
import '../../theme/app_theme.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        return switch (state) {
          BootstrapInitial() || BootstrapLoadingPacks() => const _Loading(),
          BootstrapFailed(error: final e) => _Failed(error: e),
          BootstrapPacksReady(packs: final packs) => _Ready(packs: packs),
        };
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator(color: AppTheme.coral));
}

class _Failed extends StatelessWidget {
  const _Failed({required this.error});
  final Object error;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(48),
          child: Text('Failed to load icon catalog:\n$error',
              textAlign: TextAlign.center),
        ),
      );
}

class _Ready extends StatelessWidget {
  const _Ready({required this.packs});
  final PackIndex packs;

  static const _scatterIcons = [
    'home',
    'heart-outline',
    'star-outline',
    'bell-outline',
    'download-outline',
    'cog-outline',
    'magnify',
    'account-outline',
  ];

  // Featured packs row: 4 highly-popular Iconify packs. PackTile renders each.
  static const _featuredPackPrefixes = ['ph', 'lucide', 'solar', 'mdi'];

  @override
  Widget build(BuildContext context) {
    final mdiPack = packs.byPrefix['mdi'];
    final featured = [
      for (final p in _featuredPackPrefixes)
        if (packs.byPrefix[p] != null) packs.byPrefix[p]!,
    ];
    return PageContainer.slivers(
      slivers: [
        SliverToBoxAdapter(
          child: _Hero(
              packs: packs, mdiPack: mdiPack, scatterIcons: _scatterIcons),
        ),
        SliverToBoxAdapter(child: _CategorySection(packs: packs)),
        SliverToBoxAdapter(child: _FeaturedPacksSection(featured: featured)),
        SliverToBoxAdapter(child: _AllPacksHeader()),
        _AllPacksGridSliver(
          packs: packs.packs,
          cols: _allPacksCols(context),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 56)),
      ],
    );
  }
}

// ─── Featured packs row ─────────────────────────────────────────────────────
/// Four hand-picked packs as the same square card shown in /packs. Adapts the
/// column count down on narrow viewports so a card never gets crushed.
class _FeaturedPacksSection extends StatelessWidget {
  const _FeaturedPacksSection({required this.featured});
  final List<PackSummary> featured;

  @override
  Widget build(BuildContext context) {
    if (featured.isEmpty) return const SizedBox.shrink();
    // Resolve the PackTile palette ONCE per section build so the up-to-4
    // tiles below don't each repeat the `Theme.of(context)` lookup.
    final tilePalette = PackTilePalette.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 36),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Most used packs',
              style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 6),
          Text(
            'A curated handful — dive into one or browse them all below.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppTheme.muted,
                ),
          ),
          const SizedBox(height: 22),
          LayoutBuilder(
            builder: (context, c) {
              final cols = c.maxWidth >= 900
                  ? 4
                  : c.maxWidth >= 600
                      ? 2
                      : 1;
              const gap = 14.0;
              final cellW = (c.maxWidth - gap * (cols - 1)) / cols;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final p in featured.take(4))
                    SizedBox(
                      width: cellW,
                      child: PackTile(summary: p, palette: tilePalette),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─── All-packs heading (sits above the masonry sliver) ─────────────────────
class _AllPacksHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).brightness == Brightness.dark
        ? AppTheme.mutedDark
        : AppTheme.muted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 22),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('All packs',
                    style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 6),
                Text(
                  'Every Iconify set shipped in iconifyx — tap one to open its grid.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: muted,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          HoverBuilder(
            onTap: () => appCoordinator.navigate(AllPacksRoute()),
            builder: (ctx, hovered) => Text(
              'Browse all →',
              style: AppTheme.mono(
                size: 12,
                color: hovered ? AppTheme.coral : muted,
                weight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── All-packs masonry sliver (5 cols on wide) ─────────────────────────────
/// Same lazy `SliverMasonryGrid.count` shape that /packs uses, capped at
/// 5 columns on wide viewports. Sliver — only visible tiles materialise.
///
/// `cols` is computed by the parent (from MediaQuery / box LayoutBuilder),
/// NOT by a SliverLayoutBuilder here — wrapping the masonry in a sliver-
/// constraint builder would rebuild it every scroll frame because
/// `SliverConstraints` (scrollOffset, remainingPaintExtent) change per
/// frame, which would tear down/rebuild every mounted PackTile.
class _AllPacksGridSliver extends StatelessWidget {
  const _AllPacksGridSliver({required this.packs, required this.cols});
  final List<PackSummary> packs;
  final int cols;

  @override
  Widget build(BuildContext context) {
    // Resolve the PackTile palette ONCE per sliver build (the masonry sliver
    // doesn't itself rebuild on scroll — only newly-mounted tiles run their
    // builder). Each tile reuses the palette instead of doing 6× Theme.of
    // ternaries on every hover. See website/CLAUDE.md §4.
    final tilePalette = PackTilePalette.of(context);
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
      sliver: SliverMasonryGrid.count(
        crossAxisCount: cols,
        mainAxisSpacing: 14,
        crossAxisSpacing: 14,
        childCount: packs.length,
        itemBuilder: (context, i) =>
            PackTile(summary: packs[i], palette: tilePalette),
      ),
    );
  }
}

/// Column count for the all-packs masonry, derived once from the viewport
/// width (clamped to the centred 1240 max-width column the page sits in).
int _allPacksCols(BuildContext context) {
  final viewportW = MediaQuery.sizeOf(context).width;
  final pageW =
      viewportW.clamp(0.0, AppShellLayout.pageMaxWidth.toDouble());
  final contentW = (pageW - 56).clamp(0.0, double.infinity); // 28+28 gutter
  if (contentW >= 1100) return 5;
  if (contentW >= 900) return 4;
  if (contentW >= 600) return 3;
  if (contentW >= 380) return 2;
  return 1;
}

// ─── Hero ────────────────────────────────────────────────────────────────────
class _Hero extends StatelessWidget {
  const _Hero(
      {required this.packs, required this.mdiPack, required this.scatterIcons});

  final PackIndex packs;
  final PackSummary? mdiPack;
  final List<String> scatterIcons;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(28, 72, 28, 56),
        child: Stack(
          alignment: Alignment.topCenter,
          children: [
            _HeroScatter(mdiPack: mdiPack, names: scatterIcons),
            Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 880),
                  child: Text.rich(
                    TextSpan(
                      style: Theme.of(context).textTheme.displayLarge,
                      children: const [
                        TextSpan(text: 'Friendly icons,\nbuilt for '),
                        TextSpan(
                          text: 'Flutter',
                          style: TextStyle(color: AppTheme.coral),
                        ),
                        TextSpan(text: '.'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 14),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 600),
                  child: Text(
                    '${_fmt(packs.totalIcons)} hand-vetted icons across ${packs.packs.length} Iconify packs — type-safe in Dart, tree-shake-clean, ready to ship.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ),
                const SizedBox(height: 28),
                const _InstallBar(command: 'flutter pub add iconifyx_mdi'),
                const SizedBox(height: 36),
                _HeroStats(packs: packs),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroScatter extends StatelessWidget {
  const _HeroScatter({required this.mdiPack, required this.names});
  final PackSummary? mdiPack;
  final List<String> names;

  @override
  Widget build(BuildContext context) {
    final pack = mdiPack;
    if (pack == null) return const SizedBox.shrink();
    // Build a {name → IconRecord} from the pack preview (only ~12 items).
    final byName = <String, IconRecord>{
      for (final r in pack.preview) r.name: r
    };
    return Positioned.fill(
      child: IgnorePointer(
        child: ClipRect(
          child: LayoutBuilder(
            builder: (context, c) {
              // Text max-width is 880; keep scatter in the left/right gutters
              // outside that band so icons never overlap the headline.
              const textMaxWidth = 880.0;
              const tileSize = 44.0;
              final gutter = (c.maxWidth - textMaxWidth) / 2;
              if (gutter < tileSize + 8) {
                // Screen too narrow — skip scatter rather than crowd the text.
                return const SizedBox.shrink();
              }
              // top%, side (l/r), rotate°, highlighted.
              const spots = <_ScatterGutterSpot>[
                _ScatterGutterSpot(
                    top: 0.10,
                    side: _Side.left,
                    dx: 0.55,
                    rotate: -7,
                    highlighted: false),
                _ScatterGutterSpot(
                    top: 0.18,
                    side: _Side.right,
                    dx: 0.45,
                    rotate: 6,
                    highlighted: true),
                _ScatterGutterSpot(
                    top: 0.48,
                    side: _Side.left,
                    dx: 0.20,
                    rotate: 4,
                    highlighted: false),
                _ScatterGutterSpot(
                    top: 0.58,
                    side: _Side.right,
                    dx: 0.65,
                    rotate: -3,
                    highlighted: false),
                _ScatterGutterSpot(
                    top: 0.72,
                    side: _Side.left,
                    dx: 0.60,
                    rotate: 3,
                    highlighted: false),
                _ScatterGutterSpot(
                    top: 0.78,
                    side: _Side.right,
                    dx: 0.30,
                    rotate: -5,
                    highlighted: true),
                _ScatterGutterSpot(
                    top: 0.36,
                    side: _Side.left,
                    dx: 0.35,
                    rotate: 8,
                    highlighted: false),
                _ScatterGutterSpot(
                    top: 0.32,
                    side: _Side.right,
                    dx: 0.55,
                    rotate: -8,
                    highlighted: false),
              ];
              final children = <Widget>[];
              for (var i = 0; i < spots.length && i < names.length; i++) {
                final name = names[i];
                final rec = byName[name] ??
                    (pack.preview.isNotEmpty
                        ? pack.preview[i % pack.preview.length]
                        : null);
                if (rec == null) continue;
                final s = spots[i];
                // dx is a 0..1 position WITHIN the gutter band.
                final left = s.side == _Side.left
                    ? s.dx * (gutter - tileSize)
                    : c.maxWidth - gutter + s.dx * (gutter - tileSize);
                children.add(Positioned(
                  top: c.maxHeight * s.top,
                  left: left,
                  child: _ScatterTile(
                      record: rec,
                      rotate: s.rotate,
                      highlighted: s.highlighted),
                ));
              }
              return Stack(children: children);
            },
          ),
        ),
      ),
    );
  }
}

enum _Side { left, right }

class _ScatterGutterSpot {
  const _ScatterGutterSpot({
    required this.top,
    required this.side,
    required this.dx,
    required this.rotate,
    required this.highlighted,
  });
  final double top;
  final _Side side;
  final double dx;
  final double rotate;
  final bool highlighted;
}

class _ScatterTile extends StatelessWidget {
  const _ScatterTile(
      {required this.record, required this.rotate, required this.highlighted});
  final IconRecord record;
  final double rotate;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return Transform.rotate(
      angle: rotate * 0.01745329, // deg→rad
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: highlighted ? coralSoft : card,
          border: Border.all(color: highlighted ? AppTheme.coral : rule),
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [
            BoxShadow(
              color: Color(0x140E1320),
              blurRadius: 16,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: IconifyThumb(
            record.toIconifyData(),
            size: 22,
            color: highlighted ? AppTheme.coral : ink2,
          ),
        ),
      ),
    );
  }
}

class _InstallBar extends StatefulWidget {
  const _InstallBar({required this.command});
  final String command;

  @override
  State<_InstallBar> createState() => _InstallBarState();
}

class _InstallBarState extends State<_InstallBar> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.command));
    if (!mounted) return;
    setState(() => _copied = true);
    await Future.delayed(const Duration(milliseconds: 1400));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F0E1320),
            blurRadius: 22,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          color: card,
          border: Border.all(color: rule),
          borderRadius: BorderRadius.circular(14),
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 13, 20, 13),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppTheme.mint,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(color: AppTheme.mint, blurRadius: 8),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      widget.command,
                      style: AppTheme.mono(size: 14, color: ink2),
                    ),
                  ],
                ),
              ),
              Container(width: 1, color: rule),
              Column(
                children: [
                  Expanded(
                    child: HoverBuilder(
                      onTap: _copy,
                      builder: (ctx, hovered) => AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        decoration: BoxDecoration(
                          color: hovered ? AppTheme.coral : paper2,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _copied ? Icons.check : Icons.copy_outlined,
                              size: 14,
                              color: hovered ? Colors.white : ink2,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _copied ? 'COPIED' : 'COPY',
                              style: AppTheme.mono(
                                size: 12,
                                weight: FontWeight.w600,
                                color: hovered ? Colors.white : ink2,
                                letterSpacing: 0.24,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
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

class _HeroStats extends StatelessWidget {
  const _HeroStats({required this.packs});
  final PackIndex packs;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final items = [
      (_fmt(packs.totalIcons), 'icons'),
      ('${packs.packs.length}', 'packs'),
      ('0kb', 'runtime (tree-shaken)'),
      ('MIT', 'license'),
    ];
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 40,
      runSpacing: 12,
      children: [
        for (final (number, label) in items)
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                number,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.18,
                  color: ink,
                  fontFamily:
                      Theme.of(context).textTheme.titleLarge?.fontFamily,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: muted,
                  fontFamily:
                      Theme.of(context).textTheme.bodyMedium?.fontFamily,
                ),
              ),
            ],
          ),
      ],
    );
  }
}

// ─── Category grid ───────────────────────────────────────────────────────────
class _CategorySection extends StatelessWidget {
  const _CategorySection({required this.packs});
  final PackIndex packs;

  @override
  Widget build(BuildContext context) {
    final cats = packs.categories;
    // Pick top 7 categories by pack count, plus an "All packs" coral card.
    final ranked = [...cats]
      ..sort((a, b) => b.packPrefixes.length.compareTo(a.packPrefixes.length));
    final top = ranked.take(7).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 12, 28, 56),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Browse by category',
                  style: Theme.of(context).textTheme.headlineMedium),
              const Spacer(),
              _TextButtonWithIcon(
                label: 'All packs',
                icon: Icons.arrow_outward,
                onTap: () => appCoordinator.navigate(AllPacksRoute()),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Curated groupings of the 215 Iconify packs we ship.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppTheme.muted,
                ),
          ),
          const SizedBox(height: 22),
          LayoutBuilder(builder: (context, c) {
            final cols = c.maxWidth >= 1100
                ? 4
                : c.maxWidth >= 760
                    ? 3
                    : c.maxWidth >= 440
                        ? 2
                        : 1;
            const gap = 14.0;
            final cellW = (c.maxWidth - gap * (cols - 1)) / cols;
            final cards = [
              for (final cat in top)
                SizedBox(
                  width: cellW,
                  child: _CategoryCard(category: cat, packs: packs),
                ),
              SizedBox(
                width: cellW,
                child: _AllPacksCard(totalPacks: packs.packs.length),
              ),
            ];
            return Wrap(spacing: gap, runSpacing: gap, children: cards);
          }),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatefulWidget {
  const _CategoryCard({required this.category, required this.packs});
  final CategoryEntry category;
  final PackIndex packs;

  @override
  State<_CategoryCard> createState() => _CategoryCardState();
}

class _CategoryCardState extends State<_CategoryCard> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;

    // Sample icons from up to 4 packs in this category.
    final samples = <IconRecord>[];
    for (final p in widget.category.packPrefixes) {
      final summary = widget.packs.byPrefix[p];
      if (summary != null && summary.preview.isNotEmpty) {
        samples.add(summary.preview.first);
        if (samples.length >= 4) break;
      }
    }
    while (samples.length < 4) {
      samples.add(samples.isEmpty
          ? widget.packs.packs.first.preview.first
          : samples[samples.length % samples.length]);
    }

    return HoverBuilder(
      onTap: () =>
          appCoordinator.navigate(AllPacksRoute(initialQueries: {'cat': widget.category.slug})),
      builder: (ctx, hovered) => AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        transform:
            hovered ? Matrix4.translationValues(0, -2, 0) : Matrix4.identity(),
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
                  Expanded(
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: _SampleCell(
                        record: samples[i],
                        bg: i == 0 ? coralSoft : paper2,
                        color: i == 0 ? AppTheme.coral : ink2,
                      ),
                    ),
                  ),
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
                      Text(widget.category.name,
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 2),
                      Text(
                        '${widget.category.packPrefixes.length} packs',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                    ],
                  ),
                ),
                _CountPill(
                    text: '${widget.category.packPrefixes.length}',
                    color: ink2),
              ],
            ),
          ],
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
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Center(
        child: IconifyThumb(record.toIconifyData(), size: 20, color: color),
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: AppTheme.mono(size: 11, color: color)),
    );
  }
}

class _AllPacksCard extends StatefulWidget {
  const _AllPacksCard({required this.totalPacks});
  final int totalPacks;

  @override
  State<_AllPacksCard> createState() => _AllPacksCardState();
}

class _AllPacksCardState extends State<_AllPacksCard> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return HoverBuilder(
      onTap: () => appCoordinator.navigate(AllPacksRoute()),
      builder: (ctx, hovered) => AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        transform:
            hovered ? Matrix4.translationValues(0, -2, 0) : Matrix4.identity(),
        decoration: BoxDecoration(
          color: coralSoft,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.coral),
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
                Expanded(
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.coral,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.grid_view_rounded,
                          color: Colors.white, size: 20),
                    ),
                  ),
                ),
                for (var i = 0; i < 3; i++) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppTheme.coral.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
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
                      Text('All icons',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(color: AppTheme.coral)),
                      const SizedBox(height: 2),
                      Text(
                        'Search across every pack',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.coral.withValues(alpha: 0.8)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _CountPill(
                    text: _fmt(widget.totalPacks), color: AppTheme.coral),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TextButtonWithIcon extends StatefulWidget {
  const _TextButtonWithIcon({
    required this.label,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  State<_TextButtonWithIcon> createState() => _TextButtonWithIconState();
}

class _TextButtonWithIconState extends State<_TextButtonWithIcon> {
  @override
  Widget build(BuildContext context) {
    return HoverBuilder(
      onTap: widget.onTap,
      builder: (ctx, hovered) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(widget.label,
              style: TextStyle(
                  fontSize: 13,
                  color: hovered ? AppTheme.coral : AppTheme.muted,
                  fontWeight: FontWeight.w500)),
          const SizedBox(width: 4),
          Icon(widget.icon,
              color: hovered ? AppTheme.coral : AppTheme.muted, size: 14),
        ],
      ),
    );
  }
}

String _fmt(int n) => n
    .toString()
    .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
