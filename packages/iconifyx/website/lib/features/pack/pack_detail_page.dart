import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/iconify_svg_url.dart';
import '../../shared/widgets/collapsible_section.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/iconify_thumb.dart';
import '../../theme/app_theme.dart';

/// Pack-detail page.
///
/// URL state via [PackDetailRoute]'s [RouteQueryParameters]:
///   `/pack/<prefix>?style=<suffix>&q=<text>`
///
/// Icon size + preview color are local UI state.
///
/// Layout:
///   Row [
///     left sidebar  (Style filter / Size slider / Colors / Pack info),
///     CustomScrollView with TOP-LEVEL `SliverGrid.builder` for icons,
///   ]
///
/// **The icon grid is a top-level sliver in the page's CustomScrollView.**
/// That's what makes it truly lazy — only the rows whose y-positions overlap
/// the viewport are materialised. Earlier the grid was a `GridView.builder`
/// inside a sized box, which (despite the `.builder` name) fully inflates all
/// rows when given a bounded height. With mdi (14k icons) that was the cause
/// of the catastrophic open delay.
class PackDetailPage extends StatefulWidget {
  const PackDetailPage({super.key, required this.route});
  final PackDetailRoute route;

  @override
  State<PackDetailPage> createState() => _PackDetailPageState();
}

class _PackDetailPageState extends State<PackDetailPage> {
  late final TextEditingController _filterController;
  double _iconSize = 28;
  Color? _iconColor;
  // Override for `IconifyIcon.secondaryColor`. `null` lets the per-page
  // default ride (cell card colour as knockout). Useful for debugging
  // paint-order duotones (logos, crypto-color) where the foreground
  // letterform reads against a different surface than the card.
  Color? _iconSecondaryColor;
  // Debug toggle: swap primary <-> secondary in every duotone icon.
  // Some packs (streamline-color, streamline-flex-color, …) have
  // mixed-order paths where `trySplitTwoColorBody`'s "first color in
  // source order = primary" heuristic ends up putting the BACKGROUND
  // on top of the FOREGROUND accent. This toggle flips it so we can
  // identify which icons would render correctly with the inverse
  // split, then we know how to fix the generator.
  bool _swapLayers = false;

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

  void setIconSize(double s) => setState(() => _iconSize = s);
  void setIconColor(Color? c) => setState(() => _iconColor = c);
  void setIconSecondaryColor(Color? c) =>
      setState(() => _iconSecondaryColor = c);
  void setSwapLayers(bool v) => setState(() => _swapLayers = v);

  void _setStyle(String? style) {
    final qs = Map<String, String>.from(widget.route.queries);
    if (style == null || style == 'all') {
      qs.remove('style');
    } else {
      qs['style'] = style;
    }
    widget.route.updateQueries(appCoordinator, queries: qs);
  }

  void _setFilter(String text) {
    final qs = Map<String, String>.from(widget.route.queries);
    final t = text.trim();
    if (t.isEmpty) {
      qs.remove('q');
    } else {
      qs['q'] = t;
    }
    widget.route.updateQueries(appCoordinator, queries: qs);
  }

  List<({String label, String? slug})> _availableStyles(
      List<IconRecord> icons) {
    final hasDuotone = icons.any((r) => r.duotone);
    final hasOutline = icons.any((r) =>
        r.name.endsWith('-outline') ||
        r.name.endsWith('-line') ||
        r.name.endsWith('-stroke'));
    final hasFill = icons.any((r) =>
        r.name.endsWith('-fill') ||
        r.name.endsWith('-filled') ||
        r.name.endsWith('-solid'));
    final hasBold = icons.any((r) => r.name.endsWith('-bold'));
    final hasThin = icons.any((r) => r.name.endsWith('-thin'));
    final hasLight = icons.any((r) => r.name.endsWith('-light'));
    return [
      (label: 'All', slug: null),
      if (hasOutline) (label: 'Outline', slug: 'outline'),
      if (hasFill) (label: 'Solid', slug: 'fill'),
      if (hasDuotone) (label: 'Duotone', slug: 'duotone'),
      if (hasBold) (label: 'Bold', slug: 'bold'),
      if (hasLight) (label: 'Light', slug: 'light'),
      if (hasThin) (label: 'Thin', slug: 'thin'),
    ];
  }

