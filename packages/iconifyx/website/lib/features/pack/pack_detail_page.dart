import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/site_footer.dart';
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

  @override
  Widget build(BuildContext context) {
    final prefix = widget.route.prefix;
    return BlocBuilder<BootstrapBloc, BootstrapState>(
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

    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: LayoutBuilder(
        builder: (context, c) {
          final wide = c.maxWidth >= 900;
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);

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
            ),
          );

          final breadcrumb = Padding(
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
          );

          // The title + filter input top of the icon column. Rebuilds with
          // the filter query so the count badge stays accurate.
          final titleSliver = route.selectorBuilder<({String? style, String q})>(
            selector: (qs) => (style: qs['style'], q: qs['q'] ?? ''),
            builder: (ctx, qs) {
              final filtered = page._applyFilters(allIcons, qs.style, qs.q);
              return _TitleBar(
                title: summary.name,
                countText: filtered.length == allIcons.length
                    ? '${_fmt(allIcons.length)} icons'
                    : '${_fmt(filtered.length)} of ${_fmt(allIcons.length)}',
                controller: page._filterController,
                onChanged: page._setFilter,
              );
            },
          );

          // The actual icon SliverGrid — top-level sliver in the page scroll
          // view → only visible rows materialise.
          final gridSliver = route.selectorBuilder<({String? style, String q})>(
            selector: (qs) => (style: qs['style'], q: qs['q'] ?? ''),
            builder: (ctx, qs) {
              final filtered = page._applyFilters(allIcons, qs.style, qs.q);
              if (filtered.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Center(
                    child: Text(
                      qs.q.trim().isEmpty
                          ? 'This style group has no icons.'
                          : 'No icons matched "${qs.q.trim()}".',
                      style: TextStyle(color: muted),
                    ),
                  ),
                );
              }
              return const SizedBox.shrink();
            },
          );

          if (wide) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(pad + 28, 28, 24, 40),
                  child: SizedBox(width: 240, child: sidebar),
                ),
                Expanded(
                  child: _ScrollColumn(
                    pad: 0,
                    breadcrumb: breadcrumb,
                    titleSliverBuilder: () => titleSliver,
                    gridFallback: gridSliver,
                    page: page,
                    allIcons: allIcons,
                    iconColor: iconColor,
                    rightEdgePadding: pad,
                  ),
                ),
              ],
            );
          }
          // Narrow: sidebar inline above grid.
          return _ScrollColumn(
            pad: pad,
            breadcrumb: breadcrumb,
            inlineSidebar: sidebar,
            titleSliverBuilder: () => titleSliver,
            gridFallback: gridSliver,
            page: page,
            allIcons: allIcons,
            iconColor: iconColor,
            rightEdgePadding: pad,
          );
        },
      ),
    );
  }
}

/// Composes the right-hand-side scroll view: a CustomScrollView whose icon
/// grid is a top-level `SliverGrid.builder` so only visible rows inflate.
class _ScrollColumn extends StatelessWidget {
  const _ScrollColumn({
    required this.pad,
    required this.breadcrumb,
    this.inlineSidebar,
    required this.titleSliverBuilder,
    required this.gridFallback,
    required this.page,
    required this.allIcons,
    required this.iconColor,
    required this.rightEdgePadding,
  });

  final double pad;
  final Widget breadcrumb;
  final Widget? inlineSidebar;
  final Widget Function() titleSliverBuilder;
  final Widget gridFallback;
  final _PackDetailPageState page;
  final List<IconRecord> allIcons;
  final Color iconColor;
  final double rightEdgePadding;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: EdgeInsets.symmetric(horizontal: pad),
          sliver: SliverToBoxAdapter(child: breadcrumb),
        ),
        if (inlineSidebar != null)
          SliverPadding(
            padding: EdgeInsets.fromLTRB(28 + pad, 0, 28 + pad, 16),
            sliver: SliverToBoxAdapter(child: inlineSidebar),
          ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(28 + pad, 0, 28 + pad, 18),
          sliver: SliverToBoxAdapter(child: titleSliverBuilder()),
        ),
        // The lazy icon grid as a TOP-LEVEL sliver. SliverGrid.builder's
        // `SliverChildBuilderDelegate` only materialises rows visible in the
        // outer scroll viewport.
        SliverPadding(
          padding: EdgeInsets.fromLTRB(28 + pad, 0, 28 + pad, 40),
          sliver: _LazyGridSliver(
            page: page,
            allIcons: allIcons,
            iconColor: iconColor,
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.only(right: rightEdgePadding),
          sliver: const SliverToBoxAdapter(child: SiteFooter()),
        ),
      ],
    );
  }
}

