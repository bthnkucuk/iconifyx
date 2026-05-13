import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/category_route.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../theme/app_theme.dart';

/// Search page — Spotlight-style palette rendered as the `/search` route.
/// Replaces the old broken overlay. Pixel-aligned to the iconfyx handoff spec.
class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.initialQuery});
  final String initialQuery;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final TextEditingController _controller;
  late final FocusNode _inputFocus;
  late final FocusNode _shortcutFocus;
  late final ScrollController _scroll;

  String _query = '';
  int _activeIndex = 0;
  final Map<int, GlobalKey> _rowKeys = {};

  static const _featuredNames = [
    'home', 'magnify', 'heart-outline', 'account-outline',
    'bell-outline', 'download-outline', 'star-outline', 'cog-outline',
  ];

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
    _inputFocus = FocusNode();
    _shortcutFocus = FocusNode();
    _scroll = ScrollController();
    _query = widget.initialQuery;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _inputFocus.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _inputFocus.dispose();
    _shortcutFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onQuery(String value) {
    setState(() {
      _query = value;
      _activeIndex = 0;
    });
  }

  void _close() {
    if (Navigator.canPop(context)) {
      Navigator.of(context).pop();
    } else {
      // Fallback: deep-link directly to /search with nothing underneath.
      appCoordinator.navigate(HomeRoute());
    }
  }

  // ─── Build entry list for current state ───────────────────────────────────
  List<_Entry> _entries(PackIndex? packs, IconCatalog? catalog) {
    final q = _query.trim().toLowerCase();
    final list = <_Entry>[];
    if (q.isEmpty) {
      list.add(_Entry.quick(
        icon: Icons.home_outlined,
        name: 'Home',
        sub: 'landing · install · stats',
        run: () => appCoordinator.navigate(HomeRoute()),
      ));
      list.add(_Entry.quick(
        icon: Icons.grid_view_outlined,
        name: 'Browse all packs',
        sub: '${packs?.packs.length ?? 215} packs',
        run: () => appCoordinator.navigate(AllPacksRoute()),
      ));
      list.add(_Entry.quick(
        icon: Icons.menu_book_outlined,
        name: 'Documentation',
        sub: 'pub.dev',
        run: () => launchUrl(Uri.parse('https://pub.dev/packages/iconifyx')),
      ));
      list.add(_Entry.quick(
        icon: Icons.history_outlined,
        name: 'Changelog',
        sub: 'GitHub Releases',
        run: () => launchUrl(
            Uri.parse('https://github.com/bthnkucuk/iconifyx/releases')),
      ));
      if (packs != null) {
        for (final cat in packs.categories.take(7)) {
          list.add(_Entry.category(cat, packs));
        }
      }
      return list;
    }
    // Filtered state.
    if (packs != null) {
      for (final cat in packs.categories) {
        if (cat.name.toLowerCase().contains(q) || cat.slug.contains(q)) {
          list.add(_Entry.category(cat, packs));
        }
      }
      for (final p in packs.packs) {
        if (p.name.toLowerCase().contains(q) ||
            p.prefix.toLowerCase().contains(q)) {
          list.add(_Entry.pack(p));
          if (list.length >= 30) break;
        }
      }
    }
    if (catalog != null) {
      final cap = 60 - list.length;
      var found = 0;
      for (var i = 0; i < catalog.icons.length && found < cap; i++) {
        if (catalog.lowerNames[i].contains(q)) {
          list.add(_Entry.icon(catalog.icons[i]));
          found++;
        }
      }
    }
    return list;
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event, int entryCount) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    if (event.logicalKey == LogicalKeyboardKey.escape) {
      _close();
      return KeyEventResult.handled;
    }
    if (entryCount == 0) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
      setState(() {
        _activeIndex = (_activeIndex + 1).clamp(0, entryCount - 1);
      });
      _scheduleScrollIntoView();
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
      setState(() {
        _activeIndex = (_activeIndex - 1).clamp(0, entryCount - 1);
      });
      _scheduleScrollIntoView();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  void _scheduleScrollIntoView() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final key = _rowKeys[_activeIndex];
      final ctx = key?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx,
            duration: const Duration(milliseconds: 80), alignment: 0.5);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        final packs = state is BootstrapPacksReady ? state.packs : null;
        final catalog =
            state is BootstrapCatalogReady ? state.catalog : null;
        final entries = _entries(packs, catalog);
        // Clamp active index.
        final active = entries.isEmpty
            ? 0
            : _activeIndex.clamp(0, entries.length - 1);
        if (active != _activeIndex) {
          // Don't setState during build — defer.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _activeIndex = active);
          });
        }
        // Overlay layout: transparent backdrop fills the route's frame,
        // tap-outside dismisses, the palette panel is anchored top-center.
        return Material(
          type: MaterialType.transparency,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _close,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 96, 20, 32),
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 640),
                  child: GestureDetector(
                    onTap: () {}, // absorb taps inside the panel
                    behavior: HitTestBehavior.opaque,
                    child: Focus(
                      focusNode: _shortcutFocus,
                      onKeyEvent: (n, e) => _onKey(n, e, entries.length),
                      child: _PalettePanel(
                        controller: _controller,
                        inputFocus: _inputFocus,
                        onChanged: _onQuery,
                        onClose: _close,
                        query: _query,
                        entries: entries,
                        activeIndex: active,
                        onActiveChanged: (i) {
                          if (i != _activeIndex) {
                            setState(() => _activeIndex = i);
                          }
                        },
                        onActivate: (e) {
                          _close();
                          WidgetsBinding.instance
                              .addPostFrameCallback((_) => e.run());
                        },
                        rowKeys: _rowKeys,
                        featured: _featuredEntries(packs),
                        scrollController: _scroll,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// 8 curated icons (mdi pack preview) for the popular-icons grid in the
  /// empty state. NOT part of the keyboard-nav cursor flow per spec.
  List<IconRecord> _featuredEntries(PackIndex? packs) {
    final mdi = packs?.byPrefix['mdi'];
    if (mdi == null) return const [];
    final byName = <String, IconRecord>{
      for (final r in mdi.preview) r.name: r,
    };
    final out = <IconRecord>[];
    for (final n in _featuredNames) {
      final r = byName[n];
      if (r != null) out.add(r);
    }
    if (out.length < 8) {
      for (final p in mdi.preview) {
        if (!out.contains(p)) out.add(p);
        if (out.length >= 8) break;
      }
    }
    return out.take(8).toList();
  }
}

// ─── Panel ──────────────────────────────────────────────────────────────────
class _PalettePanel extends StatelessWidget {
  const _PalettePanel({
    required this.controller,
    required this.inputFocus,
    required this.onChanged,
    required this.onClose,
    required this.query,
    required this.entries,
    required this.activeIndex,
    required this.onActiveChanged,
    required this.onActivate,
    required this.rowKeys,
    required this.featured,
    required this.scrollController,
  });

  final TextEditingController controller;
  final FocusNode inputFocus;
  final ValueChanged<String> onChanged;
  final VoidCallback onClose;
  final String query;
  final List<_Entry> entries;
  final int activeIndex;
  final ValueChanged<int> onActiveChanged;
  final ValueChanged<_Entry> onActivate;
  final Map<int, GlobalKey> rowKeys;
  final List<IconRecord> featured;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return Container(
      decoration: BoxDecoration(
        color: card,
        border: Border.all(color: rule),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x520E1320),
            blurRadius: 80,
            offset: Offset(0, 30),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _InputRow(
            controller: controller,
            focus: inputFocus,
            onChanged: onChanged,
            onEsc: onClose,
          ),
          Container(height: 1, color: rule),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.7,
            ),
            child: _Body(
              query: query,
              entries: entries,
              activeIndex: activeIndex,
              onActiveChanged: onActiveChanged,
              onActivate: onActivate,
              rowKeys: rowKeys,
              featured: featured,
              scrollController: scrollController,
            ),
          ),
          Container(height: 1, color: rule),
          _Footer(query: query, count: entries.length),
        ],
      ),
    );
  }
}

