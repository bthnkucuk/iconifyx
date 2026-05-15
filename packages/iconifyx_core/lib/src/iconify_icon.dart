import 'package:flutter/widgets.dart';

import 'icon_data.dart';

/// Drop-in replacement for [Icon] that renders any [IconifyIconData]
/// flavour — solo, hint-layer duotone, paint-order duotone, mask-internal
/// duotone — with one constructor and sensible defaults. Use it exactly
/// like Flutter's [Icon]:
///
/// ```dart
/// IconifyIcon(MdiIcons.home, color: Colors.indigo, size: 24)
/// IconifyIcon(PhIcons.acornDuotone, color: Colors.black, size: 24)
/// IconifyIcon(LogosIcons.adobeAfterEffects, size: 24)
/// ```
///
/// The widget inspects [IconifyIconData.kind] to choose the composition:
///
/// - **Solo** — single layer in [color] (defaults to ambient `IconTheme`).
/// - **Hint-layer duotone** — secondary BEHIND primary at 40% opacity,
///   same colour as primary.
/// - **Paint-order duotone** — primary BEHIND (the background tile),
///   secondary ON TOP at full opacity. Caller should pass a contrasting
///   [secondaryColor] (e.g. the page background); without one the
///   foreground falls back to white.
/// - **Mask-internal duotone** — same render as hint-layer.
///
/// All defaults can be overridden via [secondaryColor] / [secondaryOpacity].
/// `iconifyx_core` depends ONLY on `flutter/widgets`; no Material context
/// is required (callers from Material apps can hand any Material colour
/// down through the [secondaryColor] parameter).
class IconifyIcon extends StatelessWidget {
  /// Fallback when a paint-order duotone is rendered without an explicit
  /// [secondaryColor]. Chosen so light foreground letterforms (most
  /// `logos:*`, crypto-color, emoji packs) read against a dark primary
  /// tile. Consumers with a known theme should override.
  static const Color paintOrderSecondaryFallback = Color(0xFFFFFFFF);

  /// The icon to render. Auto-detects duotone flavour from
  /// [IconifyIconData.kind].
  final IconifyIconData icon;

  /// Pixel size. Defaults to the ambient [IconTheme] size.
  final double? size;

  /// Colour for the primary layer. Defaults to the ambient [IconTheme]
  /// colour.
  final Color? color;

  /// Override colour for the secondary layer of duo-tone icons. Defaults:
  ///
  /// - **Hint / mask-internal**: same as [color], rendered at
  ///   [secondaryOpacity] (40% by default).
  /// - **Paint-order**: [paintOrderSecondaryFallback] (white) at full
  ///   opacity. Callers should pass their surface / page background
  ///   colour here so the foreground letterform "knocks out" of the
  ///   colored background tile.
  final Color? secondaryColor;

  /// Opacity for the secondary layer when [secondaryColor] is `null`.
  /// Default depends on kind: 0.4 for hint / mask-internal, 1.0 for
  /// paint-order.
  final double? secondaryOpacity;

  final String? semanticLabel;
  final TextDirection? textDirection;
  final List<Shadow>? shadows;

  const IconifyIcon(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.secondaryColor,
    this.secondaryOpacity,
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
    final bool paintOrder = icon.isPaintOrderDuotone;
    Color? effectiveSecondary;
    if (secondary != null) {
      // Knockout default for paint-order: white at full opacity (caller
      // should override with theme.surface where available). Hint /
      // mask-internal: primary colour at 40% opacity.
      final Color secBase = secondaryColor ??
          (paintOrder ? paintOrderSecondaryFallback : effectiveColor);
      final double secAlpha = secondaryOpacity ?? (paintOrder ? 1.0 : 0.4);
      effectiveSecondary = secBase.withValues(alpha: secAlpha);
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
            // Paint-order: primary BEHIND, secondary ON TOP.
            secondaryOnTop: paintOrder,
            size: effectiveSize,
            textDirection: effectiveDir,
            shadows: shadows,
          ),
        ),
      ),
    );
  }
}

/// Paints solo + every duotone flavour in a single render layer (no Stack,
/// no nested widgets). Layer order is controlled by [secondaryOnTop] so
/// paint-order duotones render their foreground letterform on top while
/// hint-layer duotones keep the faint backdrop behind the solid primary.
class _IconifyPainter extends CustomPainter {
  final IconData primary;
  final IconData? secondary;
  final Color primaryColor;
  final Color? secondaryColor;
  final bool secondaryOnTop;
  final double size;
  final TextDirection textDirection;
  final List<Shadow>? shadows;

  _IconifyPainter({
    required this.primary,
    required this.secondary,
    required this.primaryColor,
    required this.secondaryColor,
    required this.secondaryOnTop,
    required this.size,
    required this.textDirection,
    this.shadows,
  });

  @override
  void paint(Canvas canvas, Size canvasSize) {
    final hasSecondary = secondary != null && secondaryColor != null;
    if (hasSecondary && secondaryOnTop) {
      _paintGlyph(canvas, primary, primaryColor);
      _paintGlyph(canvas, secondary!, secondaryColor!);
    } else {
      if (hasSecondary) {
        _paintGlyph(canvas, secondary!, secondaryColor!);
      }
      _paintGlyph(canvas, primary, primaryColor);
    }
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
      old.secondaryOnTop != secondaryOnTop ||
      old.size != size ||
      old.textDirection != textDirection ||
      old.shadows != shadows;
}
