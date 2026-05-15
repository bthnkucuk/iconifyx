import 'package:flutter/widgets.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// Thin pass-through to [IconifyIcon] for grid cells.
///
/// `IconifyIcon` already wraps each glyph in a `FittedBox(BoxFit.contain)`
/// internally, so wide-aspect logos wordmarks scale down to the requested
/// `size × size`. This widget exists purely so the website has a single
/// import-site for "render an icon" — historically `IconifyThumb` carried
/// its own composition + Stack logic, but that all lives in
/// `IconifyIcon` now. Callers forward [color] and (for paint-order
/// duotones that want a theme-aware knockout) [secondaryColor].
class IconifyThumb extends StatelessWidget {
  const IconifyThumb(
    this.icon, {
    super.key,
    required this.size,
    this.color,
    this.secondaryColor,
    this.swapLayers = false,
  });

  final IconifyIconData icon;
  final double size;
  final Color? color;

  /// Forwarded to [IconifyIcon.secondaryColor]. For paint-order duotones
  /// this should be the surface / page background colour the foreground
  /// letterform should knock out to.
  final Color? secondaryColor;

  /// Debug-only flag. When true and [icon] is a duotone, reconstruct
  /// the [IconifyIconData] with `primary` <-> `secondary` swapped (kind
  /// preserved). Lets the website spot icons whose source-order-based
  /// two-color split picked the wrong "first" colour as background.
  /// No-op for solo icons.
  final bool swapLayers;

  @override
  Widget build(BuildContext context) {
    IconifyIconData effective = icon;
    if (swapLayers) {
      final s = icon.secondary;
      if (s != null) {
        effective = IconifyIconData.duo(s, icon.primary, kind: icon.kind);
      }
    }
    return IconifyIcon(
      effective,
      size: size,
      color: color,
      secondaryColor: secondaryColor,
    );
  }
}
