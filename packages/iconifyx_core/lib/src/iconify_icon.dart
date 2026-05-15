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
///   same colour as primary. Matches FontAwesome-style duotones.
/// - **Paint-order duotone** — primary BEHIND (the background tile),
///   secondary ON TOP at full opacity. Caller should pass a contrasting
///   [secondaryColor] (e.g. the page background); without one the
///   foreground falls back to white.
/// - **Mask-internal duotone** — same render as hint-layer.
///
/// Implementation note: each layer renders through a [Text] widget so
/// Flutter's standard text pipeline handles async font loading (via the
/// `RenderParagraph` font-listener mechanism). The wrapping [FittedBox]
/// scales the glyph's actual ink box to fit the requested `size × size`,
/// which uniformly handles wide-aspect glyphs (the wordmarks shipped in
/// the Iconify `logos` pack would otherwise overflow the cell). Layer
/// composition is via [Stack] with kind-aware z-order.
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

    final IconData? secondary = icon.secondary;
    final bool paintOrder = icon.isPaintOrderDuotone;
    Color? effectiveSecondary;
    if (secondary != null) {
      final Color secBase = secondaryColor ??
          (paintOrder ? paintOrderSecondaryFallback : effectiveColor);
      final double secAlpha = secondaryOpacity ?? (paintOrder ? 1.0 : 0.4);
      effectiveSecondary = secBase.withValues(alpha: secAlpha);
    }

    Widget layer(IconData data, Color tint) => FittedBox(
          fit: BoxFit.contain,
          alignment: Alignment.center,
          child: Text(
            String.fromCharCode(data.codePoint),
            style: TextStyle(
              inherit: false,
              color: tint,
              fontSize: effectiveSize,
              fontFamily: data.fontFamily,
              package: data.fontPackage,
              height: 1.0,
              leadingDistribution: TextLeadingDistribution.even,
              shadows: shadows,
            ),
            textAlign: TextAlign.center,
            textDirection: textDirection,
          ),
        );

    Widget body;
    if (secondary == null) {
      body = layer(icon.primary, effectiveColor);
    } else {
      final primaryLayer = layer(icon.primary, effectiveColor);
      final secondaryLayer = layer(secondary, effectiveSecondary!);
      body = Stack(
        fit: StackFit.expand,
        children: paintOrder
            // Paint-order: primary = bg (back), secondary = fg (front).
            // Stack children paint in list order — first is bottom.
            ? [primaryLayer, secondaryLayer]
            // Hint-layer / mask-internal: secondary = faded backdrop
            // (back), primary = solid on top.
            : [secondaryLayer, primaryLayer],
      );
    }

    return Semantics(
      label: semanticLabel,
      excludeSemantics: semanticLabel == null,
      child: SizedBox(
        width: effectiveSize,
        height: effectiveSize,
        child: body,
      ),
    );
  }
}
