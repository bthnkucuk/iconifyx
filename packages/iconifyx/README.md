# iconifyx (meta)

Convenience meta package that re-exports every `iconifyx_<prefix>` per-set package. Use this for one-line access to every bundled Iconify set during prototyping:

```yaml
dependencies:
  iconifyx:
    path: ../path/to/iconifyx
```

```dart
import 'package:iconifyx/iconifyx.dart';

Icon(MdiIcons.home.data);
Icon(SimpleIcons.github.data);
Icon(TwemojiIcons.smile.data);
Icon(CircleFlagsIcons.us.data);
```

## When to use the meta package vs. per-set packages

- **Use the meta package** when prototyping or when bundle size doesn't matter. Every Iconify font ends up in the bundle (~70 MB of TTF assets).
- **Use specific per-set packages** in production: `iconifyx_mdi`, `iconifyx_lucide`, etc. Your bundle ships only those sets' fonts. Two-icon apps grow by ~1 MB instead of 70 MB.

The two import styles are otherwise identical — the same `<Prefix>Icons` classes resolve.

## Example app

The example app at `example/` is a browser UI that walks every bundled set.

```bash
cd example
fvm flutter pub get
fvm flutter run -d macos
```

The example uses every icon, so its tree-shake numbers aren't representative. For a clean bundle-size verification, use [`test_apps/two_icon_test/`](../../test_apps/two_icon_test/) at the repo root.
