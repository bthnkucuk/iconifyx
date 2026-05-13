import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';

class IconDetailPage extends StatelessWidget {
  const IconDetailPage({super.key, required this.prefix, required this.name});

  final String prefix;
  final String name;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapCatalogReady) {
          return const Center(child: CircularProgressIndicator());
        }
        final icons = state.catalog.byPrefix[prefix];
        final pack = state.packs.byPrefix[prefix];
        if (icons == null || pack == null) {
          return _Missing(prefix: prefix, name: name);
        }
        final record =
            icons.firstWhere((r) => r.name == name, orElse: () => icons.first);
        return _IconView(record: record, pack: pack);
      },
    );
  }
}

class _IconView extends StatefulWidget {
  const _IconView({required this.record, required this.pack});

  final IconRecord record;
  final PackSummary pack;

  @override
  State<_IconView> createState() => _IconViewState();
}

class _IconViewState extends State<_IconView> {
  double _size = 96;
  Color? _color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final coordinator = appCoordinator;
    final r = widget.record;
    final dartSnippet = _dartSnippet(r);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              TextButton.icon(
                icon: const Icon(Icons.arrow_back, size: 18),
                label: Text(widget.pack.name),
                onPressed: () => coordinator.navigate(
                  PackDetailRoute(prefix: widget.pack.prefix),
                ),
              ),
              const Text(' / '),
              Flexible(
                child: SelectableText(
                  r.name,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 720;
              final preview = AspectRatio(
                aspectRatio: 1,
                child: Container(
                  decoration: BoxDecoration(
                    color: cs.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: cs.outlineVariant),
                  ),
                  child: Center(
                    child: IconifyIcon(
                      r.toIconifyData(),
                      size: _size,
                      color: _color ?? cs.onSurface,
                    ),
                  ),
                ),
              );
              final controls = _ControlsAndCode(
                record: r,
                pack: widget.pack,
                size: _size,
                color: _color ?? cs.onSurface,
                onSizeChanged: (v) => setState(() => _size = v),
                onColorChanged: (c) => setState(() => _color = c),
                dartSnippet: dartSnippet,
              );
              if (wide) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 360, child: preview),
                    const SizedBox(width: 24),
                    Expanded(child: controls),
                  ],
                );
              }
              return Column(
                children: [
                  preview,
                  const SizedBox(height: 20),
                  controls,
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ControlsAndCode extends StatelessWidget {
  const _ControlsAndCode({
    required this.record,
    required this.pack,
    required this.size,
    required this.color,
    required this.onSizeChanged,
    required this.onColorChanged,
    required this.dartSnippet,
  });

  final IconRecord record;
  final PackSummary pack;
  final double size;
  final Color color;
  final ValueChanged<double> onSizeChanged;
  final ValueChanged<Color> onColorChanged;
  final String dartSnippet;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          record.name,
          style: Theme.of(context)
              .textTheme
              .headlineSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _Chip('codepoint: 0x${record.codepoint.toRadixString(16)}'),
            _Chip('font: ${record.fontFamily}'),
            _Chip('package: ${record.fontPackage}'),
            if (record.duotone) _Chip('duotone', color: cs.primary),
          ],
        ),
        const SizedBox(height: 20),
        Text('Size: ${size.toStringAsFixed(0)} px',
            style: Theme.of(context).textTheme.labelLarge),
        Slider(
          value: size,
          min: 16,
          max: 256,
          divisions: 30,
          onChanged: onSizeChanged,
        ),
        Text('Color', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          children: [
            for (final c in const [
              null,
              Colors.indigo,
              Colors.teal,
              Colors.deepOrange,
              Colors.red,
              Colors.green,
              Colors.amber,
              Colors.pink,
            ])
              _ColorSwatch(
                color: c ?? cs.onSurface,
                selected: c == null,
                onTap: () => onColorChanged(c ?? cs.onSurface),
              ),
          ],
        ),
        const SizedBox(height: 24),
        Text('Dart usage',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        _CodeBlock(code: dartSnippet),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, {this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: (color ?? cs.onSurfaceVariant).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'monospace',
          color: color ?? cs.onSurfaceVariant,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _ColorSwatch extends StatelessWidget {
  const _ColorSwatch({
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.outlineVariant,
            width: selected ? 2 : 1,
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
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SelectableText(
              code,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
            ),
          ),
          IconButton(
            tooltip: 'Copy',
            icon: const Icon(Icons.copy, size: 18),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: code));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Copied to clipboard')),
                );
              }
            },
          ),
        ],
      ),
    );
  }
}

String _dartSnippet(IconRecord r) {
  if (r.duotone) {
    return '''IconifyIcon(
  IconifyIconData.duo(
    IconData(0x${r.codepoint.toRadixString(16)},
      fontFamily: '${r.fontFamily}',
      fontPackage: '${r.fontPackage}'),
    IconData(0x${r.codepoint.toRadixString(16)},
      fontFamily: '${r.fontFamily}Secondary',
      fontPackage: '${r.fontPackage}'),
  ),
  size: 24,
)''';
  }
  return '''IconifyIcon(
  IconifyIconData.solo(
    IconData(0x${r.codepoint.toRadixString(16)},
      fontFamily: '${r.fontFamily}',
      fontPackage: '${r.fontPackage}'),
  ),
  size: 24,
)''';
}

class _Missing extends StatelessWidget {
  const _Missing({required this.prefix, required this.name});
  final String prefix;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.help_outline, size: 48),
            const SizedBox(height: 16),
            Text('Icon "$name" not found in "$prefix"'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () =>
                  appCoordinator.navigate(HomeRoute()),
              child: const Text('Back to home'),
            ),
          ],
        ),
      ),
    );
  }
}
