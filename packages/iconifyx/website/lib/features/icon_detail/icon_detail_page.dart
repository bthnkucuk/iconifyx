import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:stupid_simple_sheet/stupid_simple_sheet.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/iconify_svg_url.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/iconify_thumb.dart';
import '../../theme/app_theme.dart';

class IconDetailPage extends StatelessWidget {
  const IconDetailPage({super.key, required this.prefix, required this.name});

  final String prefix;
  final String name;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapCatalogReady) {
          return const Center(
              child: CircularProgressIndicator(color: AppTheme.coral));
        }
        final icons = state.catalog.byPrefix[prefix];
        final pack = state.packs.byPrefix[prefix];
        if (icons == null || pack == null) {
          return _Missing(prefix: prefix, name: name);
        }
        final record = icons.firstWhere(
          (r) => r.name == name,
          orElse: () => icons.first,
        );
        final related =
            icons.where((r) => r.name != record.name).take(12).toList();
        return _IconView(record: record, pack: pack, related: related);
      },
    );
  }
}

class _IconView extends StatelessWidget {
  const _IconView(
      {required this.record, required this.pack, required this.related});
  final IconRecord record;
  final PackSummary pack;
  final List<IconRecord> related;

  @override
  Widget build(BuildContext context) {
    return SheetBackground(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      child: Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        clipBehavior: Clip.antiAlias,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _Breadcrumb(
                          packPrefix: pack.prefix,
                          packName: pack.name,
                          iconName: record.name),
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                        child: LayoutBuilder(
                          builder: (context, c) {
                            final wide = c.maxWidth >= 980;
                            final preview =
                                _PreviewCard(record: record, pack: pack);
                            final right = _RightColumn(
                                record: record, pack: pack, related: related);
                            if (wide) {
                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(child: preview),
                                  const SizedBox(width: 48),
                                  SizedBox(width: 420, child: right),
                                ],
                              );
                            }
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                preview,
                                const SizedBox(height: 24),
                                right,
                              ],
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb(
      {required this.packPrefix,
      required this.packName,
      required this.iconName});
  final String packPrefix;
  final String packName;
  final String iconName;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 28, 16, 0),
      child: Row(
        children: [
          _CrumbLink(
              label: 'iconifyx',
              onTap: () => appCoordinator.navigate(HomeRoute())),
          Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
          _CrumbLink(
              label: 'icons',
              onTap: () => appCoordinator.navigate(HomeRoute())),
          Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
          _CrumbLink(
              label: packName,
              onTap: () =>
                  appCoordinator.navigate(PackDetailRoute(prefix: packPrefix))),
          Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
          Expanded(
            child: Text(iconName,
                overflow: TextOverflow.ellipsis,
                style: AppTheme.mono(
                    size: 12, color: ink, weight: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
          _CloseSheetButton(),
        ],
      ),
    );
  }
}

class _CloseSheetButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return HoverBox(
      onTap: () => Navigator.of(context).maybePop(),
      width: 28,
      height: 28,
      borderRadius: 8,
      borderColor: rule,
      hoverBorderColor: AppTheme.coral,
      alignment: Alignment.center,
      child: Icon(Icons.close, size: 16, color: ink2),
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
      builder: (ctx, hovered) => Text(label,
          style:
              AppTheme.mono(size: 12, color: hovered ? AppTheme.coral : muted)),
    );
  }
}

class _PreviewCard extends StatefulWidget {
  const _PreviewCard({required this.record, required this.pack});
  final IconRecord record;
  final PackSummary pack;

  @override
  State<_PreviewCard> createState() => _PreviewCardState();
}

class _PreviewCardState extends State<_PreviewCard> {
  static const _sizes = [16, 20, 24, 32, 48];

  // Per-icon debug controls (independent of the pack-level sidebar in
  // pack_detail_page). Default primary = theme ink, secondary = black,
  // swap layers = off — matches the rest of the website's defaults.
  Color? _primaryColor;
  Color? _secondaryColor;
  double _primaryOpacity = 1.0;
  double _secondaryOpacity = 1.0;
  bool _swapLayers = false;

