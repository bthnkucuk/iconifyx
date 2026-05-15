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

**Per-icon fallback for borderline packs.** Some packs ship below the pack-level threshold but still have individual icons that need tracing — `oui` came in at 16% evenodd (sample) so the whole pack was skipped, yet `oui:check-in-circle-empty` / `chat-left` / `analyze-event` shipped as solid blobs. The pipeline now also runs a **per-icon detector** (`iconNeedsRasterTrace`): for any pack that didn't qualify at the pack level, individual icons whose body uses `fill-rule="evenodd"` or stroke-only paint are routed through `strokeFillBatch` one at a time. Counts surface in `STROKE_AUDIT.md`'s "Per-icon raster-trace fixes" section. ~4,600 icons across ~30 packs are quietly fixed this way each regen.

**`xmlns:xlink` is mandatory in `iconToSvg`'s SVG wrapper.** A handful of Iconify bodies (logos:deploy, logos:google-developers-icon, etc.) reference legacy `xlink:href` attributes. Without the namespace declaration, `oslllo-svg-fixer`'s XML parser aborts the entire stroke-fill batch with "unknown namespace prefix 'xlink'", silently dropping every icon in the set back to its original (broken) form. The declaration is harmless when xlink isn't used. Don't remove it.

### 5a-bis. `oslllo-svg-fixer` runs in a SUBPROCESS — bisect on panic.

`oslllo-svg-fixer` transitively depends on `resvg`, a native Rust crate. Specific malformed bodies — most often the foreground halves of duotone-split emoji glyphs — make resvg panic in `geom.rs:27` with `called Option::unwrap() on a None value`, which abort()s the process via `SIGABRT`. A native panic is **unrecoverable from JavaScript**: a normal try/catch only catches JS exceptions, so without isolation a single bad icon used to kill the entire generator mid-run.

The fix lives in `tools/generator/src/stroke_fill.ts` + `stroke_fill_worker.ts`:

- The fixer call is wrapped in a dedicated `bun` subprocess via `Bun.spawn`.
- If the worker exits non-zero (including signal-aborted), the parent **bisects** the input batch in two and retries each half in fresh subprocesses, recursing until a single bad icon is isolated.
- That icon is added to `strokeFillPanicNames` and gets the same deprecated-glyph treatment as a validator failure — codepoint slot stays reserved, but no Dart const and no TTF entry.
- Everything else in the batch traces normally.

Cost: one extra `bun` startup (~500 ms) per cache-miss batch, plus O(log N) extra spawns per crashing batch. Last full regen had ~14 worker crashes, all bisected down to **2 specific icons** (`noto-v1:hot-beverage`, `noto-v1:lady-beetle`); the other ~25,000 cache-miss icons traced normally. The pipeline now always reaches its final `writeCoverageReport` + `writeStrokeAudit` steps — no more pipeline-killing crashes.

### 5b. Duotone icons emit a single const + paired Secondary font.

Many Iconify sets ship duo-tone variants (Phosphor `*-duotone`, Solar `*-bold-duotone` / `*-line-duotone`, IC family, Iconamoon, Pepicons-print, etc. — ~36 sets natively, plus thousands more produced by the multi-color split path below). Two detection paths feed into the same Primary/Secondary font pair:

**Path 1 — opacity-based duotone** (`isDuotoneBody` + `splitDuotoneBody`). Iconify's canonical convention:

```html
<g fill="currentColor">
  <path d="…" opacity=".2"/>     <!-- secondary layer -->
  <path d="…"/>                  <!-- primary layer -->
</g>
```

Any element with `opacity<1` is the secondary; the rest is primary.

**Path 2 — two-color paint-order duotone** (`trySplitTwoColorBody`). Bodies with exactly **two distinct concrete fills** (excluding `none`, `currentColor`, `url(#…)`) — e.g. a dark background rect plus a light foreground letterform, as in `logos:adobe-after-effects` or many 2-color Iconify emojis:

```html
<rect fill="#00005b" rx="42.5" .../>
<path fill="#99f" d="…Ae letterform…"/>
```

