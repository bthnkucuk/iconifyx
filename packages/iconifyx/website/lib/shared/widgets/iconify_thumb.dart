import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// Thin grid-scaling wrapper around [IconifyIcon].
///
/// The website needs to render every icon at a fixed `size × size` cell.
/// `IconifyIcon`'s `CustomPaint` paints a glyph at its em-square — for
/// wide-aspect glyphs (the wordmarks in Iconify's `logos` pack) the ink
/// box can extend beyond declared bounds and bleed into neighbouring
/// cells. Wrapping in [SizedBox] + [FittedBox] uniformly scales the
/// icon's natural ink box to fit inside the cell, with no effect on
/// square glyphs.
///
/// Composition for every duotone flavour is owned by [IconifyIcon] — the
/// website only forwards [color] and (for paint-order packs that want a
/// theme-aware knockout) [secondaryColor]. iconifyx_core ships a
/// hardcoded white fallback for the latter; callers in a themed Material
/// app should pass `Theme.of(context).colorScheme.surface` (or whatever
/// surface colour they want the foreground to "knock out" to). The
/// website's `_CellPalette` resolves the surface colour once per page
/// build and forwards it here so the per-cell path stays Theme.of-free.
class IconifyThumb extends StatelessWidget {
  const IconifyThumb(
    this.icon, {
    super.key,
    required this.size,
    this.color,
    this.secondaryColor,
  });

  final IconifyIconData icon;
  final double size;
  final Color? color;

  /// Forwarded to [IconifyIcon.secondaryColor]. For paint-order duotones
  /// this should be the surface / page background colour the foreground
  /// letterform should "knock out" to.
  final Color? secondaryColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: FittedBox(
        fit: BoxFit.contain,
        alignment: Alignment.center,
        child: IconifyIcon(
          icon,
          size: size,
          color: color,
          secondaryColor: secondaryColor,
        ),
      ),
    );
  }
}
