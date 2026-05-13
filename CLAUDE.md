# Project: iconifyx

A Flutter package family + Bun TypeScript generator that takes **all** Iconify icon sets and emits tree-shake-friendly Dart classes plus per-set TTF fonts.

Read this file before doing any work in this repo. The structure, generation rules, and design constraints below are load-bearing — many of them are non-obvious and were chosen after specific failure modes were ruled out.

## Repo layout

```
icons/
├── packages/
│   ├── iconifyx_core/         # HAND-WRITTEN: IconifyIconData wrapper + IconSetLicense type
│   ├── iconifyx_<prefix>/     # GENERATED: one package per Iconify set (~206 packages)
│   │     ├── lib/
│   │     │   ├── iconifyx_<prefix>.dart     # GENERATED top-level library
│   │     │   └── src/
│   │     │       ├── sets/<prefix>.dart              # GENERATED <Prefix>Icons class
│   │     │       └── license.dart                    # GENERATED iconSetLicense const
│   │     ├── assets/fonts/*.ttf                      # GENERATED (one or more per set)
│   │     ├── pubspec.yaml                            # GENERATED
│   │     └── LICENSE-3RD-PARTY.md                    # GENERATED
│   └── iconifyx/              # META: re-exports every set package + Flutter example app
└── tools/generator/                    # Bun TypeScript codegen pipeline
    ├── src/                            # All generator logic
    ├── manifests/<prefix>.json         # COMMITTED state — stable codepoint maps per set
    └── config.yaml                     # exclusions + display category aliases
```

**One package per Iconify set.** This is the key design decision (revised 2026-05-13 after the previous category-grouped layout): an app that depends only on `iconifyx_mdi` and `iconifyx_lucide` bundles exactly those two sets' fonts (~2 MB pre-shake) — not every Iconify set. The earlier 5-sub-package layout bundled tens of MB of unused fonts for any single use of one icon.

## Critical invariants — do not break

### 1. `IconifyIconData` is an **extension type**, not a class.

`packages/iconifyx_core/lib/src/icon_data.dart` defines:

```dart
extension type const IconifyIconData(IconData data) {
  // … getters only
}
```

This is **load-bearing** for tree-shaking. Dart 3.3+ extension types erase to their representation at compile time. The kernel sees `const IconData(...)` directly, and Flutter's `const_finder` (driven by `--tree-shake-icons`) detects it.

