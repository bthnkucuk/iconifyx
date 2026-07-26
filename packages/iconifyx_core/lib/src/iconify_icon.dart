import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
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
class IconifyIcon extends StatefulWidget {
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
  State<IconifyIcon> createState() => _IconifyIconState();
}

/// Owns the laid-out [TextPainter]s.
///
/// They live on the State, not on the [CustomPainter], because a `TextPainter`
/// holds a native `ui.Paragraph` and must be disposed — and `CustomPainter` has no
/// disposal hook. Building them in the painter's constructor (as this widget used
/// to, while it was a `StatelessWidget`) leaked one or two paragraphs on **every
/// rebuild**, which leak_tracker flags in any widget test that renders an icon.
///
/// The painters still lay out once and are reused across paint() ticks: they are
/// rebuilt only when a value they were shaped from actually changes. Some of those
/// values come from the ambient [IconTheme] / [Directionality] rather than from the
/// widget, so the check has to happen in [build] — `didUpdateWidget` alone would
/// miss a theme change.
class _IconifyIconState extends State<IconifyIcon> {
  TextPainter? _primaryTp;
  TextPainter? _secondaryTp;
  _GlyphSpec? _spec;

  @override
  void dispose() {
    _primaryTp?.dispose();
    _secondaryTp?.dispose();
    super.dispose();
  }

  /// Rebuilds the painters iff [spec] differs from what they were shaped from.
  ///
  /// Disposing here is safe: the only reference to the outgoing painters is the
  /// outgoing [_IconifyPainter], and this runs during `build` — the replacement
  /// painter is installed on the render object before the frame paints.
  void _syncPainters(_GlyphSpec spec) {
    if (_spec == spec) return;
    _primaryTp?.dispose();
    _secondaryTp?.dispose();
    _primaryTp = _buildPainter(spec, spec.primary, spec.primaryColor)..layout();
    final s = spec.secondary;
    final sc = spec.secondaryColor;
    _secondaryTp = (s != null && sc != null) ? (_buildPainter(spec, s, sc)..layout()) : null;
    _spec = spec;
  }

  TextPainter _buildPainter(_GlyphSpec spec, IconData glyph, Color glyphColor) => TextPainter(
        text: TextSpan(
          text: String.fromCharCode(glyph.codePoint),
          style: TextStyle(
            inherit: false,
            color: glyphColor,
            fontSize: spec.size,
            fontFamily: glyph.fontFamily,
            package: glyph.fontPackage,
            height: 1.0,
            leadingDistribution: TextLeadingDistribution.even,
            shadows: spec.shadows,
          ),
        ),
        textDirection: spec.textDirection,
      );

  @override
  Widget build(BuildContext context) {
    final iconTheme = IconTheme.of(context);
    final effectiveSize = widget.size ?? iconTheme.size ?? 24.0;
    final effectiveColor = widget.color ?? iconTheme.color ?? const Color(0xFF000000);
    final effectiveDir = widget.textDirection ?? Directionality.maybeOf(context) ?? TextDirection.ltr;

    final IconData? secondary = widget.icon.secondary;
    final bool paintOrder = widget.icon.isPaintOrderDuotone;
    Color? effectiveSecondary;
    if (secondary != null) {
      final Color secBase =
          widget.secondaryColor ?? (paintOrder ? IconifyIcon.paintOrderSecondaryFallback : effectiveColor);
      final double secAlpha = widget.secondaryOpacity ?? (paintOrder ? 1.0 : 0.4);
      effectiveSecondary = secBase.withValues(alpha: secAlpha);
    }

    final spec = _GlyphSpec(
      primary: widget.icon.primary,
      secondary: secondary,
      primaryColor: effectiveColor,
      secondaryColor: effectiveSecondary,
      size: effectiveSize,
      textDirection: effectiveDir,
      shadows: widget.shadows,
    );
    _syncPainters(spec);

    return Semantics(
      label: widget.semanticLabel,
      excludeSemantics: widget.semanticLabel == null,
      child: SizedBox(
        width: effectiveSize,
        height: effectiveSize,
        child: CustomPaint(
          size: Size.square(effectiveSize),
          painter: _IconifyPainter(
            primaryTp: _primaryTp!,
            secondaryTp: _secondaryTp,
            spec: spec,
            // Paint-order: primary BEHIND, secondary ON TOP.
            // Else (hint / mask-internal / solo): standard z-order
            // (secondary BEHIND if present, primary ON TOP).
            secondaryOnTop: paintOrder,
          ),
        ),
      ),
    );
  }
}

