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
extension type const IconifyIconData(
  (IconData primary, IconData? secondary) _layers
) {
  const IconifyIconData.solo(IconData icon) : this((icon, null));
  const IconifyIconData.duo(IconData primary, IconData secondary)
      : this((primary, secondary));
  IconData get primary => _layers.$1;
  IconData? get secondary => _layers.$2;
  bool get isDuotone => _layers.$2 != null;
}
```

A single shape covers both regular icons (secondary = null) and duo-tone icons (both layers present). Named constructors `.solo` / `.duo` pick the form. This is **load-bearing** for tree-shaking. Dart 3.3+ extension types erase to their representation at compile time; the kernel sees a const Record whose fields are `const IconData(...)`, and Flutter's `const_finder` (driven by `--tree-shake-icons`) traverses records and detects every inner IconData reference.

If anyone ever changes this to `final class IconifyIconData { final IconData primary; final IconData? secondary; … }`, tree-shaking will silently break — Flutter Issue [#63920](https://github.com/flutter/flutter/issues/63920) confirms the const_finder does **not** look inside wrapper class constructors. `font_awesome_flutter` ships with broken tree-shake for exactly this reason.

Verified empirically (2026-05-13, `test_apps/two_icon_test/` with 9 referenced icons including 4 duotones): `PhSecondary.ttf` 91 KB → 936 bytes, `IcSecondary.ttf` 156 KB → 716 bytes. Record-based wrapper preserves tree-shake.

### 2. Generated set classes must be annotated `@staticIconProvider`.

```dart
@staticIconProvider
class MdiIcons {
  const MdiIcons._();

  /// `home`
  static const IconifyIconData home = IconifyIconData.solo(
    IconData(0xe000, fontFamily: 'Mdi', fontPackage: 'iconifyx_mdi'),
  );

  /// `account-circle` (duo-tone)
  static const IconifyIconData accountCircle = IconifyIconData.duo(
    IconData(0xe123, fontFamily: 'Mdi', fontPackage: 'iconifyx_mdi'),
    IconData(0xe123, fontFamily: 'MdiSecondary', fontPackage: 'iconifyx_mdi'),
  );
}
```

`@staticIconProvider` (from `package:flutter/widgets`) tells the tree shaker that this class contains only static const icon data and can be safely scanned. Class must have **only** `static const IconifyIconData` fields plus the private `_()` constructor. No other fields, no methods.

The `fontPackage` value is the **per-set package name** (`iconifyx_mdi`, not `iconifyx_general`).

### 2a. Render via `IconifyIcon`, never `Icon(.data)`.

```dart
IconifyIcon(MdiIcons.home, size: 24, color: Colors.indigo)       // regular
IconifyIcon(PhIcons.acornDuotone, size: 24)                       // duotone (auto)
IconifyIcon.duotone(                                              // duotone (custom)
  PhIcons.acornDuotone,
  color: Colors.blue,
  secondaryColor: Colors.red,
  secondaryOpacity: 0.5,
)
```

`IconifyIcon` in `iconifyx_core` is a polymorphic widget. The default constructor auto-detects duotone via `icon.isDuotone`; `.duotone` lets the caller customise the secondary layer. Outer shape mirrors `Icon` (`Semantics` + `SizedBox`). Duotone is rendered in a single render layer via `CustomPaint` + two `TextPainter` calls — no `Stack`. TextStyle uses `package:`, not `fontPackage:` (the latter is IconData's field; copying the name verbatim into TextStyle is a confusing compile error).

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

### 5a. Stroke / evenodd sets need rasterize+trace pre-processing.

Two failure modes need the same fix:

- **Stroke-only icons** (Lucide, Tabler, Iconoir, Phosphor-thin, mdi-light, Feather, Heroicons-outline, …): drawn with `stroke="currentColor"` + `fill="none"`. svgicons2svgfont treats strokes as zero-width geometry; an outlined circle renders as a solid disc.
- **`fill-rule="evenodd"` icons** (gravity-ui's `car`/`bug`/`card`, parts of vscode-icons, ant-design, oui, …): the internal cutouts (rings, holes) disappear because TTF glyphs use non-zero winding by default.

`tools/generator/src/svg_preprocess.ts:rasterFillSignal()` samples the first 25 icons of every set and computes both ratios. The pipeline auto-applies the `oslllo-svg-fixer` pre-pass (rasterize → Potrace trace → filled outline) when `combinedRatio >= 0.5` OR `evenOddRatio >= 0.2`, on top of any explicit allow-list in `config.strokeFillSets`. Output is cached per-icon at `tools/generator/.cache/strokefill/<prefix>/<sha1>.svg` (gitignored, content-addressed) so re-runs are near-instant; first run for a new stroke set takes ~10–20 s per ~1000 icons.

The audit MD `STROKE_AUDIT.md` (regenerated each build) reports per-set ratios + whether the pre-pass was applied + source (`explicit` / `auto` / `none`). Sets with high ratios that were NOT processed surface at the top — they're the manual-review queue.

If a set is auto-detected incorrectly (false positive, slow regen for no gain) you can suppress by NOT adding it to `strokeFillSets` (auto-detect is the default; explicit only ADDS, doesn't remove). If a set is missed but should be processed, add it to `strokeFillSets`.

### 5b. Duotone icons emit a single const + paired Secondary font.

Many Iconify sets ship duo-tone variants (Phosphor `*-duotone`, Solar `*-bold-duotone` / `*-line-duotone`, IC family, Iconamoon, Pepicons-print, etc. — ~36 sets, ~5.9k icons total). The bodies follow a fixed convention:

```html
<g fill="currentColor">
  <path d="…" opacity=".2"/>     <!-- secondary layer -->
  <path d="…"/>                  <!-- primary layer -->
