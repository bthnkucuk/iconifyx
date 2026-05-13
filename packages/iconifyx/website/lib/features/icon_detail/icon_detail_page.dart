import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:stupid_simple_sheet/stupid_simple_sheet.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
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

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.record, required this.pack});
  final IconRecord record;
  final PackSummary pack;

  static const _sizes = [16, 20, 24, 32, 48];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Container(
      padding: const EdgeInsets.all(48),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        children: [
          // 240×240 preview stage @ 120px icon.
          Container(
            width: 240,
            height: 240,
            decoration: BoxDecoration(
              color: paper,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            alignment: Alignment.center,
            child: IconifyIcon(record.toIconifyData(), size: 120, color: ink),
          ),
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
                      child: IconifyIcon(record.toIconifyData(),
                          size: s.toDouble(), color: ink),
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
              child: FittedBox(
                fit: BoxFit.contain,
                child: IconifyIcon(
                  widget.record.toIconifyData(),
                  size: 22,
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
