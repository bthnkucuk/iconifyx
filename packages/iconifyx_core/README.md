# iconifyx_core

Shared type definitions for the `iconifyx` family. This package contains no icons — it's a small stable dependency that every `iconifyx_<prefix>` per-set package relies on.

## Contents

### `IconifyIconData`

A Dart 3.3 `extension type const` that wraps `IconData` for type safety:

```dart
extension type const IconifyIconData(IconData data) {
  int get codePoint => data.codePoint;
  String? get fontFamily => data.fontFamily;
  String? get fontPackage => data.fontPackage;
  bool get matchTextDirection => data.matchTextDirection;
}
```

Use it as:

```dart
Icon(MdiIcons.home.data, size: 24);
```

The wrapper has **zero runtime cost** — at compile time it erases to the underlying `IconData`. The reason it exists is to make Flutter's `--tree-shake-icons` build flag work correctly while still giving the type system a way to mark which constants are Iconify icons.

### `IconSetLicense`

Metadata for one Iconify set, exposed by every per-set package's `iconSetLicense` const.

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

This package is **hand-written** and **not regenerated**. The API surface is intentionally tiny so the generator and consumers can rely on it without churn.