// ─── Input row ──────────────────────────────────────────────────────────────
class _InputRow extends StatelessWidget {
  const _InputRow({
    required this.controller,
    required this.focus,
    required this.onChanged,
    required this.onEsc,
  });
  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;
  final VoidCallback onEsc;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 18, 18, 18),
      child: Row(
        children: [
          Icon(Icons.search, size: 20, color: muted),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focus,
              onChanged: onChanged,
              style: TextStyle(fontSize: 17, color: ink),
              decoration: InputDecoration(
                hintText: 'Search icons, categories, pages…',
                hintStyle: TextStyle(color: muted, fontSize: 17),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isCollapsed: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          GestureDetector(
            onTap: onEsc,
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  border: Border.all(color: rule),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text('esc',
                    style: AppTheme.mono(size: 10.5, color: muted)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Body ───────────────────────────────────────────────────────────────────
class _Body extends StatelessWidget {
  const _Body({
    required this.query,
    required this.entries,
    required this.activeIndex,
    required this.onActiveChanged,
    required this.onActivate,
    required this.rowKeys,
    required this.featured,
    required this.scrollController,
  });
  final String query;
  final List<_Entry> entries;
  final int activeIndex;
  final ValueChanged<int> onActiveChanged;
  final ValueChanged<_Entry> onActivate;
  final Map<int, GlobalKey> rowKeys;
  final List<IconRecord> featured;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final isEmpty = query.trim().isEmpty;

    // Build flat list with section headers AND a popular-icons grid in empty
    // state. Section headers are not navigable; rows are.
    final children = <Widget>[];

    // Group entries by kind for header insertion + index mapping.
    final quickRange = <int>[];
    final categoryRange = <int>[];
    final packRange = <int>[];
    final iconRange = <int>[];
    for (var i = 0; i < entries.length; i++) {
      switch (entries[i].kind) {
        case _Kind.quick:
          quickRange.add(i);
          break;
        case _Kind.category:
          categoryRange.add(i);
          break;
        case _Kind.pack:
          packRange.add(i);
          break;
        case _Kind.icon:
          iconRange.add(i);
          break;
      }
    }

    void addSection(String label, List<int> indices, {String? badge}) {
      if (indices.isEmpty) return;
      children.add(_SectionTitle(label,
          badge: badge ?? indices.length.toString()));
      for (final i in indices) {
        final key = rowKeys.putIfAbsent(i, () => GlobalKey());
        children.add(_PaletteRow(
          key: key,
          entry: entries[i],
          active: i == activeIndex,
          onHover: () => onActiveChanged(i),
          onTap: () => onActivate(entries[i]),
        ));
      }
    }

    if (isEmpty) {
      addSection('Quick links', quickRange);
      addSection('Categories', categoryRange);
      if (featured.isNotEmpty) {
        children.add(_SectionTitle('Popular icons', badge: featured.length.toString()));
        children.add(_PopularGrid(records: featured));
      }
    } else {
      addSection('Categories', categoryRange);
      addSection('Packs', packRange);
      addSection('Icons', iconRange);
      if (entries.isEmpty) {
        children.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: Column(
            children: [
              Icon(Icons.search_off, size: 36, color: muted),
              const SizedBox(height: 10),
              Text('No icons match "$query"',
                  style: TextStyle(fontSize: 13, color: muted)),
            ],
          ),
        ));
      }
    }

    return SingleChildScrollView(
      controller: scrollController,
      padding: const EdgeInsets.all(6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }
}

// ─── Section title ──────────────────────────────────────────────────────────
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label, {this.badge});
  final String label;
  final String? badge;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
      child: Row(
        children: [
          Text(label.toUpperCase(),
              style: AppTheme.mono(
                  size: 10,
                  color: muted,
                  weight: FontWeight.w700,
                  letterSpacing: 1.0)),
          if (badge != null) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: paper2,
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(badge!,
                  style: AppTheme.mono(size: 10, color: muted)),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Palette row ────────────────────────────────────────────────────────────
class _PaletteRow extends StatelessWidget {
  const _PaletteRow({
    super.key,
    required this.entry,
    required this.active,
    required this.onTap,
    required this.onHover,
  });
  final _Entry entry;
  final bool active;
  final VoidCallback onTap;
  final VoidCallback onHover;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final bg = active ? coralSoft : Colors.transparent;
    final fg = active ? AppTheme.coral : ink;
    final subFg = active ? AppTheme.coral.withValues(alpha: 0.8) : muted;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => onHover(),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 80),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              entry.buildLeading(
                  active: active,
                  bg: active ? card : paper2,
                  fg: active ? AppTheme.coral : ink2,
                  context: context),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: fg,
                            letterSpacing: -0.07)),
                    const SizedBox(height: 2),
                    Text(entry.sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTheme.mono(size: 12, color: subFg)),
                  ],
                ),
              ),
              if (active)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppTheme.coral),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('↵',
                      style: AppTheme.mono(size: 11, color: AppTheme.coral)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Popular icons grid (empty state) ───────────────────────────────────────
class _PopularGrid extends StatelessWidget {
  const _PopularGrid({required this.records});
  final List<IconRecord> records;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 4, 6, 4),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: records.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 8,
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          childAspectRatio: 1,
        ),
        itemBuilder: (context, i) => _PopularTile(record: records[i]),
      ),
    );
  }
}

