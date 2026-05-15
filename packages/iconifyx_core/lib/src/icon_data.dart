import 'package:flutter/widgets.dart';

/// Type-safe wrapper around one or two [IconData] glyphs for Iconify icons.
///
/// One uniform shape covers regular (single-layer) icons AND every flavour
/// of duo-tone we ship. The representation is a record of
/// `(primary, secondary?, kind)`:
///
/// - `secondary` is `null` for regular icons, non-null for duotone.
/// - `kind` distinguishes how the two layers should compose visually.
///
/// Defined as a Dart 3.3+ `extension type const` so the wrapper is
/// zero-cost at compile time — the kernel sees the record directly and
/// every inner `const IconData(...)` stays visible to Flutter's
/// `--tree-shake-icons` analysis. A regular class wrapper would silently
/// break tree-shaking (Flutter issue #63920); the extra `int` field is
/// just inert data sitting beside the const-traversable IconData fields.
///
/// Render with [IconifyIcon]; it inspects the kind and renders the right
/// composition automatically, so callers don't need to think about which
/// flavour they're holding:
///
/// ```dart
/// IconifyIcon(MdiIcons.home)                  // solo
/// IconifyIcon(PhIcons.acornDuotone)           // hint-layer (auto)
/// IconifyIcon(LogosIcons.adobeAfterEffects)   // paint-order (auto)
/// ```
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  /// Kind = solo (single-layer icon, no secondary).
  static const int kindSolo = 0;

  /// Kind = hint-layer duotone (Phosphor / Solar / ic / Iconamoon, etc.).
  /// The secondary is a translucent backdrop element split from an opacity
  /// attribute on the source SVG. Default render: secondary BEHIND primary,
  /// at 40% opacity, same colour.
  static const int kindHint = 1;

  /// Kind = paint-order duotone (logos, cryptocurrency-color, fluent-emoji-
  /// flat, twemoji, noto, vscode-icons, etc.). The two layers were split
  /// from a 2-fill body where the first paint is the background tile and
  /// the second is the meaningful foreground letterform / contrast shape.
  /// Default render: primary BEHIND (full opacity, currentColor),
  /// secondary ON TOP (full opacity, defaults to the ambient `surface`
  /// colour so the foreground "knocks out" of the background tile).
  static const int kindPaintOrder = 2;

  /// Kind = mask-internal duotone (lets-icons `*-duotone-line` family).
  /// Visually behaves like a hint-layer duotone — bold primary on top,
  /// faint secondary backdrop — so renders the same as [kindHint], but the
  /// field is preserved separately so audit / pipeline code can tell the
  /// two apart.
  static const int kindMaskInternal = 3;

  /// Solo (single-layer) icon.
  const IconifyIconData.solo(IconData icon) : this((icon, null, kindSolo));

  /// Hint-layer duotone (the default duotone flavour).
  const IconifyIconData.duo(IconData primary, IconData secondary)
      : this((primary, secondary, kindHint));

  /// Paint-order duotone. The secondary is the FOREGROUND, drawn ON TOP
  /// of the primary background tile.
  const IconifyIconData.duoPaintOrder(IconData primary, IconData secondary)
      : this((primary, secondary, kindPaintOrder));

  /// Mask-internal duotone. Renders identically to a hint-layer duotone.
  const IconifyIconData.duoMaskInternal(IconData primary, IconData secondary)
      : this((primary, secondary, kindMaskInternal));

  /// The primary glyph. Always present.
  IconData get primary => _layers.$1;

  /// The secondary glyph. `null` for solo icons.
  IconData? get secondary => _layers.$2;

  /// One of [kindSolo] / [kindHint] / [kindPaintOrder] / [kindMaskInternal].
  int get kind => _layers.$3;

  /// `true` if this icon carries a secondary layer (any duotone flavour).
  bool get isDuotone => _layers.$2 != null;

  /// `true` for paint-order duotones — [IconifyIcon] uses this to flip
  /// the layer Z-order so the foreground renders on top.
  bool get isPaintOrderDuotone => kind == kindPaintOrder;
}