/// The icon grid as a top-level sliver. `SliverGrid.builder` only
/// materialises cells whose y-position overlaps the outer scroll viewport.
class _LazyGridSliver extends StatelessWidget {
  const _LazyGridSliver({
    required this.page,
    required this.allIcons,
    required this.iconColor,
  });

  final _PackDetailPageState page;
  final List<IconRecord> allIcons;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final iconSize = page._iconSize;
        final cellTarget = (iconSize + 56).clamp(72, 200).toDouble();
        final w = constraints.crossAxisExtent;
        final cols = (w / cellTarget).floor().clamp(3, 24);
        const childAspect = 0.85;
        return _GridContent(
          page: page,
          allIcons: allIcons,
          iconColor: iconColor,
          cols: cols,
          childAspect: childAspect,
        );
      },
    );
  }
}

class _GridContent extends StatelessWidget {
  const _GridContent({
    required this.page,
    required this.allIcons,
    required this.iconColor,
    required this.cols,
    required this.childAspect,
  });

  final _PackDetailPageState page;
  final List<IconRecord> allIcons;
  final Color iconColor;
  final int cols;
  final double childAspect;

  @override
  Widget build(BuildContext context) {
    final route = page.widget.route;
    return route.selectorBuilder<({String? style, String q})>(
      selector: (qs) => (style: qs['style'], q: qs['q'] ?? ''),
      builder: (ctx, qs) {
        final filtered = page._applyFilters(allIcons, qs.style, qs.q);
        if (filtered.isEmpty) {
          // Sized empty marker so layout stays sensible (we're inside a
          // SliverLayoutBuilder).
          return const SliverToBoxAdapter(child: SizedBox.shrink());
        }
        return SliverGrid.builder(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: childAspect,
          ),
          itemCount: filtered.length,
          itemBuilder: (context, i) {
            final ic = filtered[i];
            return _IconCell(
              key: ValueKey('${ic.prefix}/${ic.name}/${ic.codepoint}'),
              record: ic,
              iconSize: page._iconSize,
              iconColor: iconColor,
            );
          },
        );
      },
    );
  }
}

class _IconCell extends StatelessWidget {
  const _IconCell({
    super.key,
    required this.record,
    required this.iconSize,
    required this.iconColor,
  });
  final IconRecord record;
  final double iconSize;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return HoverBuilder(
      onTap: () => appCoordinator.push(
        IconDetailRoute(prefix: record.prefix, name: record.name),
      ),
      builder: (ctx, hovered) => Container(
        decoration: BoxDecoration(
          color: hovered ? coralSoft : card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: hovered ? AppTheme.coral : rule),
        ),
        padding: const EdgeInsets.fromLTRB(6, 8, 6, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Expanded(
              child: Center(
                child: FittedBox(
                  fit: BoxFit.contain,
                  child: IconifyIcon(
                    record.toIconifyData(),
                    size: iconSize,
                    color: hovered ? AppTheme.coral : iconColor,
                  ),
                ),
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
                color: hovered ? AppTheme.coral : muted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
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
  });

  final PackSummary summary;
  final List<({String label, String? slug})> styles;
  final String? activeStyle;
  final ValueChanged<String?> onStyle;
  final double size;
  final ValueChanged<double> onSize;
  final Color? color;
  final ValueChanged<Color?> onColor;

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
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              Text('${size.toStringAsFixed(0)} px',
                  style: AppTheme.mono(size: 12, color: ink)),
              Expanded(
                child: Slider(
                  value: size,
                  min: 16,
                  max: 64,
                  divisions: 12,
                  onChanged: onSize,
                ),
              ),
            ],
          ),
        ),
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
                  selected:
                      (color == null && c == null) || (color != null && color == c),
                  onTap: () => onColor(c),
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
        Text(summary.category,
            style: AppTheme.mono(size: 10, color: muted)),
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
                style: AppTheme.mono(
                    size: 9, color: muted, letterSpacing: 0.6)),
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
  });
  final String title;
  final String countText;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

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
        final filterField = SizedBox(
          width: wide ? 240 : double.infinity,
          child: TextField(
            controller: controller,
            onChanged: onChanged,
            decoration: InputDecoration(
              hintText: 'Filter icons…',
              prefixIcon: Icon(Icons.search, size: 16, color: muted),
              prefixIconConstraints:
                  const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
          ),
        );
        if (wide) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [titleRow, filterField],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [titleRow, const SizedBox(height: 10), filterField],
        );
      },
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
            size: 12, color: hovered ? AppTheme.coral : muted),
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
          Text(summary.name,
              style: Theme.of(context).textTheme.headlineMedium),
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

String _fmt(int n) => n.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
