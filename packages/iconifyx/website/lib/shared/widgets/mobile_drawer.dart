// ignore_for_file: unused_element_parameter
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/route.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/changelog_route.dart';
import '../../router/routes/shell/docs_route.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/search_route.dart';
import '../../theme/app_theme.dart';
import '../../theme/theme_cubit.dart';
import 'hover_box.dart';
import 'iconify_thumb.dart';

/// Mobile drawer: a sheet that slides down from below the top nav.
/// Triggered by the hamburger button when viewport width < 900px.
class MobileDrawer extends StatelessWidget {
  const MobileDrawer({super.key});

  /// Tracks whether the drawer is currently mounted. The hamburger button in
  /// [AppTopBar] watches this so it can morph between bars and a close (×)
  /// icon, and tap-to-close when already open.
  static final ValueNotifier<bool> isOpen = ValueNotifier(false);

  static Future<void> show(BuildContext context) async {
    isOpen.value = true;
    try {
      await showGeneralDialog(
        context: context,
        barrierDismissible: true,
        barrierLabel: 'Close menu',
        barrierColor: Colors.transparent,
        transitionDuration: const Duration(milliseconds: 220),
        pageBuilder: (ctx, anim, sec) => const MobileDrawer(),
        transitionBuilder: (ctx, anim, sec, child) {
          final curve = CurvedAnimation(
            parent: anim,
            curve: const Cubic(.2, .7, .3, 1),
          );
          return FadeTransition(
            opacity: curve,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, -0.04),
                end: Offset.zero,
              ).animate(curve),
              child: child,
            ),
          );
        },
      );
    } finally {
      isOpen.value = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return Align(
      alignment: Alignment.topCenter,
      child: Padding(
        // Sheet starts immediately below the 58px sticky nav.
        padding: const EdgeInsets.only(top: 58),
        child: Material(
          color: paper,
          shape: Border(bottom: BorderSide(color: rule)),
          child: SafeArea(
            top: false,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height - 58,
              ),
              // The search trigger lives ABOVE the scroll view so it stays
              // pinned at the top of the drawer regardless of how far the
              // user scrolls the rest of the content.
              child: BlocBuilder<BootstrapBloc, BootstrapState>(
                builder: (ctx, state) {
                  final packs =
                      state is BootstrapPacksReady ? state.packs : null;
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 20, 18, 0),
                        child: _DrawerSearchTrigger(onTap: () {
                          Navigator.of(ctx).pop();
                          appCoordinator.pushOrMoveToTop(SearchRoute());
                        }),
                      ),
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(18, 22, 18, 26),
                          child: _DrawerContent(packs: packs),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DrawerContent extends StatelessWidget {
  const _DrawerContent({required this.packs});
  final PackIndex? packs;

  void _go(BuildContext context, AppRoute route) {
    Navigator.of(context).pop();
    appCoordinator.navigate(route);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionTitle('Navigate'),
        const SizedBox(height: 6),
        _NavRow(
          icon: Icons.home_outlined,
          name: 'Home',
          sub: 'landing · install · stats',
          onTap: () => _go(context, HomeRoute()),
        ),
        const SizedBox(height: 2),
        _NavRow(
          icon: Icons.grid_view_outlined,
          name: 'All packs',
          sub: packs == null
              ? '215 · MIT-friendly · outline + filled'
              : '${packs!.packs.length} packs · 165,718 icons',
          onTap: () => _go(context, AllPacksRoute()),
        ),
        const SizedBox(height: 2),
        _NavRow(
          icon: Icons.menu_book_outlined,
          name: 'Documentation',
          sub: 'tree-shake · duotone · pipeline',
          onTap: () => _go(context, DocsRoute()),
        ),
        const SizedBox(height: 2),
        _NavRow(
          icon: Icons.history_outlined,
          name: 'Changelog',
          sub: 'release notes',
          onTap: () => _go(context, ChangelogRoute()),
        ),
        if (packs != null) ...[
          const SizedBox(height: 22),
          Row(
            children: [
              _SectionTitle('Categories'),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.paper2,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${packs!.categories.length}',
                    style: AppTheme.mono(size: 10, color: AppTheme.muted)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _CategoryGrid(
              packs: packs!,
              onTap: (slug) =>
                  _go(context, AllPacksRoute(initialQueries: {'cat': slug}))),
        ],
        const SizedBox(height: 24),
        _ThemeRow(),
        const SizedBox(height: 10),
        _PubCtaRow(),
        const SizedBox(height: 18),
        Center(
          child: Text(
            'iconifyx · v0.1.0 · MIT',
            style: AppTheme.mono(
                size: 11, color: AppTheme.muted, letterSpacing: 0.44),
          ),
        ),
      ],
    );
  }
}

class _DrawerSearchTrigger extends StatelessWidget {
  const _DrawerSearchTrigger({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return HoverBox(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      borderRadius: 12,
      bg: card,
      borderColor: rule,
      hoverBorderColor: AppTheme.coral,
      child: Row(
        children: [
          Icon(Icons.search, size: 18, color: muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Search icons, categories…',
              style: TextStyle(fontSize: 15, color: muted),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: rule),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text('⌘K', style: AppTheme.mono(size: 10, color: muted)),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        label.toUpperCase(),
        style: AppTheme.mono(
          size: 10,
          color: AppTheme.muted,
          weight: FontWeight.w700,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _NavRow extends StatefulWidget {
  const _NavRow({
    required this.icon,
    required this.name,
    required this.sub,
    required this.onTap,
    this.active = false,
  });
  final IconData icon;
  final String name;
  final String sub;
  final VoidCallback onTap;
  final bool active;
  @override
  State<_NavRow> createState() => _NavRowState();
}

class _NavRowState extends State<_NavRow> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final activeFg = widget.active ? AppTheme.coral : ink;
    return HoverBox(
      onTap: widget.onTap,
      bg: widget.active ? coralSoft : Colors.transparent,
      hoverBg: widget.active ? coralSoft : paper2,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      borderRadius: 10,
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: widget.active ? card : paper2,
              borderRadius: BorderRadius.circular(9),
            ),
            alignment: Alignment.center,
            child: Icon(widget.icon,
                size: 18, color: widget.active ? AppTheme.coral : ink2),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.name,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: activeFg,
                    )),
                const SizedBox(height: 2),
                Text(widget.sub,
                    style: AppTheme.mono(
                      size: 12,
                      color: widget.active
                          ? AppTheme.coral.withValues(alpha: 0.8)
                          : AppTheme.muted,
                    )),
              ],
            ),
          ),
          Text('→',
              style: AppTheme.mono(
                  size: 14,
                  color: widget.active ? AppTheme.coral : AppTheme.muted)),
        ],
      ),
    );
  }
}


class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.packs, required this.onTap});
  final PackIndex packs;
  final ValueChanged<String> onTap;
  @override
  Widget build(BuildContext context) {
    final ranked = [...packs.categories]
      ..sort((a, b) => b.packPrefixes.length.compareTo(a.packPrefixes.length));
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth < 380 ? 1 : 2;
      const gap = 8.0;
      final cellW = (c.maxWidth - gap * (cols - 1)) / cols;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (final cat in ranked.take(8))
            SizedBox(
                width: cellW,
                child: _CategoryCardMobile(
                    category: cat, packs: packs, onTap: () => onTap(cat.slug))),
        ],
      );
    });
  }
}

