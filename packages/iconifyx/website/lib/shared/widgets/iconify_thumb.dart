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
  });

  final IconifyIconData icon;
  final double size;
  final Color? color;
  final Color? secondaryColor;
  final double secondaryOpacity;

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

    return SizedBox(
      width: size,
      height: size,
      child: secondary == null
          ? layer(icon.primary, effectiveColor)
          : Stack(
              fit: StackFit.expand,
              children: [
                layer(
                  secondary,
                  (secondaryColor ?? effectiveColor)
                      .withValues(alpha: secondaryOpacity),
                ),
                layer(icon.primary, effectiveColor),
              ],
            ),
    );
  }
}