The element painting FIRST in source order is assigned to the primary layer (background); the second color → secondary (foreground). Both layers have their `fill` normalised to `currentColor`. Bodies with 3+ distinct fills, gradients, or non-self-closing children can't be cleanly split and fall through to the paint-order drop (§5e).

For every primary font that contains at least one duotone icon (either path), the generator emits a matching `<Family>Secondary` TTF holding only the secondary layers, at the same codepoints. Dart codegen emits ONE const per duotone icon via `IconifyIconData.duo(primaryIconData, secondaryIconData)` — the consumer-facing identifier stays the bare name (e.g. `PhIcons.acornDuotone`, `LogosIcons.adobeAfterEffects`).

**Pipeline ordering matters:** both duotone detection paths run BEFORE stroke-fill. Otherwise `oslllo-svg-fixer` rasterizes the whole body and traces it back as a single silhouette, losing the layering signal. Path 1 (opacity) runs first, then Path 2 (two-color) — Path 2 only considers icons not yet handled by Path 1.

**`centerHorizontally: false`** is mandatory in `font_builder.ts`'s svgicons2svgfont stream options. Iconify SVGs are already designed to fit their viewBox; auto-centring shifts each glyph's content to its own bbox centre, so duotone layers that live in different parts of the viewBox (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left) end up overlapping in the middle instead of staying in position. Re-enabling centring is a silent visual regression for any positionally-distinct duotone icon.

**Rendering duotone in the consumer app.** `IconifyIcon` auto-detects via `icon.isDuotone` and uses `secondaryOpacity = 0.4` by default — correct for phosphor-style "hint layer" duotones. For paint-order-split icons (logos, 2-color emojis), the secondary IS the meaningful foreground (a letterform, not a hint), so the consumer should pass `secondaryOpacity: 1.0` plus a contrasting `secondaryColor` for full-color rendering. See `IconifyIcon.duotone` constructor.

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

Two markdown reports regenerate on every `bun run generate` at repo root. They always run — even if mid-pipeline subprocess panics dropped specific icons, the pipeline still reaches its final write steps thanks to the subprocess isolation in §5a-bis.

- **`COVERAGE.md`** — per-set Iconify `info.total` upstream count vs. our built (live + non-deprecated, EXCLUDING synthesised weight variants) count. Sorted by % missing. Surfaces sets where the gap warrants investigation. Panic-skipped, paint-order-dropped, and validator-rejected icons all count as missing.
- **`STROKE_AUDIT.md`** — multi-section audit:
  - **Paint-order risk** (§5e) — sets shipping multi-fill bodies that would render as monochrome blobs; per-set drop counts.
  - **Per-icon raster-trace fixes** — packs below the pack-level threshold whose individual icons still needed tracing (oui case, §5a).
  - **Duotone visual-check checklist** — sets containing duotone icons (either path), sorted by count. Spot-check primary/secondary layer alignment.
  - **All sets** — every pack with stroke %, evenodd %, paint-order %, per-icon traces, duotone count, raster-applied badge.

Open these BEFORE manually browsing the example app — most rendering issues already show up in the audit.

### 5e. Paint-order risk drop.

Some bodies paint **3+ distinct colors**, or 2 colors that can't be cleanly split (gradients, nested groups, non-self-closing elements). Rasterize-trace doesn't help — Potrace traces the COMBINED silhouette as one filled region, so the foreground letterform / contrast shape gets absorbed into the background's fill. The result is a featureless monochrome blob.