class _CategoryCardMobile extends StatefulWidget {
  const _CategoryCardMobile({
    required this.category,
    required this.packs,
    required this.onTap,
  });
  final CategoryEntry category;
  final PackIndex packs;
  final VoidCallback onTap;
  @override
  State<_CategoryCardMobile> createState() => _CategoryCardMobileState();
}

class _CategoryCardMobileState extends State<_CategoryCardMobile> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final samples = <IconRecord>[];
    for (final p in widget.category.packPrefixes) {
      final summary = widget.packs.byPrefix[p];
      if (summary != null && summary.preview.isNotEmpty) {
        samples.add(summary.preview.first);
        if (samples.length >= 3) break;
      }
    }
    return HoverBox(
      onTap: widget.onTap,
      padding: const EdgeInsets.all(14),
      borderRadius: 12,
      bg: card,
      borderColor: rule,
      hoverBorderColor: AppTheme.coral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var i = 0; i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: i == 0 ? coralSoft : paper2,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Center(
                    child: i < samples.length
                        ? IconifyThumb(
                            samples[i].toIconifyData(),
                            size: 14,
                            color: i == 0 ? AppTheme.coral : ink2,
                          )
                        : const SizedBox.shrink(),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text(widget.category.name,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: ink,
              )),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text('${widget.category.packPrefixes.length} packs',
                    style: TextStyle(fontSize: 11, color: AppTheme.muted)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: paper2,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${widget.category.packPrefixes.length}',
                    style: AppTheme.mono(size: 10, color: AppTheme.muted)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ThemeRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return BlocBuilder<ThemeCubit, ThemeMode>(
      builder: (ctx, mode) {
        final isDarkMode = mode == ThemeMode.dark ||
            (mode == ThemeMode.system &&
                MediaQuery.platformBrightnessOf(ctx) == Brightness.dark);
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: card,
            border: Border.all(color: rule),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: paper2,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Icon(
                  isDarkMode
                      ? Icons.dark_mode_outlined
                      : Icons.light_mode_outlined,
                  size: 16,
                  color: ink2,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Theme',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: ink,
                    )),
              ),
              _Segmented(
                options: const ['Light', 'Dark'],
                activeIndex: isDarkMode ? 1 : 0,
                onChange: (i) => ctx
                    .read<ThemeCubit>()
                    .setMode(i == 0 ? ThemeMode.light : ThemeMode.dark),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({
    required this.options,
    required this.activeIndex,
    required this.onChange,
  });
  final List<String> options;
  final int activeIndex;
  final ValueChanged<int> onChange;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: paper2,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < options.length; i++)
            GestureDetector(
              onTap: () => onChange(i),
              child: MouseRegion(
                cursor: SystemMouseCursors.click,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: i == activeIndex ? card : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    options[i],
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight:
                          i == activeIndex ? FontWeight.w700 : FontWeight.w500,
                      color: i == activeIndex ? ink : muted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PubCtaRow extends StatefulWidget {
  @override
  State<_PubCtaRow> createState() => _PubCtaRowState();
}

class _PubCtaRowState extends State<_PubCtaRow> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    return HoverBox(
      onTap: () => launchUrl(Uri.parse('https://pub.dev/packages/iconifyx')),
      padding: const EdgeInsets.symmetric(vertical: 14),
      borderRadius: 12,
      bg: ink,
      hoverBg: AppTheme.coral,
      alignment: Alignment.center,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'View on pub.dev',
            style: TextStyle(
              color: paper,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 6),
          Icon(Icons.trending_up_outlined, size: 16, color: paper),
        ],
      ),
    );
  }
}