  @override
  Widget build(BuildContext context) {
    final record = widget.record;
    final pack = widget.pack;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final effectivePrimary =
        (_primaryColor ?? ink).withValues(alpha: _primaryOpacity);
    final effectiveSecondary =
        (_secondaryColor ?? const Color(0xFF000000))
            .withValues(alpha: _secondaryOpacity);
    return Container(
      padding: const EdgeInsets.all(48),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        children: [
          // Side-by-side preview: OUR TTF rendering | original Iconify SVG.
          _SideBySidePreview(
            record: record,
            paperBg: paper,
            ink: effectivePrimary,
            muted: muted,
            secondaryColor: effectiveSecondary,
            swapLayers: _swapLayers,
          ),
          // Per-layer debug strip — only meaningful for duotone icons.
          if (record.duotone) ...[
            const SizedBox(height: 16),
            _DuotoneLayerDebugStrip(
              record: record,
              ink: effectivePrimary,
              paper: paper,
              muted: muted,
              secondaryColor: effectiveSecondary,
              swapLayers: _swapLayers,
            ),
          ],
          // Per-icon debug controls — independent of the pack-level
          // sidebar. Let the user spin primary / secondary colour and
          // swap layers per icon without affecting the grid.
          if (record.duotone) ...[
            const SizedBox(height: 16),
            _PerIconControls(
              primaryColor: _primaryColor,
              onPrimaryColor: (c) => setState(() => _primaryColor = c),
              secondaryColor: _secondaryColor,
              onSecondaryColor: (c) => setState(() => _secondaryColor = c),
              primaryOpacity: _primaryOpacity,
              onPrimaryOpacity: (v) => setState(() => _primaryOpacity = v),
              secondaryOpacity: _secondaryOpacity,
              onSecondaryOpacity: (v) => setState(() => _secondaryOpacity = v),
              swapLayers: _swapLayers,
              onSwapLayers: (v) => setState(() => _swapLayers = v),
              ink: ink,
              muted: muted,
            ),
          ],
          const SizedBox(height: 32),
          // Name + Iconfyx.foo · Category mono sub.
          Text(record.name,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            '${record.prefix}:${record.name} · ${pack.name}',
            textAlign: TextAlign.center,
            style: AppTheme.mono(size: 12, color: muted),
          ),
          const SizedBox(height: 32),
          // Size row.
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 18,
            runSpacing: 12,
            children: [
              for (final s in _sizes)
                Column(
                  children: [
                    Container(
                      width: s + 18.0,
                      height: s + 18.0,
                      decoration: BoxDecoration(
                        color: paper2,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: IconifyThumb(
                        record.toIconifyData(),
                        size: s.toDouble(),
                        color: effectivePrimary,
                        secondaryColor: effectiveSecondary,
                        swapLayers: _swapLayers,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text('${s}px',
                        style: AppTheme.mono(size: 11, color: muted)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 28),
          // Actions row.
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              _PrimaryButton(
                icon: Icons.copy_rounded,
                label: 'Copy Dart',
                onTap: () => _copyDartSnippet(context, record),
              ),
              _SecondaryButton(
                icon: Icons.numbers_rounded,
                label: 'Copy const',
                onTap: () => _copyConst(context, record),
              ),
              _SecondaryButton(
                icon: Icons.share_outlined,
                label: 'Share URL',
                onTap: () => _shareUrl(context, record),
              ),
              _SecondaryButton(
                icon: Icons.bug_report_outlined,
                label: 'Report defect',
                onTap: () => _reportDefect(context, record),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RightColumn extends StatelessWidget {
  const _RightColumn(
      {required this.record, required this.pack, required this.related});
  final IconRecord record;
  final PackSummary pack;
  final List<IconRecord> related;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CodeTabs(record: record),
        const SizedBox(height: 18),
        _MetaCard(record: record, pack: pack),
        const SizedBox(height: 18),
        _Related(pack: pack, records: related),
      ],
    );
  }
}

/// Debug strip — renders each duotone layer ALONE so we can see which
/// part is failing when a paint-order duotone (logos, crypto-color, …)
/// ships looking wrong. Three tiles:
///   1. Primary glyph only (plain Text with primary IconData font).
///   2. Secondary glyph only (plain Text with secondary IconData font).
///   3. Both via `IconifyIcon` (the composed render the rest of the app uses).
/// Plus a label showing the icon's [IconifyIconData.kind] code so we can
/// see at a glance whether the runtime received the right kind.
class _DuotoneLayerDebugStrip extends StatelessWidget {
  const _DuotoneLayerDebugStrip({
    required this.record,
    required this.ink,
    required this.paper,
    required this.muted,
    required this.secondaryColor,
    required this.swapLayers,
  });

  final IconRecord record;
  final Color ink;
  final Color paper;
  final Color muted;
  final Color secondaryColor;
  final bool swapLayers;

  static const _tileSize = 88.0;
  static const _iconSize = 64.0;

  @override
  Widget build(BuildContext context) {
    final rawData = record.toIconifyData();
    // Apply swap toggle so the debug strip mirrors what the main preview
    // shows. Composed tile sees the swapped form via IconifyIcon directly.
    final data = (swapLayers && rawData.secondary != null)
        ? IconifyIconData.duo(rawData.secondary!, rawData.primary,
            kind: rawData.kind)
        : rawData;
    final primaryIcon = data.primary;
    final secondaryIcon = data.secondary;
    final kindLabel = switch (data.kind) {
      IconifyIconData.kindSolo => 'solo',
      IconifyIconData.kindHint => 'hint',
      IconifyIconData.kindPaintOrder => 'paintOrder',
      IconifyIconData.kindMaskInternal => 'maskInternal',
      _ => 'unknown',
    };

    Widget rawGlyph(IconData glyph, Color tint) => SizedBox(
          width: _iconSize,
          height: _iconSize,
          child: FittedBox(
            fit: BoxFit.contain,
            child: Text(
              String.fromCharCode(glyph.codePoint),
              style: TextStyle(
                inherit: false,
                color: tint,
                fontSize: _iconSize,
                fontFamily: glyph.fontFamily,
                package: glyph.fontPackage,
                height: 1.0,
                leadingDistribution: TextLeadingDistribution.even,
              ),
            ),
          ),
        );

    Widget tile(String label, Widget child) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: _tileSize,
              height: _tileSize,
              decoration: BoxDecoration(
                color: paper,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: child,
            ),
            const SizedBox(height: 4),
            Text(label, style: AppTheme.mono(size: 10, color: muted)),
          ],
        );

    return Column(
      children: [
        Text(
          'duotone debug · kind=$kindLabel (${data.kind})',
          style: AppTheme.mono(size: 11, color: muted),
        ),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          children: [
            tile('primary only', rawGlyph(primaryIcon, ink)),
            if (secondaryIcon != null)
              tile('secondary only', rawGlyph(secondaryIcon, ink)),
            tile(
              'composed',
              IconifyIcon(
                data,
                size: _iconSize,
                color: ink,
                secondaryColor: secondaryColor,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Per-icon debug controls — primary / secondary colour swatches + swap
/// layers toggle. Lives inside [_PreviewCard] for paint-order / duotone
/// inspection without affecting the rest of the pack grid. Independent
/// of the pack-detail sidebar.
class _PerIconControls extends StatelessWidget {
  const _PerIconControls({
    required this.primaryColor,
    required this.onPrimaryColor,
    required this.secondaryColor,
    required this.onSecondaryColor,
    required this.primaryOpacity,
    required this.onPrimaryOpacity,
    required this.secondaryOpacity,
    required this.onSecondaryOpacity,
    required this.swapLayers,
    required this.onSwapLayers,
    required this.ink,
    required this.muted,
  });

  final Color? primaryColor;
  final ValueChanged<Color?> onPrimaryColor;
  final Color? secondaryColor;
  final ValueChanged<Color?> onSecondaryColor;
  final double primaryOpacity;
  final ValueChanged<double> onPrimaryOpacity;
  final double secondaryOpacity;
  final ValueChanged<double> onSecondaryOpacity;
  final bool swapLayers;
  final ValueChanged<bool> onSwapLayers;
  final Color ink;
  final Color muted;

  static const _primarySwatches = <Color?>[
    null,
    Color(0xFF2563EB),
    Color(0xFF18C29C),
    Color(0xFFFF6A3D),
    Color(0xFFFFC23D),
    Color(0xFF7C5CFF),
    Color(0xFFE53935),
    Color(0xFF111114),
  ];
  static const _secondarySwatches = <Color?>[
    null,
    Color(0xFFFFFFFF),
    Color(0xFFF1ECE3),
    Color(0xFF111114),
    Color(0xFFFFC23D),
    Color(0xFF18C29C),
    Color(0xFF2563EB),
    Color(0xFFE53935),
  ];

  @override
  Widget build(BuildContext context) {
    Widget label(String text) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(text, style: AppTheme.mono(size: 10, color: muted)),
        );
    Widget row(List<Color?> options, Color? selected, ValueChanged<Color?> onTap) =>
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final c in options)
              _Swatch(
                color: c ?? ink,
                selected: selected == c,
                onTap: () => onTap(c),
              ),
          ],
        );
    Widget opacityRow(double value, ValueChanged<double> onChanged) => Row(
          children: [
            SizedBox(
              width: 200,
              child: Slider(
                value: value,
                min: 0.0,
                max: 1.0,
                divisions: 20,
                onChanged: onChanged,
                activeColor: AppTheme.coral,
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 40,
              child: Text(
                '${(value * 100).toStringAsFixed(0)}%',
                style: AppTheme.mono(size: 11, color: muted),
              ),
            ),
          ],
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          label('PRIMARY COLOR'),
          row(_primarySwatches, primaryColor, onPrimaryColor),
          const SizedBox(height: 6),
          label('PRIMARY OPACITY'),
          opacityRow(primaryOpacity, onPrimaryOpacity),
          const SizedBox(height: 10),
          label('SECONDARY COLOR'),
          row(_secondarySwatches, secondaryColor, onSecondaryColor),
          const SizedBox(height: 6),
          label('SECONDARY OPACITY'),
          opacityRow(secondaryOpacity, onSecondaryOpacity),
          const SizedBox(height: 10),
          label('SWAP LAYERS'),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Switch.adaptive(value: swapLayers, onChanged: onSwapLayers),
              const SizedBox(width: 8),
              Text(swapLayers ? 'on' : 'off',
                  style: AppTheme.mono(size: 11, color: muted)),
            ],
          ),
        ],
      ),
    );
  }
}

/// A small square colour swatch used by the per-icon controls. Mirrors
/// the pack-detail sidebar `_Swatch` but lives here so icon_detail
/// doesn't have to import private types across files.
class _Swatch extends StatelessWidget {
  const _Swatch({
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: selected ? AppTheme.coral : Theme.of(context).dividerColor,
            width: selected ? 2 : 1,
          ),
        ),
      ),
    );
  }
}

// ─── Code tabs + dark code block ────────────────────────────────────────────
class _CodeTabs extends StatefulWidget {
  const _CodeTabs({required this.record});
  final IconRecord record;
  @override
  State<_CodeTabs> createState() => _CodeTabsState();
}

class _CodeTabsState extends State<_CodeTabs> {
  int _active = 0;
  static const _tabs = ['Flutter', 'IconData', 'Codepoint'];

  String _snippetFor(int idx) {
    final r = widget.record;
    final cp = '0x${r.codepoint.toRadixString(16)}';
    final cls = _packClassName(r.prefix);
    final ident = _camelize(r.name);
    switch (idx) {
      case 0:
        return "import 'package:${r.fontPackage}/${r.fontPackage}.dart';\nimport 'package:iconifyx_core/iconifyx_core.dart';\n\nIconifyIcon(\n  $cls.$ident,\n  size: 24,\n);";
      case 1:
        if (r.duotone) {
          return "// duotone: same codepoint, <Family>Secondary\nIconifyIconData.duo(\n  IconData($cp, fontFamily: '${r.fontFamily}', fontPackage: '${r.fontPackage}'),\n  IconData($cp, fontFamily: '${r.fontFamily}Secondary', fontPackage: '${r.fontPackage}'),\n)";
        }
        return "IconifyIconData.solo(\n  IconData($cp, fontFamily: '${r.fontFamily}', fontPackage: '${r.fontPackage}'),\n)";
      case 2:
        return "// codepoint reserved across regens\n$cp // ${r.name}";
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final code = _snippetFor(_active);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: paper2,
            padding: const EdgeInsets.all(4),
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++) ...[
                  _TabBtn(
                    label: _tabs[i],
                    active: _active == i,
                    onTap: () => setState(() => _active = i),
                  ),
                  if (i < _tabs.length - 1) const SizedBox(width: 4),
                ],
                const Spacer(),
                _CopyChip(text: code, color: ink2),
              ],
            ),
          ),
          _CodeBlock(code: code),
        ],
      ),
    );
  }
}

