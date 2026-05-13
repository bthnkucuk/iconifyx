import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../router/coordinator.dart';
import '../../router/routes/shell/all_packs_route.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/search_route.dart';
import '../../theme/app_theme.dart';
import '../../theme/theme_cubit.dart';
import 'brand_mark.dart';
import 'hover_box.dart';
import 'mobile_drawer.dart';

/// Sticky frosted nav per the handoff spec.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({super.key, required this.showMenuButton});

  final bool showMenuButton;

  @override
  Size get preferredSize => const Size.fromHeight(58);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;

    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: rule)),
      ),
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            color: paper.withValues(alpha: 0.80),
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 0),
            height: 58,
            child: Row(
              children: [
                InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => appCoordinator.navigate(HomeRoute()),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 6,
                    ),
                    child: Row(
                      children: const [
                        BrandMark(size: 30),
                        SizedBox(width: 10),
                        BrandWordmark(),
                      ],
                    ),
                  ),
                ),
                if (showMenuButton)
                  ...[
                  const Spacer(),
                  _HamburgerButton(onTap: () => MobileDrawer.show(context)),
                ]
                else
                  ...[
                  const SizedBox(width: 14),
                  _NavLink(
                      label: 'Home',
                      onTap: () => appCoordinator.navigate(HomeRoute()),
                      active: true),
                  _NavLink(
                      label: 'Icons',
                      onTap: () => appCoordinator.navigate(AllPacksRoute())),
                  _NavLink(
                      label: 'Docs',
                      onTap: () =>
                          _launch('https://pub.dev/packages/iconifyx')),
                  _NavLink(
                      label: 'Changelog',
                      onTap: () => _launch(
                          'https://github.com/bthnkucuk/iconifyx/releases')),
                  const Spacer(),
                  _SearchTrigger(color: ink2),
                  const SizedBox(width: 10),
                  _ThemeToggle(),
                  const SizedBox(width: 10),
                  _PubCta(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static Future<void> _launch(String url) async {
    await launchUrl(Uri.parse(url));
  }
}

// ─── Hamburger ──────────────────────────────────────────────────────────────
class _HamburgerButton extends StatelessWidget {
  const _HamburgerButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return HoverBox(
      onTap: onTap,
      width: 38,
      height: 38,
      borderRadius: 8,
      bg: card,
      borderColor: rule,
      hoverBorderColor: AppTheme.coral,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Bar(color: ink),
          const SizedBox(height: 4),
          _Bar(color: ink),
          const SizedBox(height: 4),
          _Bar(color: ink),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.color});
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        width: 16,
        height: 1.75,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(2),
        ),
      );
}

// ─── Nav link (local-hover, no parent setState) ─────────────────────────────
class _NavLink extends StatelessWidget {
  const _NavLink({required this.label, required this.onTap, this.active = false});
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;
    final fg = active ? AppTheme.coral : ink2;
    return HoverBox(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      borderRadius: 8,
      bg: active ? coralSoft : Colors.transparent,
      hoverBg: active ? coralSoft : paper2,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: fg,
          fontFamily: Theme.of(context).textTheme.labelLarge?.fontFamily,
        ),
      ),
    );
  }
}

class _SearchTrigger extends StatelessWidget {
  const _SearchTrigger({required this.color});
  final Color color;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return HoverBox(
      onTap: () => appCoordinator.push(SearchRoute()),
      width: 280,
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      borderRadius: 10,
      bg: card,
      borderColor: rule,
      hoverBorderColor: AppTheme.coral,
      child: Row(
        children: [
          Icon(Icons.search, size: 16, color: muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Search 165K icons…',
                style: TextStyle(fontSize: 13, color: muted)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
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

class _ThemeToggle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return InkWell(
      onTap: () => context.read<ThemeCubit>().toggle(),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          border: Border.all(color: rule),
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: BlocBuilder<ThemeCubit, ThemeMode>(
          builder: (ctx, mode) => Icon(
            mode == ThemeMode.dark
                ? Icons.light_mode_outlined
                : Icons.dark_mode_outlined,
            size: 16,
            color: ink2,
          ),
        ),
      ),
    );
  }
}

class _PubCta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    return HoverBox(
      onTap: () => launchUrl(Uri.parse('https://pub.dev/packages/iconifyx')),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      borderRadius: 10,
      bg: ink,
      hoverBg: AppTheme.coral,
      child: Text(
        'pub.dev →',
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: paper,
          fontFamily: Theme.of(context).textTheme.labelLarge?.fontFamily,
        ),
      ),
    );
  }
}
