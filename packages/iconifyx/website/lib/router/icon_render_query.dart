import 'package:flutter/widgets.dart';

/// Decoded slice of the pack/icon URL query parameters that control how
/// every icon on the pack-detail grid (and the icon-detail sheet) is
/// rendered.
///
/// All four params live on `PackDetailRoute` AND on `IconDetailRoute`'s
/// query map — the pack page is where they're MUTATED, the icon page
/// READS them so a direct `/pack/<p>/icon/<x>?size=48&color=2563eb` URL
/// reconstructs the exact same render. When the user taps an icon on the
/// pack page, the pack's queries are forwarded to the icon-detail route's
/// initial queries so the slider state carries across.
///
/// URL forms (all optional, missing → default):
///   `?size=24`               (16..128, default 24)
///   `?color=000000`          (hex no `#`, lowercased, default theme ink)
///   `?secondary=ffffff`      (hex no `#`, default black)
///   `?opacity=0.4`           (0..1, default 0.4 hint / ignored paint-order)
class IconRenderQuery {
  const IconRenderQuery({
    required this.size,
    required this.color,
    required this.secondaryColor,
    required this.secondaryOpacity,
  });

  /// Default render state. `color` / `secondaryColor` are `null` to let
  /// the page resolve theme-appropriate defaults at render time.
  static const IconRenderQuery defaults = IconRenderQuery(
    size: 24,
    color: null,
    secondaryColor: null,
    secondaryOpacity: 0.4,
  );

  /// Pixel size for the rendered glyph. Clamped to 16..128 on parse.
  final double size;

  /// Primary layer colour. `null` = "let the page pick a theme-aware
  /// default" (typically `AppTheme.ink` / `AppTheme.inkDark`).
  final Color? color;

  /// Secondary layer colour for duotone icons. `null` = page default
  /// (black for paint-order knockout, primary tint for hint-layer).
  final Color? secondaryColor;

  /// Alpha applied to the secondary layer for HINT-kind duotones. Has
  /// no effect on paint-order icons (their foreground letterform paints
  /// fully opaque in `secondaryColor`).
  final double secondaryOpacity;

  /// Parse a query map into an [IconRenderQuery].
  factory IconRenderQuery.fromQueries(Map<String, String> qs) {
    return IconRenderQuery(
      size: _parseSize(qs['size']),
      color: _parseHex(qs['color']),
      secondaryColor: _parseHex(qs['secondary']),
      secondaryOpacity: _parseOpacity(qs['opacity']),
    );
  }

  /// Serialise into a query map. Only writes keys whose value diverges
  /// from the page-level default so URLs stay tidy.
  Map<String, String> toQueries(Map<String, String> base) {
    final qs = Map<String, String>.from(base);
    if (size == defaults.size) {
      qs.remove('size');
    } else {
      qs['size'] = size.toStringAsFixed(0);
    }
    if (color == null) {
      qs.remove('color');
    } else {
      qs['color'] = _toHex(color!);
    }
    if (secondaryColor == null) {
      qs.remove('secondary');
    } else {
      qs['secondary'] = _toHex(secondaryColor!);
    }
    if (secondaryOpacity == defaults.secondaryOpacity) {
      qs.remove('opacity');
    } else {
      qs['opacity'] = secondaryOpacity.toStringAsFixed(2);
    }
    return qs;
  }

  IconRenderQuery copyWith({
    double? size,
    Object? color = _sentinel,
    Object? secondaryColor = _sentinel,
    double? secondaryOpacity,
  }) {
    return IconRenderQuery(
      size: size ?? this.size,
      color: identical(color, _sentinel) ? this.color : color as Color?,
      secondaryColor: identical(secondaryColor, _sentinel)
          ? this.secondaryColor
          : secondaryColor as Color?,
      secondaryOpacity: secondaryOpacity ?? this.secondaryOpacity,
    );
  }

  static const Object _sentinel = Object();

  static double _parseSize(String? raw) {
    if (raw == null) return defaults.size;
    final v = double.tryParse(raw);
    if (v == null) return defaults.size;
    return v.clamp(16.0, 128.0);
  }

  static double _parseOpacity(String? raw) {
    if (raw == null) return defaults.secondaryOpacity;
    final v = double.tryParse(raw);
    if (v == null) return defaults.secondaryOpacity;
    return v.clamp(0.0, 1.0);
  }

  static Color? _parseHex(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    var hex = raw.toLowerCase();
    if (hex.startsWith('#')) hex = hex.substring(1);
    if (hex.length == 3) {
      // shorthand `f0c` → `ff00cc`
      hex = hex.split('').map((ch) => '$ch$ch').join();
    }
    if (hex.length == 6) hex = 'ff$hex';
    if (hex.length != 8) return null;
    final v = int.tryParse(hex, radix: 16);
    if (v == null) return null;
    return Color(v);
  }

  static String _toHex(Color c) {
    final argb = c.toARGB32();
    final rgb = argb & 0x00ffffff;
    return rgb.toRadixString(16).padLeft(6, '0');
  }
}
