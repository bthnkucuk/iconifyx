import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:markdown_widget/markdown_widget.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../router/coordinator.dart';
import '../../router/routes/shell/docs_route.dart';
import '../../theme/app_theme.dart';

/// Renders a markdown string as a themed [Column] — drop into a sliver
/// adapter, no inner scroll view. Two reasons we wrap markdown_widget
/// rather than using it directly:
///
/// 1. **Theme integration.** markdown_widget ships its own light/dark
///    configs with hard-coded text styles that don't match
///    [AppTheme]'s Plus Jakarta Sans + JetBrains Mono. We rebuild the
///    config from AppTheme so headings, body, and code blocks all use
///    the bundled fonts.
/// 2. **Routing.** Internal markdown links (`duotone.md`,
///    `architecture.md`, ...) should navigate inside the app, not open
///    a new browser tab. The link `onTap` is intercepted: relative
///    paths matching a known doc slug route through the coordinator;
///    everything else opens via `url_launcher`.
class MarkdownBody extends StatelessWidget {
  const MarkdownBody(this.data, {super.key});

  final String data;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tt = Theme.of(context).textTheme;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;

    final bodyStyle = (tt.bodyMedium ?? const TextStyle()).copyWith(
      color: ink,
      fontSize: 15,
      height: 1.65,
    );
    final codeInlineStyle = AppTheme.mono(
      size: 13,
      color: ink,
    );
    final codeBlockStyle = AppTheme.mono(
      size: 13,
      color: ink,
      height: 1.55,
    );