class _TabBtn extends StatelessWidget {
  const _TabBtn(
      {required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return GestureDetector(
      onTap: onTap,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: active ? card : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
                color: active
                    ? Theme.of(context).dividerColor
                    : Colors.transparent),
          ),
          child: Text(label,
              style: AppTheme.mono(
                  size: 12, color: ink2, weight: FontWeight.w600)),
        ),
      ),
    );
  }
}

class _CopyChip extends StatefulWidget {
  const _CopyChip({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  State<_CopyChip> createState() => _CopyChipState();
}

class _CopyChipState extends State<_CopyChip> {
  bool _copied = false;
  Future<void> _do() async {
    await Clipboard.setData(ClipboardData(text: widget.text));
    if (!mounted) return;
    setState(() => _copied = true);
    await Future.delayed(const Duration(milliseconds: 1400));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    return HoverBuilder(
      onTap: _do,
      builder: (ctx, hovered) => AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: hovered ? AppTheme.coral : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          _copied ? 'COPIED' : 'COPY',
          style: AppTheme.mono(
            size: 11,
            weight: FontWeight.w600,
            color: hovered ? Colors.white : widget.color,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({required this.code});
  final String code;
  @override
  Widget build(BuildContext context) {
    const codeBg = Color(0xFF0F1422);
    const codeFg = Color(0xFFE6DECF);
    return Container(
      color: codeBg,
      padding: const EdgeInsets.all(16),
      child: SelectableText(
        code,
        style: AppTheme.mono(size: 12.5, color: codeFg, height: 1.65),
      ),
    );
  }
}

// ─── Meta card ──────────────────────────────────────────────────────────────
class _MetaCard extends StatelessWidget {
  const _MetaCard({required this.record, required this.pack});
  final IconRecord record;
  final PackSummary pack;
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
              style:
                  AppTheme.mono(size: 13, color: ink, weight: FontWeight.w500)),
        ],
      );
    }

    final items = [
      kv('Style', record.duotone ? 'Duotone' : 'Mono'),
      kv('Codepoint', '0x${record.codepoint.toRadixString(16).toUpperCase()}'),
      kv('Font', record.fontFamily),
      kv('Package', record.fontPackage),
      kv('License', pack.license),
      kv('Category', pack.category),
    ];
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < items.length; i += 2) ...[
            if (i > 0) const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: items[i]),
                const SizedBox(width: 14),
                Expanded(
                  child: i + 1 < items.length
                      ? items[i + 1]
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Related ────────────────────────────────────────────────────────────────
class _Related extends StatelessWidget {
  const _Related({required this.pack, required this.records});
  final PackSummary pack;
  final List<IconRecord> records;
  @override
  Widget build(BuildContext context) {
    if (records.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 12),
          child: Text('Related in ${pack.name}',
              style: Theme.of(context).textTheme.titleMedium),
        ),
        LayoutBuilder(
          builder: (context, c) {
            const cols = 6;
            const gap = 6.0;
            final cell = (c.maxWidth - gap * (cols - 1)) / cols;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final r in records)
                  SizedBox(
                    width: cell,
                    height: cell,
                    child: _RelatedTile(record: r),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _RelatedTile extends StatefulWidget {
  const _RelatedTile({required this.record});
  final IconRecord record;
  @override
  State<_RelatedTile> createState() => _RelatedTileState();
}

class _RelatedTileState extends State<_RelatedTile> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return AspectRatio(
      aspectRatio: 1,
      child: Tooltip(
        message: widget.record.name,
        child: HoverBuilder(
          onTap: () => appCoordinator
              .push(PackDetailRoute(prefix: widget.record.prefix)),
          builder: (ctx, hovered) => AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            decoration: BoxDecoration(
              color: hovered ? coralSoft : Colors.transparent,
              border: Border.all(
                color:
                    hovered ? AppTheme.coral : Theme.of(context).dividerColor,
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: IconifyThumb(
                widget.record.toIconifyData(),
                size: 22,
                color: hovered ? AppTheme.coral : ink2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Buttons ────────────────────────────────────────────────────────────────
class _PrimaryButton extends StatefulWidget {
  const _PrimaryButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  State<_PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<_PrimaryButton> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return HoverBox(
      onTap: widget.onTap,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      borderRadius: 10,
      bg: AppTheme.coral,
      hoverBg: ink,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(widget.icon, size: 16, color: Colors.white),
          const SizedBox(width: 6),
          Text(widget.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              )),
        ],
      ),
    );
  }
}

class _SecondaryButton extends StatefulWidget {
  const _SecondaryButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  State<_SecondaryButton> createState() => _SecondaryButtonState();
}

class _SecondaryButtonState extends State<_SecondaryButton> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    return HoverBox(
      onTap: widget.onTap,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      borderRadius: 10,
      bg: card,
      borderColor: rule,
      hoverBorderColor: ink,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(widget.icon, size: 16, color: ink2),
          const SizedBox(width: 6),
          Text(widget.label,
              style: TextStyle(
                color: ink2,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              )),
        ],
      ),
    );
  }
}

class _Missing extends StatelessWidget {
  const _Missing({required this.prefix, required this.name});
  final String prefix;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.help_outline, size: 56),
            const SizedBox(height: 16),
            Text('Icon "$name" not found in "$prefix"'),
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

// ─── Helpers ────────────────────────────────────────────────────────────────
String _packClassName(String prefix) {
  // e.g. "fa6-solid" → "Fa6SolidIcons", "mdi" → "MdiIcons"
  final parts = prefix.split(RegExp(r'[-_]'));
  return '${parts.map((p) => p.isEmpty ? p : p[0].toUpperCase() + p.substring(1)).join('')}Icons';
}

String _camelize(String name) {
  final parts = name.split(RegExp(r'[-._/:]'));
  if (parts.isEmpty) return name;
  final head = parts.first.toLowerCase();
  final tail = parts.skip(1).map((p) =>
      p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1).toLowerCase());
  var ident = '$head${tail.join('')}';
  if (ident.isNotEmpty && RegExp(r'^[0-9]').hasMatch(ident)) {
    ident = 'n$ident';
  }
  return ident;
}

Future<void> _copyDartSnippet(BuildContext context, IconRecord r) async {
  final cls = _packClassName(r.prefix);
  final ident = _camelize(r.name);
  final snippet =
      "import 'package:${r.fontPackage}/${r.fontPackage}.dart';\nimport 'package:iconifyx_core/iconifyx_core.dart';\n\nIconifyIcon($cls.$ident, size: 24)";
  await Clipboard.setData(ClipboardData(text: snippet));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Dart snippet copied')),
    );
  }
}

