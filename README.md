# iconifyx

Type-safe, tree-shake-friendly Flutter access to **every** icon set on [icon-sets.iconify.design](https://icon-sets.iconify.design/) — 200+ sets, 300,000+ icons.

```dart
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';

Icon(MdiIcons.home.data, size: 24);
Icon(LucideIcons.house.data, color: Colors.blue);
```

**One package per Iconify set.** Depend only on the sets you use; your bundle ships only those fonts. No category packages, no monolithic dep — Material Design alone, FontAwesome alone, Lucide alone, etc.

## Bundle size

An app that uses two icons from two different sets bundles only those sets' fonts:

| Scenario | Bundle font size |
|---|---|
| Vanilla Flutter app (no icon packages) | ~0 |
| App + `iconifyx_mdi` + `iconifyx_lucide`, two icons used | **~1.1 MB** |
| Same against a monolithic icons dep | 50+ MB |

Tree-shake details (release build with `--tree-shake-icons`, on by default):

| File | Before | After |
|---|---|---|
| `Lucide.ttf` (used: `house`) | 176 KB | **720 B** |
| `Mdi_2.ttf` (used: `home`) | 784 KB | **664 B** |
| `Mdi.ttf` (zero references) | 808 KB | 808 KB |
| `Mdi_3.ttf` (zero references) | 300 KB | 300 KB |

Flutter only subsets fonts where it finds at least one IconData reference; fonts with zero references stay full size but at least your app doesn't ship the other 200 sets. See [test_apps/two_icon_test/](test_apps/two_icon_test/) for the verification harness.

## Quick start

```yaml
# pubspec.yaml
dependencies:
  iconifyx_mdi:
    path: ../path/to/iconifyx_mdi
  iconifyx_lucide:
    path: ../path/to/iconifyx_lucide
```

```dart
import 'package:flutter/material.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';

class MyButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) => IconButton(
    icon: Icon(LucideIcons.house.data),
    onPressed: () {},
  );
}
```

Every icon constant is an `IconifyIconData`. The underlying Flutter `IconData` is exposed via `.data`. The wrapper is a Dart 3.3 extension type, so it has zero runtime cost — at compile time the `IconifyIconData(...)` wrapper disappears and the const `IconData` it wraps survives. That preservation is what makes tree-shaking work.

## Available packages

- **`iconifyx_core`** — `IconifyIconData` wrapper type. Tiny. Every other package depends on it.
- **`iconifyx_<prefix>`** — one per Iconify set. E.g. `iconifyx_mdi`, `iconifyx_lucide`, `iconifyx_tabler`, `iconifyx_simple_icons`, `iconifyx_fa6_solid`, `iconifyx_twemoji`, … (~206 total).
- **`iconifyx`** — meta package re-exporting every per-set package. Convenient when you want to evaluate icons quickly. Bundles every font; avoid in production builds.

Naming rule: take the Iconify prefix from the URL bar at icon-sets.iconify.design (`mdi`, `fa6-solid`, `simple-icons`, …), prepend `iconifyx_`, and replace any `-` with `_`. So:

| Iconify prefix | Pub package | Class |
|---|---|---|
| `mdi` | `iconifyx_mdi` | `MdiIcons` |
| `lucide` | `iconifyx_lucide` | `LucideIcons` |
| `fa6-solid` | `iconifyx_fa6_solid` | `Fa6SolidIcons` |
| `simple-icons` | `iconifyx_simple_icons` | `SimpleIcons` |
| `material-symbols` | `iconifyx_material_symbols` | `MaterialSymbolsIcons` |

## Tree-shaking caveats

- **Flutter Web** has unreliable icon tree-shaking ([flutter#154986](https://github.com/flutter/flutter/issues/154986)). The per-set-package design helps regardless because your web bundle only includes assets from packages you import.
- Within one icon set, Flutter only subsets fonts that have at least one referenced icon. Other split fonts (e.g. `Mdi.ttf` when you only use icons in `Mdi_2.ttf`) ship at source size. This is a Flutter limitation, not something we can avoid.
- Always use `Icon(MyIcon.data)` — passing the wrapper directly to widgets that take `IconData` requires `.data` because the extension type is not implicitly assignable.

## Repository layout

```
iconifyx/
├── packages/
│   ├── iconifyx_core/                Hand-written wrapper. Stable API.
│   ├── iconifyx_<prefix>/            Generated. One directory per Iconify set.
│   └── iconifyx/                     Meta + example app.
├── test_apps/
│   └── two_icon_test/                Bundle-size verification harness.
└── tools/generator/                  Bun TypeScript codegen.
    ├── src/                          Pipeline source.
    ├── manifests/                    Committed state: stable codepoint maps.
    └── config.yaml                   Exclusion list + display category aliases.
```

See [CLAUDE.md](CLAUDE.md) for architecture rationale, [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for the regeneration playbook, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions.

Generator-emitted reports:

- [COVERAGE.md](COVERAGE.md) — per-set Iconify source count vs our built count, sorted by gap. Reveals which sets are partial or fully missing (gradient-only emoji sets, animation packs, etc.).
- [STROKE_AUDIT.md](STROKE_AUDIT.md) — which sets went through the rasterize+trace pre-pass (and why: explicit config vs auto-detected). Use this to spot stroke-only or `fill-rule="evenodd"` sets that render as filled blobs and should be flagged.

## Regenerating (after `bun install`)

```bash
bun run generate                  # rebuild every set (~80 s on M-series, 8 workers)
bun run generate -- --set mdi     # one set
bun run generate -- --new-only    # only sets missing a manifest
bun run generate -- --dry-run     # preview without writing
bun run generate -- --clean       # remove orphan packages + manifests
```

Manifests at `tools/generator/manifests/*.json` are **committed** — they store every icon's stable codepoint forever. Never hand-edit or delete them; consumers' built apps reference these codepoints by integer value.

## Fetching Flutter deps for every package

After cloning or regenerating, every per-set package needs `flutter pub get` once. Doing this by hand for ~210 packages is painful, so a helper script lives at the repo root:

```bash
./pub_get_all.sh                  # 8 parallel pub gets (default)
PARALLELISM=4 ./pub_get_all.sh    # cap parallelism
./pub_get_all.sh --no-fvm         # use bare `flutter` instead of `fvm flutter`
```

The script finds every `pubspec.yaml` under `packages/` and `test_apps/`, runs `fvm flutter pub get` in each, and reports a per-package ✓/✗ summary. Failed packages' logs are kept in a temp dir for inspection. Takes ~30–60 s on first run, much faster on subsequent runs thanks to Flutter's pub cache.

## Example app

```bash
cd packages/iconifyx/example
fvm flutter pub get
fvm flutter run -d macos
```

Browse every bundled set in a paginated drawer view. Filter icons by name. Tap an icon to copy its identifier and codepoint.

## Coverage

215 of 225 Iconify sets currently build successfully (~166,000 live icons). The 10 sets that don't build are dominated by gradients, filters, or animations (color-emoji sets, `svg-spinners`, etc.) that don't translate to a monochrome TTF; see [CLAUDE.md](CLAUDE.md#known-failures) for the list.

**Stroke-only sets** like Lucide, Tabler, Iconoir, Heroicons-outline, mdi-light, Phosphor-thin, Feather — these need their stroked outlines converted to filled outlines before font conversion, otherwise they render as solid blobs in the bundle. The generator handles this automatically for sets listed under `strokeFillSets` in `tools/generator/config.yaml`. First run is slow (~10–20 s per stroke set) because each icon is rasterized + Potrace-traced; subsequent runs are nearly instant thanks to disk-cached results.

**Duo-tone icons** (Phosphor `*-duotone`, Solar `*-bold-duotone`, IC family, ~36 sets total / ~5.9k icons) get split into two separate glyphs per icon — primary (full opacity) and secondary (translucent). The package emits both in a single class:

```dart
import 'package:iconifyx_ph/iconifyx_ph.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

IconifyDuotoneIcon(
  PhIcons.acornDuotonePrimary,
  PhIcons.acornDuotoneSecondary,
  primaryColor: Colors.blue,
  secondaryColor: Colors.red,
  secondaryOpacity: 0.5,
)
```

Stack-based rendering composes the two `Icon` widgets at runtime. Tree-shake works on each layer independently.

## License

The generator code (under `tools/`) and the wrapper package (`iconifyx_core`) are MIT-licensed.

Each bundled icon set keeps its own license — Apache 2.0, MIT, CC-BY, OFL, etc. Per-set licenses are listed in each set's `LICENSE-3RD-PARTY.md` and programmatically available via the `iconSetLicense` const each set package exports.