</g>
```

The pipeline detects them via `isDuotoneBody` (any element with `opacity<1`) and splits each body into primary + secondary using `splitDuotoneBody` (`svg_preprocess.ts`). For every primary font that contains at least one duotone icon, the generator emits a matching `<Family>Secondary` TTF holding only the secondary layers, at the same codepoints. Dart codegen emits ONE const per duotone icon via `IconifyIconData.duo(primaryIconData, secondaryIconData)` — the consumer-facing identifier stays the bare name (e.g. `PhIcons.acornDuotone`, not `acornDuotonePrimary`).

**Pipeline ordering matters:** duotone detection happens BEFORE stroke-fill. Otherwise `oslllo-svg-fixer` rasterizes the whole body and traces it back as a single silhouette, losing the duotone signal — Solar `*-bold-duotone` originally fell through to single-layer rendering for this exact reason.

**`centerHorizontally: false`** is mandatory in `font_builder.ts`'s svgicons2svgfont stream options. Iconify SVGs are already designed to fit their viewBox; auto-centring shifts each glyph's content to its own bbox centre, so duotone layers that live in different parts of the viewBox (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left) end up overlapping in the middle instead of staying in position. Re-enabling centring is a silent visual regression for any positionally-distinct duotone icon.

### 5c. Per-glyph error tolerance.

Three layers of failure handling, all automatic:

1. **Pre-validation** (`tools/generator/src/glyph_validator.ts`) rejects glyphs with:
   - Unsupported SVG elements: `<animate*>`, `<set>`, `<filter>`, `<linearGradient>`, `<radialGradient>`, `<pattern>`, `<image>`, `<foreignObject>`, `<use>`.
   - Non-standard path commands (e.g. `N` from line-md's animated paths).
   - Malformed `d` attributes (parsed via svg-pathdata).
   - Coordinate-magnitude overflow: any number > `5 × max(viewBox)` would overflow TTF's 16-bit signed glyph-table limit.

   **Critical regex:** the coord scanner uses `/-?(?:\d+\.?\d*|\.\d+)/g`. The leading-dot alternation `|\.\d+` is non-negotiable — without it the regex tokenises SVG path data like `.778` as integer `778` and trips the bound check on perfectly valid fractional coords. Mynaui lost 1,800 icons and Elegant 99/100 to this bug before the fix. Any change to the regex must add a test covering the leading-dot case to `glyph_validator.test.ts`.

2. **Retry-on-error in font_builder** (`buildOneFontWithRetry`): catches any svgicons2svgfont error mid-stream, extracts the failing glyph's name from the error message, drops it, retries. **No retry cap** — some sets (flag, certain emoji families) need 100+ retries before the build succeeds. An earlier cap of 50 left those fonts empty in the manifest but no TTF on disk, breaking `pub get` on the example app.

3. **Empty-font pruning**: after the retry-driven drops, if any font entry's `iconCount` recomputed to 0, it's removed from `manifest.fonts` so `pubspec_codegen` doesn't declare an asset for a missing TTF.

Glyphs that fail any layer get `deprecated: true` in the manifest. Their codepoints stay reserved (so they auto-recover if upstream fixes the SVG in a future release) but the icon doesn't appear in the Dart class or the TTF.

### 5d. Audit reports — read before manual review.

Two markdown reports regenerate on every `bun run generate` at repo root:

- **`COVERAGE.md`** — per-set Iconify `info.total` upstream count vs. our built (live + non-deprecated, EXCLUDING synthesised weight variants) count. Sorted by % missing. Surfaces sets where the gap warrants investigation.
- **`STROKE_AUDIT.md`** — per-set stroke/evenodd ratios + raster-fill status + duotone-icon count. Includes a duotone visual-check checklist sorted by duotone count.

Open these BEFORE manually browsing the example app — most rendering issues already show up in the audit.

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