class _PopularTile extends StatefulWidget {
  const _PopularTile({required this.record});
  final IconRecord record;
  @override
  State<_PopularTile> createState() => _PopularTileState();
}

class _PopularTileState extends State<_PopularTile> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => appCoordinator.push(
          IconDetailRoute(prefix: widget.record.prefix, name: widget.record.name),
        ),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 100),
          decoration: BoxDecoration(
            color: _hover ? coralSoft : paper2,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: IconifyIcon(
              widget.record.toIconifyData(),
              size: 20,
              color: _hover ? AppTheme.coral : ink2,
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Footer ─────────────────────────────────────────────────────────────────
class _Footer extends StatelessWidget {
  const _Footer({required this.query, required this.count});
  final String query;
  final int count;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    Widget kbd(String s) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          margin: const EdgeInsets.only(right: 4),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border.all(color: rule),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(s, style: AppTheme.mono(size: 10, color: muted)),
        );
    final right = query.isEmpty
        ? 'iconifyx · start typing'
        : count > 0
            ? 'iconifyx · $count results'
            : 'iconifyx · no matches';
    return Container(
      color: paper2,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      child: Row(
        children: [
          kbd('↑'),
          kbd('↓'),
          Text(' navigate · ', style: AppTheme.mono(size: 11, color: muted)),
          kbd('↵'),
          Text(' open · ', style: AppTheme.mono(size: 11, color: muted)),
          kbd('esc'),
          Text(' close', style: AppTheme.mono(size: 11, color: muted)),
          const Spacer(),
          Text(right, style: AppTheme.mono(size: 11, color: muted)),
        ],
      ),
    );
  }
}

