import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../shared/bloc/pack_bloc.dart';
import '../../shared/widgets/hover_box.dart';
import '../../theme/app_theme.dart';

class PackDetailPage extends StatelessWidget {
  const PackDetailPage({super.key, required this.prefix});

  final String prefix;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapPacksReady) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.coral));
        }
        final summary = state.packs.byPrefix[prefix];
        if (summary == null) return _Missing(prefix: prefix);
        if (state is BootstrapCatalogReady) {
          return BlocProvider(
            key: ValueKey(prefix),
            create: (_) => PackBloc(
              catalog: state.catalog,
              packs: state.packs,
            )..add(PackOpened(prefix)),
            child: _PackBody(prefix: prefix),
          );
        }
        return _LoadingCatalog(summary: summary);
      },
    );
  }
}

class _LoadingCatalog extends StatelessWidget {
  const _LoadingCatalog({required this.summary});
  final PackSummary summary;

  @override
  Widget build(BuildContext context) {
    return PageContainer(
      children: [
        _Breadcrumb(packName: summary.name),
        const SizedBox(height: 16),
        _Toolbar(
          packName: summary.name,
          totalCount: summary.iconCount,
          filter: '',
          onFilterChanged: (_) {},
          tileSize: 32,
          onTileSizeChanged: (_) {},
          enabled: false,
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 96),
              child: CircularProgressIndicator(color: AppTheme.coral),
            ),
          ),
        ),
      ],
    );
  }
}

class _PackBody extends StatefulWidget {
  const _PackBody({required this.prefix});
  final String prefix;

  @override
  State<_PackBody> createState() => _PackBodyState();
}

class _PackBodyState extends State<_PackBody> {
  int _tileSize = 32; // 20 / 24 / 32 per handoff spec

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PackBloc, PackState>(
      builder: (context, state) {
        if (state is PackMissing) return _Missing(prefix: state.prefix);
        if (state is! PackReady) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.coral));
        }
        // Use PageContainer.slivers so the icon grid below is LAZY —
        // SliverGrid.builder participates in the outer scroll viewport and
        // only builds visible rows. The old GridView.builder with
        // shrinkWrap+NeverScrollable forced ALL 14k icons (mdi) to materialise
        // up front, which is what made the app crawl.
        return PageContainer.slivers(
          slivers: [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Breadcrumb(packName: state.summary.name),
                  const SizedBox(height: 16),
                  _Toolbar(
                    packName: state.summary.name,
                    totalCount: state.icons.length,
                    shownCount: state.filtered.length,
                    filter: state.filter,
                    onFilterChanged: (q) =>
                        context.read<PackBloc>().add(PackFilterChanged(q)),
                    tileSize: _tileSize,
                    onTileSizeChanged: (s) => setState(() => _tileSize = s),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
            _LazyIconGrid(icons: state.filtered, tileSize: _tileSize),
            SliverToBoxAdapter(child: _PackMeta(summary: state.summary)),
            const SliverToBoxAdapter(child: SizedBox(height: 56)),
          ],
        );
      },
    );
  }
}

class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb({required this.packName});
  final String packName;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
      child: DefaultTextStyle.merge(
        style: AppTheme.mono(size: 12, color: muted),
        child: Row(
          children: [
            _CrumbLink(label: 'iconifyx', onTap: () => appCoordinator.navigate(HomeRoute())),
            Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
            _CrumbLink(label: 'icons', onTap: () => appCoordinator.navigate(HomeRoute())),
            Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
            Text(packName, style: AppTheme.mono(size: 12, color: ink, weight: FontWeight.w600)),
          ],
        ),
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

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.packName,
    required this.totalCount,
    this.shownCount,
    required this.filter,
    required this.onFilterChanged,
    required this.tileSize,
    required this.onTileSizeChanged,
    this.enabled = true,
  });

  final String packName;
  final int totalCount;
  final int? shownCount;
  final String filter;
  final ValueChanged<String> onFilterChanged;
  final int tileSize;
  final ValueChanged<int> onTileSizeChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 720;
          final countText = shownCount != null && shownCount != totalCount
              ? '${_fmt(shownCount!)} of ${_fmt(totalCount)} icons'
              : '${_fmt(totalCount)} icons';
          final title = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(packName, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(width: 12),
              _CountPillMono(text: countText, color: muted),
            ],
          );
          final right = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 240,
                child: TextField(
                  onChanged: enabled ? onFilterChanged : null,
                  enabled: enabled,
                  decoration: InputDecoration(
                    hintText: 'Filter…',
                    prefixIcon: Icon(Icons.search, size: 16, color: muted),
                    prefixIconConstraints:
                        const BoxConstraints(minWidth: 32, minHeight: 32),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _SizeToggle(value: tileSize, onChanged: onTileSizeChanged),
            ],
          );
          if (wide) {
            return Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [Expanded(child: title), right],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [title, const SizedBox(height: 12), right],
          );
        },
      ),
    );
  }
}