`tools/generator/src/svg_preprocess.ts:isPaintOrderRiskBody()` flags any body with ≥2 distinct concrete fills (`fill="#…"`, not `currentColor` / `none` / `url(#…)`). In `pipeline.ts`, after duotone split (§5b), any remaining flagged icons get **dropped** — added to `paintOrderDroppedNames`, then through the same `droppedGlyphs` path as validator failures. The icon gets `deprecated: true` (codepoint reserved per invariant #3) but never gets a Dart const or TTF entry.

Last full regen dropped ~22k icons this way — mostly the foreground halves of color emoji packs (twemoji 4.5k, noto 4k, fluent-emoji-flat 3k, …). The two-color split in §5b reclaimed ~1.7k 2-color emojis back as duotone icons; the rest fundamentally need a full rasterizer pipeline we don't ship.

The audit report shows per-set paint-order ratio + drop count. If a pack you care about is losing too many icons here, evaluate whether `trySplitTwoColorBody` could be extended (e.g. to handle nested groups), or document the pack as multi-color-only.

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
   - **Synthesise weight variants** (Lucide / Tabler / Iconoir / … with `-thin`/`-light`/`-bold` suffixes via `setStrokeWidth`).
   - **Duotone split — opacity path** (`isDuotoneBody` + `splitDuotoneBody`): split bodies with `opacity<1` elements into primary/secondary.
   - **Duotone split — two-color path** (`trySplitTwoColorBody`): split bodies with exactly 2 distinct concrete fills into primary/secondary (logos, 2-color emojis).
   - **Stroke-fill via subprocess** (`stroke_fill.ts` → `stroke_fill_worker.ts`):
     - Pack-level: if `combinedRatio≥0.5` or `evenOddRatio≥0.2` (or explicit in config) → trace every icon.
     - Per-icon fallback: otherwise, for each icon with `fill-rule="evenodd"` or stroke-only paint → trace individually.
     - On native panic: bisect to isolate the bad icon; mark it `panicSkipped`; continue with the rest.
   - **Paint-order drop** (`isPaintOrderRiskBody`): drop any remaining body with ≥2 distinct fills that couldn't be split.
   - **Pre-validation** (`glyph_validator.ts`): drop unsupported elements, malformed paths, coord overflow.
   - Allocate codepoints (existing kept, new appended; auto-split if >6000 live).
   - Sanitize Dart identifiers (Dart reserved words → suffix `_`; leading digit → prefix `n`; collisions → suffix `_2`).
   - Build TTF(s) via svgicons2svgfont → svg2ttf (`ts: 0`); retry-on-error drops mid-stream failures.
   - Emit per-set package: `pubspec.yaml`, `iconifyx_<prefix>.dart` library, `src/sets/<prefix>.dart`, `src/license.dart`, `LICENSE-3RD-PARTY.md`, fonts.
3. **Emit meta package** `iconifyx` that depends on every per-set package and re-exports them.
4. **Emit example app data**: `packages/iconifyx/example/lib/generated_index.dart` + `pubspec.yaml` (depends on every set package directly because Flutter only bundles assets from direct deps).
5. **Emit website data** + `COVERAGE.md` + `STROKE_AUDIT.md` (always; even if upstream icons were skipped, the reports surface those as deltas).

Total runtime ~130–185s on first-fresh-cache run; ~80s on warm-cache regens. Subprocess overhead adds ~500 ms per cache-miss batch.

## Known failures (as of @iconify/json 2.2.472)

After all five filtering / recovery passes (validator, retry-on-error, stroke-fill, paint-order drop, two-color duotone split, per-icon raster-trace, subprocess panic isolation), **221 of 225 sets build successfully (~338k live icons across all packs including synthesised weight variants; ~166k non-synthetic icons)**. The 4 remaining failures are sets where every icon body has properties that fundamentally don't translate to a monochrome TTF:

- `svg-spinners` — every icon is an `<animate>` element (validator drops 100%)
- `streamline-kameleon-color`, `fluent-color` — gradient/filter-heavy color emoji
- `circle-flags` — 737 country flags, each a multi-color SVG; the two-color split can't reduce them (most are 3+ colors) and paint-order drop removes them all

These would need a true rasterize-and-trace pipeline to "flatten" their visual to a monochrome silhouette, which is out of scope. Users who need them can lift the corresponding Iconify JSON and render via `flutter_svg` at runtime instead.

The pre-validator + retry + bisect pipeline turns a single bad glyph from a set-killer into a small per-glyph warning — when an Iconify upstream update fixes the bad glyph, the next regen picks it up automatically.

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
