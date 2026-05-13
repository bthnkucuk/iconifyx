import 'package:flutter/widgets.dart';

/// Type-safe wrapper around one or two [IconData] glyphs for Iconify icons.
///
/// One uniform shape covers both regular (single-layer) and duo-tone
/// (two-layer) icons. The representation is a record of
/// `(primary, secondary?)` IconData; the secondary slot is `null` for
/// regular icons and non-null for duotone ones.
///
/// Defined as a Dart 3.3+ `extension type const` so the wrapper is
/// zero-cost at compile time — the kernel sees the record directly and
/// every inner `const IconData(...)` stays visible to Flutter's
/// `--tree-shake-icons` analysis. A regular class wrapper would silently
/// break tree-shaking (Flutter issue #63920).
///
/// Render with [IconifyIcon]; it inspects [isDuotone] and renders both
/// layers when present, so callers don't need to know which variant they
/// are holding.
extension type const IconifyIconData(
  (IconData primary, IconData? secondary) _layers
) {
  /// Constructor for a regular (single-layer) icon.
  const IconifyIconData.solo(IconData icon) : this((icon, null));

  /// Constructor for a duo-tone (two-layer) icon. The two glyphs typically
  /// share the same codepoint in paired primary / secondary fonts (e.g.
  /// `Ph` + `PhSecondary`).
  const IconifyIconData.duo(IconData primary, IconData secondary)
      : this((primary, secondary));

  /// The primary (full-opacity) glyph. Always present.
  IconData get primary => _layers.$1;

  /// The secondary (translucent) glyph. `null` for regular icons.
  IconData? get secondary => _layers.$2;

  /// `true` if this icon carries a secondary layer.
  bool get isDuotone => _layers.$2 != null;
}
