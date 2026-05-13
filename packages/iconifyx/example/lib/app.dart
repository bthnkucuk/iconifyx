// GENERATED FILE — do not edit.
//
// Source of truth: tools/generator/templates/example_app.dart
// Emitted by:      tools/generator/src/example_codegen.ts:emitExampleApp
// Regenerate via:  bun run generate (from repo root)
//
// `main.dart` is hand-written and just wires up `IconifyxExampleApp` from
// this file. Edit the template, not this file.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import 'generated_index.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

const _seed = Color(0xFF6366F1); // indigo

ThemeData _buildTheme(Brightness b) => ThemeData(
      useMaterial3: true,
      brightness: b,
      colorScheme: ColorScheme.fromSeed(seedColor: _seed, brightness: b),
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );

const List<Color> _swatches = <Color>[
  Color(0xFF1F2937), // slate
  Color(0xFFEF4444), // red
  Color(0xFFF97316), // orange
  Color(0xFFF59E0B), // amber
  Color(0xFF22C55E), // green
  Color(0xFF14B8A6), // teal
  Color(0xFF3B82F6), // blue
  Color(0xFF6366F1), // indigo
  Color(0xFFA855F7), // purple
  Color(0xFFEC4899), // pink
  Color(0xFF000000), // black
  Color(0xFFFFFFFF), // white
];

const List<double> _sizePresets = <double>[16, 20, 24, 32, 40, 48, 64];

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

