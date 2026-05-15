import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// Renders an [IconifyIconData] glyph as a [Text] inside a
/// [FittedBox(BoxFit.contain)].
///
/// `IconifyIcon` from `iconifyx_core` paints via `CustomPaint` with a fixed
/// square size, so wide-aspect glyphs (e.g. the wordmarks shipped in the
/// `logos` Iconify pack) draw beyond their declared bounds and bleed into
/// neighbouring grid cells. Using a [Text] widget lets the layout system see
/// the glyph's true intrinsic ink box, and the wrapping [FittedBox] scales
/// the whole layer uniformly down to fit inside the requested `size × size`.
/// Square glyphs report intrinsic size ≈ fontSize and scale 1:1 — the fast
/// path is a no-op transform.
///
/// Duotone is rendered as a [Stack] of two layers since each must be sized
/// independently by [FittedBox]. The two glyphs share an em-square so both
/// layers end up at the same scale and overlay correctly.
class IconifyThumb extends StatelessWidget {
  const IconifyThumb(
    this.icon, {
    super.key,
    required this.size,
    this.color,
    this.secondaryColor,
    this.secondaryOpacity = 0.4,
    this.paintOrder = false,
  });

  final IconifyIconData icon;
  final double size;
  final Color? color;
  final Color? secondaryColor;
  final double secondaryOpacity;

  /// Z-order switch for paint-order duotone packs (logos, crypto-color,
  /// fluent-emoji-flat, …). The generator's `trySplitTwoColorBody` assigns
  /// the SOURCE-ORDER first paint to `primary` (= background) and the
  /// second to `secondary` (= foreground letterform). For hint-layer
  /// duotone (Phosphor / Solar opacity-fade) the secondary is a faded
  /// BACKDROP and should sit behind the primary — `paintOrder=false`,
  /// the default. For paint-order packs the secondary is the meaningful
  /// FOREGROUND and must render ON TOP of the primary tile or it'd be
  /// completely hidden (the bug: crypto-color icons shipped as just the
  /// background circle because the foreground letter was drawn first
  /// and then painted over by the primary). When `paintOrder=true` we
  /// swap the Stack children so primary is at the bottom and secondary
  /// on top.
  final bool paintOrder;

  @override
  Widget build(BuildContext context) {
    final ambient = IconTheme.of(context);
    final effectiveColor = color ?? ambient.color ?? const Color(0xFF000000);
    final secondary = icon.secondary;

    Widget layer(IconData data, Color tint) => FittedBox(
          fit: BoxFit.contain,
          alignment: Alignment.center,
          child: Text(
            String.fromCharCode(data.codePoint),
            style: TextStyle(
              inherit: false,
              color: tint,
              fontSize: size,
              fontFamily: data.fontFamily,
              package: data.fontPackage,
              height: 1.0,
              leadingDistribution: TextLeadingDistribution.even,
            ),
          ),
        );

    Widget? renderSecondary;
    if (secondary != null) {
      renderSecondary = layer(
        secondary,
        (secondaryColor ?? effectiveColor).withValues(alpha: secondaryOpacity),
      );
    }
    final renderPrimary = layer(icon.primary, effectiveColor);

    return SizedBox(
      width: size,
      height: size,
      child: secondary == null
          ? renderPrimary
          : Stack(
              fit: StackFit.expand,
              children: paintOrder
                  // Paint-order: primary = bg (back), secondary = fg (front).
                  ? [renderPrimary, renderSecondary!]
                  // Hint-layer: secondary = faded backdrop (back), primary
                  // = solid foreground (front). Matches SVG source order
                  // for Phosphor / Solar opacity-fade duotones.
                  : [renderSecondary!, renderPrimary],
            ),
    );
  }
}
