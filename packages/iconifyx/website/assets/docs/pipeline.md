# Generator pipeline

The iconifyx package family is **entirely generated**. A Bun TypeScript
pipeline in `tools/generator/` reads `@iconify/json`, builds 221
per-set Flutter packages, and writes them under `packages/`.

This page walks through each stage of the pipeline. The order matters
— several detection passes only work if they run before
rasterize-and-trace overwrites the source.

## Stage 0: load Iconify

`tools/generator/src/load_iconify.ts` loads `@iconify/json` (pinned in
`tools/generator/package.json` for determinism — same version → same
output bytes). 225 sets indexed; 1 excluded by `config.yaml`
(`custom-brand-icons`). Each set is enqueued into a worker pool with
concurrency `min(cpus, 8)`.

## Stage 1: resolve aliases + synthesise weight variants

For each set:

- Existing manifest (`tools/generator/manifests/<prefix>.json`) is
  loaded — or null on a fresh package.
- Iconify aliases are resolved into a flat icon-name list.
- **Synthesised weight variants** are added for stroke sets that ship
  in one weight upstream but want multiple in Flutter (Lucide, Tabler,
  Iconoir, …): the generator clones the body with adjusted
  `stroke-width` and appends `-thin` / `-light` / `-bold` suffixes.

## Stage 2: duotone split (four paths, in this order)

All four paths run BEFORE the rasterize-and-trace pre-pass — otherwise
`oslllo-svg-fixer` would render the body as a single silhouette and
lose the layering signal.

1. **Opacity-based** (`isDuotoneBody` + `splitDuotoneBody`). Bodies with
   any element carrying `opacity<1`, `fill-opacity<1`, or
   `stroke-opacity<1` get split: opacity element → secondary, others →
   primary.
2. **Two-colour paint-order** (`trySplitTwoColorBody`). Bodies with
   exactly two distinct concrete fills (excluding `none`,
   `currentColor`, `url(#…)`) get split: first-paint → primary
   background, second → secondary foreground. Both normalised to
   `currentColor`.
3. **Colour-mapped preprocess** (opt-in via `config.yaml:
   colorMappedSets`, currently `catppuccin`). Walks every body and
   either flattens to `currentColor` (1 or ≥3 concrete colours) or
   routes through a fill+stroke aware duotone splitter (exactly 2
   colours).
4. **Mask-internal** (`trySplitMaskInternalBody`). The lets-icons
   `*-duotone-line` family's inverse-mask trick — classifies mask
   children by effective luminance vs white and splits faint vs bold
   strokes.

Each path only considers icons not yet classified by a prior path.
Each match emits a primary const + a `<Family>Secondary` font entry,
both at the same codepoint, with a `duotoneKind` field on the manifest
icon record.

## Stage 3: rasterize-and-trace (`oslllo-svg-fixer` in a subprocess)

Two failure modes need the same fix:

- **Stroke-only icons** (Lucide, Tabler, Iconoir, Phosphor-thin,
  mdi-light, Feather, Heroicons-outline, …): drawn with
  `stroke="currentColor"` + `fill="none"`. `svgicons2svgfont` treats
  strokes as zero-width geometry; an outlined circle renders as a solid
  disc.
- **`fill-rule="evenodd"` icons** (gravity-ui's `car`/`bug`, vscode-
  icons, ant-design, oui, …): internal cutouts disappear because TTF
  glyphs use non-zero winding by default.

`rasterFillSignal()` samples 25 icons per pack and decides:

- Pack-level: trace every icon if `combinedRatio>=0.5` **or**
  `evenOddRatio>=0.2`, or if the pack is in `strokeFillSets` (explicit
  allow-list).
- Per-icon fallback: for packs that didn't qualify at the pack level,
  individual icons that need it still go through the tracer one at a
  time (~4,600 icons across ~30 packs each regen).

The tracer call runs in a **dedicated `bun` subprocess** because
`oslllo-svg-fixer` transitively depends on `resvg`, a native Rust
crate, and resvg sometimes panics in `geom.rs:27` on malformed bodies.
A native `SIGABRT` is unrecoverable from JavaScript. If the worker
exits non-zero, the parent bisects the input batch in two and retries
each half in fresh subprocesses until it isolates the offender. That
icon is marked `panicSkipped` and gets the same treatment as a
validator failure (codepoint reserved, no Dart const, no TTF entry).

Output is cached per-icon at
`tools/generator/.cache/strokefill/<prefix>/<sha1>.svg` (gitignored,
content-addressed). First run for a new stroke set takes 10-20 s per
1,000 icons; warm-cache regens are near-instant.

## Stage 4: paint-order drop

Some bodies paint **3+ distinct colours**, or 2 colours that can't be
cleanly split (gradients, nested groups, non-self-closing elements).
Rasterize-trace can't help here: Potrace traces the combined silhouette
as one filled region, so the foreground letterform / contrast shape
gets absorbed into the background's fill. The result is a featureless
monochrome blob.

`isPaintOrderRiskBody()` flags any remaining body with ≥2 distinct
concrete fills. Flagged icons are **dropped**: added to
`paintOrderDroppedNames`, marked `deprecated: true` (codepoint reserved
per the manifest stability invariant), no Dart const emitted, no TTF
entry.

Last full regen dropped ~22 K icons this way — mostly the foreground
halves of colour emoji packs (twemoji 4.5 K, noto 4 K, fluent-emoji-flat
3 K). The two-colour split in stage 2 reclaimed ~1.7 K back as duotone.