    final config = MarkdownConfig(
      configs: [
        H1Config(
          style: (tt.headlineMedium ?? const TextStyle()).copyWith(
            color: ink,
            fontSize: 30,
          ),
        ),
        H2Config(
          style: (tt.headlineSmall ?? const TextStyle()).copyWith(
            color: ink,
            fontSize: 22,
          ),
        ),
        H3Config(
          style: (tt.titleLarge ?? const TextStyle()).copyWith(
            color: ink,
            fontSize: 18,
          ),
        ),
        H4Config(
          style: (tt.titleMedium ?? const TextStyle()).copyWith(
            color: ink,
            fontSize: 15,
          ),
        ),
        PConfig(textStyle: bodyStyle),
        LinkConfig(
          style: TextStyle(
            color: AppTheme.coral,
            decoration: TextDecoration.underline,
            decorationColor: AppTheme.coral.withValues(alpha: 0.4),
            fontSize: 15,
            height: 1.65,
          ),
          onTap: (url) => _handleLinkTap(context, url),
        ),
        CodeConfig(
          style: codeInlineStyle.copyWith(
            backgroundColor: paper2,
            color: ink2,
          ),
        ),
        PreConfig(
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0B0E16) : const Color(0xFFF1ECE3),
            border: Border.all(color: rule),
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: codeBlockStyle,
          theme: _highlightTheme(isDark: isDark, baseColor: ink),
          language: 'dart',
          wrapper: (child, code, language) => _CodeBlockWrapper(
            code: code,
            language: language,
            child: child,
          ),
        ),
        BlockquoteConfig(
          sideColor: AppTheme.coral,
          textColor: ink,
        ),
        ListConfig(
          marginLeft: 28,
          marginBottom: 4,
          marker: (isOrdered, depth, index) => Padding(
            padding: const EdgeInsets.only(top: 8, right: 8),
            child: isOrdered
                ? Text(
                    '${index + 1}.',
                    style: AppTheme.mono(size: 13, color: muted),
                  )
                : Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.coral,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
          ),
        ),
        TableConfig(
          headerStyle: (tt.titleSmall ?? const TextStyle()).copyWith(
            color: ink,
          ),
          bodyStyle: bodyStyle.copyWith(fontSize: 14),
          border: TableBorder.all(color: rule, width: 1),
          headPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          bodyPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        ),
        HrConfig(color: rule, height: 1),
      ],
    );

    // HeadingConfig.divider is a static singleton inside markdown_widget's
    // H1Config / H2Config and can't be retargeted from the public API. The
    // package's default divider colour (#d7dde3) is close enough to
    // AppTheme.rule that the difference is imperceptible in light theme;
    // in dark theme h1/h2 dividers print slightly heavier than the rest
    // of the page chrome. Living with it.
    return MarkdownBlock(data: data, config: config);
  }

  /// Internal markdown links of the form `duotone.md` /
  /// `architecture.md` / `pipeline.md` / `flutter_3_44_iconData.md` are
  /// routed through the coordinator. Anything else launches in a new
  /// browser tab.
  Future<void> _handleLinkTap(BuildContext context, String url) async {
    // markdown_widget passes the raw href value. Strip anchor / query
    // for slug matching.
    final cleaned = url.split('#').first.split('?').first;
    final slug = _slugForLink(cleaned);
    if (slug != null) {
      appCoordinator.navigate(DocsRoute(slug: slug));
      return;
    }
    final uri = Uri.tryParse(url);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  /// Map a relative href to the matching docs route slug, or null when
  /// no match. The author-side filenames use snake_case
  /// (`flutter_3_44_iconData.md`) while the public URL slug is kebab-
  /// case (`flutter-3-44-icondata`) — both are accepted so the same
  /// markdown source can ship to pub.dev and the website.
  String? _slugForLink(String href) {
    var name = href;
    if (name.contains('/')) {
      name = name.substring(name.lastIndexOf('/') + 1);
    }
    if (name.endsWith('.md')) {
      name = name.substring(0, name.length - 3);
    }
    if (name.isEmpty) return null;
    final lowered = name.toLowerCase();
    switch (lowered) {
      case 'index':
        return 'overview';
      case 'architecture':
        return 'architecture';
      case 'duotone':
        return 'duotone';
      case 'pipeline':
        return 'pipeline';
      case 'flutter_3_44_icondata':
      case 'flutter-3-44-icondata':
        return 'flutter-3-44-icondata';
      default:
        return null;
    }
  }

  /// Minimal hand-rolled highlight theme matching AppTheme. Covers the
  /// classes flutter_highlight emits for Dart and YAML — that's all we
  /// have in the docs.
  Map<String, TextStyle> _highlightTheme({
    required bool isDark,
    required Color baseColor,
  }) {
    const keyword = Color(0xFFCE4264); // coral-adjacent
    const string = Color(0xFF18782F);
    const stringDark = Color(0xFF7EE07A);
    const number = Color(0xFF7C5CFF);
    const comment = Color(0xFF6B7185);
    const type = Color(0xFF4DA3FF);
    return {
      'root': TextStyle(color: baseColor),
      'keyword': const TextStyle(
        color: keyword,
        fontWeight: FontWeight.w700,
      ),
      'built_in': const TextStyle(color: type),
      'type': const TextStyle(color: type),
      'class': const TextStyle(color: type),
      'string': TextStyle(color: isDark ? stringDark : string),
      'number': const TextStyle(color: number),
      'comment': const TextStyle(
        color: comment,
        fontStyle: FontStyle.italic,
      ),
      'meta': const TextStyle(color: comment),
      'attr': TextStyle(color: isDark ? stringDark : string),
      'literal': const TextStyle(color: number),
      'tag': const TextStyle(color: keyword),
      'name': const TextStyle(color: type),
      'symbol': const TextStyle(color: number),
      'function': TextStyle(color: baseColor),
      'title': const TextStyle(color: type),
    };
  }
}

/// Wraps a [PreConfig]-rendered code block with a copy-to-clipboard
/// button. The wrapper sees the original `code` string and the
/// detected `language` so we can ship both back in a useful copy.
class _CodeBlockWrapper extends StatelessWidget {
  const _CodeBlockWrapper({
    required this.child,
    required this.code,
    required this.language,
  });

  final Widget child;
  final String code;
  final String language;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Stack(
      children: [
        child,
        Positioned(
          top: 6,
          right: 6,
          child: _CopyButton(
            onTap: () async {
              await Clipboard.setData(ClipboardData(text: code));
              if (!context.mounted) return;
              ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                SnackBar(
                  content: Text('Copied $language code',
                      style: TextStyle(fontSize: 13)),
                  duration: const Duration(milliseconds: 1400),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            mutedColor: muted,
          ),
        ),
      ],
    );
  }
}

class _CopyButton extends StatefulWidget {
  const _CopyButton({required this.onTap, required this.mutedColor});
  final VoidCallback onTap;
  final Color mutedColor;

  @override
  State<_CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends State<_CopyButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: _hover
                ? AppTheme.coral.withValues(alpha: 0.16)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            'COPY',
            style: AppTheme.mono(
              size: 10,
              color: _hover ? AppTheme.coral : widget.mutedColor,
              weight: FontWeight.w700,
              letterSpacing: 1.0,
            ),
          ),
        ),
      ),
    );
  }
}
