import 'package:flutter/widgets.dart';

/// Type-safe wrapper around one or two [IconData] glyphs for Iconify icons.
///
/// One uniform shape covers regular (single-layer) icons AND every flavour
/// of duo-tone we ship. The representation is a record of
/// `(primary, secondary?, kindCode)`:
///
/// - `secondary` is `null` for regular icons, non-null for duotone.
/// - `kindCode` distinguishes how the two layers should compose visually.
///
/// Defined as a Dart 3.3+ `extension type const` so the wrapper is
/// zero-cost at compile time — the kernel sees the record directly and
/// every inner `const IconData(...)` stays visible to Flutter's
/// `--tree-shake-icons` analysis. A regular class wrapper would silently
/// break tree-shaking (Flutter issue #63920); the extra `int` field is
/// just inert data sitting beside the const-traversable IconData fields.
///
/// Render with [IconifyIcon]; it inspects the kind and renders the right
/// composition automatically:
///
/// ```dart
/// IconifyIcon(MdiIcons.home)                  // solo
/// IconifyIcon(PhIcons.acornDuotone)           // hint-layer duotone
/// IconifyIcon(LogosIcons.adobeAfterEffects)   // paint-order duotone
/// ```
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  /// Kind = solo (single-layer icon, no secondary).
  static const int kindSolo = 0;

  /// Kind = hint-layer duotone (Phosphor / Solar / ic / Iconamoon, etc.).
  /// The secondary is a translucent backdrop split from an `opacity`
  /// attribute on the source SVG. Default render: secondary BEHIND
  /// primary at 40% opacity in the primary colour.
  static const int kindHint = 1;

  /// Kind = paint-order duotone (logos / cryptocurrency-color / fluent-
  /// emoji-flat / twemoji / noto / vscode-icons / gcp / token-branded).
  /// The two layers were split from a 2-fill body where the first paint
  /// is the background tile and the second is the meaningful foreground.
  /// Default render: primary BEHIND (currentColor), secondary ON TOP at
  /// full opacity. The caller provides a contrasting `secondaryColor`
  /// (typically the page surface) — otherwise the foreground falls back
  /// to white.
  static const int kindPaintOrder = 2;

  /// Kind = mask-internal duotone (lets-icons `*-duotone-line` family).
  /// Visually behaves like a hint-layer duotone; the field is kept
  /// separately so audit code can tell the two apart.
  static const int kindMaskInternal = 3;

  /// Solo (single-layer) icon.
  const IconifyIconData.solo(IconData icon) : this((icon, null, kindSolo));

  /// Two-layer (duotone) icon. `kind` defaults to [kindHint]; pass
  /// [kindPaintOrder] or [kindMaskInternal] for icons whose split path
  /// produced a foreground-on-background structure or an inverse-mask
  /// flavour respectively.
  const IconifyIconData.duo(
    IconData primary,
    IconData secondary, {
    int kind = kindHint,
  }) : this((primary, secondary, kind));

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