// ─── Entry model ────────────────────────────────────────────────────────────
enum _Kind { quick, category, pack, icon }

class _Entry {
  _Entry._({
    required this.name,
    required this.sub,
    required this.kind,
    required this.run,
    required this.buildLeading,
  });

  factory _Entry.quick({
    required IconData icon,
    required String name,
    required String sub,
    required VoidCallback run,
  }) {
    return _Entry._(
      name: name,
      sub: sub,
      kind: _Kind.quick,
      run: run,
      buildLeading: ({
        required bool active,
        required Color bg,
        required Color fg,
        required BuildContext context,
      }) =>
          _Leading(bg: bg, child: Icon(icon, size: 18, color: fg)),
    );
  }

  factory _Entry.category(CategoryEntry cat, PackIndex packs) {
    final samples = <IconRecord>[];
    for (final p in cat.packPrefixes) {
      final s = packs.byPrefix[p];
      if (s != null && s.preview.isNotEmpty) {
        samples.add(s.preview.first);
        if (samples.length >= 4) break;
      }
    }
    return _Entry._(
      name: cat.name,
      sub: '${cat.packPrefixes.length} packs · category',
      kind: _Kind.category,
      run: () => appCoordinator.navigate(CategoryRoute(slug: cat.slug)),
      buildLeading: ({
        required bool active,
        required Color bg,
        required Color fg,
        required BuildContext context,
      }) =>
          _CategoryLeading(samples: samples, bg: bg, fg: fg),
    );
  }

  factory _Entry.pack(PackSummary p) {
    return _Entry._(
      name: p.name,
      sub: '${p.packageName} · ${p.iconCount} icons',
      kind: _Kind.pack,
      run: () => appCoordinator.navigate(PackDetailRoute(prefix: p.prefix)),
      buildLeading: ({
        required bool active,
        required Color bg,
        required Color fg,
        required BuildContext context,
      }) {
        final preview = p.preview.isNotEmpty ? p.preview.first : null;
        return _Leading(
          bg: bg,
          child: preview == null
              ? Icon(Icons.collections_outlined, size: 18, color: fg)
              : IconifyIcon(preview.toIconifyData(), size: 18, color: fg),
        );
      },
    );
  }

  factory _Entry.icon(IconRecord r) {
    return _Entry._(
      name: r.name,
      sub: '${r.prefix}:${r.name}',
      kind: _Kind.icon,
      run: () => appCoordinator.push(
          IconDetailRoute(prefix: r.prefix, name: r.name)),
      buildLeading: ({
        required bool active,
        required Color bg,
        required Color fg,
        required BuildContext context,
      }) =>
          _Leading(
              bg: bg, child: IconifyIcon(r.toIconifyData(), size: 18, color: fg)),
    );
  }

  final String name;
  final String sub;
  final _Kind kind;
  final VoidCallback run;
  final Widget Function({
    required bool active,
    required Color bg,
    required Color fg,
    required BuildContext context,
  }) buildLeading;
}

class _Leading extends StatelessWidget {
  const _Leading({required this.bg, required this.child});
  final Color bg;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
      alignment: Alignment.center,
      child: child,
    );
  }
}

class _CategoryLeading extends StatelessWidget {
  const _CategoryLeading({required this.samples, required this.bg, required this.fg});
  final List<IconRecord> samples;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
      padding: const EdgeInsets.all(4),
      child: GridView.count(
        crossAxisCount: 2,
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (var i = 0; i < 4; i++)
            Container(
              decoration: BoxDecoration(
                color: i == 0 ? coralSoft : Colors.transparent,
                borderRadius: BorderRadius.circular(3),
              ),
              child: Center(
                child: i < samples.length
                    ? IconifyIcon(samples[i].toIconifyData(),
                        size: 11,
                        color: i == 0 ? AppTheme.coral : fg)
                    : const SizedBox.shrink(),
              ),
            ),
        ],
      ),
    );
  }
}