## Stage 5: pre-validation

`glyph_validator.ts` rejects glyphs with:

- Unsupported SVG elements: `<animate*>`, `<set>`, `<filter>`,
  `<linearGradient>`, `<radialGradient>`, `<pattern>`, `<image>`,
  `<foreignObject>`, `<use>`.
- Non-standard path commands (e.g. `N` from line-md's animated paths).
- Malformed `d` attributes (parsed via `svg-pathdata`).
- Coordinate-magnitude overflow (any number > 5× max viewBox would
  overflow TTF's 16-bit signed glyph table).

The coord scanner regex is `/-?(?:\d+\.?\d*|\.\d+)/g`. The leading-dot
alternation (`|\.\d+`) is non-negotiable — without it, `mynaui` lost
1,800 icons and `elegant` lost 99/100 to false positives on perfectly
valid fractional coords like `.778`.

`flattenAnimations` (also stage 5, but applied earlier where relevant)
takes line-md / icon-park animated SMIL animations and bakes the most-
visible state of the animation into the static attribute, then strips
the `<animate>` tag. Last regen: 1,277 of 1,279 line-md icons flattened.

## Stage 6: codepoint allocation

`codepoint_allocator.ts` allocates codepoints for new icons:

- Every existing assignment from the manifest is preserved verbatim
  (the manifest is the source of truth for codepoint stability — never
  hand-edit, never delete).
- New icons get appended in alphabetical order.
- If `live count > 6000`, the pack auto-splits into multiple font
  families (`Mdi_2`, `Mdi_3`, …). This is internal to the build; the
  generator merges them back into one TTF in stage 8.

## Stage 7: TTF build

`font_builder.ts` runs `svgicons2svgfont` → `svg2ttf({ ts: 0 })`. Two
things make this resilient:

- **Retry-on-error**: if `svgicons2svgfont` errors mid-stream, the
  failing glyph's name is extracted from the error, dropped from the
  input set, and the build retries. No retry cap (some sets need 100+
  retries).
- **Empty-font pruning**: after retry-driven drops, font entries with
  `iconCount == 0` are removed from `manifest.fonts` so
  `pubspec_codegen` doesn't declare an asset for a missing TTF.

`centerHorizontally: false` is non-optional — re-enabling it shifts
duotone layers in positionally-distinct icons (`ic:baseline-signal-
wifi-1-bar-lock`) on top of each other.

## Stage 8: single-TTF merge (§32)

`font_merger.ts` runs a Python `fontTools` subprocess via `uv` to
collapse any sibling group (`Mdi.ttf`, `Mdi_2.ttf`, …) into a single
TTF using **cmap format 12**:

- BMP PUA (`0xE000-0xF8FF`) holds the first sibling's icons (codepoint
  stability preserved).
- Supplementary PUA (`0xF0000-0x10FFFF`) holds ex-sibling icons,
  remapped sequentially. The manifest's `tier: 'bmp' | 'supp'` field
  records which range each icon ended up in.

Each `iconifyx_<prefix>` package now ships exactly one primary TTF
(plus one Secondary if the pack has duotone icons). See
[`doc/architecture.md`](architecture.md) for the bundle-size impact.

First generator run after a fresh clone takes ~3 s extra to set up the
`uv venv` and install `fontTools`. Warm-cache runs no-op the venv
setup.

## Stage 9: Dart codegen

For each pack:

- `dart_codegen.ts` → `lib/src/sets/<prefix>.dart` — the
  `@staticIconProvider`-annotated `<Prefix>Icons` class with one const
  per live icon.
- `pubspec_codegen.ts` → `pubspec.yaml` + `lib/iconifyx_<prefix>.dart`
  top-level library.
- `license_codegen.ts` → `lib/src/license.dart` + `LICENSE-3RD-PARTY.md`.

Dart identifier sanitisation handles reserved words (suffix `_`),
leading digits (prefix `n`), and collisions (suffix `_2`).

## Stage 10: meta + example + website emit

- `iconifyx` meta package's `pubspec.yaml` and `lib/iconifyx.dart` are
  re-emitted listing every per-set package as a dep.
- `packages/iconifyx/example/lib/generated_index.dart` and
  `pubspec.yaml` are re-emitted (the example app depends on every set
  directly because Flutter only bundles assets from direct deps).
- `packages/iconifyx/website/lib/data/packs.json` +
  `lib/data/icons_index.json` are emitted (see
  [`website_codegen.ts`](https://github.com/bthnkucuk/iconifyx/blob/main/tools/generator/src/website_codegen.ts)).
- `COVERAGE.md`, `FONT_AUDIT.md`, `STROKE_AUDIT.md`, `DETERMINISM.md`,
  `MANIFEST_AUDIT.md` are regenerated at the repo root regardless of
  upstream icon drops — the pipeline always reaches its final write
  steps thanks to stage-3 subprocess isolation.

## Total runtime

- First-fresh-cache run: ~130-185 s.
- Warm-cache regen: ~80 s on M-series, 8 workers.
- Subprocess overhead: ~500 ms per cache-miss stroke-fill batch.

## Common operations

```bash
# Full regen of every set
bun run generate

# Single set (good for fixing an SVG issue)
bun run generate -- --set mdi

# Only sets with no manifest yet (incremental adds)
bun run generate -- --new-only

# Preview without writing
bun run generate -- --dry-run

# Remove generated dirs + manifests for sets no longer in @iconify/json
bun run generate -- --clean
```
