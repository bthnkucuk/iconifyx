# iconifyx

Type-safe, tree-shake-friendly Flutter access to **every** icon set on [icon-sets.iconify.design](https://icon-sets.iconify.design/) — 200+ sets, 300,000+ icons.

```dart
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

IconifyIcon(MdiIcons.home, size: 24);
IconifyIcon(LucideIcons.house, color: Colors.blue);
```

**One package per Iconify set.** Depend only on the sets you use; your bundle ships only those fonts. No category packages, no monolithic dep — Material Design alone, FontAwesome alone, Lucide alone, etc.

## Bundle size

Empirically measured: **your app bundle grows by roughly the number of icons you reference, NOT by the number of packs**. Tree-shake works end-to-end on macOS desktop release, Flutter web (CanvasKit) release, and iOS — verified Flutter 3.44.

| Scenario | Bundle font size |
|---|---|
| Vanilla Flutter app (no icon packages) | ~0 |
| **3 icons across 3 packs** (mdi + lucide + tabler) | **2.5 KB** |
| **50 icons across 10 packs** | **~18 KB** |
| Same against a monolithic icons dep (or `iconifyx` meta) | 30+ MB |

Per-glyph cost in a release build with `--tree-shake-icons` (default-on):

| Scenario | Bundled TTF size |
|---|---|
| `Mdi.ttf` (used: 1 icon) | ~700 B |
| `Lucide.ttf` (used: 5 icons) | ~2 KB |
| `Tabler.ttf` (used: 5 icons) | ~2 KB |

Every pack ships exactly ONE primary TTF (plus one Secondary for duotone packs). The generator merges multi-sibling auto-split fonts internally via `cmap format 12` + Supplementary PUA codepoints, so Flutter's per-pack `font-subset` runs against a single file with no "unreferenced sibling" tax. See [test_apps/treeshake_regression/](test_apps/treeshake_regression/) for the canonical bundle-size regression harness; CI enforces total < 35 KB for the 10-pack / 50-icon scenario.

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
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

class MyButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) => IconButton(
    icon: IconifyIcon(LucideIcons.house),
    onPressed: () {},
  );
}
```

Every icon constant is an `IconifyIconData` — a Dart 3.3 extension type over a `(IconData primary, IconData? secondary, int kindCode)` record. The `IconifyIcon` widget auto-detects the duotone kind from the record and composes layers correctly: hint-layer (Phosphor / Solar / ic), paint-order (logos / cryptocurrency-color / fluent-emoji-flat), or mask-internal (lets-icons `*-duotone-line`). One `CustomPaint`, no `Stack`. At compile time the wrapper disappears and the const `IconData`s survive — tree-shake-friendly. If you must pass a raw `IconData` to a Flutter widget that takes one (e.g. `Icon`), use `.primary`.

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
- Prefer `IconifyIcon(MyIcon)` — it handles both regular and duotone glyphs and uses `package:` correctly in its `TextStyle`. If you must use Flutter's `Icon` widget, pass the primary half via `Icon(MyIcon.primary)` (the extension type is not implicitly assignable to `IconData`).

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

221 of 225 Iconify sets currently build successfully (~166k non-synthetic live icons; ~338k including synthesised weight variants like Lucide `-thin`/`-light`/`-bold`). The 4 sets that don't build are dominated by gradients, filters, or animations that don't translate to a monochrome TTF (`svg-spinners`, `streamline-kameleon-color`, `fluent-color`, `circle-flags`); see [CLAUDE.md](CLAUDE.md#known-failures) for the list.

**Stroke-only sets** like Lucide, Tabler, Iconoir, Heroicons-outline, mdi-light, Phosphor-thin, Feather — these need their stroked outlines converted to filled outlines before font conversion, otherwise they render as solid blobs in the bundle. The generator handles this automatically for sets listed under `strokeFillSets` in `tools/generator/config.yaml`. First run is slow (~10–20 s per stroke set) because each icon is rasterized + Potrace-traced; subsequent runs are nearly instant thanks to disk-cached results.

Even on packs whose pack-level signal sits below the auto-detect threshold (e.g. `oui` at 16% evenodd), the pipeline runs a **per-icon raster-trace fallback**: any individual icon body with `fill-rule="evenodd"` or stroke-only paint gets traced one-by-one so it doesn't ship as a featureless blob. Roughly 4.6k icons across ~30 packs are quietly rescued this way each regen.

**Duo-tone icons** ship as a single const per icon using `IconifyIconData.duo(primary, secondary, kind: ...)`. Three detection paths produce three rendering flavours, all dispatched automatically by `IconifyIcon`:

1. **Opacity-based hint-layer** (Phosphor `*-duotone`, Solar `*-bold-duotone`, IC family, Iconamoon, …) — bodies with one element at `opacity<1` / `fill-opacity<1` / `stroke-opacity<1`. Render: secondary BEHIND primary at 40% opacity in primary colour. `kind: IconifyIconData.kindHint` (default).
2. **Two-color paint-order** (`logos`, `cryptocurrency-color`, `fluent-emoji-flat`, `twemoji`, `noto`, `vscode-icons`, `gcp`, `token-branded`) — bodies with exactly two distinct fills split into background (primary) + foreground (secondary). Render: primary BEHIND, secondary ON TOP at 100% opacity (caller supplies a contrasting `secondaryColor`, fallback white). `kind: kindPaintOrder`.
3. **Mask-internal** (`lets-icons` `*-duotone-line` family) — bodies built around an inverse-mask pattern with luminance-based child classification. Renders like hint-layer. `kind: kindMaskInternal`.

```dart
import 'package:iconifyx_ph/iconifyx_ph.dart';
import 'package:iconifyx_logos/iconifyx_logos.dart';

// Hint-layer — auto detected, no caller knowledge needed.
IconifyIcon(PhIcons.acornDuotone, color: Colors.blue);

// Paint-order — pass a knockout colour for the foreground letterform.
IconifyIcon(
  LogosIcons.adobeAfterEffects,
  size: 24,
  secondaryColor: Theme.of(context).colorScheme.surface,
);
```

Without `secondaryColor`, paint-order falls back to `IconifyIcon.paintOrderSecondaryFallback` (white) — readable against most dark coloured tiles. Both layers render in a single `CustomPaint` (no `Stack`), and tree-shake works on each layer's `IconData` independently.

**Animation flattening** — for packs that ship reveal-style SMIL animations (line-md, certain icon-park variants), the pipeline extracts each `<animate>` element's most-visible value (smallest `stroke-dashoffset`, largest `opacity`, last `to=`/`values=`) and applies it as a static attribute to the parent element before rasterizing. Result: line-md's 1,279 reveal icons + ~30 transition icons all ship with their content fully drawn.

## License

The generator code (under `tools/`) and the wrapper package (`iconifyx_core`) are MIT-licensed.

Each bundled icon set keeps its own license — Apache 2.0, MIT, CC-BY, OFL, etc. Per-set licenses are listed in each set's `LICENSE-3RD-PARTY.md` and programmatically available via the `iconSetLicense` const each set package exports.
