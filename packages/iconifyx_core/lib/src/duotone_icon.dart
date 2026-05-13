import 'package:flutter/widgets.dart';

import 'icon_data.dart';

/// Renders a duo-tone icon by stacking its two layers:
///  - The **secondary** layer is drawn first, with reduced opacity so it
///    fades into the background (default 40%, matching FontAwesome's
///    duotone convention).
///  - The **primary** layer is drawn on top at full opacity.
///
/// Both layers default to the ambient [IconTheme] color. Override
/// [primaryColor], [secondaryColor], and [secondaryOpacity] independently to
/// customise the look.
///
/// Tree-shaking note: this widget composes two separate `IconifyIconData`
/// constants (one per layer), each of which is a `static const` field in the
/// generated `<Prefix>Icons` class. The `--tree-shake-icons` build flag sees
/// both as ordinary const IconData references and subsets each underlying
/// TTF accordingly — no special handling required.
class IconifyDuotoneIcon extends StatelessWidget {
  /// The primary (full-opacity) layer.
  final IconifyIconData primary;

  /// The secondary (translucent) layer. Drawn under the primary.
  final IconifyIconData secondary;

  /// Pixel size of the icon. Defaults to the ambient [IconTheme] size.
  final double? size;

  /// Colour for the primary layer. Defaults to the ambient [IconTheme] colour.
  final Color? primaryColor;

  /// Colour for the secondary layer. Defaults to [primaryColor] (and ultimately
  /// the ambient [IconTheme] colour).
  final Color? secondaryColor;

  /// Opacity for the secondary layer. Defaults to 0.4.
  final double secondaryOpacity;

  /// Optional semantic label forwarded to both layers.
  final String? semanticLabel;

  /// Text direction forwarded to both layers; defaults to ambient.
  final TextDirection? textDirection;

  const IconifyDuotoneIcon(
    this.primary,
    this.secondary, {
    super.key,
    this.size,
    this.primaryColor,
    this.secondaryColor,
    this.secondaryOpacity = 0.4,
    this.semanticLabel,
    this.textDirection,
  });

  /// Named-parameter constructor for cases where call-site readability is
  /// preferred over positional arguments.
  const IconifyDuotoneIcon.layers({
    super.key,
    required this.primary,
    required this.secondary,
    this.size,
    this.primaryColor,
    this.secondaryColor,
    this.secondaryOpacity = 0.4,
    this.semanticLabel,
    this.textDirection,
  });

  @override
  Widget build(BuildContext context) {
    final iconTheme = IconTheme.of(context);
    final effectiveSize = size ?? iconTheme.size;
    final effectivePrimary = primaryColor ?? iconTheme.color;
    final effectiveSecondaryBase = secondaryColor ?? effectivePrimary;
    final effectiveSecondary =
        effectiveSecondaryBase?.withValues(alpha: secondaryOpacity);

    // Both child Icon widgets are sized identically; Flutter stacks them
    // top-left aligned which is what we want for icon fonts (each glyph
    // occupies the whole em-square).
    return Stack(
      alignment: Alignment.center,
      children: [
        Icon(
          secondary.data,
          size: effectiveSize,
          color: effectiveSecondary,
          semanticLabel: semanticLabel,
          textDirection: textDirection,
        ),
        Icon(
          primary.data,
          size: effectiveSize,
          color: effectivePrimary,
          semanticLabel: semanticLabel,
          textDirection: textDirection,
        ),
      ],
    );
  }
}