  List<IconRecord> _applyFilters(
      List<IconRecord> icons, String? style, String q) {
    Iterable<IconRecord> out = icons;
    if (style != null) {
      out = out.where((r) {
        if (style == 'duotone') return r.duotone;
        if (style == 'outline') {
          return r.name.endsWith('-outline') ||
              r.name.endsWith('-line') ||
              r.name.endsWith('-stroke');
        }
        if (style == 'fill') {
          return r.name.endsWith('-fill') ||
              r.name.endsWith('-filled') ||
              r.name.endsWith('-solid');
        }
        return r.name.endsWith('-$style');
      });
    }
    final qq = q.trim().toLowerCase();
    if (qq.isNotEmpty) {
      out = out.where((r) => r.name.toLowerCase().contains(qq));
    }
    return out.toList(growable: false);
  }

  /// When a fling/scroll ends we want cells that rendered as placeholders
  /// (because `Scrollable.recommendDeferredLoadingForContext` was true) to
  /// finally paint their icon. The simplest trigger is a top-level rebuild
  /// gated by a ScrollEndNotification listener — the rebuild is cheap (the
  /// outer LayoutBuilder + `_GridContent` + `_applyFilters` all early-out on
  /// equal inputs) and gives the currently-mounted cells a fresh build pass
  /// where `recommendDeferredLoading` is now false → icons paint.
  bool _onScrollNotification(ScrollNotification n) {
    if (n is ScrollEndNotification) {
      // ignore: avoid_print
      // Causes _LoadedBody → _GridContent → SliverChildBuilderDelegate to
      // rebuild and re-evaluate the deferred check.
      setState(() {});
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final prefix = widget.route.prefix;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScrollNotification,
      child: BlocBuilder<BootstrapBloc, BootstrapState>(
        builder: (context, state) {
          if (state is! BootstrapPacksReady) {
            return const Center(
                child: CircularProgressIndicator(color: AppTheme.coral));
          }
          final summary = state.packs.byPrefix[prefix];
          if (summary == null) return _Missing(prefix: prefix);
          if (state is! BootstrapCatalogReady) {
            return _LoadingCatalog(summary: summary);
          }
          final allIcons = state.catalog.byPrefix[prefix] ?? const [];
          return _LoadedBody(
            page: this,
            summary: summary,
            allIcons: allIcons,
          );
        },
      ),
    );
  }
}

class _LoadedBody extends StatelessWidget {
  const _LoadedBody({
    required this.page,
    required this.summary,
    required this.allIcons,
  });
  final _PackDetailPageState page;
  final PackSummary summary;
  final List<IconRecord> allIcons;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final route = page.widget.route;
    final styles = page._availableStyles(allIcons);
    final iconColor = page._iconColor ?? ink;

