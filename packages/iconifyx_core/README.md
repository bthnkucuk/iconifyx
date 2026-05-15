# iconifyx_core

Shared type + widget definitions for the `iconifyx` family. This package
contains no icons — it's a small stable dependency that every
`iconifyx_<prefix>` per-set package relies on, plus the [IconifyIcon]
widget consumers use to render those icons.

Depends ONLY on `flutter/widgets`. No Material context required.

## Contents

### `IconifyIconData`

A Dart 3.3 `extension type const` over a record. One shape covers solo
icons AND every duotone flavour:

```dart
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  static const int kindSolo = 0;
  static const int kindHint = 1;          // Phosphor / Solar opacity-fade
  static const int kindPaintOrder = 2;    // logos / crypto-color two-fill
  static const int kindMaskInternal = 3;  // lets-icons *-duotone-line

  const IconifyIconData.solo(IconData icon);
  const IconifyIconData.duo(
    IconData primary,
    IconData secondary, {
    int kind = kindHint,
  });

  IconData get primary;
  IconData? get secondary;
  int get kind;
  bool get isDuotone;
  bool get isPaintOrderDuotone;
}
```

Why the record-based extension type: tree-shake. Dart 3.3+ erases extension
types at compile time; Flutter's `const_finder` (driven by `--tree-shake-
icons`) walks records and detects every inner `const IconData(...)`. A
plain class wrapper would silently break tree-shake — `font_awesome_flutter`
ships with broken tree-shake for exactly this reason (Flutter issue #63920).

The extra `int kindCode` doesn't affect tree-shake — it's inert data sitting
beside the const-traversable `IconData` fields.

#### Kinds

| Kind | What | Render default |
|---|---|---|
| `kindSolo` | Single layer | one glyph in `color` |
| `kindHint` | Phosphor `*-duotone`, Solar `*-duotone`, ic battery, Iconamoon. Secondary is a translucent backdrop. | secondary BEHIND primary at 40% opacity (same colour) |
| `kindPaintOrder` | logos, cryptocurrency-color, fluent-emoji-flat, twemoji, noto, vscode-icons, gcp. Secondary is the meaningful foreground letterform. | primary BEHIND, secondary ON TOP at 100% opacity (caller-provided `secondaryColor`, fallback white) |
| `kindMaskInternal` | lets-icons `*-duotone-line` family. Visually a hint-layer; the field is kept separately for audit. | same as `kindHint` |

### `IconifyIcon` widget

Drop-in replacement for [Icon] that renders any `IconifyIconData` flavour
with one constructor:

```dart
IconifyIcon(MdiIcons.home, color: Colors.indigo, size: 24)
IconifyIcon(PhIcons.acornDuotone, color: Colors.black, size: 24)
IconifyIcon(LogosIcons.adobeAfterEffects, size: 24)
IconifyIcon(LetsIconsIcons.addRoundDuotoneLine, size: 24)
```

The widget inspects `icon.kind` and composes the layers automatically — no
flags at the call site. For paint-order icons rendered against a known
surface, pass the surface colour as `secondaryColor` so the foreground
letterform "knocks out" against the primary background tile:

```dart
IconifyIcon(
  LogosIcons.adobeAfterEffects,
  size: 24,
  secondaryColor: Theme.of(context).colorScheme.surface,
)
```

Without an explicit `secondaryColor`, paint-order falls back to
`IconifyIcon.paintOrderSecondaryFallback` (white) — readable against
most dark colored tiles but the consumer with a known theme should
override.

Implementation: one `CustomPaint` with cached, laid-out `TextPainter`
instances per layer. The painter applies a `BoxFit.contain` emulating
scale + centre transform so wide-aspect glyphs (the wordmarks in Iconify's
`logos` pack) scale down to fit the requested `size × size`. One render
layer, no Stack overhead.

### `IconSetLicense`

Metadata for one Iconify set, exposed by every per-set package's
`iconSetLicense` const.

```dart
const IconSetLicense({
  required String prefix,
  required String name,
  String? author,
  String? authorUrl,
  required String licenseTitle,
  String? licenseSpdx,
  String? licenseUrl,
  required int iconCount,
});
```

## Stability

This package is **hand-written** and **not regenerated**. The API surface
is intentionally tiny so the generator and consumers can rely on it
without churn. Adding new duotone flavours adds a new `kind*` constant +
a new handler in `IconifyIcon` — no schema break.
