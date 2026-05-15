import 'package:flutter/material.dart';

import '../bootstrap/icon_catalog.dart';

/// Plain Iconify CDN URL for an icon — what the icon looks like upstream,
/// no tint applied. Used in defect-report bodies so the link is stable.
String iconifySvgUrl(IconRecord r) =>
    'https://api.iconify.design/${r.prefix}/${r.name}.svg';

/// Iconify CDN URL with an explicit `?color=` query param so monochrome
/// icons (whose paths use `currentColor`) render in the requested tint
/// instead of defaulting to black. Multi-color icons (`logos`, color
/// emojis) ignore the param and keep their own palette — which is exactly
/// what we want when comparing the source to our TTF output.
String iconifySvgUrlTinted(IconRecord r, Color tint) {
  final argb = tint.toARGB32();
  final hex = (argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0');
  return 'https://api.iconify.design/${r.prefix}/${r.name}.svg?color=%23$hex';
}