    return LayoutBuilder(
      builder: (context, c) {
        final wide = c.maxWidth >= 900;

        // Derive the icon grid's eventual crossAxisExtent from box
        // constraints here, in the OUTER (box) LayoutBuilder. This rebuilds
        // only on viewport resize — never on scroll. Previously a
        // `SliverLayoutBuilder` wrapped the grid; sliver constraints change
        // every scroll frame (scrollOffset, remainingPaintExtent), so the
        // grid + its `selectorBuilder` + `_applyFilters` ran ~60×/s during
        // scroll — for arcticons (15k icons) that's ~900k iterations/s of
        // filter work and one SliverGrid widget allocation per frame.
        final pageColumnWidth =
            wide ? (c.maxWidth - 240 - 28 - 24) : c.maxWidth;
        final pageContainerPad =
            ((pageColumnWidth - AppShellLayout.pageMaxWidth) / 2)
                .clamp(0.0, double.infinity);
        final gridCrossExtent = (pageColumnWidth - 2 * pageContainerPad - 56)
            .clamp(0.0, double.infinity);
        final iconSizeValue = page._iconSize;
        // Cell now hosts a side-by-side comparison (iconifyx TTF + iconify
        // CDN SVG), so each cell needs roughly 2× the horizontal room a
        // square-icon cell would. Bumped from `iconSize + 56` to
        // `iconSize * 2 + 64`; cols clamp lowered from 3..24 to 2..12.
        final cellTarget =
            (iconSizeValue * 2 + 64).clamp(140, 360).toDouble();
        final cols = (gridCrossExtent / cellTarget).floor().clamp(2, 12);
        const crossAxisSpacing = 10.0;
        final cellWidth =
            (gridCrossExtent - crossAxisSpacing * (cols - 1)) / cols;
        // Each sub-tile gets half the cell minus internal padding + divider.
        // Clamped to 16..96 like before — that's the IconifyThumb sweet spot.
        final iconRenderSize =
            ((cellWidth - 28) / 2).clamp(16.0, 96.0);

        final cardColor = isDark ? AppTheme.cardDark : AppTheme.card;
        final palette = _CellPalette(
          card: cardColor,
          rule: isDark ? AppTheme.ruleDark : AppTheme.rule,
          coralSoft: isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft,
          muted: muted,
          iconColor: iconColor,
          iconRenderSize: iconRenderSize,
          // Default secondary = plain black. Using the card surface (white
          // in light theme) made paint-order foreground letterforms blend
          // into the page background where the glyph touches the tile
          // edge — looked like the icon was broken rather than a
          // knockout. Black is universally legible against any
          // currentColor-filled primary tile (until the user picks
          // explicit ink as the primary). Override via the sidebar
          // "SECONDARY COLOR" swatches.
          surfaceForKnockout:
              page._iconSecondaryColor ?? const Color(0xFF000000),
          swapLayers: page._swapLayers,
        );

        final sidebar = route.selectorBuilder<String?>(
          selector: (q) => q['style'],
          builder: (ctx, activeStyle) => _Sidebar(
            summary: summary,
            styles: styles,
            activeStyle: activeStyle,
            onStyle: page._setStyle,
            size: page._iconSize,
            onSize: page.setIconSize,
            color: page._iconColor,
            onColor: page.setIconColor,
            secondaryColor: page._iconSecondaryColor,
            onSecondaryColor: page.setIconSecondaryColor,
            swapLayers: page._swapLayers,
            onSwapLayers: page.setSwapLayers,
          ),
        );

        final breadcrumbSliver = SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 16),
            child: Row(
              children: [
                _CrumbLink(
                    label: 'iconifyx',
                    onTap: () => appCoordinator.navigate(HomeRoute())),
                Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                _CrumbLink(
                    label: 'packs',
                    onTap: () => appCoordinator.navigate(AllPacksRoute())),
                Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                Text(summary.name,
                    style: AppTheme.mono(
                        size: 12, color: muted, weight: FontWeight.w600)),
              ],
            ),
          ),
        );

        // The title + filter input is pinned at the top of the icon column
        // (sticky as user scrolls). Rebuilds only on filter query change —
        // the selectorBuilder wraps the SliverPersistentHeader so the
        // pinned delegate gets a fresh count text when the filter changes.
        final scaffoldBg = Theme.of(context).scaffoldBackgroundColor;
        final titleSliver = route.selectorBuilder<({String? style, String q})>(
          selector: (qs) => (style: qs['style'], q: qs['q'] ?? ''),
          builder: (ctx, qs) {
            final filtered = page._applyFilters(allIcons, qs.style, qs.q);
            return SliverPersistentHeader(
              pinned: true,
              delegate: _PinnedTitleDelegate(
                // Match the app top bar (58px) on wide. Narrow stacks the
                // filter under the title so it needs a bit more room.
                height: wide ? 58 : 96,
                background: scaffoldBg,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: _TitleBar(
                    title: summary.name,
                    countText: filtered.length == allIcons.length
                        ? '${_fmt(allIcons.length)} icons'
                        : '${_fmt(filtered.length)} of ${_fmt(allIcons.length)}',
                    controller: page._filterController,
                    onChanged: page._setFilter,
                    useRowLayout: wide,
                  ),
                ),
              ),
            );
          },
        );

        // The lazy icon grid as a TOP-LEVEL sliver. `SliverGrid` with
        // `SliverChildBuilderDelegate` only materialises rows visible in
        // the outer scroll viewport — and crucially, no SliverLayoutBuilder
        // wraps it, so it does NOT rebuild during scroll.
        final gridSliver = SliverPadding(
          padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
          sliver: _GridContent(
            page: page,
            allIcons: allIcons,
            cols: cols,
            // Landscape rectangle: 1.6× wider than tall to fit the
            // side-by-side TTF + SVG comparison without cramping either
            // tile.
            childAspect: 1.6,
            palette: palette,
          ),
        );

        if (wide) {
          return Material(
            color: Theme.of(context).scaffoldBackgroundColor,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(28, 28, 24, 40),
                  child: SizedBox(width: 240, child: sidebar),
                ),
                Expanded(
                  child: PageContainer.slivers(
                    slivers: [
                      breadcrumbSliver,
                      titleSliver,
                      gridSliver,
                    ],
                  ),
                ),
              ],
            ),
          );
        }
        // Narrow: sidebar inline above grid, wrapped in CollapsibleSection
        // so mobile users land on a tidy top — the filters/options panel is
        // a tap away on the trailing chevron, but doesn't dominate the
        // viewport by default.
        final inlineSidebarSliver = SliverPadding(
          padding: const EdgeInsets.fromLTRB(28, 0, 28, 16),
          sliver: SliverToBoxAdapter(
            child: CollapsibleSection(
              title: 'OPTIONS',
              child: sidebar,
            ),
          ),
        );
        return PageContainer.slivers(
          slivers: [
            breadcrumbSliver,
            inlineSidebarSliver,
            titleSliver,
            gridSliver,
          ],
        );
      },
    );
  }
}

