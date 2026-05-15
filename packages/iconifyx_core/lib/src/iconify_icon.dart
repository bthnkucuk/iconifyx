import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'icon_data.dart';

/// Drop-in replacement for [Icon] that renders every [IconifyIconData]
/// flavour with one constructor:
///
/// ```dart
/// IconifyIcon(MdiIcons.home, color: Colors.indigo, size: 24)
/// IconifyIcon(PhIcons.acornDuotone, color: Colors.black, size: 24)
/// IconifyIcon(LogosIcons.adobeAfterEffects, size: 24)
/// ```
///
/// The widget inspects [IconifyIconData.kind] and composes the layers
/// automatically:
///
/// - **Solo** — single layer in [color].
/// - **Hint-layer duotone** — secondary BEHIND primary at 40% opacity,
///   same colour as primary. Matches FontAwesome-style duotones.
/// - **Paint-order duotone** — primary BEHIND (the background tile),
///   secondary ON TOP at full opacity. Caller should pass a contrasting
///   [secondaryColor] (e.g. the page background); without one the
///   foreground falls back to white.
/// - **Mask-internal duotone** — same render as hint-layer.
///
/// Implementation: one `CustomPaint` with TextPainter-based glyph
/// rendering for both layers. Layout happens once per build via
/// [_IconifyPainter]'s constructor and the same laid-out TextPainters
/// are reused across paint() ticks. The painter applies a
/// [BoxFit.contain] emulating scale + centre transform so wide-aspect
/// glyphs (the wordmarks shipped in Iconify's `logos` pack) scale down
/// to fit the requested `size × size`. This is roughly 2× cheaper than
/// the equivalent Stack of FittedBox(Text) — one render object, one
/// layer, no widget-tree overhead per layer.
///
/// `iconifyx_core` depends ONLY on `flutter/widgets`; no Material context
/// is required. Material apps can hand any colour they like down through
/// [secondaryColor].
class IconifyIcon extends StatelessWidget {
  /// Fallback when a paint-order duotone renders without an explicit
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
      final Color secBase = secondaryColor ??
          (paintOrder ? paintOrderSecondaryFallback : effectiveColor);
      final double secAlpha = secondaryOpacity ?? (paintOrder ? 1.0 : 0.4);
      effectiveSecondary = secBase.withValues(alpha: secAlpha);
    }

    return Semantics(
      label: semanticLabel,
      excludeSemantics: semanticLabel == null,
      child: SizedBox(
        width: effectiveSize,
        height: effectiveSize,
        child: CustomPaint(
          size: Size.square(effectiveSize),
          painter: _IconifyPainter(
            primary: icon.primary,
            secondary: secondary,
            primaryColor: effectiveColor,
            secondaryColor: effectiveSecondary,
            // Paint-order: primary BEHIND, secondary ON TOP.
            // Else (hint / mask-internal / solo): standard z-order
            // (secondary BEHIND if present, primary ON TOP).
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

/// Paints solo + every duotone flavour in a single render layer.
///
/// TextPainters are laid out once in the constructor and reused across
/// paint() ticks — `shouldRepaint` returns true only when an input
/// differs, at which point a fresh painter (and fresh TextPainters)
/// replaces this one. Within paint(), a [BoxFit.contain] scale + centre
/// transform is applied to fit the glyph's intrinsic ink into the
/// declared canvas size, matching the wide-glyph fitting that
/// `IconifyThumb`'s old per-layer FittedBox provided.
class _IconifyPainter extends CustomPainter {
  final IconData primary;
  final IconData? secondary;
  final Color primaryColor;
  final Color? secondaryColor;
  final bool secondaryOnTop;
  final double size;
  final TextDirection textDirection;
  final List<Shadow>? shadows;

  late final TextPainter _primaryTp;
  late final TextPainter? _secondaryTp;

  _IconifyPainter({
    required this.primary,
    required this.secondary,
    required this.primaryColor,
    required this.secondaryColor,
    required this.secondaryOnTop,
    required this.size,
    required this.textDirection,
    this.shadows,
  }) {
    _primaryTp = _buildPainter(primary, primaryColor);
    _primaryTp.layout();
    final s = secondary;
    final sc = secondaryColor;
    if (s != null && sc != null) {
      final tp = _buildPainter(s, sc);
      tp.layout();
      _secondaryTp = tp;
    } else {
      _secondaryTp = null;
    }
  }

  TextPainter _buildPainter(IconData glyph, Color glyphColor) => TextPainter(
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

  @override
  void paint(Canvas canvas, Size canvasSize) {
    // BoxFit.contain emulation. Compute the largest scale that keeps both
    // glyphs inside canvasSize (preserving aspect), then centre.
    final double maxGlyphW = math.max(
      _primaryTp.width,
      _secondaryTp?.width ?? 0,
    );
    final double maxGlyphH = math.max(
      _primaryTp.height,
      _secondaryTp?.height ?? 0,
    );
    if (maxGlyphW <= 0 || maxGlyphH <= 0) return;
    final double scaleX = canvasSize.width / maxGlyphW;
    final double scaleY = canvasSize.height / maxGlyphH;
    final double scale = math.min(scaleX, scaleY);
    final double dx = (canvasSize.width - maxGlyphW * scale) / 2;
    final double dy = (canvasSize.height - maxGlyphH * scale) / 2;

    canvas.save();
    canvas.translate(dx, dy);
    if (scale != 1.0) canvas.scale(scale);

    final sTp = _secondaryTp;
    if (sTp != null && secondaryOnTop) {
      _primaryTp.paint(canvas, Offset.zero);
      sTp.paint(canvas, Offset.zero);
    } else {
      if (sTp != null) sTp.paint(canvas, Offset.zero);
      _primaryTp.paint(canvas, Offset.zero);
    }
    canvas.restore();
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
