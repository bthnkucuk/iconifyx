import 'package:flutter/widgets.dart';

import 'icon_data.dart';

/// Drop-in replacement for [Icon] that handles both regular and duo-tone
/// [IconifyIconData] values. The outer structure mirrors Flutter's [Icon]
/// — [Semantics] wrapping a [SizedBox] of the requested size — so the
/// widget behaves like an icon in layouts (no extra Stack child semantics
/// or sizing surprises) regardless of whether the icon is duotone.
///
/// For duotone icons the two layers are painted in the same render layer
/// via a single [CustomPaint] (no [Stack]), so the widget tree is just as
/// shallow as a regular [Icon].
///
/// Pass either constructor variant the icon directly — the default
/// constructor figures out automatically whether the icon is duotone:
///
/// ```dart
/// IconifyIcon(MdiIcons.home, color: Colors.indigo)               // regular
/// IconifyIcon(PhIcons.acornDuotone, color: Colors.black)         // duotone (auto)
/// IconifyIcon.duotone(                                            // duotone, custom
///   PhIcons.acornDuotone,
///   color: Colors.black,
///   secondaryColor: Colors.red,
///   secondaryOpacity: 0.5,
/// )
/// ```
class IconifyIcon extends StatelessWidget {
  /// The icon to render. Duo-tone icons are detected via
  /// [IconifyIconData.isDuotone] and rendered with both layers.
  final IconifyIconData icon;

  /// Pixel size of the icon. Defaults to the ambient [IconTheme] size.
  final double? size;

  /// Colour of the (primary) layer. Defaults to ambient [IconTheme] colour.
  final Color? color;

  /// Override colour for the secondary layer of duo-tone icons. Defaults
  /// to [color] (and ultimately [IconTheme] colour).
  final Color? secondaryColor;

  /// Opacity applied to the secondary layer of duo-tone icons. Defaults
  /// to 0.4, matching FontAwesome's duotone convention.
  final double secondaryOpacity;

  final String? semanticLabel;
  final TextDirection? textDirection;
  final List<Shadow>? shadows;

  /// Render any [IconifyIconData]. Duo-tone icons are rendered with both
  /// layers automatically; the secondary layer uses [color] at
  /// [secondaryOpacity]=0.4 unless [IconifyIcon.duotone] is used to
  /// customise it.
  const IconifyIcon(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.semanticLabel,
    this.textDirection,
    this.shadows,
  })  : secondaryColor = null,
        secondaryOpacity = 0.4;

  /// Render a duo-tone icon with explicit control over the secondary
  /// layer's colour and opacity. Non-duotone icons fall back to single-
  /// layer rendering and the secondary controls have no effect.
  const IconifyIcon.duotone(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.secondaryColor,
    this.secondaryOpacity = 0.4,
    this.semanticLabel,
    this.textDirection,
    this.shadows,
  });

  @override
  Widget build(BuildContext context) {
    final iconTheme = IconTheme.of(context);
    final effectiveSize = size ?? iconTheme.size ?? 24.0;
    final effectiveColor = color ?? iconTheme.color ?? const Color(0xFF000000);
    final effectiveDir =
        textDirection ?? Directionality.maybeOf(context) ?? TextDirection.ltr;

    final IconData? secondary = icon.secondary;
    Color? effectiveSecondary;
    if (secondary != null) {
      final base = secondaryColor ?? effectiveColor;
      effectiveSecondary = base.withValues(alpha: secondaryOpacity);
    }

    final glyphSize = Size.square(effectiveSize);

    return Semantics(
      label: semanticLabel,
      excludeSemantics: semanticLabel == null,
      child: SizedBox(
        width: effectiveSize,
        height: effectiveSize,
        child: CustomPaint(
          size: glyphSize,
          painter: _IconifyPainter(
            primary: icon.primary,
            secondary: secondary,
            primaryColor: effectiveColor,
            secondaryColor: effectiveSecondary,
            size: effectiveSize,
            textDirection: effectiveDir,
            shadows: shadows,
          ),
        ),
      ),
    );
  }
}

/// Paints the icon's primary glyph (and, for duotone, also the secondary
/// glyph at the same canvas origin) in a single render layer — no Stack,
/// no nested widgets. Both glyphs come from the same em-square (their
/// fonts share a font height), so painting them at [Offset.zero]
/// reproduces the original SVG layering without any per-glyph centring
/// gymnastics.
class _IconifyPainter extends CustomPainter {
  final IconData primary;
  final IconData? secondary;
  final Color primaryColor;
  final Color? secondaryColor;
  final double size;
  final TextDirection textDirection;
  final List<Shadow>? shadows;

  _IconifyPainter({
    required this.primary,
    required this.secondary,
    required this.primaryColor,
    required this.secondaryColor,
    required this.size,
    required this.textDirection,
    this.shadows,
  });

  @override
  void paint(Canvas canvas, Size canvasSize) {
    if (secondary != null && secondaryColor != null) {
      _paintGlyph(canvas, secondary!, secondaryColor!);
    }
    _paintGlyph(canvas, primary, primaryColor);
  }

  void _paintGlyph(Canvas canvas, IconData glyph, Color glyphColor) {
    final tp = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(glyph.codePoint),
        style: TextStyle(
          inherit: false,
          color: glyphColor,
          fontSize: size,
          fontFamily: glyph.fontFamily,
          package: glyph.fontPackage,
          height: 1.0,
          leadingDistribution: TextLeadingDistribution.even,
          shadows: shadows,
        ),
      ),
      textDirection: textDirection,
    );
    tp.layout();
    tp.paint(canvas, Offset.zero);
  }

  @override
  bool shouldRepaint(_IconifyPainter old) =>
      old.primary != primary ||
      old.secondary != secondary ||
      old.primaryColor != primaryColor ||
      old.secondaryColor != secondaryColor ||
      old.size != size ||
      old.textDirection != textDirection ||
      old.shadows != shadows;
}