/// Everything a glyph's [TextPainter] is shaped from — the cache key that decides
/// whether the laid-out painters can be reused.
@immutable
class _GlyphSpec {
  const _GlyphSpec({
    required this.primary,
    required this.secondary,
    required this.primaryColor,
    required this.secondaryColor,
    required this.size,
    required this.textDirection,
    required this.shadows,
  });

  final IconData primary;
  final IconData? secondary;
  final Color primaryColor;
  final Color? secondaryColor;
  final double size;
  final TextDirection textDirection;
  final List<Shadow>? shadows;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is _GlyphSpec &&
        other.primary == primary &&
        other.secondary == secondary &&
        other.primaryColor == primaryColor &&
        other.secondaryColor == secondaryColor &&
        other.size == size &&
        other.textDirection == textDirection &&
        // By value, not identity: `Shadow` has value equality, so a caller passing
        // a fresh `[Shadow(...)]` literal every build no longer re-shapes the glyph.
        listEquals(other.shadows, shadows);
  }

  @override
  int get hashCode => Object.hash(
        primary,
        secondary,
        primaryColor,
        secondaryColor,
        size,
        textDirection,
        shadows == null ? null : Object.hashAll(shadows!),
      );
}

/// Paints solo + every duotone flavour in a single render layer.
///
/// It does NOT own the [TextPainter]s — [_IconifyIconState] builds, lays out and
/// disposes them, because a `TextPainter` holds a native `ui.Paragraph` and
/// `CustomPainter` has no disposal hook. This class only draws.
///
/// Within paint(), a [BoxFit.contain] scale + centre transform is applied to fit
/// the glyph's intrinsic ink into the declared canvas size, matching the wide-glyph
/// fitting that `IconifyThumb`'s old per-layer FittedBox provided.
class _IconifyPainter extends CustomPainter {
  _IconifyPainter({
    required TextPainter primaryTp,
    required TextPainter? secondaryTp,
    required this.spec,
    required this.secondaryOnTop,
  })  : _primaryTp = primaryTp,
        _secondaryTp = secondaryTp;

  /// What the painters were shaped from; drives [shouldRepaint].
  final _GlyphSpec spec;
  final bool secondaryOnTop;

  final TextPainter _primaryTp;
  final TextPainter? _secondaryTp;

  @override
  void paint(Canvas canvas, Size canvasSize) {
    // Glyphs are shaped at `fontSize == size`, so their em-quad already
    // matches `canvasSize`. Primary + secondary share the SAME canonical
    // 1000-em-quad (force-set by the generator's font-merger) so layers
    // overlay in alignment when painted at the same Offset.zero.
    //
    // We still apply a `min(canvasSize / glyphPaintW, 1.0)` clamp-BoxFit
    // for wide-aspect glyphs like `logos:adobe-after-effects` whose
    // wordmark spans >1 em horizontally — without it those overflow the
    // declared icon size box. The clamp's upper bound of 1.0 means
    // narrow icons never UP-scale (a previous bug from up-scaling icons
    // by `canvas.scale(canvasSize/maxBboxW)` was the Solar
    // `add-circle-bold-duotone` left-pinned regression).
    final double maxGlyphW = math.max(
      _primaryTp.width,
      _secondaryTp?.width ?? 0,
    );
    final double maxGlyphH = math.max(
      _primaryTp.height,
      _secondaryTp?.height ?? 0,
    );
    if (maxGlyphW <= 0 || maxGlyphH <= 0) return;
    final double scale = math.min(
      math.min(canvasSize.width / maxGlyphW, canvasSize.height / maxGlyphH),
      1.0,
    );
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
      old.spec != spec ||
      old.secondaryOnTop != secondaryOnTop ||
      // Identity, not value: when the spec is unchanged the State hands back the
      // very same laid-out painters, so this is false and nothing repaints.
      !identical(old._primaryTp, _primaryTp) ||
      !identical(old._secondaryTp, _secondaryTp);
}