Future<void> _copyConst(BuildContext context, IconRecord r) async {
  final cls = _packClassName(r.prefix);
  final ident = _camelize(r.name);
  await Clipboard.setData(ClipboardData(text: '$cls.$ident'));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Copied $cls.$ident')),
    );
  }
}

Future<void> _shareUrl(BuildContext context, IconRecord r) async {
  final url = '/pack/${r.prefix}/icon/${Uri.encodeComponent(r.name)}';
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('URL copied: $url')),
    );
  }
}

Future<void> _reportDefect(BuildContext context, IconRecord r) async {
  final iconifyUrl = iconifySvgUrl(r);
  final title = 'Icon defect: ${r.prefix}/${r.name}';
  final body = '''
Pack: ${r.prefix}
Icon: ${r.name}
Iconify source: $iconifyUrl

What's wrong:
- (describe the visual defect)

Expected:
- (what should it look like)
''';
  final uri = Uri.https(
    'github.com',
    '/bthnkucuk/iconifyx/issues/new',
    {'title': title, 'body': body},
  );
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open issue tracker')),
    );
  }
}

// ─── Side-by-side preview ───────────────────────────────────────────────────
/// Two-tile preview: OUR generated TTF rendering vs the original Iconify CDN
/// SVG. Lets the user spot generator regressions during manual visual QA
/// without bouncing to iconify.design.
class _SideBySidePreview extends StatelessWidget {
  const _SideBySidePreview({
    required this.record,
    required this.paperBg,
    required this.ink,
    required this.muted,
    required this.secondaryColor,
    required this.swapLayers,
  });