/// Pre-resolved palette + sizing for the icon grid's cells.
///
/// Computed ONCE per grid rebuild (i.e. when style/size/color/theme changes)
/// and handed to every [_IconCell] verbatim, so the per-cell build path does
/// no `Theme.of(context)` / `AppTheme` lookups, no allocations beyond the
/// `IconifyIconData` itself. Scrolling 15k cells past the viewport stays
/// cheap because each newly-mounted cell just reads these values.
class _CellPalette {
  const _CellPalette({
    required this.card,
    required this.rule,
    required this.coralSoft,
    required this.muted,
    required this.iconColor,
    required this.iconRenderSize,
    required this.surfaceForKnockout,
    required this.swapLayers,
  });
  final Color card;
  final Color rule;
  final Color coralSoft;
  final Color muted;
  final Color iconColor;
  final double iconRenderSize;
  /// The colour passed to `IconifyThumb.secondaryColor` so paint-order
  /// duotones (logos / crypto-color / fluent-emoji-flat / …) render their
  /// foreground letterform as a knockout against the primary background
  /// tile. Resolved once in `_LoadedBody.build` from the cell's own card
  /// colour — the foreground letter visually "punches out" of the
  /// currentColor-filled tile and the gap reads as the card surface.
  final Color surfaceForKnockout;
  /// Debug toggle: swap primary <-> secondary in every duotone icon.
  /// Useful for packs (streamline-color family) where the two-color split
  /// heuristic picked the wrong "first" colour as background and the
  /// foreground accents ended up underneath. Wired into `IconifyThumb`
  /// which reconstructs an `IconifyIconData` with the IconDatas swapped
  /// (kind preserved). Off by default.
  final bool swapLayers;
}

class _GridContent extends StatelessWidget {
  const _GridContent({
    required this.page,
    required this.allIcons,
    required this.cols,
    required this.childAspect,
    required this.palette,
  });

  final _PackDetailPageState page;
  final List<IconRecord> allIcons;
  final int cols;
  final double childAspect;
  final _CellPalette palette;

  @override
  Widget build(BuildContext context) {
    final route = page.widget.route;
    return route.selectorBuilder<({String? style, String q})>(
      selector: (qs) => (style: qs['style'], q: qs['q'] ?? ''),
      builder: (ctx, qs) {
        final filtered = page._applyFilters(allIcons, qs.style, qs.q);
        if (filtered.isEmpty) {
          // Sized empty marker so layout stays sensible.
          return const SliverToBoxAdapter(child: SizedBox.shrink());
        }
        return SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: childAspect,
          ),
          delegate: SliverChildBuilderDelegate(
            (context, i) {
              final ic = filtered[i];
              return _IconCell(
                key: ValueKey('${ic.prefix}/${ic.name}/${ic.codepoint}'),
                record: ic,
                palette: palette,
              );
            },
            childCount: filtered.length,
            // None of these are needed for an icon grid and they cost real
            // CPU per visible cell at 15k items:
            addAutomaticKeepAlives: false,
            addSemanticIndexes: false,
          ),
        );
      },
    );
  }
}

class _IconCell extends StatelessWidget {
  const _IconCell({
    super.key,
    required this.record,
    required this.palette,
  });
  final IconRecord record;
  final _CellPalette palette;

