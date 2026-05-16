# iconifyx documentation

iconifyx packages every Iconify icon set as a tree-shake-friendly
Flutter package. This is the long-form documentation set.

## Topics

- **[Architecture](architecture.md)** — why `IconifyIconData` is an
  extension type, the per-pack package layout, single-TTF-per-pack
  (§32), the determinism contract.
- **[Duotone rendering](duotone.md)** — the three duotone kinds
  (hint / paint-order / mask-internal), how the `IconifyIcon` widget
  composes them with a single `CustomPaint`.
- **[Flutter 3.44 and `final class IconData`](flutter-3-44-icondata.md)** —
  why the extension type pattern is also forward-compatible with
  Flutter's upcoming subclass-prohibition migration.
- **[Generator pipeline](pipeline.md)** — what the codegen actually
  does, in order: load → duotone split → rasterize → drop → validate →
  allocate → build → merge → emit.

## Quick install

```yaml
dependencies:
  iconifyx_core: ^0.1.0
  iconifyx_mdi:    ^0.1.0
  iconifyx_lucide: ^0.1.0
```

```dart
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';

IconifyIcon(MdiIcons.home, size: 24, color: Colors.indigo);
```

`flutter build --release` bundles only the glyphs you reference — see
[Architecture](architecture.md) for the empirical numbers.

## Reporting issues

[github.com/bthnkucuk/iconifyx](https://github.com/bthnkucuk/iconifyx)