class IconifyxExampleApp extends StatelessWidget {
  const IconifyxExampleApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'iconifyx',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      home: const BrowserPage(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser page (top-level layout)
// ─────────────────────────────────────────────────────────────────────────────

class BrowserPage extends StatefulWidget {
  const BrowserPage({super.key});
  @override
  State<BrowserPage> createState() => _BrowserPageState();
}

class _BrowserPageState extends State<BrowserPage> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  ExampleSetEntry? _selectedSet;
  String _setFilter = '';
  String _iconFilter = '';
  double _iconSize = 32;
  Color _primaryColor = const Color(0xFF1F2937);
  Color _secondaryColor = const Color(0xFFEF4444);
  double _secondaryOpacity = 0.4;
  bool _darkCanvas = false;

  @override
  void initState() {
    super.initState();
    for (final cat in exampleCategories) {
      if (cat.sets.isNotEmpty) {
        _selectedSet = cat.sets.first;
        break;
      }
    }
  }

  List<ExampleIconEntry> get _visibleIcons {
    final set = _selectedSet;
    if (set == null) return const [];
    if (_iconFilter.isEmpty) return set.icons;
    final f = _iconFilter.toLowerCase();
    return set.icons.where((i) => i.name.toLowerCase().contains(f)).toList();
  }

  void _selectSet(ExampleSetEntry s) {
    setState(() {
      _selectedSet = s;
      _iconFilter = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 1200;
    final medium = width >= 820;

    final sidebar = _SetSidebar(
      filter: _setFilter,
      onFilterChanged: (v) => setState(() => _setFilter = v),
      selectedSet: _selectedSet,
      onSelectSet: _selectSet,
    );

    final grid = _IconGridArea(
      set: _selectedSet,
      icons: _visibleIcons,
      iconFilter: _iconFilter,
      onIconFilter: (v) => setState(() => _iconFilter = v),
      iconSize: _iconSize,
      primaryColor: _primaryColor,
      secondaryColor: _secondaryColor,
      secondaryOpacity: _secondaryOpacity,
      darkCanvas: _darkCanvas,
      onOpenDrawer: medium
          ? null
          : () => _scaffoldKey.currentState?.openDrawer(),
      onOpenEndDrawer:
          wide ? null : () => _scaffoldKey.currentState?.openEndDrawer(),
    );

    final hasDuotone = _selectedSet?.icons.any((i) => i.isDuotone) ?? false;
    final controls = _ControlsPanel(
      iconSize: _iconSize,
      onIconSize: (v) => setState(() => _iconSize = v),
      primary: _primaryColor,
      onPrimaryColor: (v) => setState(() => _primaryColor = v),
      secondary: _secondaryColor,
      onSecondaryColor: (v) => setState(() => _secondaryColor = v),
      secondaryOpacity: _secondaryOpacity,
      onSecondaryOpacity: (v) => setState(() => _secondaryOpacity = v),
      darkCanvas: _darkCanvas,
      onDarkCanvas: (v) => setState(() {
        _darkCanvas = v;
        // Keep contrast sane when toggling the canvas: invisible-on-canvas
        // primary swatches get flipped to their counterpart, but the user
        // can still pick any swatch after.
        if (v && _primaryColor.computeLuminance() < 0.3) {
          _primaryColor = Colors.white;
        } else if (!v && _primaryColor.computeLuminance() > 0.85) {
          _primaryColor = const Color(0xFF1F2937);
        }
      }),
      hasDuotone: hasDuotone,
    );

    if (wide) {
      return Scaffold(
        key: _scaffoldKey,
        body: Row(
          children: [
            SizedBox(
              width: 300,
              child: ColoredBox(color: cs.surface, child: sidebar),
            ),
            VerticalDivider(width: 1, color: cs.outlineVariant),
            Expanded(child: grid),
            VerticalDivider(width: 1, color: cs.outlineVariant),
            SizedBox(
              width: 320,
              child: ColoredBox(color: cs.surface, child: controls),
            ),
          ],
        ),
      );
    } else if (medium) {
      return Scaffold(
        key: _scaffoldKey,
        endDrawer: Drawer(width: 320, child: controls),
        body: Row(
          children: [
            SizedBox(
              width: 280,
              child: ColoredBox(color: cs.surface, child: sidebar),
            ),
            VerticalDivider(width: 1, color: cs.outlineVariant),
            Expanded(child: grid),
          ],
        ),
      );
    } else {
      return Scaffold(
        key: _scaffoldKey,
        drawer: Drawer(width: 300, child: sidebar),
        endDrawer: Drawer(width: 320, child: controls),
        body: grid,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar (set list + filter)
// ─────────────────────────────────────────────────────────────────────────────

class _SetSidebar extends StatelessWidget {
  final String filter;
  final ValueChanged<String> onFilterChanged;
  final ExampleSetEntry? selectedSet;
  final ValueChanged<ExampleSetEntry> onSelectSet;

  const _SetSidebar({
    required this.filter,
    required this.onFilterChanged,
    required this.selectedSet,
    required this.onSelectSet,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    final lower = filter.toLowerCase();
    bool match(ExampleSetEntry s) =>
        lower.isEmpty ||
        s.name.toLowerCase().contains(lower) ||
        s.prefix.toLowerCase().contains(lower);

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: cs.primary,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'iX',
                    style: tt.titleSmall?.copyWith(
                      color: cs.onPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'iconifyx',
                  style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: SearchBar(
              hintText: 'Search sets…',
              leading: const Icon(Icons.search, size: 20),
              elevation: const WidgetStatePropertyAll(0),
              backgroundColor: WidgetStatePropertyAll(cs.surfaceContainerHigh),
              padding: const WidgetStatePropertyAll(
                EdgeInsets.symmetric(horizontal: 12),
              ),
              constraints: const BoxConstraints(minHeight: 40),
              onChanged: onFilterChanged,
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                for (final cat in exampleCategories) ...[
                  if (cat.sets.any(match)) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 12, 6),
                      child: Text(
                        cat.name.toUpperCase(),
                        style: tt.labelSmall?.copyWith(
                          color: cs.onSurfaceVariant,
                          letterSpacing: 0.6,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    for (final s in cat.sets.where(match))
                      _SidebarSetTile(
                        set: s,
                        selected: identical(s, selectedSet),
                        onTap: () => onSelectSet(s),
                      ),
                  ],
                ],
                if (!exampleCategories.any((c) => c.sets.any(match)))
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        'No sets match "$filter".',
                        style: tt.bodyMedium
                            ?.copyWith(color: cs.onSurfaceVariant),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SidebarSetTile extends StatelessWidget {
  final ExampleSetEntry set;
  final bool selected;
  final VoidCallback onTap;
  const _SidebarSetTile({
    required this.set,
    required this.selected,
    required this.onTap,
  });

  /// Pull 4 representative icons spread across the alphabet for the preview
  /// strip. Falls back to the first N if the set is small.
  List<ExampleIconEntry> _samples() {
    final all = set.icons;
    if (all.length <= 4) return all;
    final step = all.length ~/ 4;
    return [for (var i = 0; i < 4; i++) all[i * step]];
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final samples = _samples();

    final borderColor = selected ? cs.primary : cs.outlineVariant;
    final bgColor =
        selected ? cs.primaryContainer.withValues(alpha: 0.45) : cs.surface;
    final nameColor = selected ? cs.onPrimaryContainer : cs.onSurface;
    final metaColor = selected
        ? cs.onPrimaryContainer.withValues(alpha: 0.75)
        : cs.onSurfaceVariant;
    final iconColor = selected ? cs.primary : cs.onSurface;

    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 4, 10, 4),
      child: Material(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: borderColor,
                width: selected ? 1.5 : 1,
              ),
            ),
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  set.name,
                  style: tt.bodyMedium?.copyWith(
                    color: nameColor,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      _formatCount(set.icons.length),
                      style: tt.labelSmall?.copyWith(color: metaColor),
                    ),
                    Text(
                      '  ·  ',
                      style: tt.labelSmall?.copyWith(color: metaColor),
                    ),
                    Flexible(
                      child: Text(
                        set.license,
                        style: tt.labelSmall?.copyWith(color: metaColor),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    for (var i = 0; i < samples.length; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      samples[i].isDuotone
                          ? IconifyDuotoneIcon(
                              samples[i].data,
                              samples[i].secondary!,
                              size: 22,
                              primaryColor: iconColor,
                              secondaryColor: iconColor,
                              secondaryOpacity: 0.35,
                            )
                          : Icon(
                              samples[i].data.data,
                              size: 22,
                              color: iconColor,
                            ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatCount(int n) {
    if (n >= 1000) {
      final k = n / 1000;
      return '${k.toStringAsFixed(k >= 10 ? 0 : 1)}k icons';
    }
    return '$n icons';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon grid (middle pane)
// ─────────────────────────────────────────────────────────────────────────────

class _IconGridArea extends StatelessWidget {
  final ExampleSetEntry? set;
  final List<ExampleIconEntry> icons;
  final String iconFilter;
  final ValueChanged<String> onIconFilter;
  final double iconSize;
  final Color primaryColor;
  final Color secondaryColor;
  final double secondaryOpacity;
  final bool darkCanvas;
  final VoidCallback? onOpenDrawer;
  final VoidCallback? onOpenEndDrawer;

  const _IconGridArea({
    required this.set,
    required this.icons,
    required this.iconFilter,
    required this.onIconFilter,
    required this.iconSize,
    required this.primaryColor,
    required this.secondaryColor,
    required this.secondaryOpacity,
    required this.darkCanvas,
    this.onOpenDrawer,
    this.onOpenEndDrawer,
  });

  @override
  Widget build(BuildContext context) {
    final s = set;
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    if (s == null) {
      return const Center(child: Text('No sets bundled.'));
    }

    final canvasColor = darkCanvas ? const Color(0xFF111827) : cs.surface;

    // Tile dimensions scale with iconSize so the grid feels responsive.
    final tile = (iconSize * 2.6).clamp(80.0, 160.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Row(
            children: [
              if (onOpenDrawer != null) ...[
                IconButton.filledTonal(
                  icon: const Icon(Icons.menu),
                  onPressed: onOpenDrawer,
                  tooltip: 'Sets',
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.name,
                      style: tt.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        _MetaChip(text: s.prefix),
                        _MetaChip(text: '${s.icons.length} icons'),
                        _MetaChip(text: s.license),
                        if (s.icons.any((i) => i.isDuotone))
                          _MetaChip(text: 'duotone', accent: true),
                      ],
                    ),
                  ],
                ),
              ),
              if (onOpenEndDrawer != null) ...[
                const SizedBox(width: 12),
                IconButton.filledTonal(
                  icon: const Icon(Icons.tune),
                  onPressed: onOpenEndDrawer,
                  tooltip: 'Controls',
                ),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: SearchBar(
            hintText: 'Filter ${s.icons.length} icons by name…',
            leading: const Icon(Icons.search, size: 20),
            elevation: const WidgetStatePropertyAll(0),
            backgroundColor: WidgetStatePropertyAll(cs.surfaceContainerHigh),
            padding: const WidgetStatePropertyAll(
              EdgeInsets.symmetric(horizontal: 14),
            ),
            constraints: const BoxConstraints(minHeight: 44),
            onChanged: onIconFilter,
          ),
        ),
        Expanded(
          child: ColoredBox(
            color: canvasColor,
            child: icons.isEmpty
                ? Center(
                    child: Text(
                      iconFilter.isEmpty
                          ? 'No icons.'
                          : 'No icons match "$iconFilter".',
                      style:
                          tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                    ),
                  )
                : LayoutBuilder(
                    builder: (context, c) {
                      final cols = (c.maxWidth / tile).floor().clamp(2, 16);
                      return GridView.builder(
                        // Resetting on set change forces a fresh render
                        // (and clears any stale tile from the previous
                        // set's font lookup).
                        key: ValueKey('grid-${s.prefix}'),
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        gridDelegate:
                            SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: cols,
                          childAspectRatio: 1,
                        ),
                        itemCount: icons.length,
                        itemBuilder: (context, i) {
                          final e = icons[i];
                          return _IconTile(
                            // Keying by icon identity (not list position)
                            // prevents Flutter from recycling a tile whose
                            // glyph rendering hasn't caught up after a
                            // fling, which was showing a lower-row icon in
                            // an upper slot.
                            key: ValueKey(
                                '${s.prefix}/${e.name}/${e.data.codePoint}'),
                            entry: e,
                            iconSize: iconSize,
                            primary: primaryColor,
                            secondary: secondaryColor,
                            secondaryOpacity: secondaryOpacity,
                            darkCanvas: darkCanvas,
                            setPrefix: s.prefix,
                            setName: s.name,
                            packageName: s.packageName,
                          );
                        },
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  final String text;
  final bool accent;
  const _MetaChip({required this.text, this.accent = false});
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final bg =
        accent ? cs.primaryContainer : cs.surfaceContainerHigh;
    final fg = accent ? cs.onPrimaryContainer : cs.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: tt.labelSmall
            ?.copyWith(color: fg, fontWeight: FontWeight.w500),
      ),
    );
  }
}

class _IconTile extends StatelessWidget {
  final ExampleIconEntry entry;
  final double iconSize;
  final Color primary;
  final Color secondary;
  final double secondaryOpacity;
  final bool darkCanvas;
  final String setPrefix;
  final String setName;
  final String packageName;

  const _IconTile({
    super.key,
    required this.entry,
    required this.iconSize,
    required this.primary,
    required this.secondary,
    required this.secondaryOpacity,
    required this.darkCanvas,
    required this.setPrefix,
    required this.setName,
    required this.packageName,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final tileBg = darkCanvas
        ? const Color(0xFF1F2937)
        : cs.surfaceContainerLow;
    final tileBorder = darkCanvas
        ? const Color(0xFF374151)
        : cs.outlineVariant;
    final labelColor =
        darkCanvas ? Colors.white70 : cs.onSurfaceVariant;

    return Padding(
      padding: const EdgeInsets.all(4),
      child: Material(
        color: tileBg,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => _showIconDetails(context),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: tileBorder, width: 1),
            ),
            padding: const EdgeInsets.all(8),
            child: Column(
              children: [
                Expanded(
                  child: Center(
                    child: entry.isDuotone
                        ? IconifyDuotoneIcon(
                            entry.data,
                            entry.secondary!,
                            size: iconSize,
                            primaryColor: primary,
                            secondaryColor: secondary,
                            secondaryOpacity: secondaryOpacity,
                          )
                        : Icon(
                            entry.data.data,
                            size: iconSize,
                            color: primary,
                          ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  entry.name,
                  style: tt.labelSmall?.copyWith(color: labelColor),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showIconDetails(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _IconDetails(
        entry: entry,
        primary: primary,
        secondary: secondary,
        secondaryOpacity: secondaryOpacity,
        darkCanvas: darkCanvas,
        setPrefix: setPrefix,
        setName: setName,
        packageName: packageName,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon details bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

class _IconDetails extends StatelessWidget {
  final ExampleIconEntry entry;
  final Color primary;
  final Color secondary;
  final double secondaryOpacity;
  final bool darkCanvas;
  final String setPrefix;
  final String setName;
  final String packageName;
  const _IconDetails({
    required this.entry,
    required this.primary,
    required this.secondary,
    required this.secondaryOpacity,
    required this.darkCanvas,
    required this.setPrefix,
    required this.setName,
    required this.packageName,
  });

  String _importLine() => "import 'package:$packageName/$packageName.dart';";

  String _usageSnippet() {
    if (entry.isDuotone) {
      return 'IconifyDuotoneIcon(\n'
          '  ${_classFromPackage()}.${_identFromName(entry.name, suffix: 'Primary')},\n'
          '  ${_classFromPackage()}.${_identFromName(entry.name, suffix: 'Secondary')},\n'
          '  size: 24,\n'
          ')';
    }
    return 'Icon(\n'
        '  ${_classFromPackage()}.${_identFromName(entry.name)}.data,\n'
        '  size: 24,\n'
        ')';
  }

  String _classFromPackage() {
    // package name is iconifyx_<suffix> where <suffix> is the prefix with
    // hyphens swapped for underscores; class is the prefix camel-cased + Icons.
    return _camelCaseClassFromPrefix(setPrefix);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        8,
        24,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: darkCanvas
                      ? const Color(0xFF1F2937)
                      : cs.surfaceContainer,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: cs.outlineVariant),
                ),
                alignment: Alignment.center,
                child: entry.isDuotone
                    ? IconifyDuotoneIcon(
                        entry.data,
                        entry.secondary!,
                        size: 56,
                        primaryColor: primary,
                        secondaryColor: secondary,
                        secondaryOpacity: secondaryOpacity,
                      )
                    : Icon(entry.data.data, size: 56, color: primary),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      style: tt.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$setName  ·  $setPrefix',
                      style: tt.bodyMedium
                          ?.copyWith(color: cs.onSurfaceVariant),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        _MetaChip(
                          text:
                              '0x${entry.data.codePoint.toRadixString(16)}',
                        ),
                        if (entry.isDuotone)
                          const _MetaChip(text: 'duotone', accent: true),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _CodeBlock(label: 'Import', text: _importLine()),
          const SizedBox(height: 12),
          _CodeBlock(label: 'Usage', text: _usageSnippet()),
        ],
      ),
    );
  }
}

class _CodeBlock extends StatelessWidget {
  final String label;
  final String text;
  const _CodeBlock({required this.label, required this.text});
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: tt.labelMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: text));
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    duration: const Duration(seconds: 1),
                    content: Text('$label copied'),
                  ),
                );
              },
              icon: const Icon(Icons.content_copy, size: 16),
              label: const Text('Copy'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: cs.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(8),
          ),
          child: SelectableText(
            text,
            style: tt.bodySmall?.copyWith(
              fontFamily: 'monospace',
              height: 1.45,
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Controls panel (right pane)
// ─────────────────────────────────────────────────────────────────────────────

class _ControlsPanel extends StatelessWidget {
  final double iconSize;
  final ValueChanged<double> onIconSize;
  final Color primary;
  final ValueChanged<Color> onPrimaryColor;
  final Color secondary;
  final ValueChanged<Color> onSecondaryColor;
  final double secondaryOpacity;
  final ValueChanged<double> onSecondaryOpacity;
  final bool darkCanvas;
  final ValueChanged<bool> onDarkCanvas;
  final bool hasDuotone;

  const _ControlsPanel({
    required this.iconSize,
    required this.onIconSize,
    required this.primary,
    required this.onPrimaryColor,
    required this.secondary,
    required this.onSecondaryColor,
    required this.secondaryOpacity,
    required this.onSecondaryOpacity,
    required this.darkCanvas,
    required this.onDarkCanvas,
    required this.hasDuotone,
  });

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          Text(
            'Display',
            style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          _LabelRow(label: 'Size', value: '${iconSize.toInt()} px'),
          Slider(
            min: 12,
            max: 96,
            divisions: 84,
            value: iconSize,
            onChanged: onIconSize,
          ),
          Wrap(
            spacing: 6,
            children: [
              for (final v in _sizePresets)
                ChoiceChip(
                  label: Text('${v.toInt()}'),
                  selected: iconSize == v,
                  onSelected: (_) => onIconSize(v),
                ),
            ],
          ),
          const SizedBox(height: 24),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: darkCanvas,
            onChanged: onDarkCanvas,
            title: Text(
              'Dark canvas',
              style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
            ),
            subtitle: Text(
              'Preview icons against a dark background.',
              style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
            ),
          ),
          const Divider(height: 32),
          Text(
            hasDuotone ? 'Primary color' : 'Color',
            style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          _Swatches(selected: primary, onSelect: onPrimaryColor),
          if (hasDuotone) ...[
            const Divider(height: 32),
            Text(
              'Secondary (duotone)',
              style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            _Swatches(selected: secondary, onSelect: onSecondaryColor),
            const SizedBox(height: 16),
            _LabelRow(
              label: 'Opacity',
              value: '${(secondaryOpacity * 100).round()} %',
            ),
            Slider(
              min: 0.05,
              max: 1.0,
              divisions: 19,
              value: secondaryOpacity,
              onChanged: onSecondaryOpacity,
            ),
          ],
        ],
      ),
    );
  }
}

class _LabelRow extends StatelessWidget {
  final String label;
  final String value;
  const _LabelRow({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Text(label, style: tt.bodyMedium),
        const Spacer(),
        Text(
          value,
          style:
              tt.labelMedium?.copyWith(color: cs.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _Swatches extends StatelessWidget {
  final Color selected;
  final ValueChanged<Color> onSelect;
  const _Swatches({required this.selected, required this.onSelect});
  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final c in _swatches)
          _SwatchDot(
            color: c,
            selected: c.toARGB32() == selected.toARGB32(),
            onTap: () => onSelect(c),
          ),
      ],
    );
  }
}

class _SwatchDot extends StatelessWidget {
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  const _SwatchDot({
    required this.color,
    required this.selected,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkResponse(
      onTap: onTap,
      radius: 24,
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? cs.primary : cs.outlineVariant,
            width: selected ? 3 : 1,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: derive Dart class + identifier from the Iconify prefix / icon name.
// Mirrors the rules in tools/generator/src/group_sets.ts:dartClassNameFromPrefix
// and tools/generator/src/identifier.ts:sanitizeIdentifier (good-enough subset
// for usage snippets — generator stays authoritative).
// ─────────────────────────────────────────────────────────────────────────────

String _camelCaseClassFromPrefix(String prefix) {
  final tokens = prefix.split(RegExp('[-_]')).where((t) => t.isNotEmpty);
  final pascal = tokens
      .map((t) => t.substring(0, 1).toUpperCase() + t.substring(1).toLowerCase())
      .join();
  return '${pascal}Icons';
}

String _identFromName(String name, {String suffix = ''}) {
  final tokens = name
      .replaceAll(RegExp('[./:_]'), '-')
      .split('-')
      .where((t) => t.isNotEmpty)
      .toList();
  if (tokens.isEmpty) return name + suffix;
  var ident = tokens.first.toLowerCase();
  for (var i = 1; i < tokens.length; i++) {
    final t = tokens[i].toLowerCase();
    ident += t.substring(0, 1).toUpperCase() + t.substring(1);
  }
  if (RegExp('^[0-9]').hasMatch(ident)) ident = 'n$ident';
  return ident + suffix;
}
