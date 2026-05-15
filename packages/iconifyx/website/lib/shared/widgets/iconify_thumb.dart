import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// Thin grid-scaling wrapper around [IconifyIcon].
///
/// The website needs to render every icon at a fixed `size × size` cell.
/// `IconifyIcon`'s `CustomPaint` paints a glyph at its em-square — for
/// wide-aspect glyphs (the wordmarks in Iconify's `logos` pack) that
/// means the ink box can extend beyond the declared bounds and bleed into
/// neighbouring cells. Wrapping in a [SizedBox] + [FittedBox] uniformly
/// scales the icon's natural ink box to fit inside the cell, with no
/// effect on square glyphs (the FittedBox is a no-op transform when the
/// child already fits).
///
/// Duotone composition, paint-order Z-order, and secondary defaults are
/// all handled by [IconifyIcon] based on [IconifyIconData.kind] — callers
/// just hand the icon over.
class IconifyThumb extends StatelessWidget {
  const IconifyThumb(
    this.icon, {
    super.key,
    required this.size,
    this.color,
  });

  final IconifyIconData icon;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: FittedBox(
        fit: BoxFit.contain,
        alignment: Alignment.center,
        child: IconifyIcon(icon, size: size, color: color),
      ),
    );
  }
}
