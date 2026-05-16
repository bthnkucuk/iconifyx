# Changelog

All notable changes to **iconifyx** (and the family of `iconifyx_<prefix>`
per-set packages it re-exports) are documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Maintained by [@obenkucuk](https://github.com/obenkucuk) and
[@bthnkucuk](https://github.com/bthnkucuk). Full credits in
[`doc/backers.md`](doc/backers.md).

## [Unreleased]

### Added
- Authoring docs (`doc/architecture.md`, `doc/duotone.md`,
  `doc/flutter_3_44_iconData.md`, `doc/pipeline.md`, `doc/backers.md`)
  covering the load-bearing design decisions (tree-shake invariants,
  per-pack package layout, duotone kinds, generator pipeline, credits).
- This changelog file.

## [0.1.0] - 2026-05-16

The first cohesive release after the §32 single-TTF-per-pack work landed.
At this point the package family ships ~338K live icons across 221 packs
(~166K non-synthetic) and the bundle-size contract is verified end-to-end
by the `test_apps/treeshake_regression/` CI gate.

### Added

#### Generator pipeline
- **§32 — single-TTF-per-pack** via cmap format 12 + supplementary PUA
  codepoints. Packs that previously auto-split into `Mdi.ttf` /
  `Mdi_2.ttf` / `Mdi_3.ttf` are now collapsed back into one TTF per pack
  by a Python `fontTools` post-process. Empirically: 10 packs × 5 icons →
  17.66 KB total fonts in macOS release (down from ~12 MB on a 3-pack
  test before §32).
- **§32 Phase A/B** — `font-merger` Python tool + TypeScript bridge.
- **§22 R1+R2 — per-pack alias map split + per-pack category meta**
  (BREAKING — older codepoint maps for packs with alias overlap have
  been re-allocated; see `tools/generator/manifests/<prefix>.json`).
- **§22 R4 — category-meta packages** (`iconifyx_emoji`, `iconifyx_logos`
  …) for callers who want to import a whole category.
- **§22 R3 — per-pack independent versioning** driven by content hash.
- **§17 #2 — vtracer multi-colour recovery** via `@neplex/vectorizer`
  (~4,593 icons recovered).
- **§16-A1/A2/A3 — manifest/codegen/identifier lints** including
  determinism self-check (regen-twice byte-diff harness).
- **§16-A10 — canonical 1000-em-quad on every emitted TTF** (resolved §33
  Solar duotone alignment).
- **§14 — stroke-aware paint extraction** (recovers ~739 icons that
  earlier were paint-order-dropped).
- **§15 — speed wins**: `Bun.hash`, `--skip-meta`, batched stroke-fill,
  per-font TTF cache, SQLite-backed strokefill cache (warm regen
  ~30–50 s faster).
- **§11 — icons_index.json per-pack shards** for lazy shard fetch on the
  website.
- **§12 — packs.json on jsDelivr** with a CDN-aware loader.
- **§3 — iterate-until-empty rebuild loop** (fixes ~569 silent empty
  glyphs).
- **§7 — htmlparser2 AST migration** with empirical recovery numbers.
- **patch svg2ttf `Glyph._getBounds`** — fixes Fontelico determinism
  (§16-A10) and glyph header bbox accuracy.

#### Audit tooling
- **§16 audit suite** — `COVERAGE.md`, `FONT_AUDIT.md`,
  `STROKE_AUDIT.md`, `DETERMINISM.md`, `MANIFEST_AUDIT.md` regenerate on
  every `bun run generate`. The audits surface silent `svg2ttf` drops,
  paint-order risk, duotone alignment regressions, etc.
- **Visual three-way audit tool** — Phase 1.5 (programmatic
  Flutter render-to-PNG harness, persistent stdin render server ~10×
  faster than single-shot).
- **Visual-diff CLI Phase 1** — root-caused Solar duotone alignment bug
  (§33).

#### Website (`packages/iconifyx/website`)
- **§9 — trigram bitmap search index** (165K linear scan → <16 ms p95).
- **§9 — lazy FontLoader per pack + memory probe** (fixes CanvasKit
  OOM after heavy navigation).
- **§23 #1-#5 — per-cell perf** (remove `SvgPicture.network` from
  `_IconCell`, scroll-end via `ValueNotifier` not full-tree rebuild, 60 ms
  search debounce, `RepaintBoundary` on `_IconCell`, hoist `Theme.of`
  out of `PackTile` / `_PaletteRow`).
- **§19 — search-bar space-eater fix** (3 trim-removals + delete dead
  shell-shortcuts focus check).
- **§27 — routing back-button** (replace-not-push for filter URL state
  + sheet pop).
- **§10 — selection-tray foundation** (bloc + localStorage + tray widget
  + cell affordance).
- **§21 — GitHub Pages deploy workflow**.

#### Core (`iconifyx_core`)
- **`IconifyIconData`** is an extension type over a 3-field record
  `(IconData primary, IconData? secondary, int kindCode)`. Three kinds:
  `kindHint` (Phosphor / Solar / `ic` opacity fade), `kindPaintOrder`
  (logos / crypto-color / Fluent emoji 2-fill), `kindMaskInternal`
  (lets-icons `*-duotone-line`).
- **Single `IconifyIcon(...)` constructor** — the widget reads
  `icon.kind` and composes the right way (hint backdrop at 40 %,
  paint-order foreground on top, mask-internal same as hint). One
  `CustomPaint` + two cached `TextPainter`s, no `Stack`.
- **`BoxFit.contain` emulation inside the painter** so wide-aspect
  wordmarks (Iconify `logos`) shrink to fit the requested cell size.
- **No Material dependency** — `iconifyx_core` depends only on
  `package:flutter/widgets`.

### Changed
- Default `secondaryColor` in the website was switched to black (down
  from `Theme.of(context).colorScheme.surface`) so paint-order duotones
  knock out cleanly regardless of theme.
- Per-pack package layout (revisited 2026-05-13): one Dart package per
  Iconify set instead of the earlier 5-sub-package category grouping.
  An app that depends on `iconifyx_mdi` + `iconifyx_lucide` ships ONLY
  those two fonts, not every Iconify set.

### Fixed
- Duotone Secondary fonts being missing from `pubspec.yaml` when the
  primary font happened to ship without a sibling.
- Routing back-button replace-not-push.
- `IconRecord.toIconifyData()` on the website used to drop the duotone
  `kind:` argument at runtime, causing every paint-order pack to render
  as hint-layer (secondary at 40 % behind primary → foreground
  letterform invisible). Now the `icons_index.json` tuple's 4th slot
  carries the kind code through.
- `xmlns:xlink` declaration in `iconToSvg`'s SVG wrapper — without it
  `oslllo-svg-fixer`'s XML parser would abort whole stroke-fill batches
  on `xlink:href` references (logos:deploy etc.).
- `centerHorizontally: false` for `svgicons2svgfont` — auto-centring
  shifted positionally-distinct duotone layers (`ic/baseline-signal-
  wifi-1-bar-lock` — lock on the right, wifi bars on the left) on top
  of each other.

### Breaking
- **§22 R1+R2** re-allocates codepoints for any pack that had alias
  overlap. Apps that hard-coded raw codepoints will need to rebuild
  against the new manifest. Apps using the generated `Icons` classes
  (the supported API) are unaffected.

### Security
- Pre-validator drops `<animate*>`, `<set>`, `<filter>`, gradient
  elements, `<pattern>`, `<image>`, `<foreignObject>`, `<use>` before
  they reach the font writer. Per-glyph error isolation in
  `oslllo-svg-fixer` via subprocess + bisect-on-panic (resvg's native
  panic on specific malformed bodies is now isolated to the offending
  icon, not the whole regen).

## [0.0.x] - earlier prototypes

Pre-0.1.0 history captured in the git log only — not a stable surface,
not on pub.dev. Highlights:

- `cffcd0c2` — `IconifyIcon` polymorphic widget for regular + duotone in
  one API.
- `0d4bf28d` — pinned Flutter 3.44.0-0.3.pre + verified compatibility
  with Flutter's upcoming `final class IconData` migration.
- `8cab7096` — multi-weight stroke set variants + example app redesign
  as codegen template.
- `5b5a487f` — duotone icon support (Option A: paired consts +
  `IconifyDuotoneIcon` widget — later collapsed into the single
  `IconifyIcon` constructor).
- `0fa47819` — recover bad sets + render stroke-only sets correctly via
  the rasterize-trace pre-pass.
- `71aa373d` — initial commit: iconifyx — Iconify icon sets as per-set
  Flutter packages.

[Unreleased]: https://github.com/bthnkucuk/iconifyx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bthnkucuk/iconifyx/releases/tag/v0.1.0