class _SizeToggle extends StatelessWidget {
  const _SizeToggle({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const sizes = [20, 24, 32];
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < sizes.length; i++) ...[
          _SizeBtn(size: sizes[i], active: value == sizes[i], onTap: () => onChanged(sizes[i])),
          if (i < sizes.length - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

class _SizeBtn extends StatefulWidget {
  const _SizeBtn({required this.size, required this.active, required this.onTap});
  final int size;
  final bool active;
  final VoidCallback onTap;
  @override
  State<_SizeBtn> createState() => _SizeBtnState();
}

class _SizeBtnState extends State<_SizeBtn> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final active = widget.active;
    final fg = active ? AppTheme.coral : ink2;
    return HoverBox(
      onTap: widget.onTap,
      width: 32,
      height: 32,
      borderRadius: 8,
      borderColor: active ? AppTheme.coral : rule,
      bg: active ? coralSoft : Colors.transparent,
      hoverBg: active ? coralSoft : paper2,
      alignment: Alignment.center,
      child: Icon(
        widget.size <= 20
            ? Icons.grid_view_rounded
            : widget.size <= 24
                ? Icons.grid_view_outlined
                : Icons.apps_outlined,
        size: 14,
        color: fg,
      ),
    );
  }
}

/// Sliver-level icon grid — participates in the outer CustomScrollView's
/// viewport so `SliverGrid.builder` only materialises rows that are within (or
/// near) the visible area. Replaces the old `GridView.builder + shrinkWrap +
/// NeverScrollableScrollPhysics` combo that synchronously inflated all 14k+
/// icons on mdi → caused the catastrophic slowdown.
class _LazyIconGrid extends StatelessWidget {
  const _LazyIconGrid({required this.icons, required this.tileSize});
  final List<IconRecord> icons;
  final int tileSize;

  @override
  Widget build(BuildContext context) {
    if (icons.isEmpty) {
      return const SliverPadding(
        padding: EdgeInsets.fromLTRB(28, 24, 28, 48),
        sliver: SliverToBoxAdapter(
          child: Center(child: Text('No icons match this filter.')),
        ),
      );
    }
    // Handoff spec: 8/10/12 cols based on tileSize (32/24/20).
    final base = tileSize == 32
        ? 80.0
        : tileSize == 24
            ? 64.0
            : 52.0;
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 24),
      sliver: SliverLayoutBuilder(
        builder: (context, constraints) {
          final w = constraints.crossAxisExtent;
          final cols = (w / base).floor().clamp(4, 24);
          return DecoratedSliver(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            sliver: SliverPadding(
              padding: const EdgeInsets.all(8),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  mainAxisSpacing: 0,
                  crossAxisSpacing: 0,
                ),
                itemCount: icons.length,
                itemBuilder: (context, i) {
                  final ic = icons[i];
                  return _IconCell(
                    key: ValueKey('${ic.prefix}/${ic.name}/${ic.codepoint}'),
                    record: ic,
                    iconSize: tileSize.toDouble(),
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }
}

class _IconCell extends StatefulWidget {
  const _IconCell({super.key, required this.record, required this.iconSize});
  final IconRecord record;
  final double iconSize;

  @override
  State<_IconCell> createState() => _IconCellState();
}

class _IconCellState extends State<_IconCell> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return Tooltip(
      message: widget.record.name,
      child: AspectRatio(
        aspectRatio: 1,
        child: HoverBuilder(
          onTap: () => appCoordinator.push(
            IconDetailRoute(
                prefix: widget.record.prefix, name: widget.record.name),
          ),
          builder: (ctx, hovered) => AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            decoration: BoxDecoration(
              color: hovered ? coralSoft : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: FittedBox(
                fit: BoxFit.contain,
                child: IconifyIcon(
                  widget.record.toIconifyData(),
                  size: widget.iconSize,
                  color: hovered ? AppTheme.coral : ink2,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PackMeta extends StatelessWidget {
  const _PackMeta({required this.summary});
  final PackSummary summary;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    Widget kv(String k, String v) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(k.toUpperCase(),
              style: AppTheme.mono(
                  size: 10,
                  color: muted,
                  weight: FontWeight.w700,
                  letterSpacing: 1.0)),
          const SizedBox(height: 4),
          Text(v,
              style: AppTheme.mono(size: 13, color: ink, weight: FontWeight.w500)),
        ],
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 8, 28, 0),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Wrap(
          spacing: 32,
          runSpacing: 16,
          children: [
            kv('Pub package', summary.packageName),
            kv('Author', summary.author ?? '—'),
            kv('License', summary.license),
            kv('Icons', _fmt(summary.iconCount)),
            if (summary.duotoneCount > 0) kv('Duotone', _fmt(summary.duotoneCount)),
            kv('Category', summary.category),
          ],
        ),
      ),
    );
  }
}

class _CountPillMono extends StatelessWidget {
  const _CountPillMono({required this.text, required this.color});
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