  @override
  Widget build(BuildContext context) {
    // During fast scroll the engine reports `recommendDeferredLoading`. Skip
    // both the IconifyIcon paint AND the Iconify CDN SVG fetch (`SvgPicture
    // .network` is the bigger cost — a fling across arcticons would
    // otherwise fire ~15k network requests). Show the cell chrome only;
    // when scroll velocity drops below the threshold and any new cell
    // enters the viewport, that cell renders both halves normally.
    final deferred = Scrollable.recommendDeferredLoadingForContext(context);
    final iconData = deferred ? null : record.toIconifyData();
    return HoverBuilder(
      onTap: () => appCoordinator.push(
        IconDetailRoute(prefix: record.prefix, name: record.name),
      ),
      builder: (ctx, hovered) {
        final accent = hovered ? AppTheme.coral : palette.iconColor;
        return Container(
          decoration: BoxDecoration(
            color: hovered ? palette.coralSoft : palette.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: hovered ? AppTheme.coral : palette.rule),
          ),
          padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: iconData == null
                            ? const SizedBox.shrink()
                            : IconifyThumb(
                                iconData,
                                size: palette.iconRenderSize,
                                color: accent,
                                secondaryColor: palette.surfaceForKnockout,
                                swapLayers: palette.swapLayers,
                              ),
                      ),
                    ),
                    Container(
                      width: 1,
                      margin: const EdgeInsets.symmetric(vertical: 6),
                      color: palette.rule,
                    ),
                    Expanded(
                      child: Center(
                        child: deferred
                            ? const SizedBox.shrink()
                            : SvgPicture.network(
                                iconifySvgUrlTinted(record, accent),
                                width: palette.iconRenderSize,
                                height: palette.iconRenderSize,
                                placeholderBuilder: (_) =>
                                    const SizedBox.shrink(),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Text(
                record.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  height: 1.1,
                  color: hovered ? AppTheme.coral : palette.muted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.summary,
    required this.styles,
    required this.activeStyle,
    required this.onStyle,
    required this.size,
    required this.onSize,
    required this.color,
    required this.onColor,
    required this.secondaryColor,
    required this.onSecondaryColor,
    required this.swapLayers,
    required this.onSwapLayers,
  });

  final PackSummary summary;
  final List<({String label, String? slug})> styles;
  final String? activeStyle;
  final ValueChanged<String?> onStyle;
  final double size;
  final ValueChanged<double> onSize;
  final Color? color;
  final ValueChanged<Color?> onColor;
  final Color? secondaryColor;
  final ValueChanged<Color?> onSecondaryColor;
  final bool swapLayers;
  final ValueChanged<bool> onSwapLayers;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (styles.length > 1) ...[
          _SidebarLabel('STYLE'),
          const SizedBox(height: 4),
          for (final s in styles)
            _CategoryRow(
              label: s.label,
              active: (s.slug ?? '') == (activeStyle ?? ''),
              onTap: () => onStyle(s.slug),
            ),
          const SizedBox(height: 18),
        ],
        _SidebarLabel('SIZE'),
        const SizedBox(height: 4),
        _SizeSliderRow(initialValue: size, onCommit: onSize),
        const SizedBox(height: 18),
        _SidebarLabel('COLOR'),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in const [
                null,
                Color(0xFF2563EB),
                Color(0xFF18C29C),
                Color(0xFFFF6A3D),
                Color(0xFFFFC23D),
                Color(0xFF7C5CFF),
                Color(0xFFE53935),
                Color(0xFF111114),
              ])
                _Swatch(
                  color: c ?? ink,
                  selected: (color == null && c == null) ||
                      (color != null && color == c),
                  onTap: () => onColor(c),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // Paint-order duotones (logos, crypto-color, fluent-emoji-flat,
        // …) use the secondary colour as the foreground letterform's
        // "knockout" against the primary background tile. Default
        // matches the cell card colour; override here when debugging.
        _SidebarLabel('SECONDARY COLOR'),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in const [
                null,
                Color(0xFFFFFFFF),
                Color(0xFFF1ECE3),
                Color(0xFF111114),
                Color(0xFFFFC23D),
                Color(0xFF18C29C),
                Color(0xFF2563EB),
                Color(0xFFE53935),
              ])
                _Swatch(
                  color: c ?? AppTheme.card,
                  selected: (secondaryColor == null && c == null) ||
                      (secondaryColor != null && secondaryColor == c),
                  onTap: () => onSecondaryColor(c),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // Debug: swap primary <-> secondary in every duotone icon.
        // For streamline-color and similar packs where the two-color
        // split's "first colour = primary" heuristic ended up with the
        // background on top of the foreground accent.
        _SidebarLabel('SWAP LAYERS'),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              Switch.adaptive(
                value: swapLayers,
                onChanged: onSwapLayers,
              ),
              const SizedBox(width: 8),
              Text(
                swapLayers ? 'on' : 'off',
                style: AppTheme.mono(size: 11, color: muted),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SidebarLabel('PACK'),
        const SizedBox(height: 6),
        _MetaRow(label: 'Author', value: summary.author ?? '—'),
        _MetaRow(label: 'License', value: summary.license),
        _MetaRow(label: 'Icons', value: _fmt(summary.iconCount)),
        if (summary.duotoneCount > 0)
          _MetaRow(label: 'Duotone', value: _fmt(summary.duotoneCount)),
        _MetaRow(label: 'Package', value: summary.packageName, mono: true),
        const SizedBox(height: 8),
        Text(summary.category, style: AppTheme.mono(size: 10, color: muted)),
      ],
    );
  }
}

class _SidebarLabel extends StatelessWidget {
  const _SidebarLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
      child: Text(label,
          style: AppTheme.mono(
            size: 10,
            color: AppTheme.muted,
            weight: FontWeight.w700,
            letterSpacing: 1.0,
          )),
    );
  }
}

