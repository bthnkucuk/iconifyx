import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/iconify_thumb.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../router/routes/shell/search_route.dart';
import '../../theme/app_theme.dart';

/// Search page — Spotlight-style palette rendered as the `/search` route.
/// The current query is owned by the [SearchRoute] (via [RouteQueryParameters]),
/// so it lives in the URL and is restored when the palette is re-opened.
class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.route});
  final SearchRoute route;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final TextEditingController _controller;
  late final FocusNode _inputFocus;
  late final FocusNode _shortcutFocus;
  late final ScrollController _scroll;

  int _activeIndex = 0;
  final Map<int, GlobalKey> _rowKeys = {};

  /// Coalesces rapid keystrokes into a single filter run. With 165k icons
  /// in the catalog the linear scan in `_entries` runs 30-80 ms in
  /// release; debouncing turns a burst of typing into one scan instead
  /// of one-per-keystroke. See RESEARCH_PLAN.md §23 #3.
  Timer? _searchDebounce;
  static const _searchDebounceDuration = Duration(milliseconds: 60);

  static const _featuredNames = [
    'home', 'magnify', 'heart-outline', 'account-outline',
    'bell-outline', 'download-outline', 'star-outline', 'cog-outline',
  ];

  String get _query => widget.route.query('q') ?? '';

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: _query);
    _inputFocus = FocusNode();
    _shortcutFocus = FocusNode();
    _scroll = ScrollController();
    widget.route.queryNotifier.addListener(_onRouteQueryChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _inputFocus.requestFocus();
      // Place caret at the end so the user can continue typing where they
      // left off when the palette was re-opened with a seeded query.
      _controller.selection = TextSelection.collapsed(
        offset: _controller.text.length,
      );
    });
  }

  @override
  void dispose() {
    widget.route.queryNotifier.removeListener(_onRouteQueryChanged);
    _searchDebounce?.cancel();
    _controller.dispose();
    _inputFocus.dispose();
    _shortcutFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Keeps the input controller in sync with external URL changes (e.g.
  /// browser back/forward navigating between /search?q=foo and /search?q=bar).
  void _onRouteQueryChanged() {
    final q = _query;
    if (_controller.text != q) {
      _controller.value = TextEditingValue(
        text: q,
        selection: TextSelection.collapsed(offset: q.length),
      );
    }
    if (mounted) setState(() => _activeIndex = 0);
  }

  void _onQuery(String value) {
    // Debounce so a burst of typing produces a single filter scan instead
    // of one per keystroke. Cancel the previous timer and start a new one;
    // only the trailing keystroke runs through to the route notifier.
    _searchDebounce?.cancel();
    _searchDebounce = Timer(_searchDebounceDuration, () {
      // Write to the route's query notifier — this updates the URL via
      // [RouteQueryParameters.updateQueries] and triggers _onRouteQueryChanged
      // (which calls setState above to re-render the results).
      //
      // IMPORTANT: store the user's LITERAL text. Trimming here used to wipe
      // any trailing space the user just typed — the round-trip listener then
      // overwrote the controller with the trimmed value before the user could
      // type the next character, eating every space. See RESEARCH_PLAN.md §19.
      // Trimming/normalisation happens at consumption sites only (`_entries`
      // does `.trim().toLowerCase()`).
      final qs = Map<String, String>.from(widget.route.queries);
      if (value.isEmpty) {
        qs.remove('q');
      } else {
        qs['q'] = value;
      }
      widget.route.updateQueries(appCoordinator, queries: qs);
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
          // `Flexible(loose)` lets the body shrink when the parent (the
          // `Align`/`Padding` around this panel) gives a maxHeight smaller
          // than 0.7×screen — e.g. when the browser viewport is short. The
          // inner `ConstrainedBox` still caps the body at 0.7×screen so on
          // tall viewports the palette stays anchored near the top rather
          // than stretching all the way down.
          Flexible(
            fit: FlexFit.loose,
            child: ConstrainedBox(
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

    // Resolve the palette row colours ONCE per body rebuild. Each
    // _PaletteRow reads from this record instead of doing 6× isDark
    // ternaries on every keystroke / hover. See RESEARCH_PLAN.md §23 #5.
    final rowPalette = _PaletteRowPalette.of(context);

    // Build flat list with section headers AND a popular-icons grid in empty
    // state. Section headers are not navigable; rows are.
    final entriesList = <Widget>[];

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
      entriesList.add(_SectionTitle(label,
          badge: badge ?? indices.length.toString()));
      for (final i in indices) {
        final key = rowKeys.putIfAbsent(i, () => GlobalKey());
        entriesList.add(_PaletteRow(
          key: key,
          entry: entries[i],
          active: i == activeIndex,
          onTap: () => onActivate(entries[i]),
          palette: rowPalette,
        ));
      }
    }

    if (isEmpty) {
      addSection('Quick links', quickRange);
      addSection('Categories', categoryRange);
      if (featured.isNotEmpty) {
        entriesList.add(_SectionTitle('Popular icons', badge: featured.length.toString()));
        entriesList.add(_PopularGrid(records: featured));
      }
    } else {
      addSection('Categories', categoryRange);
      addSection('Packs', packRange);
      addSection('Icons', iconRange);
      if (entries.isEmpty) {
        entriesList.add(Padding(
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

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(6),
      itemCount: entriesList.length,
      itemBuilder: (_, i) => entriesList[i],
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

// ─── Palette row palette ────────────────────────────────────────────────────
/// Theme-resolved colour bundle for [_PaletteRow]. Computed ONCE in
/// `_Body.build` so each visible row's build skips the 6× `isDark`
/// ternary cascade. See website/CLAUDE.md §4 and RESEARCH_PLAN.md §23 #5.
class _PaletteRowPalette {
  const _PaletteRowPalette({
    required this.card,
    required this.paper2,
    required this.muted,
    required this.ink,
    required this.ink2,
    required this.coralSoft,
  });
  final Color card;
  final Color paper2;
  final Color muted;
  final Color ink;
  final Color ink2;
  final Color coralSoft;

  factory _PaletteRowPalette.of(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _PaletteRowPalette(
      card: isDark ? AppTheme.cardDark : AppTheme.card,
      paper2: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
      muted: isDark ? AppTheme.mutedDark : AppTheme.muted,
      ink: isDark ? AppTheme.inkDark : AppTheme.ink,
      ink2: isDark ? AppTheme.ink2Dark : AppTheme.ink2,
      coralSoft: isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft,
    );
  }
}

// ─── Palette row (Mix-powered, no setState on hover) ────────────────────────
class _PaletteRow extends StatelessWidget {
  const _PaletteRow({
    super.key,
    required this.entry,
    required this.active,
    required this.onTap,
    required this.palette,
  });
  final _Entry entry;
  final bool active;
  final VoidCallback onTap;
  final _PaletteRowPalette palette;

  @override
  Widget build(BuildContext context) {
    // Active (keyboard nav) is pre-painted; mouse hover is handled INSIDE the
    // HoverBuilder via an oref signal so it only rebuilds this row's subtree.
    return HoverBuilder(
      onTap: onTap,
      builder: (ctx, hovered) {
        final showCoral = active || hovered;
        final bg = showCoral ? palette.coralSoft : Colors.transparent;
        final fg = showCoral ? AppTheme.coral : palette.ink;
        final subFg = showCoral
            ? AppTheme.coral.withValues(alpha: 0.8)
            : palette.muted;
        final leadingBg = showCoral ? palette.card : palette.paper2;
        final leadingFg = showCoral ? AppTheme.coral : palette.ink2;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 90),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              entry.buildLeading(
                  active: showCoral,
                  bg: leadingBg,
                  fg: leadingFg,
                  context: ctx),
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
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppTheme.coral),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('↵',
                      style: AppTheme.mono(size: 11, color: AppTheme.coral)),
                ),
            ],
          ),
        );
      },
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
      child: LayoutBuilder(
        builder: (context, constraints) {
          const cols = 8;
          const gap = 4.0;
          final cellSize = (constraints.maxWidth - gap * (cols - 1)) / cols;
          final children = <Widget>[];
          for (var i = 0; i < cols; i++) {
            if (i > 0) children.add(const SizedBox(width: gap));
            children.add(SizedBox(
              width: cellSize,
              height: cellSize,
              child: i < records.length
                  ? _PopularTile(record: records[i])
                  : const SizedBox.shrink(),
            ));
          }
          return Row(children: children);
        },
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
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return HoverBuilder(
      onTap: () => appCoordinator.push(
        IconDetailRoute(prefix: widget.record.prefix, name: widget.record.name),
      ),
      builder: (ctx, hovered) => AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        decoration: BoxDecoration(
          color: hovered ? coralSoft : paper2,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: IconifyThumb(
            widget.record.toIconifyData(),
            size: 20,
            color: hovered ? AppTheme.coral : ink2,
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
      run: () => appCoordinator.navigate(AllPacksRoute(initialQueries: {'cat': cat.slug})),
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
              : IconifyThumb(preview.toIconifyData(), size: 18, color: fg),
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
              bg: bg, child: IconifyThumb(r.toIconifyData(), size: 18, color: fg)),
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
    Widget cell(int i) {
      return Expanded(
        child: Container(
          decoration: BoxDecoration(
            color: i == 0 ? coralSoft : Colors.transparent,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Center(
            child: i < samples.length
                ? IconifyThumb(samples[i].toIconifyData(),
                    size: 11,
                    color: i == 0 ? AppTheme.coral : fg)
                : const SizedBox.shrink(),
          ),
        ),
      );
    }

    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                cell(0),
                const SizedBox(width: 2),
                cell(1),
              ],
            ),
          ),
          const SizedBox(height: 2),
          Expanded(
            child: Row(
              children: [
                cell(2),
                const SizedBox(width: 2),
                cell(3),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
