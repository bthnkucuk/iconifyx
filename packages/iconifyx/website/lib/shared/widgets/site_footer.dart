import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_theme.dart';
import 'brand_mark.dart';

class SiteFooter extends StatelessWidget {
  const SiteFooter({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 40, 28, 60),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: rule)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const BrandMark(size: 22),
          const SizedBox(width: 10),
          Text(
            'iconifyx',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: muted,
              fontFamily: Theme.of(context).textTheme.titleLarge?.fontFamily,
            ),
          ),
          const SizedBox(width: 14),
          Text(
            '© 2026 · MIT',
            style: TextStyle(fontSize: 13, color: muted),
          ),
          const Spacer(),
          _FooterLink(label: 'Docs', url: 'https://pub.dev/packages/iconifyx'),
          _FooterLink(label: 'GitHub', url: 'https://github.com/bthnkucuk/iconifyx'),
          _FooterLink(label: 'pub.dev', url: 'https://pub.dev/packages/iconifyx'),
          _FooterLink(label: 'Changelog', url: 'https://github.com/bthnkucuk/iconifyx/releases'),
        ],
      ),
    );
  }
}

class _FooterLink extends StatefulWidget {
  const _FooterLink({required this.label, required this.url});
  final String label;
  final String url;

  @override
  State<_FooterLink> createState() => _FooterLinkState();
}

class _FooterLinkState extends State<_FooterLink> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => launchUrl(Uri.parse(widget.url)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: _hover ? AppTheme.coral : muted,
            ),
          ),
        ),
      ),
    );
  }
}