/// Discrete-snap size slider.
///
/// `divisions: 12` with min=16/max=64 snaps to the steps
/// `16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64`. The Slider only
/// fires `onChanged` when the snapped value crosses to the next step — not
/// on every drag pixel — so committing on every `onChanged` updates the
/// grid at most ~12 times across the full drag, not 60 Hz. That's cheap
/// enough for live preview without the per-pixel rebuild storm.
class _SizeSliderRow extends StatelessWidget {
  const _SizeSliderRow({required this.initialValue, required this.onCommit});
  final double initialValue;
  final ValueChanged<double> onCommit;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          Text('${initialValue.toStringAsFixed(0)} px',
              style: AppTheme.mono(size: 12, color: ink)),
          Expanded(
            child: Slider(
              value: initialValue,
              min: 16,
              max: 64,
              divisions: 12,
              onChanged: onCommit,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value, this.mono = false});
  final String label;
  final String value;
  final bool mono;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 60,
            child: Text(label.toUpperCase(),
                style:
                    AppTheme.mono(size: 9, color: muted, letterSpacing: 0.6)),
          ),
          Expanded(
            child: Text(value,
                style: mono
                    ? AppTheme.mono(size: 12, color: ink)
                    : TextStyle(fontSize: 12, color: ink)),
          ),
        ],
      ),
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch(
      {required this.color, required this.selected, required this.onTap});
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return HoverBuilder(
      onTap: onTap,
      builder: (ctx, hovered) => Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? AppTheme.coral
                : (hovered
                    ? Theme.of(context).colorScheme.onSurface
                    : Theme.of(context).dividerColor),
            width: selected ? 2 : 1,
          ),
        ),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
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
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final fg = active ? AppTheme.coral : ink;
    return HoverBox(
      onTap: onTap,
      bg: active ? coralSoft : Colors.transparent,
      hoverBg: active ? coralSoft : paper2,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      borderRadius: 8,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          color: fg,
          fontWeight: active ? FontWeight.w600 : FontWeight.w500,
        ),
      ),
    );
  }
}

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

  /// When true, title row + filter input share one row (wide viewports).
  /// When false, they stack vertically. Driven by the parent so the pinned
  /// header above can reserve a fixed extent.
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
    final filterField = SizedBox(
      width: useRowLayout ? 240 : double.infinity,
      height: 36,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textAlignVertical: TextAlignVertical.center,
        style: TextStyle(fontSize: 13, color: ink),
        decoration: InputDecoration(
          hintText: 'Filter icons…',
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
        children: [titleRow, filterField],
      );
    }
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [titleRow, const SizedBox(height: 8), filterField],
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
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
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
        style: AppTheme.mono(size: 12, color: hovered ? AppTheme.coral : muted),
      ),
    );
  }
}

class _LoadingCatalog extends StatelessWidget {
  const _LoadingCatalog({required this.summary});
  final PackSummary summary;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(48),
      child: Column(
        children: [
          Text(summary.name, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 24),
          const Center(child: CircularProgressIndicator(color: AppTheme.coral)),
        ],
      ),
    );
  }
}

class _Missing extends StatelessWidget {
  const _Missing({required this.prefix});
  final String prefix;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.report_outlined, size: 56),
            const SizedBox(height: 16),
            Text('Pack "$prefix" not found'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => appCoordinator.navigate(HomeRoute()),
              child: const Text('Back to home'),
            ),
          ],
        ),
      ),
    );
  }
}

String _fmt(int n) => n
    .toString()
    .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