  final IconRecord record;
  final Color paperBg;
  final Color ink;
  final Color muted;
  final Color secondaryColor;
  final bool swapLayers;

  static const double _tileSize = 200;
  static const double _iconSize = 120;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        // Stack vertically on very narrow viewports, side-by-side otherwise.
        final stacked = c.maxWidth < 460;
        final ours = _PreviewTile(
          label: 'iconifyx (ttf)',
          muted: muted,
          paperBg: paperBg,
          ink: ink,
          size: _tileSize,
          child: IconifyThumb(
            record.toIconifyData(),
            size: _iconSize,
            color: ink,
            secondaryColor: secondaryColor,
            swapLayers: swapLayers,
          ),
        );
        final source = _PreviewTile(
          label: 'iconify (source)',
          muted: muted,
          paperBg: paperBg,
          ink: ink,
          size: _tileSize,
          child: _IconifySourcePreview(
              url: iconifySvgUrlTinted(record, ink),
              size: _iconSize,
              muted: muted),
        );
        if (stacked) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [ours, const SizedBox(height: 16), source],
          );
        }
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [ours, const SizedBox(width: 20), source],
        );
      },
    );
  }
}

class _PreviewTile extends StatelessWidget {
  const _PreviewTile({
    required this.label,
    required this.muted,
    required this.paperBg,
    required this.ink,
    required this.size,
    required this.child,
  });

  final String label;
  final Color muted;
  final Color paperBg;
  final Color ink;
  final double size;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label.toUpperCase(),
            style: AppTheme.mono(
              size: 10,
              color: muted,
              weight: FontWeight.w700,
              letterSpacing: 1.2,
            )),
        const SizedBox(height: 8),
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: paperBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          alignment: Alignment.center,
          child: child,
        ),
      ],
    );
  }
}

/// Renders the raw Iconify CDN SVG at the given size. Color resolution is
/// done server-side via the URL's `?color=` query (see
/// [iconifySvgUrlTinted]) so multi-color sets (`logos`, color emojis) keep
/// their native palette while monochrome icons honour the requested tint.
class _IconifySourcePreview extends StatelessWidget {
  const _IconifySourcePreview({
    required this.url,
    required this.size,
    required this.muted,
  });

  final String url;
  final double size;
  final Color muted;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.network(
      url,
      width: size,
      height: size,
      fit: BoxFit.contain,
      placeholderBuilder: (_) => SizedBox(
        width: size * 0.3,
        height: size * 0.3,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: muted,
        ),
      ),
    );
  }
}
