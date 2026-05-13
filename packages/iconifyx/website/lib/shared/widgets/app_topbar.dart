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
                  // Mobile: brand on left, hamburger far-right.
                  ...[
                  const Spacer(),
                  _HamburgerButton(onTap: () => MobileDrawer.show(context)),
                ]
                else
                  // Desktop: full nav row.
                  ...[
                  const SizedBox(width: 14),
                  _NavLink(label: 'Home', onTap: () => appCoordinator.navigate(HomeRoute()), active: true),
                  _NavLink(label: 'Icons', onTap: () => appCoordinator.navigate(AllPacksRoute())),
                  _NavLink(label: 'Docs', onTap: () => _launch('https://pub.dev/packages/iconifyx')),
                  _NavLink(label: 'Changelog', onTap: () => _launch('https://github.com/bthnkucuk/iconifyx/releases')),
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
class _HamburgerButton extends StatefulWidget {
  const _HamburgerButton({required this.onTap});
  final VoidCallback onTap;
  @override
  State<_HamburgerButton> createState() => _HamburgerButtonState();
}

class _HamburgerButtonState extends State<_HamburgerButton> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: card,
            border: Border.all(color: _hover ? AppTheme.coral : rule),
            borderRadius: BorderRadius.circular(8),
          ),
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
        ),
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

// ─── Nav link (hover bg) ────────────────────────────────────────────────────
class _NavLink extends StatefulWidget {
  const _NavLink({required this.label, required this.onTap, this.active = false});

  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  State<_NavLink> createState() => _NavLinkState();
}

class _NavLinkState extends State<_NavLink> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;

    final bg = widget.active ? coralSoft : (_hover ? paper2 : Colors.transparent);
    final fg = widget.active ? AppTheme.coral : ink2;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: fg,
              fontFamily: Theme.of(context).textTheme.labelLarge?.fontFamily,
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Search trigger (opens command palette) ─────────────────────────────────
class _SearchTrigger extends StatefulWidget {
  const _SearchTrigger({required this.color});
  final Color color;
  @override
  State<_SearchTrigger> createState() => _SearchTriggerState();
}

class _SearchTriggerState extends State<_SearchTrigger> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => appCoordinator.push(SearchRoute()),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 280,
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: card,
            border: Border.all(color: _hover ? AppTheme.coral : rule),
            borderRadius: BorderRadius.circular(10),
          ),
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
        ),
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

class _PubCta extends StatefulWidget {
  @override
  State<_PubCta> createState() => _PubCtaState();
}

class _PubCtaState extends State<_PubCta> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final paper = isDark ? AppTheme.paperDark : AppTheme.paper;
    final bg = _hover ? AppTheme.coral : ink;
    final fg = _hover ? Colors.white : paper;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => launchUrl(Uri.parse('https://pub.dev/packages/iconifyx')),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            'pub.dev →',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: fg,
              fontFamily:
                  Theme.of(context).textTheme.labelLarge?.fontFamily,
            ),
          ),
        ),
      ),
    );
  }
}