If anyone ever changes this to `final class IconifyIconData { final IconData data; … }`, tree-shaking will silently break — Flutter Issue [#63920](https://github.com/flutter/flutter/issues/63920) confirms the const_finder does **not** look inside wrapper class constructors. We chose extension type specifically because it preserves the proof to the kernel that `const IconData(0xe000, …)` exists.

Verified empirically (2026-05-13): a two-icon app using `MdiIcons.home` + `LucideIcons.house` shrinks both fonts containing those icons from 176 KB / 784 KB to 720 / 664 bytes respectively. See `test_apps/two_icon_test/`.

### 2. Generated set classes must be annotated `@staticIconProvider`.

```dart
@staticIconProvider
class MdiIcons {
  const MdiIcons._();
  static const IconifyIconData home = IconifyIconData(IconData(
    0xe000, fontFamily: 'Mdi', fontPackage: 'iconifyx_mdi',
  ));
}
```

`@staticIconProvider` (from `package:flutter/widgets`) tells the tree shaker that this class contains only static const icon data and can be safely scanned. Class must have **only** `static const IconifyIconData` fields plus the private `_()` constructor. No other fields, no methods.

The `fontPackage` value is the **per-set package name** (`iconifyx_mdi`, not `iconifyx_general`).

### 3. Manifests are the source of truth for codepoint stability.

`tools/generator/manifests/<prefix>.json` files record, for every icon ever assigned to a set:
- its codepoint (BMP PUA, U+E000–U+F8FF)
- its font family (e.g. `Mdi` vs `Mdi_2` for auto-split sets)
- its Dart identifier (camelCased, reserved-word safe)
- a `deprecated: true` flag if the icon was removed upstream

**These files are committed to git.** Never delete or hand-edit them. The codepoint allocator (`tools/generator/src/codepoint_allocator.ts`) preserves every existing assignment verbatim, then appends new icons. Deleting a manifest re-runs allocation from scratch, which would shift every existing codepoint and break consumers' built apps.

### 4. `svgicons2svgfont` is BMP-only; sets >6000 icons auto-split.

The OpenType cmap format 4 used internally is 16-bit. Sets that have more than 6000 live icons get split into multiple TTFs (`Mdi.ttf`, `Mdi_2.ttf`, `Mdi_3.ttf`, …), each within BMP PUA. The split is automatic in `codepoint_allocator.ts`; the generated Dart class still emits one class per set, but icons reference different `fontFamily` strings.

**Do not** try to use supplementary PUA (`0xF0000+`). The font generator does not support it and Flutter's icon text renderer is fragile there. See `ICONS_PER_FONT_SOFT_CAP = 6000` in `codepoint_allocator.ts`.

### 5. TTF generation must be deterministic.

`svg2ttf({ ts: 0 })` is mandatory. Without it, the font's creation timestamp drifts every run and CI diffs blow up. Always pass `ts: 0`. Same icon set + same `@iconify/json` version = byte-identical TTF.

### 5a. Stroke-only sets need outline pre-processing.

Sets where icons are drawn with `<path stroke="currentColor" fill="none" />` (Lucide, Tabler, Iconoir, Phosphor-thin, mdi-light, Feather, Heroicons-outline, …) render as solid filled shapes in a TTF unless the strokes are first expanded into closed filled outlines.

The pipeline runs every icon in the `strokeFillSets` list (`tools/generator/config.yaml`) through `oslllo-svg-fixer` (rasterize + Potrace trace) before font conversion. Output is cached per-icon on disk at `tools/generator/.cache/strokefill/<prefix>/<sha1>.svg` so re-runs are nearly instant; first run for a stroke set takes ~10–20 s per ~1000 icons.

If you're adding a new stroke-only Iconify set, add its prefix to `strokeFillSets` in config.yaml. Without that step, the icons will build but render as solid blobs.

### 5c. Duotone icons emit two glyphs each.

Many Iconify sets ship duo-tone variants (Phosphor `*-duotone`, Solar `*-bold-duotone` / `*-line-duotone`, IC family, Iconamoon, Pepicons-print, etc. — ~36 sets, ~5.9k icons total). The bodies follow a fixed convention:

```html
<g fill="currentColor">
  <path d="…" opacity=".2"/>     <!-- secondary layer -->
  <path d="…"/>                  <!-- primary layer -->
</g>
```

The pipeline detects them via `isDuotoneBody` (any element with `opacity<1`) and splits each body into primary + secondary using `splitDuotoneBody` (`svg_preprocess.ts`). For every primary font that contains at least one duotone icon, the generator emits a matching `<Family>Secondary` TTF holding only the secondary layers, at the same codepoints. Dart codegen emits two const fields per duotone icon — `<identifier>Primary` and `<identifier>Secondary`.

**Pipeline ordering matters:** duotone detection happens BEFORE stroke-fill. Otherwise `oslllo-svg-fixer` rasterizes the whole body and traces it back as a single silhouette, losing the duotone signal — Solar `*-bold-duotone` originally fell through to single-layer rendering for this exact reason.

**Rendering** is done by `IconifyDuotoneIcon` (in `iconifyx_core`):

```dart
IconifyDuotoneIcon(
  PhIcons.acornDuotonePrimary,
  PhIcons.acornDuotoneSecondary,
  size: 64,
  primaryColor: Colors.blue,
  secondaryColor: Colors.red,
  secondaryOpacity: 0.5,   // default 0.4
)
```

The widget stacks two `Icon` widgets (secondary first with reduced opacity, primary on top). Both layers default to the ambient `IconTheme` color so plain `IconifyDuotoneIcon(a, b)` Just Works inside an `IconButton` etc.

Tree-shake still applies: each layer is a normal `static const IconifyIconData` field, so const_finder subsets both Primary and Secondary fonts to only the referenced codepoints.

### 5b. Per-glyph error tolerance.

The pipeline has two layers of glyph-level error tolerance so one bad SVG never fails the whole set:

1. **Pre-validation** (`tools/generator/src/glyph_validator.ts`) rejects glyphs with malformed path data, non-standard SVG path commands (e.g. `N`), unsupported elements (`<animate>`, `<filter>`, `<linearGradient>`, `<radialGradient>`, etc.), or coordinates that would overflow TTF's 16-bit signed range.
2. **Retry-on-error** (`tools/generator/src/font_builder.ts`) catches any svgicons2svgfont error after pre-validation, parses the offending glyph's name from the error message, marks it deprecated in the manifest, and retries the build. Loops up to 50× per font.

Glyphs that fail either layer get `deprecated: true` in the manifest. Their codepoints stay reserved (so they auto-recover if upstream fixes the SVG in a future release) but the icon doesn't appear in the Dart class or the TTF.

### 6. Per-set package naming convention.

For Iconify prefix `<p>`, the Dart package is named `iconifyx_` + `<p>` with `-` replaced by `_` (Dart package names require `[a-z][a-z0-9_]*`):

- `mdi` → `iconifyx_mdi`
- `fa6-solid` → `iconifyx_fa6_solid`
- `material-symbols` → `iconifyx_material_symbols`

This conversion lives in `paths.ts:prefixToPackageSuffix` / `setPackageName`. Never invent a different scheme — example app codegen, meta package codegen, and `--clean` all rely on the round-trip.

## Common operations

```bash
# First-time setup (or after pulling new deps)
bun install

# Full regeneration of all sets (~80s on M-series, 8 workers)
bun run generate

# Just one set (useful when fixing an SVG issue)
bun run generate -- --set mdi

# Only sets that have no manifest yet (incremental adds)
bun run generate -- --new-only

# Preview what would change without writing
bun run generate -- --dry-run

# Remove generated package dirs + manifests for sets no longer in @iconify/json
bun run generate -- --clean

# Run unit tests (identifier + codepoint allocator)
cd tools/generator && bun test
```

Flutter side:

```bash
# Example app (browse every set)
cd packages/iconifyx/example
fvm flutter pub get
fvm flutter run -d macos

# Two-icon bundle-size test (verifies per-set package design)
cd test_apps/two_icon_test
fvm flutter pub get
fvm flutter build macos --release --tree-shake-icons
find build/macos -name "*.ttf" | xargs ls -la
# Expected: only mdi + lucide fonts present (not every set);
#          Mdi_2.ttf ≈ 664 bytes, Lucide.ttf ≈ 720 bytes.
```

User prefers `fvm` over `flutter` directly.

## Pipeline summary

1. **Load** `@iconify/json` — pinned in `tools/generator/package.json`. 225 sets indexed, 1 excluded by config (custom-brand-icons).
2. **For each set** (worker pool, concurrency = min(cpus, 8)):
   - Load existing manifest (or null for first-time).
   - Resolve aliases → flat icon name list.
   - Allocate codepoints (existing kept, new appended; auto-split if >6000 live).
   - Sanitize Dart identifiers (Dart reserved words → suffix `_`; leading digit → prefix `n`; collisions → suffix `_2`).
   - Build TTF(s) via svgicons2svgfont → svg2ttf (`ts: 0`).
   - Emit per-set package: `pubspec.yaml`, `iconifyx_<prefix>.dart` library, `src/sets/<prefix>.dart`, `src/license.dart`, `LICENSE-3RD-PARTY.md`, fonts.
3. **Emit meta package** `iconifyx` that depends on every per-set package and re-exports them.
4. **Emit example app data**: `packages/iconifyx/example/lib/generated_index.dart` + `pubspec.yaml` (depends on every set package directly because Flutter only bundles assets from direct deps).

Total runtime ~80s for all 225 sets, producing ~206 per-set packages.

## Known failures (as of @iconify/json 2.2.472)

After Phase 1 (validator + retry-on-error) and Phase 2 (stroke-fill for stroke-only sets), **215 of 225 sets build successfully (165,718 live icons)**. The 10 remaining failures are sets where every icon body has properties that fundamentally don't translate to a monochrome TTF:

- `fluent-color`, `fluent-emoji` — gradient-heavy multi-color emoji
- `streamline-emojis`, `streamline-freehand-color`, `streamline-ultimate-color` — gradient/filter-heavy color sets
- `svg-spinners` — every icon is an `<animate>` element
- `icon-park-twotone` — gradient overlays
- `marketeq`, `gcp` — assorted gradient/filter use
- `unjs` — `<linearGradient>` per icon

These would need a true rasterize-and-trace pipeline to "flatten" their visual to a monochrome silhouette, which is out of scope. Users who need them can lift the corresponding Iconify JSON and render via `flutter_svg` at runtime instead.

The pre-validator + retry pipeline turns a single bad glyph from a set-killer into a small per-glyph warning — when an Iconify upstream update fixes the bad glyph, the next regen picks it up automatically.

## File ownership

| Path | Hand-written? | Generated by |
|---|---|---|
| `packages/iconifyx_core/lib/**/*.dart` | YES | — |
| `packages/iconifyx_<prefix>/lib/<pkg>.dart` | no | `pubspec_codegen.ts` (emit-library) |
| `packages/iconifyx_<prefix>/lib/src/sets/<prefix>.dart` | no | `dart_codegen.ts` |
| `packages/iconifyx_<prefix>/lib/src/license.dart` | no | `license_codegen.ts` |
| `packages/iconifyx_<prefix>/pubspec.yaml` | no | `pubspec_codegen.ts` |
| `packages/iconifyx_<prefix>/LICENSE-3RD-PARTY.md` | no | `license_codegen.ts` |
| `packages/iconifyx_<prefix>/assets/fonts/*.ttf` | no | `font_builder.ts` |
| `packages/iconifyx/pubspec.yaml` | no | `pubspec_codegen.ts:emitMetaPubspec` |
| `packages/iconifyx/lib/iconifyx.dart` | no | `pubspec_codegen.ts:emitMetaLibraryFile` |
| `packages/iconifyx/example/pubspec.yaml` | no | `example_codegen.ts:emitExamplePubspec` |
| `packages/iconifyx/example/lib/generated_index.dart` | no | `example_codegen.ts:emitExampleIndex` |
| `packages/iconifyx/example/lib/main.dart` | YES (static template) | — |
| `packages/iconifyx/example/lib/main_minimal.dart` | YES (tree-shake test) | — |
| `test_apps/two_icon_test/**` | YES (bundle-size verification) | — |
| `tools/generator/config.yaml` | YES | — |
| `tools/generator/manifests/*.json` | (state, committed) | `pipeline.ts` (append-only) |
| `tools/generator/src/**/*.ts` | YES | — |

If you edit a generated file by hand, your edits will be wiped on the next `bun run generate`. Edit the generator instead.

## Adding a new icon set

Iconify auto-adds new sets via npm updates. To pick them up:

```bash
bun update @iconify/json
bun run generate -- --new-only       # only processes sets without manifests
```

A new `packages/iconifyx_<new-prefix>/` directory is created and the meta + example app pubspecs are updated to include the new dep.

## Tooling versions

- Bun 1.3.x
- Flutter 3.19+ / Dart 3.3+ (extension types required)
- `@iconify/json` 2.2.x — pinned in `tools/generator/package.json` for determinism
- `svgicons2svgfont` 15.x — emit SVG font with explicit unicode metadata per glyph
- `svg2ttf` 6.x — TTF binary output, always called with `ts: 0`

## User preferences captured

- Uses `fvm` to drive Flutter, not the `flutter` binary directly.
- Bun-based pipeline, not pnpm/npm.
- Communicates in Turkish; code, identifiers, file names stay in English.
- Strongly prefers small bundle sizes: the per-set-package layout was explicitly chosen so an app using two icons doesn't ship 80 MB of fonts. Do not regress this.
