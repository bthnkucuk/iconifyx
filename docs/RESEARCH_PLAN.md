# iconifyx — Research-driven improvement plan

Consolidated findings from 12 parallel research agents (May 2026). Each
section is one investigation; sections end with cited file paths and a
verdict. Top-of-document index lists the work in priority order.

This is a **plan** — most items are not implemented yet. Cross-reference
against `git log` to see what's landed.

## Priority queue (highest impact / hour first)

### A. Tool — generator pipeline

1. **Iterate-until-empty rebuild loop** (font-build) — 3 h, eliminates all
   ~570 silent empty glyphs immediately. See §3. ✅ SHIPPED 2026-05-16
   (569 → 0 empty glyphs after regen).
2. **Area-based duotone classification** (`trySplitTwoColorBody`) — 4 h,
   recovers ~2 000 streamline-color / flex-color paint-order failures.
   See §2.
3. **Inherited-paint resolver via htmlparser2 AST** — 8 h, removes the
   regex-bug class (Mynaui-1800-lost, `<g fill="none">` miss, style-attr
   miss). See §7.
4. **`fill="transparent"` / `rgba(.,.,.,0)` canonical no-ink predicate** —
   3 h, eliminates the next bpmn-class regression. See §5.
5. **vtracer multi-colour trace for paint-order drops** — 1-2 days,
   recovers ~10-14 k of the 22 k dropped multi-colour icons. See §1.
6. **`setStrokeWidth` + multi-weight proportional scaling** — 2-3 h,
   improves all synthesised weight variants. See §6.
7. **picosvg pre-validator subprocess** — 1 day, eliminates ~70 % of the
   svg2ttf retry pain. See §8.
8. **opentype.js replacement for svgicons2svgfont + svg2ttf** — 2 days,
   structural fix for the build pipeline's most fragile component. See §3.
9. **Visual-regression golden files + audit dashboard** — 5-6 h, catches
   future regressions automatically. See §4.

### B. Web — website

10. **`IconifyIcon` `ui.Picture` cache** — ~3 h, biggest scroll perf win
    on 15 k-icon packs. See §9.
11. **Per-pack JSON shards on jsDelivr + lazy fetch** — 4-6 days end-to-
    end, drops initial bundle by ~26 ×. See §11.
12. **`RepaintBoundary` on `_IconCell`** — 1 h, hover doesn't repaint
    neighbours. See §9.
13. **Single static `packs.json` on jsDelivr** — 3-4 h, decouples data
    updates from Flutter redeploys. See §12.
14. **Selection tray / bulk export flow** — 1 day, biggest user-perceived
    UX upgrade. See §10.
15. **Icon-detail page restructure** — 3 h, hides debug knobs behind a
    disclosure. See §10.

---

## §1 — Vector tracing quality

**Status: ✅ SHIPPED (2026-05-16). Phase 1 — opt-in via
`config.vtracerSets`; `circle-flags` + `twemoji` ON by default
(both at 100 % recovery: 732 + 3 861 = 4 593 icons newly
ship-able). `fluent-emoji-flat` (~3 088 candidates) and `noto`
(~4 020 candidates) are eligible but commented out pending visual
QA — uncomment in `config.yaml: vtracerSets` to flip on.** See
empirical-results sub-section below and
`tools/generator/src/vtracer.ts` + `vtracer_worker.ts` for the
implementation.

**Verdict: Adopt `@neplex/vectorizer` (vtracer) for paint-order
multi-colour drops. Hold Potrace for monochrome.**

22 k icons currently drop to paint-order risk (multi-colour emoji
bodies, gradient logos). Potrace fundamentally cannot do multi-colour —
binary in, single silhouette out. vtracer is the only OSS Node-native
tool that does hierarchical "stacked" multi-colour tracing.

Realistic recovery: **~10-14 k icons** (the multi-colour-flat emoji
families: twemoji 4.5 k, noto 4 k, fluent-emoji-flat 3 k; `circle-flags`
737). Gradient-heavy and 3D-emoji packs stay broken.

Architecture: **dual-tracer dispatch** by body class.
- Stroke-only / evenodd / mask-internal → existing Svg2 + Potrace path.
- Paint-order-dropped multi-fill → new vtracer path.

Integration:
- New `tools/generator/src/vtracer_worker.ts` mirroring
  `stroke_fill_worker.ts` (subprocess isolation, bisect-on-panic).
- Pre-rasterize via existing `oslllo-svg2` (same panic surface).
- Pipeline: paint-order-drop branch becomes vtracer dispatch instead of
  unconditional drop.
- Cache traced SVG at `.cache/vtrace/<prefix>/<sha1>.svg`.
- Two configs: `ColorMode.Binary` for monochrome A/B; `ColorMode.Color`
  with `colorPrecision=6`, `filterSpeckle=6`, `layerDifference=24` for
  paint-order recovery.

Side fix in `iconNeedsRasterTrace`: detect parent-`<g stroke=…>` paint
inheritance (regex currently reads child only).

**Files:** `tools/generator/src/vtracer_worker.ts` (new),
`vtracer_trace.ts` (new), `pipeline.ts`, `svg_preprocess.ts`,
`stroke_fill_worker.ts` (template), `package.json`.

**Tools:** `@neplex/vectorizer` 0.0.5 (MIT, prebuilt arm64/x64 darwin +
linux). `oslllo-svg-fixer` can be DROPPED once vtracer lands.

**Cost:** ~2 days. **Estimated icons recovered:** 10-14 k.

### Empirical results (Phase 1, 2026-05-16)

Shipped as `tools/generator/src/vtracer.ts` (orchestrator) +
`vtracer_worker.ts` (subprocess + bisect-on-panic, mirrors
`stroke_fill_worker.ts`). Cache lives at
`.cache/vtrace/<prefix>/<wyhash16>.json`.

| Pack | Live before | Live after | Δ | vtracer candidates | Recovered | % | Comment |
|---|---:|---:|---:|---:|---:|---:|---|
| `circle-flags` | 5 | **737** | **+732** | 732 | 732 | **100 %** | flag silhouettes → BG circle + accent path; 200 s cache-cold |
| `twemoji` | 715 | **4 576** | **+3 861** | 3 861 | 3 861 | **100 %** | emoji families; 1 094 s cache-cold (~270 ms/icon); 152 validator drops (alien-monster, etc.) |
| `fluent-emoji-flat` | ? | ? | ? | ~3 088 | _pending_ | _pending_ | opt-in via config — cache-cold cost ~15 min |
| `noto` | ? | ? | ? | ~4 020 | _pending_ | _pending_ | gradient-heavy; expect lower recovery |

**Phase 1 total recovered to date: 4 593 icons across two packs**
(circle-flags 732 + twemoji 3 861). Each ships as a paint-order
duotone with primary in the regular font, secondary in
`<Family>Secondary.ttf`.

Per-icon trace cost on M-series: ~270 ms cache-miss
(rasterise via `@resvg/resvg-js` at 256 × 256 + vtracer
spline mode). Single subprocess per pack; worker bisects
on resvg/vtracer panic same as stroke-fill. Determinism
preserved via pinned VTRACER_CONFIG (colorPrecision=6,
filterSpeckle=6, layerDifference=24, mode=Spline).

**Codepoint stability**: recovered icons get codepoints via the
existing allocator path — they're routed through `secondaryByName`
with `duotoneKind: 'paintOrder'`, indistinguishable from a two-
colour split downstream. The existing §32 sibling-merge step adds
supp PUA slots if any pack newly crosses the 6 000-icon BMP cap.

`@neplex/vectorizer` 0.0.5 ships prebuilt darwin-arm64/-x64 and
linux-x64/-arm64 native bindings; no Rust toolchain on user or CI.
The const-enum identifiers in the package's `.d.ts` conflict with
`verbatimModuleSyntax`; worker mirrors the literal values
(documented inline; values are stable vtracer public API since
v0.6).

### Open questions (Phase 2)

- Visual diff per pack to confirm recovery quality (visual-diff
  CLI on 50 sampled icons per opted-in pack).
- Per-pack `vtracerSets` tuning: noto's gradient layers may need
  different `filterSpeckle` / `layerDifference`.
- Should `noto-v1:hot-beverage` / `noto-v1:lady-beetle` (the two
  known stroke-fill panic icons — see CLAUDE.md §5a-bis) also try
  vtracer recovery? Currently they're skipped at the stroke-fill
  stage before reaching the vtracer dispatch.

---

## §2 — SVG analysis: area-based duotone classification

**Verdict: Adopt — replace source-order with sum-of-paths-bbox area.**

Current `trySplitTwoColorBody` picks the FIRST colour encountered in
source order as primary. For streamline-color and streamline-flex-color
this is wrong:

```
<path fill="#2859c5"/>   <!-- accent 1 (pins/frame) -->
<path fill="#8fbffa"/>   <!-- BODY (background) -->
<path fill="#2859c5"/>   <!-- accent 2 (star/plus) -->
```

Both `#2859c5` paths get grouped as primary; the `#8fbffa` body becomes
secondary and ends up on top of the foreground accent in paint-order
render. Foreground vanishes.

**Critical finding**: union-bbox-per-colour is WRONG too. The 8 accent
paths in `ai-chip-spark-flat` span the whole 14×14 canvas (union area
194); the body rect is only 100. Right metric is **sum-of-individual-
path-bboxes per colour group**: accents ~18, body ~100.

```ts
function elementArea(tag, attrs): number {
  if (tag === 'rect')   return width × height;
  if (tag === 'circle') return π r²;
  if (tag === 'ellipse')return π rx ry;
  if (tag === 'path') {
    return new SVGPathData(d).getBounds() → (maxX-minX) × (maxY-minY);
  }
}

// In trySplitTwoColorBody after bucketing by colour:
areas[colorA] = sum of element areas in bucket A;
areas[colorB] = sum of element areas in bucket B;
ratio = max / min;
if (ratio < 1.5) fall back to source-order;
else larger-area colour → primary (background), other → secondary;
```

Also add **white-as-foreground rule**: pure white (`#fff`, `white`,
`rgb(255,255,255)`) is almost never the background. If one of two
colours is canonical-white, the other is the background regardless of
area.

**Files:** `tools/generator/src/svg_preprocess.ts` (replace the bucketing
tail of `trySplitTwoColorBody`), `svg_preprocess.test.ts` (new tests).
Path-bbox via `svg-pathdata` already in deps.

**Cost:** 3-4 h. **Estimated icons recovered:** 2 000+ across
streamline-color, streamline-flex-color, fluent-color partial.

Multi-colour (3+) follow-up: gated `multiColorSplitSets` opt-in. Top-2
colours by area become primary/secondary; 3rd+ drops to currentColor
flatten. Skip OKLab clustering — RGB-Euclidean nearest-of-top2 is 50×
cheaper at 95 % accuracy. Risk: 3-colour brand marks where the 3rd
colour is meaningful (Google's red/yellow/green/blue G). Gate per-pack.

---

## §3 — Font build correctness

**Status: ✅ Quick fix SHIPPED (2026-05-16). `verifyGlyphsNonEmpty` in
`tools/generator/src/font_builder.ts` + iterate-until-empty loop in
`pipeline.ts:processOneSet`. Empirical Δ: **569 → 0 empty glyphs**
across the whole regen (366,203 codepoints checked; only 7 missing
codepoints across 3 fonts remain, none of them empty-glyph issues).
Structural opentype.js rewrite still pending.**

**Verdict (immediate): Adopt iterate-until-empty rebuild. Verdict
(structural): Replace svgicons2svgfont + svg2ttf with opentype.js.**

Current pipeline: SVG body → `svgicons2svgfont` → SVG-font intermediate
(a 2018-deprecated XML format) → `svg2ttf` → TTF. svg2ttf silently
coerces some features (open paths, complex curves) producing
empty-outline glyphs. Pre-fix regen: **569 silent empties across 37 fonts**
— meteocons 158/440 (36 %), devicon 115, token-branded 98.

### Quick fix (3 h, shipped 2026-05-16): iterate-until-empty ✅

After `buildFonts`, re-inspect via `fontkit`. Mark every empty glyph
`deprecated: true`, recompute counts, rebuild. Loop until empties = 0
or no change (bounded MAX_ITER=3). Empty set monotonically shrinks.

```ts
for (let iter = 0; iter < MAX_ITER; iter++) {
  const empties = inspectAllFonts(ttfs, manifest);
  if (empties.length === 0) break;
  for (const {name} of empties) {
    icons[name].deprecated = true;
    icons[name].deprecatedSince = today;
    icons[name].deprecatedReason = 'empty-outline post-build';
    secondaryByName.delete(name);
    resolvedByName.delete(name);
  }
  recomputeFontIconCounts(manifest);
  ttfs = await buildFonts(...);
}
```

Codepoint stability: empty glyphs get `deprecated: true`, codepoint
stays reserved. No consumer-visible blanks.

### Empirical results post-ship (2026-05-16, warm-cache full regen)

| Metric | Before | After |
|---|---:|---:|
| Empty glyphs across all fonts | 569 | **0** |
| Fonts with empty glyphs | 37 | 0 |
| Codepoints checked | 366,800 | 366,203 |
| Worst offenders (meteocons / devicon / token-branded) | 158 / 115 / 98 | 0 / 0 / 0 |

Wall-clock cost on warm-cache regen: ~3 s extra (1 fontkit pass per
emitted TTF + bytes-only buffer ops; no disk IO until the final
write step). On the cache-cold `meteocons` pack the loop converges
in **1 iteration** — no second-order silent-empties surfaced after
the first drop pass. `MAX_ITER=5` safety cap was never tripped
during the full-set regen.

Implementation: `verifyGlyphsNonEmpty(ttfBytes, members)` in
`tools/generator/src/font_builder.ts` opens the in-memory TTF via
`fontkit.create()` and returns the subset whose glyph has
`path.commands.length === 0`. `pipeline.ts:processOneSet` wraps
`buildFonts` in a `do { ... } while (newlyEmpty)` loop, marking
each empty as `deprecated: true` / `deprecatedSince=today` and
recomputing per-font icon counts before the next pass. Dropped
icons get the same on-disk semantics as the existing
`onGlyphDropped` (svgicons2svgfont mid-stream error) path — the
codepoint stays reserved per CLAUDE.md §3, so a future Iconify
upstream fix automatically restores the icon on the next regen.

### Structural fix (2 days): opentype.js

`opentype.js` exposes `new Glyph({...})` + `new Font({...})` +
`font.toArrayBuffer()`. Assemble `opentype.Path` from each Iconify body
via `svg-pathdata` (already a dep) → `moveTo/lineTo/curveTo/quadTo/
close`. Replaces BOTH svgicons2svgfont AND svg2ttf with one library;
skips the lossy SVG-font middle step.

Determinism: set `font.createdTimestamp = 0` explicitly. Output is
~3-5 % larger but tree-shake collapses to 6 entries so post-shake size
is identical.

### Additional glyph-quality metrics (1 h, font_verify.ts)

Beyond "has commands":
- **moveTo-only**: `commands.filter(c => c.command !== 'moveTo').length === 0`
- **BBox outside em-square**: `bbox.maxX < 0 || minX > unitsPerEm || …`
- **Micro-glyph**: `bbox area < 0.5 % of em²` (rounding-error leftover)

### Pre-build validator addition (30 min, glyph_validator.ts)

Catches "no drawable geometry" before build:
```ts
const drawables = body.match(/<(path|rect|circle|...)\b/g)?.length ?? 0;
if (drawables === 0) return { ok: false, reason: 'no drawable primitives' };
// Also reject <path d=""/> empties
```

**Files:** `tools/generator/src/font_builder.ts` (opentype.js rewrite),
`pipeline.ts` (rebuild loop), `font_verify.ts` (metrics + ttfSha256 for
determinism check), `glyph_validator.ts` (pre-check), `manifest.ts`
(`ttfSha256?`, `deprecatedReason?`).

**Tools:** `opentype.js` 1.3.x (replaces both), `fontkit` 2.x (keep,
verify), `fonteditor-core` 2.x (backup if opentype write quality
regresses).

---

## §4 — Audit + visual regression infrastructure

**Verdict: Adopt pixelmatch + golden files + static HTML dashboard, gated
by audit-driven sampling.**

Every recent bug surfaced ONLY after the user manually opened a specific
icon in the website. Audits flagged none upstream. Need automated visual
regression.

### Golden file regression (~2 h, highest leverage)

For the ~20 already-triaged bugs (bpmn:call-activity, lets-icons:
alarmclock-duotone-line, line-md:account, streamline-color:ai-chip-
spark-flat, etc.), store the rendered 64×64 PNG hash. CI fails on hash
change. Golden render via `fontkit.glyphForCodePoint(cp).path.toSVG()`
→ wrap in `<svg>` → `oslllo-svg2().png()`. Tests live in
`tools/generator/test/golden_icons.test.ts` via `bun:test`.

### Pixel-similarity diff (~6 h)

Each icon: rasterize source SVG (already cached via stroke-fill) AND
TTF glyph (via fontkit + resvg) at 64×64 grayscale. `pixelmatch` with
`{threshold: 0.1, includeAA: false}` returns mismatched-pixel count.
Score = `1 - mismatch / 4096`. Flag below 0.92.

```ts
// tools/generator/src/visual_diff.ts
const sim = 1 - pixelmatch(srcPng, ttfPng, null, 64, 64, opts) / 4096;
```

Budget: 30 k icons × 2.5 ms = 75 s single-threaded → 10-12 s with the
existing 8-worker pool. Cache rasterized source PNGs at
`.cache/raster64/<prefix>/<sha1>.bin`.

### Audit-driven sampling

100 % of changed-manifest packs (`git diff`), 100 % of `strokeFillSets`
+ duotone packs, 100 % of newly-added icons, 5 % stratified random of
everything else (seeded by `hash(prefix)` so coverage rotates). Keeps
budget under 60 s.

### Static HTML dashboard (~3 h)

Single self-contained `VISUAL_AUDIT.html` (≤ 5 MB) with bottom-quartile
similarity rows + all goldens. Each row: source PNG + TTF PNG embedded
as `data:image/png;base64,…`. Sortable + filterable. No build step.

### CI workflow

`.github/workflows/regen.yml`:
```yaml
- bun install && bun run generate
- cd tools/generator && bun test  # goldens
- bun run audit_gate.ts --max-regressions 0
- upload-artifact: VISUAL_AUDIT.{md,html} + COVERAGE/STROKE/FONT_AUDIT
```

Per-icon health score: **Hold** — keep score in audit output, NOT in
manifest. Manifest immutability is contract for codepoint stability;
score drifts on rasterizer upgrades and risks false-positive auto-
deprecation.

**Files:** `tools/generator/src/visual_diff.ts` (new),
`visual_dashboard.ts` (new), `pipeline.ts` (hook after
verifyFontsAgainstManifests), `test/golden_icons.test.ts` (new),
`test/goldens.json` (seed list).

**Tools:** `pixelmatch` ^7.x (Mapbox, 150 LOC, MIT, dep-free), fontkit
+ oslllo-svg2 already in deps. No headless browser, no SSIM lib.

### §4 update (2026-05-16): Flutter-rendered raster path now sub-30 ms

The original §4 plan rasterizes via fontkit → oslllo-svg2 (pure SVG
path data). That misses what the consumer ACTUALLY sees, because
`IconifyIcon`'s composition rules (hint-layer at 40 %, paint-order
foreground on top, lets-icons mask-internal) only happen at Flutter
render time. The §33b visual-diff CLI fills that gap by capturing
the Flutter-rendered PNG via the §a87ab25b render harness — but the
single-shot `flutter test` per icon costs ~5-8 s.

**Persistent render server (Approach E, shipped this branch as
`a87ab25b-v2`):** ONE `flutter test` process boots, binds a
loopback TCP socket, and serves line-delimited JSON render
requests. Per-icon cost drops to **mean 25.8 ms / p95 40 ms**
(measured: 100 random icons across all packs, M-series). Bootstrap
~2 s; first request per pack ~140 ms (cold font load); subsequent
requests for the same pack ~10-15 ms.

Implications for the §4 plan:
- The Flutter-rendered comparison is now CHEAPER than the per-icon
  pixelmatch step (~3 ms parser + ~25 ms render = ~28 ms total),
  so we can include it in the audit-driven sampling budget without
  blowing the 60 s ceiling.
- Whole-corpus run (340k icons, single server): ~340 000 × 25.8 ms
  = ~2.4 h sequential. 5 % stratified sample (~17 k) = ~7 min.
  Already practical without parallelism; parallelism via multiple
  server instances is straight-line linear speedup (each binds its
  own port).
- See `tools/generator/audit/render/README.md` for the Bench section
  and the `RenderServer` API contract.

---

## §5 — Colour semantics: no-ink predicate + area-aware paint order

**Verdict: Adopt unified no-ink predicate (~3 h) + area-aware
foreground-vs-background (~4 h, overlaps §2).**

### Canonical "no-ink" forms

Every encoding that means "no visible ink":
- `fill="none"` / `fill=none`
- `fill="transparent"`
- `fill="rgba(*,*,*,0)"` / `fill="rgb(* * * / 0)"` / `fill="hsla(...,0)"`
- `fill="#XXXXXX00"` (8-digit zero-alpha hex), `fill="#XXX0"` (4-digit)
- `fill=""` (empty)
- `fill-opacity="0"`
- `opacity="0"` (on element or ancestor)
- `display="none"` / `visibility="hidden"`
- Inherited `fill="none"` from `<g>` with no override
- `style="fill: none"` or `style="fill: transparent"` etc.

Single predicate:
```ts
function elementHasNoInk(attrs, groupAttrs = ''): boolean {
  // Walks own attrs + style + ancestor group attrs.
  // Returns true if BOTH effective fill and stroke are no-ink.
}
```

Replaces three separate keyword lists across `iconNeedsRasterTrace`,
`extractConcreteFills`, `splitDuotoneBody`, `isPaintOrderRiskBody`. Cost
~3 h including 6-8 new unit tests.

### Alpha at trace time

When source has `fill-opacity="0.5"`, half-tone trace can fail. Rule:
if ALL elements have opacity<1, promote them all to opacity=1 (avoids
"all-faint trace returns empty silhouette"). If SOME have <1 and some
don't, keep duotone split (current behaviour).

### currentColor paint identity

Today `extractConcreteFills` excludes `currentColor` entirely, so
`<rect fill="#000"/><path fill="currentColor"/>` reports as 1 concrete
colour → falls through to mono-flatten, collapsing the foreground. Treat
`currentColor` as its own paint identity, paired with one concrete →
valid 2-colour duotone candidate. Cost ~2 h.

### Foreground-colour hint on manifest (optional, ~5 h)

```ts
interface ManifestIconEntry {
  paintOrderForegroundHint?: string;   // canonical hex
  paintOrderBackgroundHint?: string;
}
```

Consumer renderers can use these as default `secondaryColor`. Surface
only in website's `icons_index.json` (metadata-rich, no bundle impact),
not per-set Dart class.

**Files:** `tools/generator/src/svg_preprocess.ts` (unified predicate,
trySplitTwoColorBody enhancement), `pipeline.ts` (alpha promotion
pre-pass), `manifest.ts` (hint fields), `@iconify/utils` already in deps
for colour canonicalisation.

---

## §6 — Stroke handling

**Verdict: Adopt setStrokeWidth fix (~2 h, biggest impact),
stroke-as-fill skip (~2 h), DOM-based iconNeedsRasterTrace (~half day).
Hold paper.js stroke-to-path for later.**

### setStrokeWidth: style + group inheritance + proportional scaling

Current `setStrokeWidth` only touches `stroke-width="…"` attrs.
- Misses `style="stroke-width: 1.5"`.
- Misses inheriting children (parent `<g stroke-width="2">` only).
- Multi-weight synthesis does FLAT replace, destroying per-layer width
  ratios.

Fix: regex over both presentation + style; inject onto outer `<g>` if
absent; **proportional scale** with `ratio = newWidth / sourcePackBase`
(Lucide base 2; thin = 1.0 → ratio 0.5).

```ts
export function scaleStrokeWidths(body, ratio): string {
  const scale = (w) => Math.max(0.25, +(parseFloat(w) * ratio).toFixed(2));
  body = body.replace(/stroke-width\s*=\s*["']([^"']+)["']/g, ...);
  body = body.replace(/style\s*=\s*"([^"]*)"/g, ...);
  if (!/stroke-width/.test(body) && /stroke=/.test(body)) {
    // inject onto outer <g>
  }
}
```

Impact: ~100 k icons across Lucide / Tabler / Iconoir / Phosphor /
Heroicons / Feather multi-weight variants visibly improved.

### Stroke-as-fill skip

```ts
strokeIsFillLike(body, viewBox): boolean
// true when maxStrokeWidth * 2 >= minSide * 0.15
```

When true, skip rasterize-trace (BPMN's 220-unit strokes in 1700-unit
viewBox are already thick enough). Saves time + keeps sharper geometry.
Followup: paper.js stroke→path geometric expansion for full fidelity
(holds for later — 2-3 day work).

### DOM-based iconNeedsRasterTrace

Replace regex with proper AST walk + paint inheritance resolution (see
§7). Catches:
- `<g stroke="...">` inheritance
- `style="stroke: ..."` CSS
- Open paths (no `Z`)
- Inherited `fill="none"` from parent

~300-800 icons currently broken from missed detection.

**Files:** `tools/generator/src/svg_preprocess.ts` (`setStrokeWidth`,
`scaleStrokeWidths`, `strokeIsFillLike`, `iconNeedsRasterTrace`),
`stroke_fill.ts` (route around stroke-as-fill).

**Tools:** `paper.js` / `paper-jsdom` for future geometric stroke→path
(2-3 day project, deferred); `fast-xml-parser` or htmlparser2 already
transitive.

---

## §7 — SVG AST migration (regex → htmlparser2)

**Verdict: Adopt phased migration, zero new direct deps.**

**Status — Phase 1 shipped (2026-05-16).** `splitDuotoneBody` and
`trySplitTwoColorBody` migrated to AST iteration via `dom.ts` helpers;
22 unit tests pass (15 pre-existing + 7 new covering nested `<g
opacity>`, `<defs>+<use>`, mixed self-closing+non-self-closing
siblings). Empirical recovery on `@iconify/json@2.2.472`: **+2,869 split
decisions** the legacy regex couldn't make (AST split where legacy fell
through to `{primary: body, secondary: ''}`); **~963 of those actually
ship as new duotones** after downstream validator + stroke-fill flow:

```
prefix              new-duotones-ship
pepicons-print              569
pepicons                     77
noto-v1                      58
emojione                     55
emojione-v1                  55
line-md                      54
twemoji                      22
noto                         18
solar                         9   (home-bold-duotone family — defs+use)
stash                         8
openmoji                      7
logos                         5
flag, qlementine, …          26   (≤4 per set)
TOTAL                       ~963
```

The recovery delta is dominated by the per-icon outer wrapper `<g
fill="currentColor"><g opacity=".2">…</g><path/></g>` pattern (pepicons
family) where the inner faded group was treated as a non-self-closing
sibling by the regex walk and aborted the split.

Same-output regression check: 10,358 bodies produce **byte-identical**
output via AST vs legacy. 577 bodies "diverge" — all are the "all-faded
body, no primary layer" case where legacy returns `{primary: '',
secondary: '<faded>'}` and AST returns `{primary: body, secondary: ''}`;
both shapes trigger the pipeline's `primary.length === 0 ||
secondary.length === 0` skip, so the divergence is shape-only (no
behavioural change).

**Phase 2 deferred:** `trySplitMaskInternalBody` and `flattenAnimations`
still on regex — their failure modes are less common in practice and
the AST helpers already exist if/when needed.

All four required packages now explicit `dependencies` in
`tools/generator/package.json`:
- `htmlparser2@12.0.0` (was transitive via cheerio → @iconify/tools)
- `domhandler@6.0.1`, `domutils@4.0.2`, `dom-serializer@3.1.1`
- `css-tree` — skipped; 20-line `style="..."` parser suffices if/when
  Phase 2 wants it

### Foundational helper

```ts
// dom.ts (~80 LOC)
export function parseBody(body: string): Element {
  return parseDocument(`<svg>${body}</svg>`, { xmlMode: true })
    .children.find(c => c.type === 'tag')!;
}
export function serializeBody(root: Element): string { ... }

export function resolvePaint(el: Element): PaintState {
  // Walk ancestors, merge: style wins per SVG 1.1 spec; opacity is
  // multiplicative; child wins for concrete-vs-none paint.
}
```

`resolvePaint` is the LOAD-BEARING primitive — eliminates the entire
class of `<g fill="none">` child-miss and style-attr-miss bugs in one
shot.

### Style attr flatten pass

20-line custom parser (skip css-tree, overkill). Flatten `style="fill:
none; stroke: ..."` into direct attributes once, then no downstream
function needs dual-path handling.

### Splitter rewrites

Replace regex-based `splitDuotoneBody`, `trySplitTwoColorBody`,
`trySplitMaskInternalBody`, `trySplitTwoStrokeColorBody` with AST clone
+ filter pattern:

```ts
const primary = cloneNode(root, true);
const secondary = cloneNode(root, true);
walk(primary, el => { if (resolvePaint(el).opacity < 1) removeElement(el); });
walk(secondary, el => { if (resolvePaint(el).opacity >= 1) removeElement(el); });
```

Naturally handles nested `<g>` wrappers (current regex bails to
"whole-body-primary" on any nesting).

### Performance

htmlparser2 parse ~25 µs, serialize ~15 µs per body. 340 k bodies →
+15 s sequential, +2-3 s with worker concurrency 8. Cache parsed tree
on `ResolvedIcon._ast` to drop to <5 s.

### Phased rollout (3 weeks)

1. Phase 0 (4 h): foundational helpers + 25-30 unit tests
2. Phase 1 (3 h): predicates A/B'd behind `--ast-predicates` flag, log
   divergences
3. Phase 2 (1 h): cut over predicates, delete regex
4. Phase 3 (6 h): splitters A/B'd, diff TTF bytes between regex/AST
   builds
5. Phase 4: cut over splitters

Total ~15 engineering hours, reversible at every phase.

**Files:** `tools/generator/src/dom.ts` (new),
`tools/generator/src/svg_preprocess.ts` (migration),
`svg_preprocess.test.ts` (new test surface),
`tools/generator/package.json` (promote transitives to explicit).

---

## §8 — Multi-language tools

**Verdict: Adopt picosvg (Python subprocess), Adopt fontTools (Python
subprocess), Trial Rust sibling crate for trace worker. Reject Lyon /
WASM rewrites at current scale.**

### picosvg pre-validator (1 day, highest signal-per-hour)

`picosvg` (Google Fonts, Apache-2.0) is the canonical SVG-normaliser
that resolves `<use>`, flattens transforms, expands clip-paths via
skia-pathops, drops anything that won't survive a font build. Used as a
gate: any icon picosvg rejects gets `deprecated: true` directly, no
retry loop.

Predicts svg2ttf failure with high precision. Eliminates ~70 % of the
unbounded retry pain + cuts ~570 silent empties to near-zero when
combined with the iterate-until-empty loop (§3).

Subprocess via `Bun.spawn(["uv", "run", "picosvg_normalize.py"])`.
Cache by content SHA at `.cache/picosvg/<prefix>/<sha1>.svg`.

### fontTools SVG → TTF (2 days, structural correctness)

`fontTools.svgLib.SVGPath` + `TTGlyphPen` + `fontBuilder` is what Google
Fonts / Adobe / Apple actually ship. Bypasses SVG-font intermediate
entirely. Estimated empty-glyph reduction: ~95 % vs current
svgicons2svgfont + svg2ttf. Cubic→quadratic conversion via
`fontTools.pens.cu2quPen.Cu2QuPen` (svg2ttf doesn't do this; causes
curve drift on logo wordmarks).

Subprocess via `Bun.spawn(["uv", "run", "build_ttf.py"])`, fed JSON
over stdin. Output: TTF bytes on stdout. Deterministic via `head.created
= modified = 0` + `recalcTimestamp=False`.

**This is the "switch off svgicons2svgfont + svg2ttf together" option
that the opentype.js plan in §3 also covers.** Pick one — fontTools is
the industry standard but adds a Python toolchain; opentype.js stays
in-TS.

### Rust trace worker (1-2 days)

`tools/generator-rust/` Cargo crate with `resvg` + `visioncortex-potrace`
as **library** calls (not subprocess). Catches `panic!` via
`catch_unwind` per-icon, eliminating the bisect dance. Single binary
`iconifyx-trace` invoked from TS via `Bun.spawn`.

Pays for itself by removing ~50 lines of bisect TS + ~14 worker-restart
cost per regen. Future-friendly: can extend to vtracer (§1) in the same
crate.

### Polyglot CI

`mise.toml` at repo root:
```toml
[tools]
bun = "1.3"
python = "3.12"
rust = "1.85"
uv = "latest"
```

GitHub Actions: `jdx/mise-action@v2` (~15 s cold setup, cached). `uv`
handles Python deps in <2 s. Cargo cached via `Swatinem/rust-cache@v2`.
Total CI setup ~30 s cold.

### Verification

`harfbuzzjs` (WASM, MIT) replaces fontkit's empty-glyph check with
`hb_face_get_glyph_extents()` — only library that agrees with what
Flutter's text engine actually renders. ~700 KB WASM, no subprocess.

### Reject

- `lyon` (Rust path geometry) — TS impl via svg-pathdata is "fine
  enough" at our scale.
- `read-fonts` / `write-fonts` (Skrifa) — only marginal verify-side
  win; bundle into Rust trace crate if anything.
- `nanoemoji` — overkill (COLRv1 territory; we ship monochrome).
- WASM-fontkit-rs — Python subprocess simpler for build; harfbuzzjs
  covers verify.

**Tools:** `fonttools` (Python, MIT), `picosvg` (Python, Apache-2.0),
`uv` (Rust, MIT/Apache, Python venv manager), `harfbuzzjs` (WASM, MIT),
`resvg + visioncortex-potrace` (Rust, MPL-2.0 + Apache-2.0).

---

## §9 — Website performance

**Status: ✅ PARTIAL (2026-05-16). Lazy per-pack `FontLoader` +
memory probe shipped — see
[`lib/bootstrap/font_loader_service.dart`](../packages/iconifyx/website/lib/bootstrap/font_loader_service.dart)
and [`memory_probe.dart`](../packages/iconifyx/website/lib/bootstrap/memory_probe.dart).
Pack-detail and icon-detail routes gate render on
`FontLoaderService.ensurePack` before showing any glyph. A periodic
probe (`performance.measureUserAgentSpecificMemory()` when COOP/COEP
is in force, `performance.memory.usedJSHeapSize` fallback,
visit-count last resort) surfaces a "Refresh to free memory"
snackbar past 350 MB or 20 unique pack visits. See
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md#coopcoep-for-memory-probe)
for the COOP/COEP follow-up that lets the accurate API run on
GitHub Pages. The TextPainter `ui.Picture` cache and RepaintBoundary
items below are still pending.**

**Verdict: Adopt TextPainter `ui.Picture` cache, RepaintBoundary, lazy
font registration. Trial 3-gram search filter.**

### TextPainter + ui.Picture cache (~3 h, biggest win)

Current `_IconifyPainter` constructs + lays out TextPainter every
rebuild. At 15 k cells × 2 TextPainter constructions + layouts per
scroll wake. Layout is the dominant cost (text shaping).

Add LRU cache keyed by `(codePoint, fontFamily, fontPackage, color,
size, secondaryCodePoint, secondaryColor)`. Cache value: pre-baked
`ui.Picture` of the painted glyph. Bind size to integer rounding
(size=27.6 → bucket 28). Cap 2 000 entries × ~2 KB = ~4 MB.

```dart
class _GlyphPictureCache {
  static final _lru = LinkedHashMap<int, ui.Picture>();
  static const _cap = 2000;
  static ui.Picture get(int key, ui.Picture Function() build) {
    final hit = _lru.remove(key);
    if (hit != null) { _lru[key] = hit; return hit; }
    final p = build();
    _lru[key] = p;
    if (_lru.length > _cap) _lru.remove(_lru.keys.first);
    return p;
  }
}
```

Expected: arcticons grid scroll smooth in release; ~60 % paint cost
reduction for revisited glyphs.

### RepaintBoundary on _IconCell (~1 h)

Hover currently repaints all neighbours sharing the SliverGrid layer.
Wrap cell's outer container in `RepaintBoundary`. ~150 visible cells →
~150 layer entries, negligible. Hover, swatch change, slider step
repaint only changed cell.

### Lazy per-pack FontLoader registration

Stop declaring icon fonts in `FontManifest.json` eagerly. Post-build
rewrite manifest to empty + bundle `lib/data/font_manifest_by_pack.json`
mapping prefix → `[{family, asset}]`. Runtime:

```dart
Future<void> ensurePackFontsLoaded(String prefix) async {
  if (!_loaded.add(prefix)) return;
  await Future.wait([
    for (final f in spec) (FontLoader(f['family']!)
      ..addFont(rootBundle.load(f['asset']!))).load(),
  ]);
}
```

Gate `PackDetailPage` body on a `FutureBuilder`. Mitigates CanvasKit
WASM heap growth (font registry grows monotonically; no public
unregister API).

Companion: clear `imageCache` + glyph LRU on every pack route exit;
periodic `window.location.reload()` after N pack visits if heap >
target.

### 3-gram search filter (Trial, ~150 LOC)

`Int32List` of size 26³ mapping every present trigram → bitset chunk
index. Per query: AND together three letter-trigram presence bitsets;
skip 80-95 % of icons before substring `contains`. Sub-100 ms goal
becomes <16 ms steady state. For queries <3 chars fall back to existing
linear scan.

Memory: packed bitset 340 k × ~17 k live 3-grams worst case 720 MB →
use Bloom filter over (trigram × pack-bucket-256): 256 × 17 k bits =
~540 KB.

Alternative: FlexSearch via `package:js` — proven 10 ms over 100 k
strings, but JS↔Dart interop per keystroke + ~300 KB JS.

### Memory profiling

`performance.measureUserAgentSpecificMemory()` (Chrome only, requires
COOP/COEP headers — already needed for threaded CanvasKit). Small
periodic timer probe in debug/profile mode.

**Files:** `iconifyx_core/lib/src/iconify_icon.dart` (cache),
`pack_detail_page.dart` (RepaintBoundary, font preload),
`bootstrap/font_registry.dart` (new), `tools/generator/src/
website_codegen.ts` (font_manifest_by_pack.json emit + FontManifest
stub).

---

## §10 — Website architecture + UX

**Verdict: Adopt selection-tray + bulk-export, restructure icon-detail
page, square-default grid with compare toggle.**

### Progress note (2026-05-16) — selection-tray FOUNDATION shipped

Data + persistence + minimal UI landed:

- `lib/bootstrap/selection_state.dart` — `IconRef`,
  `SelectionState`, `SelectionCubit`. Persists the selection set to
  `localStorage` via `shared_preferences` (same path the theme
  cubit uses). Set survives page reload.
- `lib/shared/widgets/selection_tray.dart` — bottom-sheet tray
  (mounted in `AppShellLayout` as a Stack overlay; only renders
  when the set is non-empty). Shows count + "Clear". Also exports a
  reusable `SelectionToggleButton`.
- `_IconCell` (`pack_detail_page.dart`) — long-press OR right-click
  toggles selection; coral check badge appears in the top-right via
  a scoped `BlocSelector` (selecting one icon does NOT rebuild the
  other 14999 cells).
- Icon detail sheet (`icon_detail_page.dart`) — "Add to selection"
  / "In selection" toggle button in the action row.

**Deferred to a follow-up agent** (the actual export UX):

- Cmd/Ctrl+click toggle (currently only long-press / right-click).
- The three bulk-export actions (`Copy import code`, `Export
  package` sheet, `Print sheet` route). Tray currently displays an
  `EXPORT · COMING SOON` placeholder.
- Optional URL share via `?selected=mdi/home,lucide/heart`.
- All-packs / search affordances (currently only pack-detail cell +
  icon-detail sheet have the toggle).

---

### Selection tray + bulk export (~1 day, biggest user-perceived win)

Most icon-site users assemble a set. Without this, iconifyx feels like
a viewer.

- Cmd/Ctrl+click on cell toggles selection.
- Sticky bottom Selection Tray: horizontal scrolling thumbs + counter +
  3 actions:
  - **Copy import code** — single Dart block with `import 'package:
    iconifyx_<prefix>/iconifyx_<prefix>.dart';` lines.
  - **Export package** — sheet with generated `pubspec.yaml` snippet.
  - **Print sheet** — `window.print()` on a print-friendly `/selection`
    route (8-col grid; gives free PDF reference).
- Persist in `localStorage` (via `package:web` / `dart:js_interop`).
  Optional URL share via `?selected=mdi/home,lucide/heart`.

Files: `lib/shared/bloc/selection_bloc.dart` (new),
`lib/shared/widgets/selection_tray.dart` (new), `_IconCell` (corner
badge + checkbox-on-hover), `AppShellLayout` (mount tray after
`Expanded(buildPath)`).

### Icon-detail restructure (~3 h)

Current: Breadcrumb → PreviewCard → CodeTabs → MetaCard →
DuotoneLayerDebugStrip → PerIconControls → Related → buttons. Noisy.

New hierarchy:
1. **Action header** — big "Copy import + usage" button at top.
2. **Visual** — `_PreviewCard` side-by-side, size grid below in
   horizontal Wrap.
3. **Code** — `_CodeTabs`, Dart default + auto-focus.
4. **Details disclosure** (collapsed) — Metadata, Related, Render
   settings (PerIconControls + DuotoneLayerDebugStrip only if
   `record.duotone`).

### Pack-grid layout (~3-4 h)

Square cell with iconifyx-only by default; explicit "Compare with
Iconify source" toggle in sidebar puts current 1.6-aspect side-by-side
back. Persist via URL `?compare=1`. Reason: 95 % of time is browse, not
audit.

### Pack-detail sidebar reorg

Three groups:
- **DISPLAY**: Style chips, Size slider, Compare-mode toggle, Color
  swatches.
- **ADVANCED** (collapsed): Secondary color swatches, Swap layers
  toggle.
- **ABOUT THIS PACK**: Author, license, counts.

### Search UX (5 small upgrades)

- Per-pack scope (`?scope=<prefix>` chip)
- Preview tiles instead of name rows
- Recent searches (localStorage chips above empty results)
- Enter key wraps between rows + grid
- Highlighted substring match via RichText

### Homepage additions

- Expanded install snippet bar with tabs (pub.dev / bun / flutter fvm)
- "Recently added packs" sliver (sort by `generatedAt`)
- Top searches chip strip (from localStorage)

### First-visit onboarding

Inline 3-step strip below hero (not modal): Browse → Install → Use.
Dismiss via `localStorage['iconifyx_visited'] = true`.

### Visual polish

- `height: 1.1, letterSpacing: -0.02` at headlineMedium+ (Plus Jakarta
  Sans).
- Mono-everything → mono for LABELS only, sans for VALUES.
- Unified radius scale (`AppTheme.radius.{xs:6, sm:8, md:10, lg:14}`).
- Subtle scroll-elevation shadow on pinned title bar when
  `shrinkOffset > 0`.
- 120 ms `AnimatedContainer` border-color transition on hover (not
  instant swap).

**Files:** `lib/features/pack/pack_detail_page.dart`,
`lib/features/icon_detail/icon_detail_page.dart`,
`lib/features/search/search_page.dart`,
`lib/features/home/home_page.dart`,
`lib/shared/bloc/search_bloc.dart` + new `selection_bloc.dart`,
`lib/theme/app_theme.dart`.

---

## §11 — `icons_index.json` CDN sharding

**Verdict: Adopt per-pack shards + global names binary on jsDelivr.
Phased rollout.**

Current: 10 MB raw / 2.1 MB gzip bundled at build time, parsed via
`compute(_parse)` in background isolate. Forces ALL bytes through main
thread before search works.

### Shard scheme

- 225 per-pack shards: `cdn/v<sha>/packs/<prefix>.json` (median 25 KB
  raw, p95 120 KB, max 1 MB = arcticons; gzipped ~5/25/200 KB).
- One global `names.bin` (~1.3 MB raw, ~450 KB brotli) for search.

### names.bin wire format

```
magic: "IFXN"
schemaVersion: u8 = 1
packCount: u16, packs: [prefixLen u8, prefix utf8, iconCount u32]
icons: [packIdx u16, codepoint u24, kindCode u8, nameLen u8, name ascii]
```

Total ~166 k live icons × avg 8 bytes = 1.3 MB. Brotli ~450 KB.
Decoded into `Uint8List` + offset table. Scanned linearly via
`indexOfBytes` (hand-rolled byte-level). p95 ~30 ms in WASM.

### CDN: jsDelivr

`https://cdn.jsdelivr.net/gh/Bthn/icons@<sha>/cdn/packs/<prefix>.json`.
SHA = manifest content hash. Immutable URLs → `max-age=31536000`.
Brotli auto-negotiated. CORS by default. Backup: raw.githubusercontent
fallback in client fetcher.

### Generator emit

```ts
// website_codegen.ts
buildPerPackShards(input): Map<string, string>
buildNamesBinary(input): Uint8Array
buildCdnManifest(shards, namesBin): string
```

`cdn_manifest.json` (~30 KB) is the ONLY bundled file going forward.
Carries `cdnVersion` SHA + per-shard integrity SHA.

### Client refactor

```dart
class IconCatalog {
  final Map<String, Future<List<IconRecord>>> _packShards = {};
  final LruCache<String, List<IconRecord>> _hot = LruCache(maxSize: 20);
  Future<NamesIndex>? _names;

  Future<List<IconRecord>> packIcons(String prefix) { ... }
  Future<NamesIndex> names() => _names ??= _fetchNames();
}
```

`PackBloc` becomes async (`PackLoading` → `PackReady`); pack-detail
renders shimmer grid sized by `summary.iconCount` while shard loads.

### Phased rollout

1. Phase 1 (1 day): generator emits shards alongside existing
   `icons_index.json` — no client change.
2. Phase 2 (2 days): `PackBloc` switches to shards; search still uses
   bundled index. **Net: ~8 MB doesn't ship at boot for users who never
   visit a pack.**
3. Phase 3 (2 days): search swaps to `names.bin`. Drop
   `icons_index.json` from pubspec. **Net: web build initial download
   drops from ~12 MB to ~1.5 MB.**

Each phase behind `kUseCdn` const; rollback by flipping false.

### Offline resilience

- `packs.json` stays bundled → home + sidebar work offline.
- Pack-detail offline → `PackError(retryable: true)` with retry button
  + exponential backoff.
- Skip service worker for v1.

**Files:** `tools/generator/src/website_codegen.ts` (new emit
functions), `pipeline.ts` (write `build/cdn/` tree), `lib/bootstrap/
icon_catalog.dart` (lazy fetcher rewrite), `bootstrap_bloc.dart` (drop
eager load), `pack_bloc.dart` (async states), `pack_detail_page.dart`
(shimmer), `search_bloc.dart` (byte-scan).

**Cost:** ~4-6 dev days end-to-end. **Net savings:** ~26 × reduction
in initial download.

---

## §12 — `packs.json` CDN strategy

**Verdict: DON'T shard. Single brotli'd file on jsDelivr. Keep previews
inline.**

200 KB raw, 32 KB gzip, **26 KB brotli**. That's one HTTP/2 frame.
Keyword sharding `/keyword/<term>.json` would yield 1-3 KB shards —
smaller than TLS handshake overhead, and re-fetches on every typo.

At 225 packs, in-memory string match against parsed records is
sub-millisecond. Keyword shards solve a problem that doesn't exist
here.

### What to do

- Add `tools/generator/src/website_codegen.ts:buildCdnManifest()`
  emitting a tiny `cdn_manifest.json` (~250 B):
  ```json
  {"schemaVersion":1, "commitSha":"abc123", "packsUrl": "...jsdelivr.../packs.json"}
  ```
- Bundle that as asset; everything else fetched.
- Client: bundled `cdn_manifest.json` → HTTP GET `packsUrl` (5 s timeout)
  → on failure, fall back to bundled `packs.json` (last-known-good,
  ~26 KB asset cost).

### Why bother

- **Bundle size** -26 KB (modest).
- **Data update without Flutter rebuild** — new `@iconify/json` ships,
  regen `packs.json` on jsDelivr, returning users see new packs
  without app redeploy. **Real reason to do this.**
  - Caveat: requires `icons_index.json` CDN flow too (§11). Otherwise
    new previews point at codepoints not in bundled font set.
- **Edge TTFB** ~30 ms vs ~150 ms from origin.

### Keep previews inline

12 previews × 30 bytes × 225 packs ≈ 80 KB raw / 12 KB brotli. Splitting
would save 12 KB but add 20 RTTs on first paint. Not worth it. Also:
previews use TTF codepoints (not Iconify SVG URLs); decoupling would
visually drift from in-pack rendering.

**Files:** `tools/generator/src/website_codegen.ts` (add
`buildCdnManifest`, keep `buildPacksJson` unchanged),
`lib/bootstrap/bootstrap_bloc.dart` (10-line loader with HTTP +
fallback).

**Cost:** ~3-4 h total. Don't overbuild.

---

## §13 — Generator + audit speed (regen 120s → 30s)

**Verdict: Adopt manifest-diff incremental + per-font TTF cache +
persistent subprocess pool + tiered raster diff.**

Current warm-cache regen is ~120 s. The `.cache/strokefill/` is already
1.4 GB (Tabler 174 MB, Arcticons 168 MB) — so cache HITS dominate,
meaning the ~120 s is mostly per-glyph I/O + svgicons2svgfont +
meta/audit emit, NOT trace work. Different bottlenecks than expected.

### Top 3 changes

1. **Manifest-diff incremental mode + per-font TTF cache** (~6-8 h
   implementation) — biggest ROI by far.

   - `--incremental` flag: hash each pack's raw `@iconify/json` body.
     If `(packHash, generatorGitSha)` matches the last snapshot, SKIP
     the pack entirely. Copy results from `manifests/.last/<prefix>.
     {json,ttfs.tar,dart}`.
   - Per-font TTF cache keyed by `sha1(sortedMembers + bodyHashes +
     svgicons2svgfont version + svg2ttf version + flags)`. Currently
     `font_builder.ts` rebuilds every TTF every run (~5 s). With cache,
     most fonts byte-identical → 0 ms.
   - **Δ saved**: ~60 s on a typical iconify bump (touches <20 % of
     packs); ~100 s on no-source-change reruns.

2. **Persistent subprocess pool** (~4 h)

   Replace per-pack `Bun.spawn` startup (~500 ms × pack) with a
   persistent worker pool that holds resvg + Potrace + svgicons2svgfont
   resident. New `tools/generator/src/pool.ts` exposes
   `class WorkerPool { send(task): Promise<result> }`. Each worker reads
   JSON-line tasks on stdin / writes results on stdout.

   - **Δ saved**: ~25 s on cold cache, ~5 s warm.
   - Also unblocks dedicated diff-worker pool (item 3) without
     competing for build slots.

3. **Raster64 cache + tiered hash-then-pixelmatch visual diff** (~10 h)

   For the visual-regression audit (§4):
   - First pass: rasterize source SVG to 64×64 grayscale (~6 ms/icon),
     cache at `.cache/raster64/<prefix>/<sha1>.bin` (4 KB/icon raw,
     ~700 MB total full cache).
   - Diff loop: `sha1(raster64)` hash-compare against committed baseline
     in `.cache/raster64/baseline.tar.zst` (separate
     `audit-baselines` branch via GH Actions).
   - Only icons with hash drift run pixelmatch at 128×128 (~1 ms each).
   - ~95 % short-circuit on typical regen.
   - **Δ**: visual-diff lands at ~12 s instead of ~250 s. Net new audit
     capability, not just speedup.

### Other recommendations (lower priority)

- **Per-icon preprocessed-body cache** (~2-3 h):
  `.cache/preproc/<prefix>/<sha1(rawBody)>.json` stores
  `{body, duotoneKind?, secondaryBody?, droppedReason?}`. Today every
  regen re-runs duotone splits + animation flatten + color-map
  normalize. Δ ~3 s.
- **CI runner upgrade**: `ubuntu-latest-large` (4-core, ~$0.024/min) +
  `actions/cache` on `bun.lockb`. Δ ~20 s cold.
- **Worker concurrency bump on CI**: `cpuCount × 1.5` workers (peak RSS
  ~800 MB on 7 GB runner). Δ ~10 s.
- **Determinism guard**: sort `Object.entries(manifest.icons)` keys
  before iteration in `font_builder.ts:52` (currently relies on
  undocumented JSON.parse insertion order). Lock down output
  determinism with `ttfSha256` checked into manifest.

### Final budget projection

With items 1+2+3 landed:
- Load: 1 s
- Skip unchanged packs: 5 s
- Audit emit: 8 s
- Meta + website codegen: 3 s
- Font verification: 2 s
- **Total warm-cache: ~19 s** (down from ~120 s)
- Plus visual-diff audit on top: ~12 s
- **Grand total: ~31 s with full audit** (under 60 s target)

### Reject

- `worker_threads`: oslllo-svg2 / Potrace are CJS with side-effects;
  porting friction without upside vs subprocess pool.
- Rust orchestrator: 2-4 weeks for ~10 s gain. Defer until JS plateau.
- GPU rasterize: resvg is CPU-only; Skia native deps add 30 MB.
- svgicons2svgfont split-and-merge: 2-3 days for ~1.5 s win on largest
  pack only. Wait for per-font cache instead.
- Bun bytecode / hot / isolates: experimental, no batch-pipeline win.
- mise: slower cold than setup-bun for our use.

**Files:** `tools/generator/src/pool.ts` (new),
`tools/generator/src/cache_keys.ts` (new),
`tools/generator/src/incremental.ts` (new),
`tools/generator/src/visual_diff.ts` (new),
`tools/generator/src/pipeline.ts` (lines 135-302, gating + pool
replacement), `tools/generator/src/stroke_fill.ts` (lines 57-76 client),
`tools/generator/src/font_builder.ts` (lines 34-75 cache wrap).

**Tools:** `resvg-js` (already have), `pixelmatch` (already
recommended §4), `fontkit` (already have), `zstd-napi` or
`Bun.deflateSync` for baseline compression, `xxhash-wasm` or `Bun.hash`
(replace `crypto.sha1` in `stroke_fill.ts:78` — 4× faster on small
buffers).

---

## §14 — SVG layer-order conventions (empirical survey)

**Verdict: Adopt three concrete changes; ~2 080 icons fixed in ~4 h.**

Empirical survey across @iconify/json 2.2.472 (~166 k icons) measured
how often each heuristic gets the right primary/secondary assignment
per pack.

### Source-order ↔ area-leader agreement by pack

| Pack | Two-color icons | Source-order = area-leader |
|---|---:|---:|
| cryptocurrency-color | 480 | **99.7 %** |
| material-icon-theme | 567 | 92.9 % |
| vscode-icons | 463 | 78 % |
| logos | 473 | 68.7 % |
| **streamline-color** | 1 289 | **62 %** ← worst |

**White-as-foreground rule**: across logos / crypto-color / vscode-
icons, when two-colour body contains canonical white, the white path
is the SMALLER-area (foreground) **86 %** of the time. Strong signal.

### Ecosystem consensus

- **Opacity-based duotone** (Phosphor / Solar / IC / FA Duotone): opacity
  < 1 = secondary. Independent of source order. iconifyx handles
  correctly via `splitDuotoneBody`.
- **W3C SVG painters algorithm** (§3 SVG 1.1): "child elements rendered
  in order they appear" — first child = bottom, last = top. This MATCHES
  logos / crypto / material-icon-theme / twemoji convention. Does NOT
  match streamline-color (accent → body → accent ordering).
- **Lucide / Tabler / Heroicons / Iconoir / Material Symbols**: monochrome
  packs, no duotone convention. N/A.

### Critical bug: stroke colour ignored

The hidden killer: `extractConcreteFills` only looks at `fill=`
attribute. For streamline-color the dominant pattern is:

```svg
<path fill="#d7e0ff" stroke="#4147d5" d="..."/>
```

A path with fill colour A + stroke colour B → 2 distinct paints, but
detector reports 1 fill → no split → ships as flat solid light-blue
body with NO dark outline. **1 190 streamline-color icons + 80
streamline-cyber-color + 40 streamline-flex-color = ~1 300 icons**
currently failing this way.

Fix: rename `extractConcreteFills` → `extractConcretePaints`, walk
both `fill=` and `stroke=` (incl. `style="fill:...; stroke:..."`),
treat `(fill A, stroke B)` body as 2-paint duotone candidate. **~1 h
implementation, ~1 300 icons recovered.**

### Area calculation — shoelace not bbox

First-cut "area-based" heuristic in §2 used sum-of-individual-path-bboxes
per colour group. Layer-order agent notes: for sparse-edge-spanning
accents (ai-chip-spark-flat's 8 pins on the 4 edges), bbox **over-
estimates** ink area. Correct metric is **shoelace polygon area** —
sum of `Σ (x_i · y_{i+1} - x_{i+1} · y_i) / 2` over each closed path,
approximating curves as line segments at endpoints.

For our scale + Potrace's rendering tolerance, shoelace is "good
enough"; exact path-area integrals via kurbo / bezier-js are overkill.

### Unified decision tree

```ts
function classifyDuotone(body): {primary, secondary, kind} | null {
  // 1. Opacity-based (Phosphor / Solar / ic) — highest confidence.
  if (isDuotoneBody(body)) return splitDuotoneBody(body);

  // 2. Mask-internal pattern (lets-icons).
  if (bodyUsesMaskPattern(body)) {
    const m = trySplitMaskInternalBody(body);
    if (m) return {...m, kind: 'maskInternal'};
  }

  // 3. Two-paint split: walk fill+stroke, bucket by colour.
  const paints = extractPaintRolesPerElement(body);     // NEW: fill+stroke aware
  if (paints.distinctColors.size !== 2) return null;

  const areas = sumShoelaceAreaPerColor(paints);
  const [colorA, colorB] = [...paints.distinctColors];

  // 4a. White-as-foreground override (86 % accurate across logos/crypto/vscode)
  if (isWhite(colorA) && !isWhite(colorB))
    return assign(colorB /*primary*/, colorA /*secondary*/);
  if (isWhite(colorB) && !isWhite(colorA))
    return assign(colorA /*primary*/, colorB /*secondary*/);

  // 4b. Area-leader wins when gap > 1.3× (avoids flipping Solar's
  // near-symmetric duotone where source-order is the right tie-break).
  if (areas[colorA] > 1.3 * areas[colorB]) return assign(colorA, colorB);
  if (areas[colorB] > 1.3 * areas[colorA]) return assign(colorB, colorA);

  // 5. Tie-break: source-order BG-first (painters algorithm).
  return assign(paints.firstColor, paints.otherColor);
}
```

### Estimated fix counts per change

| Change | Cost | Icons fixed |
|---|---:|---:|
| Include `stroke=` in 2-paint detection | ~1 h | **~1 300** (streamline-color family) |
| Shoelace area + white-as-FG override + 1.3× gap | ~3 h | **~780** (streamline-color flip + ~150 logos + ~100 vscode-icons + ~40 material-icon-theme) |
| 3-color reduction (top-2 by area → primary/secondary, 3rd flattened) | ~4 h | **~290** (gcp tiles, three-color logos, vscode-icons multi-accent) |
| **Combined top-2** | **~4 h** | **~2 080 icons** (≈ 5 % lift in live count) |

### Gradients / blends / `<use>`

- Gradients: unrecoverable for monochrome duotone (no discrete bg/fg
  layering). Already dropped via validator.
- `mix-blend-mode`: 0 hits in @iconify/json 2.2.472. Skip.
- `<use>`: flattened by `oslllo-svg-fixer`. Resolved geometry inherits
  parent `fill`; doesn't affect classification.
- Filters: dropped via validator. Always.

### Cross-reference with §2

The §2 recommendation (area-based duotone classification) is REFINED
by this agent's findings:
- Bbox-sum-per-colour → upgrade to **shoelace polygon area** for
  accents that span the canvas edges
- Add **stroke-colour detection** as a HIGHER priority than area
  (recovers 1.7× more icons per hour)
- Add **white-as-foreground rule** as an explicit override
- Add **1.3× area-gap floor** before flipping (preserves Solar/Phosphor
  near-symmetric duotones)

### Files

- `tools/generator/src/svg_preprocess.ts` — `extractConcreteFills` →
  `extractConcretePaints` (fill + stroke); `trySplitTwoColorBody` →
  unified `classifyDuotone` with shoelace area + white override
- `svg_preprocess.test.ts` — regression cases for `streamline-color:
  ai-chip-spark-flat`, `logos:adobe-after-effects`, `cryptocurrency-
  color:xmr`, white-as-foreground edge case
- `manifests/streamline-color.json` — currently 0 duotone live count;
  expected to climb to ~1 300 after the stroke-colour fix

---

## §15 — Generator speed: cross-check / second opinion

**Verdict on §13: well-reasoned at the architectural level but never
profiled, over-claims manifest-diff ROI, and under-weights APFS
many-small-files pain. The 120 s → 19 s target is optimistic by 2-3×.
Realistic warm-cache local target: 55-70 s; CI with matrix sharding:
~35 s.**

A second agent was dispatched to challenge §13 recommendation-by-
recommendation, verify empirical claims against git history, and suggest
what §13 missed.

### Per-§13-recommendation verdict

#### 13.1 Manifest-diff incremental + per-font TTF cache — REFINE

§13 claim: 60-100 s saved on typical reruns. Empirical reality, from
`git log` of last 10 manifest-touching commits, packs-changed
distribution = `{28, 6, 1, 3, 11, 27, 214, 23, 12, 55}`. Median ~20,
mean ~38. But **2 / 10 commits (20 %) invalidated 100 %+ of packs** —
those are pipeline-logic changes (`flattenAnimations`, paint-order
detection), exactly when the developer iterates rapidly. Manifest-diff
gives **zero** speedup on those reruns.

§13's cache key `sha1(sortedMembers + bodyHashes + svgicons2svgfont/
svg2ttf versions)` is **insufficient**:
- Misses `centerHorizontally`, `fontHeight: 1000`, `normalize: true`
  flags (`font_builder.ts:137-142`). Change `fontHeight` → cache says
  "hit" → wrong TTF.
- Misses `iconToSvg` output (different `xmlns:xlink` handling, viewBox
  normalization). Hash is over raw `body`, but actual stream input is
  `iconToSvg(ic)`.
- Misses auto-split boundary cross (`Mdi` → `Mdi_2`). §13 flagged this
  but supplied no key fix.

**Tighter key**: `sha1(JSON.stringify({fontName, fontHeight, normalize,
centerHorizontally, svg2ttfOpts, members: sortedMembers.map(m =>
({name: m.name, cp: m.codepoint, svg: iconToSvg(ic)})), versions}))`.
Hashing the actual `iconToSvg` output is the only sound key.

**Simpler alternative**: per-font TTF cache alone is ~80 % of the gain.
Skip the manifest-diff layer entirely. Manifest-diff adds complexity
(`.last/<prefix>.{json,ttfs.tar,dart}` mirror tree, copy semantics,
partial-failure recovery) for diminishing returns when pipeline-logic
changes invalidate it anyway.

**Realistic Δ**: per-font TTF cache 30-50 s warm; manifest-diff adds
10-20 s on Iconify-only bumps; **0 s on pipeline-edit reruns**.

#### 13.2 Persistent subprocess pool — REJECT in favour of batched calls

§13's bottleneck claim is wrong:
- `Bun.spawn` startup is ~30-50 ms on M-series, not 500 ms (that's
  worst-case Node cold start).
- `runFixerWorker` only runs on **cache MISS** batches. On warm cache
  (1.4 GB strokefill), most packs hit 100 % — the worker never spawns.
  See `stroke_fill.ts:129` early return.
- Persistent worker doesn't help `font_builder.ts` at all — that's
  in-process svgicons2svgfont.

Real cold-cache: ~150 packs trigger the worker × ~50 ms spawn = ~7.5 s
total overhead. Actual rasterize+Potrace work is 10-20 s per ~1 000
icons. Persistent pool saves **~5 s, not ~25 s**.

**Simpler alternative — batch multiple packs into ONE worker call**.
Pre-collect all cache misses across all packs into a single `tempIn`
dir, spawn one worker, demultiplex by output filename. Trades
complexity for ~14 spawn calls → 1. **Δ ~5 s, ~2 h to implement vs ~4 h
for §13's pool.**

#### 13.3 Tiered raster diff for visual audit — KEEP, change cache format

`.cache/raster64/` would be ~700 MB on top of 1.4 GB strokefill = 2.1 GB
of many small files on APFS. macOS pain:
- `getattrlist` / `readdir` performance degrades sharply > 10 k entries
  per directory.
- `existsSync` over 300 k+ files in flat layout is O(n) worst-case per
  call.
- Spotlight indexes the cache silently (`mdworker` competes for I/O).
- `git status` walks them all — slow `git status` is a side-effect
  users notice.

**Reject**: `.cache/raster64/<prefix>/<sha1>.bin` (many-small-files).
**Adopt instead**: SQLite DB via `bun:sqlite` (zero-deps, in-tree)
keyed `(sha1, scope) → blob`. Single file, mmap-backed, ~5× faster
`EXISTS` than `existsSync`, atomic transactions, easy to ship as a CI
artifact. WAL mode + content-addressed values preserves determinism.
The 1.4 GB strokefill cache should migrate to this layout too.

Alternative: pack as `.cache/raster64.tar` with a sidecar offset index
(`tar + mmap`). 1 file, 1 inode, fast lookups, ~50 % compression.

#### 13.x — Minor verdicts

- **`xxhash-wasm` vs `crypto.sha1`**: sha1 on 1 KB inputs is ~3 µs in
  Bun. `xxhash-wasm` is ~0.5 µs but needs wasm load. Over 340 k icons
  that's 1 s saved. **Not worth a dep.** `Bun.hash()` (wyhash,
  in-process, ~4× faster than sha1, zero-overhead) is the right pick.
  **KEEP** as a trivial change. Not cryptographically stable but fine
  for cache keys.
- **Sort `Object.entries` determinism guard**: **REJECT** — verified
  `manifest.ts:135` writes via sorted `Object.fromEntries`, so JSON
  parse order is already deterministic. Non-issue.
- **CI runner upgrade (ubuntu-large)**: keep, but cheap-and-correct.
- **Concurrency `cpuCount × 1.5`**: dangerous on Bun.
  `oslllo-svg-fixer` spawns its OWN subprocesses; we're already at
  ~16 effective processes on an 8-core box. Pushing to 12 workers OOMs
  CI runners. **REJECT** without measuring RSS first.

### Three things §13 missed

#### M1. **§13 never profiled.**

No `bun --inspect`, no `bun --cpu-profile`, no `console.time`
instrumentation. The "60-100 s saved" is back-of-napkin.

**Concrete profile plan (30 min)**:
1. `bun --cpu-profile tools/generator/src/index.ts` → `.cpuprofile`
   loadable in Chrome DevTools / Speedscope.
2. Add `console.time / timeEnd` markers around the 8 pipeline stages
   in `pipeline.ts`. Aggregate per-pack timings.
3. Run with `--smoke 5` first to isolate per-pack vs amortized cost.
4. macOS-specific: `instruments -t "Time Profiler" -D out.trace bun
   run src/index.ts` for syscall-level resolution.

Likely findings (cross-check agent's bet on the actual top-3 warm-cache
cost):
- `Object.entries(manifest.icons)` iterating 340 k entries per font ×
  N fonts in `font_builder.ts:52` (O(n²) on largest packs).
- `JSON.stringify` of 3.3 MB tabler manifest at write time.
- `fs.existsSync` over 72 k cache files.

#### M2. **Many-small-files on APFS is the real cache problem.**

§13 acknowledged 1.4 GB cache but kept the same layout. macOS APFS
quirks:
- `readdir` on `tabler/` (43 087 entries) is ~120 ms cold, ~25 ms warm.
- `existsSync(cachePath)` (`stroke_fill.ts:120`) is 5-15 µs per call
  × 340 k = **1.7-5 s just on stat calls**.
- Spotlight + git status compete for I/O.

**Fix**: SQLite-backed CAS via `bun:sqlite`, or single tar. Side
benefit: `.cache/` becomes 1 file — easy to `.gitignore`, easy to
ship to CI as a single artifact. Currently impossible —
`actions/cache` chokes on 300 k files.

#### M3. **Distributed CI sharding is under-rated by §13.**

GitHub Actions matrix sharding: 225 packs → 8 matrix shards × ~28
packs each. Each shard runs ~20 s (8× speedup over serial). Merge
step uses `actions/download-artifact` and re-emits the meta package.
**Wall time: ~30 s end-to-end. Cost: 8 × CI minutes per regen.**

Bonus: each shard's `.cache/strokefill/<their-packs>` is small (~150 MB
max for tabler shard) → fits `actions/cache` easily. No 1.4 GB
monolith. Limitations: meta package + `iconifyx/example/pubspec.yaml`
+ audit reports need ALL packs, so the merge step still does ~10 s of
cross-pack work. Net ~30-40 s on CI vs §13's projected 19 s + Ubuntu-
large upgrade. **Same speedup, fewer moving parts.** Especially
valuable because it's the ONLY approach that helps on the "100 % of
packs invalidated" pipeline-edit case.

#### M4 (bonus). **Lazy meta-package emit + `bun --watch` dev loop.**

Today `pubspec_codegen.ts:emitMetaPubspec` +
`example_codegen.ts:emitExampleIndex` run every regen even when
iterating on `svg_preprocess.ts` against `--set mdi`. Pointless. Gate
behind a `--emit-meta` flag (default true on CI, false in dev). Δ ~3-
5 s per dev iteration.

`bun --watch tools/generator/src/index.ts -- --set mdi --skip-meta
--dry-run` makes the inner dev loop ~1-2 s for SVG-preprocess tweaks.

### Combined best plan — ordered by ROI

| # | Change | Cost | Wall-time Δ | Risk |
|---|---|---|---|---|
| 1 | **Profile first** — `console.time` markers + `--cpu-profile` baseline | 30 min | 0 (informs everything else) | none |
| 2 | **Per-font TTF cache** keyed on full serialized stream input (incl. `iconToSvg` output, flags, lib versions) | 4 h | -30 to -50 s warm | low |
| 3 | **SQLite-backed `.cache/strokefill/`** via `bun:sqlite` (also reduces `git status` pain, ships as 1 CI artifact) | 5 h | -5 to -10 s + huge fs-cleanliness win | medium |
| 4 | **`Bun.hash`** over `crypto.sha1` in stroke_fill + cache keys | 30 min | -1 s | none |
| 5 | **`--skip-meta` / `--dev-mode` flag** for inner-loop iteration | 1 h | -3 to -5 s per dev run | none |
| 6 | **Batched stroke-fill worker** (one `tempIn` dir across all packs per regen) | 2 h | -5 s cold-cache | low |
| 7 | **GitHub Actions matrix sharding** (8 shards, merge step) | 6 h | -50 to -70 s on CI ONLY | medium |
| 8 | **Tiered visual-diff with SQLite-backed PNG cache** (after #3 lands) | 8 h | enables audit at +12 s instead of +250 s | medium |
| 9 | Manifest-diff incremental — defer indefinitely; profile first to confirm worth it | — | low | high churn |

**Realistic warm-cache local target**: 120 s → **~55-70 s** (not §13's
19 s). §13's 19 s implies 90 % of work eliminated, which is only true
if "iconify bump touches < 20 % of packs AND no pipeline edits AND no
audit emit". Three big assumptions, two of them empirically wrong on
recent commit history.

**Realistic CI target**: ~35 s with matrix sharding + #2 + #3 + #4.

### Prioritised top-3 (cross-checked)

1. **PROFILE FIRST.** 30 min with `--cpu-profile` + stage-level
   `console.time` will redirect the next 20 h of optimization work.
   §13 skipped this entirely; cross-check agent refuses to recommend
   anything ROI-ranked above measurement.
2. **Per-font TTF cache with a complete cache key** — full `iconToSvg`
   output hash + ALL stream options + lib versions, not just `members
   + bodyHashes`. Single biggest dependable speedup; ~4 h work; ~30-
   50 s saved warm.
3. **Migrate `.cache/strokefill/` to SQLite (`bun:sqlite`).** Fixes
   the many-small-files APFS pain, makes the cache shippable as a
   single CI artifact, speeds `existsSync` lookups, eliminates `git
   status` slowdown. Foundational for #8 (visual-diff cache) and #7
   (matrix-shard cache restoration).

### Files

- `tools/generator/src/font_builder.ts:52` — `Object.entries` iteration;
  cache wrap site
- `tools/generator/src/font_builder.ts:137-142` — stream options that
  must be in any per-font cache key
- `tools/generator/src/stroke_fill.ts:78` — `Bun.hash` replacement
- `tools/generator/src/stroke_fill.ts:118-128` — `existsSync` hot loop,
  the APFS pain point
- `tools/generator/src/pipeline.ts` — needs `--skip-meta` flag for dev
  iteration
- `tools/generator/manifests/tabler.json` — 3.3 MB / 127 k lines;
  JSON.stringify cost worth profiling

### Cross-reference with §13

§15 supersedes §13's top-3:
- §13.1 (manifest-diff) → §15 keeps per-font TTF cache but **rejects
  manifest-diff complexity** and **tightens the cache key**.
- §13.2 (persistent subprocess pool) → §15 **rejects** in favour of
  batched single-call worker invocation.
- §13.3 (tiered raster diff) → §15 **keeps the audit plan** but
  **rejects flat-file cache layout** in favour of SQLite.

§13's CI runner upgrade, `Bun.hash`, and `cpuCount × 1.5` worker
recommendations are addressed individually above (keep, keep, reject).

---

## §16 — Audit gap analysis: new correctness tools

**Verdict: Adopt the top-5 (combined "manifest lint" + upstream
regression diff + suspicious-glyph perceptual hash + per-pack
tree-shake + duotone primary/secondary sync). ~18-19 h total work,
closes whole classes of "build green, ship blank" silent failures
that the current 3 audits cannot see.**

Existing audits (`COVERAGE.md`, `STROKE_AUDIT.md`, `FONT_AUDIT.md`)
cover per-codepoint emptiness, upstream coverage gap, and stroke /
evenodd / paint-order ratios well. The blind spots are
**cross-file invariants** that no single per-pass audit owns. 16
proposals; the top 5 below close the highest-impact gaps.

### A1+A2+A3 — Combined manifest + codegen + identifier lint ✅ shipped

**Cost**: ~4 h combined. **ROI**: high.

**Implemented → `bun run audit manifest-lint`**. Lives in
`tools/generator/audit/manifest_lint.ts` and writes `MANIFEST_LINT.md`
+ `docs/audit/manifest-lint/<prefix>.json`. Wired into the dispatcher
at `tools/generator/audit.ts`. Runtime: ~15 s warm for the full
225-pack corpus (target was < 30 s).

Three checks emitted as one `MANIFEST_LINT.md` pass:

**A1 — Manifest internal-consistency.** Catches cross-field drift no
audit checks today: (a) live icon referencing a `fontFamily` not in
`manifest.fonts`, (b) a font with `iconCount > 0` but no live icons,
(c) `duotone: true` icons but no `<Family>Secondary` font, (d) the
inverse, (e) two non-deprecated icons sharing `(family, codepoint)`,
(f) `info.total !== live.count`, (g) `nextCodepoint <= maxUsedCp`,
(h) deprecated icon's codepoint re-used by a live icon.

**A2 — Dart codegen ↔ TTF reverse reconciliation.** Today
`FONT_AUDIT.md` walks manifest → TTF. We never walk Dart source →
TTF. Regex `IconData\(0x([0-9a-f]+), fontFamily: '([^']+)',
fontPackage: '([^']+)'\)` against each
`lib/src/sets/<prefix>.dart`; verify the `(fontPackage, family,
codepoint)` triple maps to a non-empty glyph. Catches orphan consts
when empty-font pruning happens after codegen and consts reference a
phantom TTF (Flutter throws `Unable to load font`).

**A3 — Identifier rename detection.** For every non-deprecated icon
in the current manifest, assert
`current.icons[name].identifier === previous.icons[name].identifier`.
Previous version is read via
`git show HEAD:tools/generator/manifests/<prefix>.json` — no separate
snapshot state. Also detects within-pack identifier collisions
(two distinct icon names sanitising to the same Dart identifier —
sanitiser bug). The manifest is supposed to preserve identifiers
(`codepoint_allocator.ts:102-114` copies them verbatim), but there
is no audit that the contract holds end-to-end. Catches the
alphabetical-collision-reshuffle bug: `MdiIcons.foo` becoming
`MdiIcons.foo_2` after an upstream icon rename, which compiles green
locally (manifest preserved) and breaks in a fresh clone.

**Risk if skipped**: Manifest desync (e.g. duotone flag without
secondary font) emits Dart consts referencing a `MdiSecondary` font
+ codepoint that doesn't exist → blank glyph at runtime, invisible
to `FONT_AUDIT.md` because it only walks `manifest.fonts`.

**First-run empirical findings (2026-05-15 corpus, 225 packs):**

- **A1: 11 violations across 11 packs.** Every hit is the same code,
  `nextCodepoint-underflow` — the `nextCodepoint` field in
  `manifest.fonts[*]` is stale at `0xf770` while live codepoints now
  reach up to `0xf4c36` (tabler). Cause: the §32 post-build merge
  rewrites icon codepoints into supplementary PUA but doesn't bump
  the source font entry's `nextCodepoint`. Real audit hit — next
  allocation would collide with an in-use slot. Packs hit:
  `arcticons, fluent, ic, iconoir, lucide, material-symbols,
  material-symbols-light, mdi, ph, solar, tabler` — exactly the
  packs that went through font-merge.
- **A2: 319 orphan consts across 11 packs.** Concentrated in
  `devicon` (multi-colour brand logos that paint-order-drop after
  codegen), `meteocons`, `logos`, `flagpack`, `gcp`, `codicon`,
  `token-branded`, `skill-icons`, `glyphs`, `streamline-color`,
  `vscode-icons`. All findings are `glyph-empty` — the Dart const
  emits, the TTF cmap slot exists, but the glyph outline is empty
  (so consumers render a blank box). A2 is the Dart-side mirror of
  FONT_AUDIT's manifest-side empty-glyph drift.

  **✅ Remediated 2026-05-16 → `bun run audit orphan-const-fix --apply`.**
  Lives in `tools/generator/audit/orphan_const_fix.ts` and wired into
  the dispatcher at `tools/generator/audit.ts`. Reads the per-pack
  `docs/audit/manifest-lint/<prefix>.json`, maps each A2 row's
  `(constant, codepoint, primary-family)` triple back to a unique
  manifest icon name, and (under `--apply`) sets
  `deprecated: true` + `deprecatedSince: <today>` +
  `deprecatedReason: 'svg2ttf-silent-empty'` on the entry. Codepoint
  stays reserved (CLAUDE.md §3 invariant). Recomputes
  `manifest.fonts[*].iconCount` + `info.total` to keep A1's
  internal-consistency checks green. After applying, regen each
  affected pack to re-emit Dart / TTF / pubspec without the
  deprecated consts. Verified 319 → 0 A2 violations.
- **A3: 0 renames vs. HEAD.** Expected — no recent regen, manifests
  on disk are byte-identical to HEAD. Positive test (synthetic
  rename → `identifier-renamed` row) confirmed detection works.

### A8 — Iconify upstream regression detector ✅ SHIPPED

**Cost**: ~2 h. **ROI**: high.

Diff `previous.icons[name].deprecated` vs current. Two flavours:
(i) Iconify upstream removed it — legitimate; (ii) our validator
started rejecting it — OUR regression. Manifest needs a new
`deprecatedReason` field (already proposed in §3); buckets new
deprecations by reason. Cross-reference with `iconifyJsonVersion`
bump — same version + new deprecations = our regression.

This is the Mynaui-1800-lost case CLAUDE.md §5c calls out by name —
a regex tightening in `glyph_validator.ts` silently deprecated 1 000+
icons; only visible by watching the log scroll. Will happen again.

**Status (2026-05-16):** shipped as `bun run audit upstream-regressions`.
`ManifestIconEntry` now carries a `deprecatedReason` field with five
buckets: `upstream-removed` / `validator-rejected` / `panic-skipped` /
`paint-order-dropped` / `unknown`. `codepoint_allocator.ts` stamps
`'upstream-removed'` as the default for icons that disappeared from
the live set; `pipeline.ts` overwrites with the precise reason at
every drop site (validator / panic / paint-order). The audit module
lives at `tools/generator/audit/upstream_regressions.ts` and emits
`UPSTREAM_REGRESSIONS.md` at repo root + per-pack JSON under
`docs/audit/upstream-regressions/`. The report flags **suspicious
packs** — those that lost icons to validator / panic / paint-order
WITHOUT an `iconifyJsonVersion` bump (= same upstream payload, new
rejections = OUR regression). That section is the Mynaui-class
early-warning trigger. First run on the current corpus: 565 new
deprecations across 29 packs, all in the `unknown` bucket (pre-A8
deprecations have no `deprecatedReason`); zero suspicious packs.

### A14 — Suspicious-glyph perceptual hash ("solid blob" detector)

**Cost**: ~6 h alone; **~0 h incremental** if §4 visual-regression
lands first. **ROI**: highest absolute when combined with §4.

`FONT_AUDIT.md` catches `path.commands.length === 0`. It does NOT
catch glyphs that draw a filled rectangle / circle / near-solid
pixel field — the exact "stroke-fill failed silently, shipped a
black box" signature. Heuristic:

- rasterize glyph at 64×64 grayscale via `fontkit + resvg`
- `inkRatio = abovethresh / total`
- `coverage = glyphBbox / emBbox`
- flag if `inkRatio > 0.7 && coverage > 0.85` (filled square)
- also flag if 16×16 dHash Hamming distance < 4 to a curated
  known-bad set (solid square, solid circle, solid horizontal bar,
  blank)

This is the bug class that has bitten the project the most:
Catppuccin's 659 blanks, gravity-ui blobs, streamline-color failures.
The pipeline has 5 defences against this but no audit ever
**verifies the result**. Combine with §4 pixelmatch infrastructure;
solid-blob detector is one extra heuristic on top.

### A5 — Per-pack tree-shake automation

**Cost**: ~5 h. **ROI**: high (per-project priority).

Today tree-shake is verified ONCE manually for a curated 2-pack
scenario (`test_apps/two_icon_test/`). CLAUDE.md §1 calls tree-shake
"load-bearing for the entire per-set-package architecture" — if the
extension-type invariant ever flips (a Flutter / Dart version forces
a class wrapper), the current single test verifies it for 2 packs
out of 225.

Don't build 225 Flutter apps. Instead: a `bun:test` that scans
`lib/src/sets/<prefix>.dart` for one randomly-sampled icon (rotated
each regen by `Date.now() % manifests.length`), generates a minimal
`test_apps/_shake_probe/` Flutter project, runs `fvm flutter build
macos --release --tree-shake-icons`, asserts `find build -name
"*.ttf" | xargs ls -l` shows only the expected family with size <
2 KB. ~10 s per regen.

### A6 — Duotone primary/secondary codepoint sync

**Cost**: ~1.5 h. **ROI**: high (cheapest meaningful addition).

For every duotone icon, primary glyph must exist at codepoint X in
`Family`, AND secondary must exist at codepoint X in
`FamilySecondary`. Today `FONT_AUDIT.md` checks each font in
isolation — catches "PhSecondary cp 0xe123 empty" but doesn't
correlate to "Ph cp 0xe123 is fine, so this is a duotone half-
failure". Extension to `font_verify.ts`; cross-check each
`duotone: true` icon's primary AND secondary entries. New "Half-
broken duotones" section in `FONT_AUDIT.md`.

Risk if skipped: 1 500+ duotone icons across logos / lets-icons /
catppuccin / cif / cryptocurrency-color etc. — a half-failure looks
like a Phosphor-bug-not-iconifyx-bug to the consumer.

**Implemented (extended) → `bun run audit glyph-metrics`**. Lives in
`tools/generator/audit/glyph_metrics.ts` and writes
`GLYPH_METRICS_AUDIT.md` + `docs/audit/glyph-metrics/<prefix>.json`.
Goes beyond the A6 scope (presence) to also catch alignment-class
bugs: primary/secondary x-bbox mismatch (`solar:add-circle-bold-
duotone` discovery — score 522), cmap-dedup collisions via path
hash (the `SolarSecondary.accessibility-bold-duotone` glyph shared
across 69 codepoints), font-level metric drift, and outlier glyphs.
First run: 6,320 mismatches across 59 packs, 18,513 dedup
collisions across 166 packs.

### Honourable mentions kept out of top 5

- **A4 — Codepoint exhaustion forecast** (30 min). Per-font slot
  count vs `ICONS_PER_FONT_SOFT_CAP = 6000` + PUA headroom. Surfaces
  packs about to trigger a new font split → consumer bundle-size
  surprise (`Mdi.ttf` becoming `Mdi.ttf + Mdi_2.ttf + Mdi_3.ttf`
  without changelog notice). Trivial; add to `COVERAGE.md`. **ROI**:
  medium.

- **A7 — Per-pack pubspec ↔ assets reconciliation** (~2 h). Today's
  empty-font prune happens in `pipeline.ts:786-788`; if a previous
  regen left a stale `Mdi_4.ttf` orphan, the new pubspec doesn't
  declare it but the file persists. Three-way diff: readdir(assets/
  fonts/), manifest fonts, pubspec font families. Combine with A1.

- **A10 — Determinism self-check** ✅ **SHIPPED** (regen-twice
  byte-diff). Foundational for the planned cache work (§15) but
  doesn't catch a present bug. SHA256 every TTF / .dart / manifest,
  diff against committed `docs/audit/sha_baseline.json`. Optional
  `--regen-twice [--smoke a,b,c | --full]` re-runs the generator and
  diffs the second snapshot against the first — empirically catches
  any new non-determinism leaking into the pipeline. Doubles as
  `ttfSha256` baseline for future cache-key validation.
  Lives in [tools/generator/audit/determinism.ts](../tools/generator/audit/determinism.ts);
  emits [DETERMINISM_AUDIT.md](../DETERMINISM_AUDIT.md). Snapshot:
  ~0.6 s for 745 files (295 TTF + 225 Dart + 225 manifest). First
  regen-twice run on `fontelico` flagged a real TTF non-determinism
  bug — exactly the class this tool was built to surface.

#### Fontelico drift investigation (2026-05-16) — **resolved**

The §16-A10 audit's first regen-twice on `fontelico` surfaced two
independent bugs, both now fixed:

1. **Upstream `svg2ttf` bug — Glyph header bbox accumulators
   initialised to `0` instead of `±Infinity`**
   ([node_modules/svg2ttf/lib/sfnt.js:273-351](../node_modules/svg2ttf/lib/sfnt.js)).
   For any glyph whose actual geometry has `xMin > 0` or `yMin > 0`
   (very common — Iconify icons are padded inside a 1000×1000
   viewBox), `Math.min(0, anyPositive) === 0` clamps the header
   value at zero, so the emitted `glyf` table per-glyph header lies
   and reports `(xMin, yMin) = (0, 0)`. Dual flaw for `xMax`/`yMax`
   on glyphs that live entirely in negative space. Doesn't affect
   rasterised pixels (Skia draws path data, not header) but pollutes
   the `glyf` table for third-party tooling, and interacts
   unpredictably with non-deterministic iteration order in upstream
   tools.

   Empirical example (Fontelico `crown` glyph, pre-patch):
   ```
   header xMin=0   yMin=0   xMax=917 yMax=973
   actual xMin=80  yMin=250 xMax=917 yMax=972
   ```

   **Track A (shipped):** local patch via
   [`bun patch`](../tools/generator/patches/svg2ttf@6.1.0.patch).
   `bun install` reapplies automatically. Confirmed by re-reading
   the same glyph post-patch:
   ```
   header xMin=79  yMin=250 xMax=917 yMax=973
   ```

   **Track B (planned):** upstream PR against
   https://github.com/fontello/svg2ttf with the same `±Infinity`
   sentinel fix. Not blocking — local patch is the durable fix until
   upstream lands a release.

2. **`canonicalize_ttf.py` was bumping `head.modified` on every
   save.** Root cause of the actual Fontelico SHA drift between
   consecutive regens: `fontTools.TTFont(…)` defaults
   `recalcTimestamp=True`, which writes the current wall-clock time
   into `head.modified` on `.save()`. `canonicalize_ttf.py` was
   relying on the constructor default and (correctly) only passing
   `recalcBBoxes=False`. Three consecutive regens of Fontelico
   produced three different SHAs entirely from this `modified`
   timestamp bump and its `checksumAdjustment` knock-on. The svg2ttf
   `{ ts: 0 }` step was working as documented — `head.created` was
   pinned correctly; the timestamp was being overwritten downstream.

   **Fix:** [tools/generator/python/canonicalize_ttf.py](../tools/generator/python/canonicalize_ttf.py)
   now passes `recalcTimestamp=False` to the `TTFont` constructor
   AND explicitly sets `head.created = head.modified = 0` alongside
   the existing canonical bbox pin. Two consecutive regens of
   `fontelico` now produce byte-identical TTFs (sha256
   `e856d63d156e5ffe27fc92fae8ac2a5e4958b0022338a238cbdb17d71f787751`).

#### Baseline update + cache invalidation

After the patches above:

- `docs/audit/sha_baseline.json` updated with the new canonical
  Fontelico hash. Re-running `bun run audit determinism` reports the
  Fontelico entry as clean.
- The per-font TTF cache key (§15) is content-addressed by SVG INPUT
  bytes, not by output. Old (pre-patch) cached entries are still
  valid byte-output for the OLD chain but stale under the new chain.
  Anyone with a pre-2026-05-16 `.cache/ttf/` should run
  `--clean-cache` once after pulling.
- The two-track svg2ttf fix surfaces a general principle for similar
  upstream bugs: ship a `bun patch` locally first, file the upstream
  PR as a goodwill follow-up, document both in
  [tools/generator/patches/README.md](../tools/generator/patches/README.md).

- **A12 — Stroke-fill panic-list regression tracker** (~2 h).
  Persist panic-skipped name set across regens. New / recovered
  panics surface in `STROKE_AUDIT.md`. Currently CLAUDE.md §5a-bis
  hard-codes `noto-v1:hot-beverage` + `noto-v1:lady-beetle`; no
  signal when upstream resvg fixes them.

- **A15 — Package-size budget regression** (~2 h). Per-pack TTF
  size + Dart const count snapshotted regen-to-regen. >10 % delta
  warns. Catches accidental stroke-fill cache loss (fonts triple in
  size) and glyph-complexity inflation. Compounds with A10.

### Rejected / deferred

- **A9 — Cross-pack meta identifier collisions**: informational only.
  Different classes; not a compile error.
- **A11 — Glyph vertical-alignment anomaly detector**: no clear
  remediation if a pack scores badly.
- **A13 — License SPDX lint**: low practical value.
- **A16 — SVG transform-attribute parity**: overlaps §4; rare bug
  class.

### Combined target

Top-5 implemented in priority order: **~18-19 h** of work.

Outcome:
- Half-broken duotones surfaced explicitly (was invisible).
- Solid-blob ship case catchable end-to-end (was invisible).
- Cross-file manifest / pubspec / codegen / TTF drift bounded (was
  emergent only via Flutter build-time crashes downstream).
- Tree-shake invariant verified across all 225 packs (was 2).
- Iconify upstream regressions surfaced as a markdown diff (was a
  log line that scrolled past).

### Files

- New `MANIFEST_LINT.md` emitted alongside `COVERAGE.md` (A1+A2+A3)
- New section in `FONT_AUDIT.md` for half-broken duotones (A6)
- New `STROKE_AUDIT.md` panic-diff section (A12 — honourable)
- New `tools/generator/src/manifest_lint.ts` (A1+A2+A3 host)
- New `tools/generator/src/glyph_shape_audit.ts` (A14, combined with
  §4 visual-regression harness)
- Extend `tools/generator/src/font_verify.ts` for A6
- Extend `tools/generator/src/manifest.ts` to add `deprecatedReason`
  field (A8)
- Existing tree-shake reference target:
  `test_apps/two_icon_test/lib/main.dart` (A5 builds on this pattern)

### Cross-reference with prior sections

- A14 directly extends §4 (pixelmatch visual regression) — same
  rasterize infrastructure.
- A10 is a prerequisite for §13's per-font TTF cache and §15's
  tighter cache-key proposal — both are dangerous to land without a
  determinism baseline.
- A8 + A12 together close the "upstream regression" feedback loop
  that §3 (iterate-until-empty rebuild) implicitly relies on.
- A5 protects the §1 / §2 of CLAUDE.md tree-shake invariant — the
  architectural justification for the entire repo layout.

---

## §17 — Rust crates for SVG processing + audit tooling

**Verdict: Recommended hybrid — keep TS orchestration; add a focused
`tools/generator-rust/` crate exposing 3-4 high-value primitives via
subprocess CLI. Top-5 plan: ~100 h, 120 s → 30-40 s warm, new audit
capabilities (visual diff, true-render empty detect, panic-safe
trace, vtracer multi-colour recovery ~10-14 k icons).**

### Area 1 — Rust crates for SVG processing

| Crate | Verdict | Replaces / unlocks | Δ | Cost |
|---|---|---|---:|---:|
| **`resvg` + `usvg`** (Linebender, Apache/MIT, v0.47) | **High ROI** | Direct in-process rasterize; eliminates node-canvas/oslllo JS shim + IPC roundtrip | 30-50 s warm | 16-24 h |
| **`vtracer`** (visioncortex, MIT) | **✅ SHIPPED 2026-05-16** via `@neplex/vectorizer` 0.0.5 — pre-built native bindings on darwin/linux, no Rust toolchain. See §1 empirical-results sub-section. circle-flags pilot: 732/732 recovered (100 %). | new capability + ~270 ms / icon cache-miss | 8-12 h |
| **`tiny-skia`** (Linebender, BSD-3) | **High ROI** | CPU rasterize for visual-diff audit; 340 k glyphs @ 64×64 in ~5-8 s vs ~75 s TS | 70+ s | 4-6 h |
| **`fontations`** (`skrifa` + `read-fonts`, Google) | **High ROI** | `font_verify.ts` replacement + true-render empty-glyph check (catches what fontkit can't) | 3-7 s | 8-12 h |
| **`harfbuzz_rs`** | **Medium** | Native shaping; ~10× WASM `harfbuzzjs` (§8) | 28 s | 6 h |
| **`oxipng` / `imagequant`** | **Low** | PNG cache compression; saves disk not time | 0 s | 2 h |
| **`kurbo`** | **Reject** | Exact path-area; §14 explicitly says shoelace-in-TS is enough | — | — |
| **`lyon`** | **Reject** | Stroke→fill geometric tessellation; lossy on Iconify's open subpaths | — | — |
| **`roxmltree` / `svgtypes` / `xmlparser`** | **Reject** | DOM-less XML; splits duotone-detection IP across languages | — | — |

### Binding mechanism trade-off

| Mechanism | Per-call overhead | Setup | Fits our usage |
|---|---|---|---|
| **Subprocess CLI** (`Bun.spawn`) | ~500 ms startup once; ~0 per task via line protocol | 1-2 days for `pool.ts`-style harness | **YES — batch, not request/response** |
| napi-rs | ~10 µs/call; per-arch binaries | 1 week first time | Overkill for batch |
| Bun FFI | ~1 µs/call | 2 days; ABI-by-hand | Officially `experimental`; not for CI |
| neon | similar to napi-rs but older | similar | No advantage |

**Verdict: subprocess CLI with persistent JSON-line worker pool.**
napi-rs ONLY if a single primitive is hot enough to merit per-arch
releases (none today). Bun FFI is explicitly marked experimental and
inappropriate for our prod pipeline.

### Area 2 — Rust-implemented audit primitives

| Audit | Verdict | Replaces / unlocks | Δ | Cost |
|---|---|---|---:|---:|
| **1. In-process panic-safe stroke-fill** | **High ROI** | Replaces `stroke_fill.ts` + worker subprocess bisect; `catch_unwind` per icon | 10-15 s warm; 50 s cold | 20-30 h |
| **2. Parallel rasterize-and-pixel-diff** | **High ROI** | Visual regression audit (§4) at 5× JS speed; new capability | 12 s vs 75 s TS | 24-32 h |
| **5. True-render empty-glyph detection** | **High ROI** | Catches §3's ~570 silent empties fontkit misses; rasterize at 32×32, count non-zero | foundational | 6 h on top of #2 |
| **3. TTF ↔ SVG cross-verify (skrifa)** | **Medium** | Catches `svg2ttf` path simplification; non-existent in JS | new | 16-20 h |
| **4. Shoelace duotone audit (kurbo)** | **Medium** | Post-hoc validation of §14's area-leader heuristic | audit-only | 8 h |
| **6. Flutter render emulator** (harfbuzz_rs) | **Medium** | Shape-then-rasterize emulating TextPainter | new | 12-16 h |
| **7. Property tests for codepoint allocator** | **Low** | Duplicates allocator semantics across languages | — | — |
| **8. Parallel TTF byte-determinism check** | **Medium** | Implementable in TS for similar cost; only worth in Rust if crate exists | — | 4 h |

### Top-5 combined plan

1. `tools/generator-rust/iconifyx-trace` CLI — resvg + tiny-skia +
   panic-safe stroke-fill (~30-40 h)
2. vtracer subcommand for multi-colour recovery (~12 h)
3. Visual-diff audit subcommand (~32 h) — combines #2 + #5
4. skrifa-based font-verify subcommand (~12 h)
5. Persistent JSON-line worker pool on TS side (~12 h) — without
   this, per-pack subprocess startup wipes the Rust speed wins

**Total: ~100 h. Wall-clock**: 120 s → ~30-40 s warm regen. **New
capabilities**: visual diff + true-render empty detect.

### Where NOT to go

- **Don't rewrite `svg2ttf` in Rust.** §3 already weighs `opentype.js`
  (TS) vs `fontTools` (Python). Equally good engineering, no marginal
  win over existing plans.
- **Don't move SVG preprocessing to Rust.** `svg_preprocess.ts`
  (1 060 lines) embodies the duotone-detection IP. Splitting across
  languages doubles surface for "colour-bucketing changed but audit
  didn't" bugs. §7's `htmlparser2` AST migration stays TS.
- **Don't use Bun FFI.** Experimental per official docs.
- **Don't bother with neon.** napi-rs supersedes on every axis.

### GitHub Actions toolchain

`dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache@v2` works on
ubuntu/macos/windows with no special setup; cold-start ~30 s. Per-arch
binaries can be uploaded as workflow artefacts so downstream
contributors don't need Rust locally.

### Realistic budget table

| Investment | Wall-clock | New audit |
|---|---|---|
| Top-5 plan (~100 h / 2.5 wk) | 120 s → 30-40 s | Visual diff, true-render empty, panic-safe trace, +10-14 k icons via vtracer |
| Maximalist Rust rewrite (~6 wk) | 120 s → 15-20 s | Same + redundant svg2ttf replacement |
| TS-only §13/§15 (~20 h) | 120 s → ~55-70 s | Same audit set at TS speed |

**§13/§15 TS-only is the cheapest wall-clock win.** Rust's REAL
value is in the audit layer — specifically visual diff + true-render
empty-glyph detection, which are 5-10× faster AND less brittle than
JS-via-Sharp-via-resvg-via-node-canvas. Speed alone doesn't justify
Rust; audit capability does.

---

## §18 — Rust port-or-keep verdict (per-module)

**Verdict: NO Rust port of existing TS modules today.** §17 (new Rust
crate exposing new primitives) is a separate, narrower scope. This
section addresses "should we rewrite `tools/generator/src/*.ts` in
Rust?" — answer is no.

The hot loop's CPU work (resvg rasterize, Potrace trace) is **already
in Rust** via `oslllo-svg-fixer`. The rest of `tools/generator/src/`
is dominated by IO + JSON + string templating where Bun is within 2×
of optimised Rust. Do §15 first (~10 h TS, ~40-60 s saved); re-profile
after; only THEN consider porting the stroke-fill worker.

### Per-module verdict

| Module | LOC | CPU/IO | Port verdict | Δ if ported | Why |
|---|---:|---|---|---:|---|
| `index.ts` | 105 | trivial | **No** | 0 | CLI dispatch |
| `log.ts` | 30 | trivial | **No** | 0 | ANSI formatting |
| `paths.ts` | 61 | trivial | **No** | 0 | Path helpers |
| `load_iconify.ts` | 173 | IO + JSON | **No** | <1 s | Bun's `JSON.parse` is SIMD; serde_json adds FFI boundary cost > gain |
| `identifier.ts` | 94 | µs CPU | **No** | <50 ms | Pure string ops |
| `codepoint_allocator.ts` | 144 | tiny | **No** | <100 ms | Invariants where bugs are CATASTROPHIC; keep in debuggable lang |
| `manifest.ts` | 153 | IO + JSON | **No** | <500 ms | Most human-touched state; keep close to on-disk shape |
| `glyph_validator.ts` | 140 | tiny | **No** | <200 ms | Rust regex semantics differ subtly; risk re-introducing Mynaui `\.\d+` bug |
| **`svg_preprocess.ts`** | **1 060** | **CPU** | **No (port); Hybrid (§7 AST in TS)** | 1-3× via AST | The ONLY defensible candidate, but §7's `htmlparser2` migration delivers more correctness for less risk |
| `stroke_fill.ts` | 268 | orch | **No** | ~1-2 s | Just `Bun.hash` swap per §15 |
| **`stroke_fill_worker.ts`** | **124** | **calls Rust** | **Hybrid candidate** | 5-10 s cold; 0 warm | The ONE module where Rust is rational — but only if you ship vtracer (§1) in the same crate |
| `font_builder.ts` | 179 | CPU | **No** | 5-10 s | No Rust equivalent has `svgicons2svgfont`'s exact semantics; §3 plans `opentype.js` or fontTools instead |
| `font_verify.ts` | 183 | CPU + IO | **No** | 1-2 s | skrifa would halve it; 1 s for a new bridge — not worth |
| `stroke_audit.ts` | 338 | stats | **No** | <500 ms | Pure markdown emit |
| `coverage_report.ts` | 192 | trivial | **No** | <100 ms | — |
| `dart_codegen.ts` | 118 | tiny | **No** | <500 ms | String templates |
| `license_codegen.ts` | 52 | trivial | **No** | 0 | — |
| `pubspec_codegen.ts` | 129 | trivial | **No** | 0 | — |
| `website_codegen.ts` | 244 | CPU (JSON build) | **No** | 1-2 s | Per-pack JSON sharding (§11) is the real fix |
| `group_sets.ts` | 82 | trivial | **No** | 0 | Config loader |
| `pipeline.ts` | 979 | orch | **No** | 0 | TS/Bun is good at this |

### Counter-argument (why NOT to port)

The polyglot tax is concrete:

1. **Two toolchains per contributor.** Today: `bun install`. With
   Rust: `rustup` + target compile + cargo cache. Repo audience is
   Flutter/Dart devs debugging icon issues — pushing them to learn
   `cargo` to debug an SVG regex is a tax most won't pay.
2. **Two cache strategies on CI.** Bun lockfile + cargo target +
   sccache. Cache-key churn doubles; recovery from corruption is
   slower.
3. **Cross-language debugging friction.** Pipeline.ts → subprocess →
   Rust panic backtrace → cargo land. Splits CLAUDE.md's load-bearing
   invariants across two surfaces.
4. **§15 is strictly cheaper.** Per-font TTF cache (~4 h, 30-50 s) +
   SQLite-backed strokefill (~5 h, 5-10 s + fixes `git status` slow on
   43 087-entry `tabler/` dir) + `Bun.hash` (~30 min, 1 s) +
   `--skip-meta` (~1 h, 3-5 s/dev run). **~10 h, ~40-60 s saved.**
   Rust port costs 3× more for one-fourth the speedup.
5. **CLAUDE.md user prefs are explicit:** "Bun-based pipeline, not
   pnpm/npm." Stated preference for single-toolchain simplicity.

### Concrete recommendation

1. **Profile first** (30 min): `bun --cpu-profile`, `console.time`
   markers around 8 pipeline stages in `pipeline.ts:135-302`.
2. **§15 TS work** (~10 h total):
   - Per-font TTF cache (`font_builder.ts:34-75`, ~30-50 s)
   - SQLite-backed strokefill (`stroke_fill.ts:109-128`, ~5-10 s +
     fs cleanliness on APFS — 43 087 entries in `tabler/` cache)
   - `Bun.hash` over `crypto.sha1` (`stroke_fill.ts:78`, ~1 s)
   - `--skip-meta` flag (`index.ts` + `pipeline.ts`, ~3-5 s/dev)
3. **Re-profile.** If `svg_preprocess.ts` regex is still > 20 % of
   warm-cache time, do §7's `htmlparser2` AST migration (TS, ~8 h —
   delivers correctness AND speed).
4. **Only then** revisit Rust for `stroke_fill_worker.ts` — and only
   if committing to §1's vtracer recovery (~10-14 k icons), so the
   `tools/generator-rust/` crate amortises across two features.

### Bottom line

The "let's port to Rust" instinct is reasonable from a hot-take
perspective; the data says otherwise. **80 % of warm-cache time is
IO + JSON + template emit. The 20 % that's CPU is already Rust** under
a JS shim. The TS module with significant CPU (`svg_preprocess.ts`)
has a TS-side path (`htmlparser2`) that delivers more correctness for
less risk than a port. **Partial Rust port is NOT rational today.**

### Reconciling §17 and §18

§17 ≠ §18. §17 says **new Rust crate** for **new audit primitives**
(visual diff, true-render empty detect, panic-safe trace, vtracer
recovery) is high-ROI. §18 says **rewriting existing TS modules** in
Rust is low-ROI. Both can be true. The split: TS stays for
orchestration + preprocessing + codegen + reports; Rust comes in only
where it unlocks audit capabilities that are impractical in JS or
where panic-safety justifies the polyglot tax.

---

## §19 — Search-input space-bar bug: real root cause + previous-fix verdict

**Status of previous fix: WRONG SCOPE — diagnosed a non-existent
framework-level interception. The fix in `app_shell_layout.dart`
is dead code and the real bug was untouched.**

A focused debugging agent traced the actual symptom end-to-end and
found the bug is not at the focus / keyboard / shortcut layer at all.

### Real root cause: trim-then-write-back feedback loop

Same pattern is copy-pasted across three pages:

```dart
TextField(
  onChanged: (text) {
    final t = text.trim();         // ← strips trailing space the user just typed
    route.updateQueries(qs: {'q': t});
  },
);

// Elsewhere in the same widget:
route.queryNotifier.addListener(_onQueriesChanged);

void _onQueriesChanged() {
  final q = route.query('q') ?? '';
  if (_filterController.text != q) {
    _filterController.value = TextEditingValue(
      text: q,                                            // ← writes trimmed value back
      selection: TextSelection.collapsed(offset: q.length),
    );
  }
}
```

Trace for typing `a␣b`:
1. `a` → controller=`"a"` → trim no-op → query=`"a"` → listener finds
   controller==query → no-op.
2. `␣` → controller=`"a "` → onChanged → `t="a"` (trailing space
   stripped) → query stays `"a"` → listener sees `"a " != "a"` →
   **overwrites controller with `"a"`, caret at offset 1**.
3. `b` → user typing into `"a"` → controller becomes `"ab"`. From the
   user's POV, space was eaten and `b` came right after `a`.

The space the user typed is wiped before they can type the next char.

### File:line citations

| Page | Trim site | Write-back site |
|---|---|---|
| Search palette | `lib/features/search/search_page.dart:87-99` (trim at 91) | `lib/features/search/search_page.dart:76-85` |
| All packs filter | `lib/features/home/all_packs_page.dart:72-87` (trim at 74) | `lib/features/home/all_packs_page.dart:52-60` |
| Pack detail filter | `lib/features/pack/pack_detail_page.dart:79-114` (trim at 107) | `lib/features/pack/pack_detail_page.dart:79-87` |

### Why the previous `_ShellShortcuts` fix did not work

In vanilla Flutter web with a focused `TextField`, `space` never
reaches application Focus.onKeyEvent handlers in a way that could
swallow it:

- `WidgetsApp.Shortcuts(space → ActivateIntent)` ships at the root.
- `DefaultTextEditingShortcuts` immediately under it maps
  `space → DoNothingAndStopPropagationTextIntent` (web disabling map).
- `EditableText` installs `Actions(DoNothingAndStopPropagationTextIntent
  → DoNothingAction(consumesKey: false))` — returns
  `KeyEventResult.skipRemainingHandlers`, framework reports
  `handled: false` to the engine, browser IME inserts the space.

The custom `_ShellShortcuts` `Focus` is not in space's propagation
path; the framework stops it before that. Moreover the previous fix's
`_isTextFieldFocused()` check (`app_shell_layout.dart:87-91`) is
**itself broken**: `FocusManager.instance.primaryFocus.context.widget`
is the `Focus` widget EditableText builds at
`editable_text.dart:5804`, not the `EditableText` itself. The
`is EditableText` check is always false; the early-return never fires.

The fix is dead code that happens to be harmless only because none of
its activators (`Cmd+K`, `Ctrl+K`, `/`) match `space` anyway.

### Verdict on the agent's analysis: CORRECT

Cross-checks that validate the root cause:

1. **Empirical signal**: typing `mdi line` in `/packs` produces URL
   `/packs?q=mdiline` — confirms the wipe happens in
   route→controller direction, not at the keyboard layer.
2. **Framework reality check**: Flutter web's
   `DefaultTextEditingShortcuts` for space is verifiable in the
   Flutter source — agent cited the exact file:line.
3. **Internal consistency**: agent's trace explains why other
   keys work but only space is eaten (only space gets stripped by
   `trim()`; non-trailing-whitespace chars survive).
4. **Previous-fix sanity**: `is EditableText` check failing is
   verifiable by reading the Flutter framework's EditableText source.

### Fix recommendation

**Option A (recommended)**: stop trimming inside `onChanged`. Trim only
at the point of consumption (already done in `_visible` / `_entries` /
`_applyFilters` via `q.trim().toLowerCase()`). URL keeps user's literal
text and the round-trip listener no longer wipes the controller. URL
becomes `?q=a%20b` — correct, matches every browser address bar.

Two-line change per file:
- `search_page.dart:87-99` — drop `final t = value.trim();`. Store
  `value` directly.
- `all_packs_page.dart:72-81` — same: `_setFilter(text)` stores `text`
  raw.
- `pack_detail_page.dart:105-114` — same.

**Option B (only if literal spaces in URL are unwanted)**: keep
`.trim()` in `_setFilter` BUT guard `_onQueriesChanged` so it doesn't
overwrite controller when only difference is whitespace mid-edit:
`_filterController.text.trim() != q`. Strictly worse than A; leaves a
footgun.

Also remove the broken `_isTextFieldFocused()` early-return in
`app_shell_layout.dart:87-102` — it's dead code with a misleading
comment block that will trip a future contributor.

### Reproducer

Confirm bug:
1. `cd packages/iconifyx/website && fvm flutter run -d chrome`
2. `/packs` → "Filter packs…" field → type `mdi line` → observe
   `mdiline` (space missing); URL stays `/packs?q=mdiline`
3. `/pack/mdi` → type `home outline` → observe `homeoutline`
4. `/search` (press `/` or top-bar search) → type `home outline` →
   observe `homeoutline`

Verify fix:
1. Apply the three trim removals.
2. Each field shows `mdi line` / `home outline` / `home outline`; URL
   reflects `?q=mdi%20line` etc.
3. Smoke check: `/` outside a field opens palette; `/` inside a field
   inserts literal `/`; `Cmd-K` opens palette from both.

### Lesson

The previous fix added complexity to the wrong layer because the
symptom ("space doesn't work in a TextField") pattern-matched to a
familiar Flutter footgun (Shortcuts intercepting keys before
EditableText). The actual bug was in the data-flow contract our own
code defined. **Before reaching for framework-level fixes, instrument
the data path first.**

---

## §20 — Figma + ecosystem SVG tooling (publicly known)

**Verdict: Two NEW ideas worth adopting beyond §17 — (a) `usvg`
subprocess as a normaliser PRE-PASS for the whole pipeline (supersedes
parts of §7), and (b) OKLab/RGB K-means k=2 for 3-colour → duotone
reduction (recovers ~2-4 k currently-dropped icons).**

### Figma's renderer (what's publicly known)

- C++ → WebAssembly via Emscripten; same source compiles to native
  binaries for server-side rendering ([Figma WebGPU blog](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/))
- Tile-based GPU renderer; migrated GLSL → WGSL for WebGPU (2025)
- Custom SVG importer, not Skia's — Evan Wallace: "no standardized
  way of converting SVG markup to pixels; most tools have their own
  custom importers"
- Path simplification, transform flattening, malformed SVG handling —
  **not publicly documented**

**For iconifyx**: zero direct adoption — proprietary runtime renderer.
The transferable principle is "**normalise before rendering**", which
maps directly to picosvg + usvg.

### Other commercial tools

- **Sketch / Affinity** — Core Graphics / Metal proprietary; not
  borrowable.
- **Adobe Illustrator** — proprietary PostScript-derived; closed.
- **Inkscape** — Cairo + `lib2geom` (C++ Bezier arithmetic). No JS
  bindings; kurbo (Rust) is a simpler analogue.
- **Penpot** — JS/SVG-native browser rendering; wrong abstraction for
  batch codegen.

### Open-source production SVG tools — verdict table

| Tool | Lang | Role | Real-world dirty SVG | Verdict |
|---|---|---|---|---|
| **resvg + usvg** (Linebender) | Rust | Parser + rasterizer | Best in class — beats librsvg 7/7, more spec tests passing | **Already in use; direct adoption per §17** |
| **librsvg** | Rust (was C) | Renderer | Slower, less spec-compliant than resvg | Skip |
| **Skia (SkSVG)** | C++ | Renderer | Experimental per Skia team | Skip |
| **picosvg** (Google) | Python | Normaliser | Resolves `<use>`, flattens transforms via skia-pathops, strokes→fills, expands clip paths | **Adopt per §8** |
| **`usvg` (standalone)** | Rust | Normaliser | Resolves all references/transforms; outputs `M/L/Q/C/Z` only with absolute coords | **NEW Adopt — pure Rust, no Python dep** |
| **vtracer** (visioncortex) | Rust | Image → SVG tracer | Hierarchical multi-colour stacked | **Adopt per §1** |
| **svgo** | JS | Optimiser | Designed for clean SVG; transform flattening NOT implemented ([issue #624 since 2015](https://github.com/svg/svgo/issues/624)) | Light cleanup only |
| **Inkscape CLI** | C++/Py | Full app | Strongest dirty handler | Too slow (GUI startup); last-resort only |
| **ThorVG / Pathfinder / Vello** | various | Renderers | SVG Tiny / research-grade / immature | Skip — wrong abstraction for build-time |

### Multi-colour → monochrome reduction (key §5e unlock)

**No mainstream tool does "intelligent" multi-colour → mono reduction**
— every icon-font builder (IcoMoon, Fontello, fantasticon) drops fill
info and ships the union silhouette (= our current paint-order drop
failure mode).

The genuine state of the art:
- **vtracer Binary mode** — same silhouette failure as ours; skip
- **vtracer Color mode + stacked hierarchy** — §1 plan; top-2 layers
  map onto our duotone primary/secondary slots
- **OKLab / DeltaE2000 K-means clustering** ([Okolors](https://github.com/IanManske/Okolors))
  — for 3+ colour bodies, cluster to top-2 OKLab centroids, assign
  each path to nearest centroid, emit as duotone

**NEW concrete proposal: 3-colour → duotone via k-means clustering**

For the ~3 k currently-dropped 3-colour emojis (subset of 22 k):
1. Run OKLab (or cheaper RGB-Euclidean — §2 notes 50× cheaper at 95 %
   accuracy) K-means with k=2 over per-path fill colours, weighted by
   shoelace area
2. Assign each path to closer centroid
3. Emit as duotone — larger cluster = primary, smaller = secondary

**Expected recovery**: ~2-4 k icons (needs prototyping). Combined with
vtracer (10-14 k) reduces the 22 k drop to ~6-8 k truly intractable.

**Cost**: ~1 day implementation. **Not in any prior section.**

### Transform flattening — `usvg` is the answer

`usvg` (Rust) and `picosvg` (Python) are both production-grade. svgo's
transform flattening is explicitly broken (open issue 10+ years). The
new recommendation:

**Adopt `usvg` as a subprocess PRE-PASS before `svg_preprocess.ts`.**

- Eliminates ALL `<use>`-related bugs in current regex paths
- Removes much of §7's motivation (htmlparser2 AST migration) on the
  parsing-correctness axis — usvg already normalised everything
- Pre-normalised bodies have stable hashes → cache hit rate jumps
- Pure Rust; no Python dependency (vs picosvg)
- Cost: subprocess hop per cache-miss icon (~5 ms with §15's
  persistent worker pool)

This is genuinely new and supersedes ~50 % of §7's value.

### SVG → font glyph: state of the art

| Pipeline | Adoption | Verdict |
|---|---|---|
| **fontTools + cu2qu + skia-pathops** (Python) | **Google Fonts, Adobe, Apple, Material Symbols all use this** | Gold standard — `cu2qu` properly converts SVG cubics to TTF quadratics (svg2ttf does NOT) |
| **opentype.js** (JS) | Lighter alternative | Lacks built-in cu2qu; needs partial port |
| **harfbuzz_rs / harfbuzzjs** | Verifier layer, not builder | True-render empty-glyph detection |

**For iconifyx**: §3 already plans this swap. fontTools is the right
replacement despite Python dep (uv venv mitigates); explains
meteocons/devicon ~570 silent empty-glyph rate.

### GPU vs CPU verdict

**CPU wins for our pipeline.** Reasons:
- Hot path is parse → normalise → trace → emit TTF, not rasterise
- Rasterise only inside stroke-fill + future visual-diff audit
- At 64×64, GPU is starving (texture upload + readback dominates)
- Skia team's own benchmarks: "CPU rasterisation still beats GPU
  Skia for complex content" — and icon paths qualify as "complex"
- Vello / WebGPU is impressive but wgpu setup tax is real

**Stick with CPU**: resvg + tiny-skia via §17's Rust crate. Skip
Vello, GPU Skia, Pathfinder. Revisit if 340 k → 5 M icons.

### Top-5 adoption recommendations

| # | What | Where | Recovery / Δ | Cost |
|---|---|---|---:|---:|
| 1 | **vtracer for paint-order recovery** (§1 plan) | New `vtracer_worker.ts`, paint-order drop branch | **+10-14 k icons** (twemoji, noto, fluent-emoji, circle-flags) | 2 days |
| 2 | **`usvg` subprocess as normaliser pre-pass** (NEW) | Insert before `svg_preprocess.ts` | Correctness uplift across ALL packs; cache stability; eliminates ~5-8 regex bugs | 1.5 days |
| 3 | **picosvg pre-validator** (§8 plan) | Subprocess after preprocess, before font build | -570 silent empties (~3 %) + svg2ttf failure prediction | 1 day |
| 4 | **OKLab K-means k=2 for 3-colour → duotone** (NEW) | New path in `trySplitTwoColorBody` after vtracer | **+2-4 k icons** | 1 day |
| 5 | **fontTools (or opentype.js) replacing svgicons2svgfont + svg2ttf** (§3 plan) | Swap `font_builder.ts` backend | -95 % silent empties; proper cu2qu cubic→quadratic | 2-3 days |

**Combined effect**: ~22 k drop → ~6-8 k truly intractable (70 %
recovery). Plus ~95 % empty-glyph reduction. Cleaner preprocessing.
Total ~6-8 days; the two genuinely-new ideas are usvg-as-normaliser
and OKLab-3-colour-to-duotone.

### Explicit non-adoption

- Vello / WebGPU / GPU rasterisation — CPU sufficient
- lib2geom — C++ only, kurbo simpler
- ThorVG / Pathfinder / Skia GPU — wrong abstraction
- SVGO `convertTransform` — broken for our transforms
- Inkscape CLI — too slow even headless

---

## §21 — GitHub Pages deployment plan ✅ **SHIPPED**

> 🚀 **STATUS: SHIPPED.** Workflow lives at
> [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml);
> operator guide at [`docs/DEPLOYMENT.md`](DEPLOYMENT.md). Flag-set diverged
> slightly from the YAML in this section because Flutter 3.44 removed
> `--web-renderer` and `--pwa-strategy` and the website requires
> `--no-tree-shake-icons` (see DEPLOYMENT.md "Build flag notes" for the
> mapping). Local build verified: 163 MB, well under the 250 MB guard.
> One-time GitHub Pages "Source = GitHub Actions" repo setting remains as
> a manual user step before the first deploy can succeed.

**Verdict: Ship via single GitHub Actions workflow at
`.github/workflows/deploy-web.yml` — CanvasKit renderer, hash routing
(already active), base href `/icons/`, generator does NOT run in CI
(generated files committed), ~169 MB bundle today. Day-1 deploy with
clear day-2 perf roadmap.**

### Pre-flight checklist

- **FVM pin exists** — `.fvmrc:1-3` declares `flutter: 3.44.0-0.3.pre`;
  `subosito/flutter-action@v2` accepts `flutter-version-file: .fvmrc`
- **Website is its own pub workspace** — `packages/iconifyx/website/
  pubspec.yaml` has ~206 `path:` deps; CI must `cd` into this dir
- **All generated package source is committed** per CLAUDE.md "File
  ownership" — codegen output is NOT regenerated in CI
- **Website data JSONs committed** — `lib/data/icons_index.json`
  (9.3 MB), `packs.json` (204 KB) declared as assets
- **NO `setUrlStrategy(PathUrlStrategy())` call** — confirmed via
  grep. Flutter web defaults to hash routing → `/#/pack/mdi`. This
  is what we want for Pages (no 404.html SPA fallback needed).
- **`web/index.html:17` uses `$FLUTTER_BASE_HREF` placeholder** —
  build substitutes correctly
- **Pages must be set to "GitHub Actions" source** (not "Deploy from
  branch") in repo settings — one-time manual step

### Renderer + routing decision

**Renderer: CanvasKit, locked.** Site renders 15 k cells via TTF text
rendering — HTML renderer would catastrophically regress the
`IconifyIcon` `CustomPaint` + `TextPainter` path. Pass `--web-renderer
canvaskit`. CanvasKit's ~3 MB WASM served from `gstatic.com` by
default (faster + globally cached than Pages).

**Routing: hash (default).** URLs are `/#/pack/mdi`. GitHub Pages
serves the hash fragment; SPA handles it. No 404.html dance.

### Concrete `.github/workflows/deploy-web.yml`

```yaml
name: Deploy website to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'packages/iconifyx/website/**'
      - 'packages/iconifyx_*/**'
      - '.fvmrc'
      - '.github/workflows/deploy-web.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/iconifyx/website
    steps:
      - uses: actions/checkout@v4

      - name: Setup Flutter (via .fvmrc pin)
        uses: subosito/flutter-action@v2
        with:
          flutter-version-file: .fvmrc
          channel: any
          cache: true

      - name: Pub cache
        uses: actions/cache@v4
        with:
          path: |
            ${{ env.PUB_CACHE }}
            ~/.pub-cache
          key: pub-${{ runner.os }}-${{ hashFiles('packages/iconifyx/website/pubspec.lock') }}
          restore-keys: pub-${{ runner.os }}-

      - run: flutter pub get
      - run: flutter analyze lib --no-fatal-infos

      - name: Build web (CanvasKit, hash routing, no service worker)
        run: |
          flutter build web \
            --release \
            --web-renderer canvaskit \
            --base-href "/icons/" \
            --pwa-strategy none \
            --source-maps=false

      - name: Bundle size guard
        run: |
          size=$(du -sm build/web | cut -f1)
          test "$size" -lt 250 || { echo "build/web exceeded 250 MB"; exit 1; }

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/iconifyx/website/build/web

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Base href + custom domain matrix

| Scenario | URL | `--base-href` | `web/CNAME` |
|---|---|---|---|
| Default (repo Pages) | `https://Bthn.github.io/icons/` | `"/icons/"` | omit |
| User Pages (rename repo) | `https://Bthn.github.io/` | `"/"` | omit |
| Custom domain | `https://iconifyx.dev/` | `"/"` | `iconifyx.dev` |

Hash routing means base href is the only mount-path-coupled config —
no zenrouter changes.

### Asset hosting

**Day 1: serve everything from GitHub Pages.** Pages auto-gzips JS /
CSS / JSON / HTML via Fastly CDN. TTFs uncompressed but already
internally compressed (~5-10 % brotli/gzip gain). 100 GB/month
bandwidth + 100 MB/file limit fine for our largest TTF.

**Day 2: migrate `icons_index.json` + `packs.json` to jsDelivr per
§11/§12.** Trims ~10 MB off initial download. Don't do day 1; ship
Pages-only first, validate pipeline, layer CDN later.

**TTFs stay on Pages** until §9's `FontLoader` lazy registration
lands (1-2 days). Today Flutter web declares every TTF in
`FontManifest.json` but downloads lazily on first glyph render.

### Day-1 perf caveats

Real numbers from current `build/web`:
- `main.dart.js` 2.8 MB → ~700 KB gzipped by Pages
- `canvaskit.wasm` ~5 MB (loaded from gstatic)
- `assets/packages/` 112 MB across 320 TTFs — lazy-fetched on first
  glyph render (median ~360 KB per pack first-visit)
- `assets/lib/icons_index.json` 9.3 MB → ~2.1 MB gzipped (parsed via
  `compute(_parse)` so main thread isn't blocked)
- Lighthouse score: probably 40-60 on mobile until §11 + §9 land
- WASM-out-of-bounds crash from heavy navigation NOT made worse by
  Pages — CanvasKit heap accumulation; fixed only by `FontLoader`
  lazy registration

### Day-2+ roadmap

1. `packs.json` via jsDelivr (§12; 3-4 h) — fastest perceived win
2. `icons_index.json` shards + `names.bin` (§11; 4-6 days) — drops
   initial download from ~12 MB → ~1.5 MB; phased rollout with
   `kUseCdn` const for one-flip rollback
3. Lazy `FontLoader` per pack (§9; 1-2 days) — fixes WASM OOB
4. Custom domain + HSTS once chosen

### Rollback plan

No point-in-time restore on Pages. Three layered options:

1. **Re-deploy known-good SHA**: `gh workflow run "Deploy website to
   GitHub Pages" --ref <good-sha>` (workflow_dispatch trigger
   enables this). ~2 min back to that SHA's output.
2. **Pin to release branch**: change trigger to `branches: [release]`;
   cherry-pick stable commits.
3. **Disable site**: repo Settings → Pages → "Unpublish site" until
   you fix forward.

Deploy artifact retained 90 days in Actions tab.

---

## §22 — Pack structural audit

**Verdict: Adopt 5 incremental structural changes (~18 h total)
without touching the per-set-package layout (which is load-bearing).
Biggest win: split alias double-emission off into a separate library
— halves MDI's class file from 70 k → 35 k LOC. Don't add nested
sub-classes or runtime name-lookup — both break tree-shake.**

### Current inventory

226 packs (225 Iconify sets + core + meta). Per-pack: one
`@staticIconProvider class XxxIcons` with N flat `static const`
fields. Size dramatically varies:

| Pack | LOC | Icons |
|---|---:|---:|
| MaterialSymbolsIcons | 92 894 | 18 575 |
| MdiIcons | 70 009 | 13 998 |
| TablerIcons | 127 578 | — |
| PhIcons | 47 537 | 7 920 (1 528 duotone) |
| LucideIcons | 39 619 | ~4 500 |

Every pack pins `version: 0.1.0`. Class names follow `<Camel>Icons`
consistently across 10 sampled packs — no drift.

### Manifest metadata leakage

Iconify's upstream `categories`, `aliases`, `tags`, `samples`,
`suffixes` are read by `load_iconify.ts` / `website_codegen.ts` and
flow to website's `icons_index.json` — but **NOT into manifests or
Dart codegen**. 9.8 MB JSON is the de-facto reflection layer; it's
website-only.

### Granularity findings

**50 of 225 packs ship explicit `suffixes` metadata** (Material
Symbols has 6 styles, Phosphor 6 weights, Solar 6 styles, Fluent 20
size+fill combos). Today codegen flattens ALL into one class. 22 %
of catalog has structural axes we discard.

**75 of 225 packs ship `info.categories`** (MDI has 61, fa7-solid 74,
solar 37, iconoir 46). None surfaces in Dart.

**Near-duplicate clusters**: mdi + mdi-light + memory (Pictogrammers,
disjoint names); Font Awesome v4 + v6 + v7 × 3 styles = 9 packs;
streamline 23 packs from one vendor; fluent 6 prefixes; token +
token-branded (half overlap).

### Verdict on granularity

- **Per-set fonts must stay separate** (tree-shake/bundle invariant
  per CLAUDE.md §6, empirically verified) — NON-NEGOTIABLE
- **Per-set DART PACKAGES are a separate question** — consumer bundle
  depends on which TTFs ship, not which pub package the const came
  from. Current 225-package layout duplicates pubspec/license/re-
  export for no per-app benefit. But: merging risks tree-shake
  regression. Status quo is safer.

### API shape weaknesses

1. **Identifier soup**: `MdiIcons.n123Off` (Dart reserved prefix `n`
   for leading digit), `aBCOff`, `homeOutlineRounded`. Autocomplete
   guessing game past ~5 k items.
2. **No compile-time metadata reachable**: can't ask
   `MdiIcons.home.category` or `.style`.
3. **Aliases doubled**: MDI has 6 363 aliases on 7 638 base icons
   (**83 % alias ratio** — half of `MdiIcons` is alias const fields).
   Material Symbols 2 364 aliases, iconoir 338, lucide 216.
4. **No variant resolver** linking `PhIcons.acornThin` /
   `PhIcons.acornDuotone` siblings.

### Alternative API shapes — verdicts

| Shape | Tree-shake | Verdict |
|---|---|---|
| Status quo (flat consts) | full | What we have |
| Sub-classes (`MdiIcons.weather.sunny`) | **BROKEN** | `@staticIconProvider` requires flat-field invariant; const_finder doesn't recurse into non-annotated nested classes |
| Multi-class same-package (`MdiWeatherIcons`) | full | Each sub-class itself `@staticIconProvider`; ~60 classes per pack to import |
| Runtime resolver (`Pack.mdi.iconNamed('home')`) | **BROKEN** | Any string lookup forces all icons retained — exact reason `font_awesome_flutter` is broken |
| Variant resolver (`Phosphor.acorn(weight: thin)`) | **partial broken** | At call site forces all variants retained |
| Lazy metadata map (`MdiIcons.byCategory['weather']`) | **broken for map** | Map keyed by category retains all referenced icons — acceptable for browse, not for "I only use 3 icons" |

**High-ROI shape**: keep flat consts AND add a SEPARATE
`<Prefix>Catalog` runtime data layer in its OWN library file. Default
import unchanged (shakable); browse-needing consumers opt into
`import 'package:iconifyx_mdi/catalog.dart'`.

### Top-5 structural recommendations

#### Rec 1 — Move alias double-emission into a separate library (highest ROI)

**Change**: emit canonical consts in main class + sibling `lib/
aliases.dart` exporting `const Map<String, IconifyIconData> mdiAliases`.

**Cost**: ~6 h. One change in `dart_codegen.ts`. Manifest entries
grow `aliasOf?: string`.

**Benefit**: `MdiIcons` 70 k → ~35 k LOC. Material-symbols, iconoir,
lucide similarly halved. IDE autocomplete on MDI becomes usable
(14 k → 7 635 entries).

**Tree-shake**: canonical fields preserve shake; alias map opt-in
breaks shake by design (correct).

**Compat break**: call sites referencing alias-only consts
(`MdiIcons.account` for canonical `person`). Mitigation: ship
`lib/aliases_legacy.dart` with `@Deprecated` re-exports for one
release.

#### Rec 2 — Per-pack category data layer

**Change**: for 75 packs with `info.categories`, emit `lib/
categories.dart` with `const Map<String, List<IconifyIconData>>`.
NOT part of default export.

**Cost**: ~4 h. Manifest field + `category_codegen.ts`.

**Benefit**: picker / docs consumers do `mdiCategories['weather']!
.map((i) => IconifyIcon(i))` instead of importing the website's
9.8 MB index.

**Tree-shake**: preserved for non-importers. Importers get correct
all-or-nothing retention.

**Compat**: purely additive.

#### Rec 3 — Independent per-pack versioning

**Change**: `pubspec_codegen.ts` hashes manifest + fonts + license
per pack. On regen, only bump packs whose hash changed.

**Cost**: ~3 h.

**Benefit**: `iconifyx_mdi 1.4.2` and `iconifyx_streamline 0.7.0`
co-exist with honest semantics. pub.dev consumers can pin
meaningfully. Today's "everything at 0.1.0" forecloses publishing.

**Tree-shake / compat**: zero impact.

#### Rec 4 — Category-meta packages (`iconifyx_logos`, `iconifyx_emoji`, …)

**Change**: for top-level Iconify `info.category` buckets (~15) with
> 2 packs, emit a meta pack re-exporting its members.

**Cost**: ~3 h.

**Benefit**: "all logo packs" → `depends_on: iconifyx_logos_meta`
instead of enumerating logos + simple-icons + cib + cryptocurrency-
color + token-branded + vscode-icons. Middle ground between
kitchen-sink `iconifyx` and individual packs.

**Tree-shake**: identical to current meta. Asset cost explicit per
meta-pack.

**Compat**: purely additive; existing `iconifyx` stays.

#### Rec 5 — Promote `IconSetLicense` → `PackInfo` ✅ SHIPPED

**Change**: rename + extend to include `category`, `tags`,
`iconifyPrefix`, `hasDuotone`, `hasPaintOrder`. Keep
`iconSetLicense` as `@Deprecated` alias.

**Cost**: ~2 h.

**Benefit**: compile-time pack-capability introspection. Useful for
picker UI ("filter to duotone-capable packs").

**Tree-shake**: one const per pack — zero impact.

**Compat**: old `iconSetLicense` stays for one release.

**Status (2026-05-16):** every per-set package now emits TWO consts in
`lib/src/license.dart` — `packInfo` (new) carrying `prefix` / `name` /
`category` / `tags` / `iconCount` / `hasDuotone` / `hasPaintOrder` /
`iconifyJsonVersion` / `author` (`IconAuthor`) / `license`
(`IconSetLicense`), and the back-compat `iconSetLicense` const
(identical payload to `packInfo.license`). New types live in
`packages/iconifyx_core/lib/src/license_info.dart`. Tree-shake invariant
preserved — both consts contain only metadata, no `IconData`
references. The capability flags are computed at codegen time by
walking `manifest.icons` for `duotone` / `duotoneKind === 'paintOrder'`.
`info.tags` is plumbed through `manifest.info.tags` (new optional
field) from the full @iconify/json pack JSON. Verified with `mdi`
(non-duotone), `ph` (`hasDuotone: true`), and `logos`
(`hasDuotone: true, hasPaintOrder: true`).

### What NOT to do

1. **DO NOT nested sub-classes** — `@staticIconProvider` requires
   flat-field invariant; nested non-annotated classes drop out of
   tree-shake (Flutter issue #63920).
2. **DO NOT merge per-set Dart packages into one mega-package** —
   would re-ship every font for any consumer (the exact failure
   `font_awesome_flutter` has).
3. **DO NOT add runtime `Pack.iconNamed(String)` to the main class**
   — string lookup forces all icons retained.
4. **DO NOT add `Material.resolve(name, style, weight)` top-level** —
   same issue. Move it to a separate library if anyone wants it.
5. **DO NOT collapse `mdi` + `mdi-light`** — disjoint icon names;
   merging bloats every consumer with both fonts.
6. **DO NOT emit per-icon category docstrings by default** —
   MDI would balloon 70 k → ~110 k LOC. Opt-in config flag only.
7. **DO NOT silently remove empty packs (`svg-spinners`, `fluent-
   color`)** — preserve manifests (codepoint invariant). Skip
   pubspec emission when icon count < 10; document in COVERAGE.md.

### Total combined cost

~18 h for top 5. Largest wins: alias-map split (halves biggest pack
class files) and category data layer (closes the 75-pack metadata
gap that pushes consumers to fetch the website's 9.8 MB index).

---

## §23 — Website performance bottlenecks (audit + top-10 fixes)

**Verdict: Three changes (~4 h total) deliver the biggest user-felt
wins. #1: remove the per-cell `SvgPicture.network` call from
`_IconCell` — currently fires 50+ external HTTPS requests per
viewport scroll on /pack/<x>. #2: stop `setState()` on every
ScrollEndNotification — rebuilds 15 k filter scan per fling-stop.
#3: debounce search keystrokes 60-80 ms.**

### Bottleneck inventory (ranked by user-felt impact)

| Rank | Bottleneck | Where | Evidence |
|---|---|---|---|
| **1** | Every pack-detail cell fires `SvgPicture.network()` against api.iconify.design | `pack_detail_page.dart:580` | `SvgPicture.network(iconifySvgUrlTinted(record, accent), ...)` inside `_IconCell.build`, gated only by `Scrollable.recommendDeferredLoadingForContext` |
| **2** | Every TTF declared eagerly in `FontManifest.json` — 330 entries, 320 TTFs, **112 MB icon fonts** | `pubspec.yaml:13-464`, `build/web/assets/FontManifest.json` | CanvasKit cache grows monotonically → `memory access out of bounds` after navigating ~20 packs |
| **3** | `icons_index.json` 9.3 MB shipped in main bundle, parsed on boot | `lib/data/icons_index.json`, `icon_catalog.dart:207-256` | measured file size |
| **4** | Search scans 165 k icons linearly per keystroke (no index) | `search_page.dart:163-170`, `pack_detail_page.dart:141-165` | `catalog.lowerNames[i].contains(q)` per icon, no debounce, no index |
| **5** | `PackDetailPage._onScrollNotification` calls `setState()` on every ScrollEndNotification | `pack_detail_page.dart:174-182` | `_LoadedBody` is StatelessWidget so its build rebuilds + reruns `_applyFilters(15k)` per fling |
| **6** | `_PaletteRow.AnimatedContainer` 90 ms color tween per row | `search_page.dart:633-639` | also flickers mid-tone — same anti-pattern HoverBox rule fixed elsewhere |
| **7** | `IconifyIcon` builds fresh `TextPainter` per paint (no shape cache) | `iconifyx_core/lib/src/iconify_icon.dart:154-178` | 15 k cell scroll allocates 1-2 TextPainters per cell, replaced on `shouldRepaint` |
| **8** | CanvasKit text-shape cache unbounded across pack nav | engine-level | CLAUDE.md performance section already documents |
| **9** | Nested LayoutBuilder scopes (PageContainer LB → page LB → SliverPersistentHeader LB) | `pack_detail_page.dart:231`, `all_packs_page.dart:116`, `app_shell_layout.dart:159` | double layout pass per resize/scroll cycle |
| **10** | `/packs` SliverMasonryGrid renders 206 PackTiles × 4 IconifyThumb previews each | `pack_tile.dart:60-75` | 824 max IconifyThumbs but lazy |

### CLAUDE.md rules — drift verification

| Rule | Status | Notes |
|---|---|---|
| §1 No `shrinkWrap`+`NeverScrollable` | OK | grep clean |
| §2 Top-level `Sliver*.builder` for big lists | OK | both pages correct |
| §3 NEVER wrap big slivers in `SliverLayoutBuilder` | OK | comments document |
| §4 Hoist `Theme.of` out of cell builders | **PARTIAL VIOLATION** | `_IconCell` clean BUT `pack_tile.dart:18-26` does 6× Theme.of per tile (206 × 6); ditto `_AllPacksHeader`, `_FeaturedPacksSection`, `_HeroScatter`, `_ScatterTile`, `_PaletteRow` (`search_page.dart:613`) |
| §5 Render via `IconifyThumb` | OK | icon-detail uses `IconifyIcon` (fine — canonical render path) |
| §6 Slider commits on snap | OK | `_SizeSliderRow` stateless `onChanged: onCommit` |
| §7 Deferred-rendering for fling scrolls | **PARTIALLY DEFEATED** | `_IconCell` reads the helper (good) but `_onScrollNotification` then triggers full `setState` on every ScrollEndNotification — rebuilds `_LoadedBody`, re-runs `_applyFilters`, re-allocates SliverGrid |

### Cold-start audit (hypothesised waterfall)

1. `index.html` (~1.5 KB), `flutter_bootstrap.js` (~10 KB) — instant
2. `main.dart.js` **~3.0 MB minified** → ~700 KB brotli → 250 ms
   cable / 1.5 s 4G LTE
3. `canvaskit.js` (88 KB) + `canvaskit.wasm` **6.9 MB** → parallel
   with #2, 300-800 ms compile
4. `_BootScreen` shows spinner (good — no white screen)
5. `packs.json` (204 KB raw, ~32 KB brotli) — fine
6. **`icons_index.json` 9.3 MB raw → ~2.1 MB brotli** — 400-900 ms
   cable / 2-5 s 4G LTE. Parsed via `compute(_parse)` Web Worker so
   doesn't block home paint, but search/pack-detail wait on it.
7. First viewport paint ~1.5-3 s cable / 5-10 s 4G LTE
8. **First IconifyThumb paint** triggers Flutter web to fetch the
   relevant TTF lazily on first `TextPainter.layout()` — confirmed
   NOT preloaded into CanvasKit

**Net**: home interactive in 2-4 s cable, 8-15 s 4G LTE. The 112 MB
icon fonts are LAZY — only fetched on first reference. But every
visited pack's TTF stays in CanvasKit cache forever → §8 crash.

### CanvasKit font memory pathway (confirmed)

1. Flutter web loads a TTF lazily on first `(fontFamily, package)`
   TextPainter reference. Font goes into `FontFallbackManager`
   registry.
2. **No public API to unregister.** Loaded TTFs persist for page
   lifetime.
3. Each pack nav adds ~50 KB-10 MB to resident set. Average ~545 KB.
4. After ~20 unique packs → ~10 MB font memory + shaped-glyph cache.
5. Once CanvasKit WASM heap exceeds ~2 GB linear-memory cap (4 GB on
   COOP+COEP isolated) → crash.

### Search bottleneck

Today: 165 k UTF-16 substring searches per keystroke. ~30-80 ms
steady state release; users perceive ~50-100 ms input latency.

Recommended layered fixes:
1. **Debounce keystrokes** 60-80 ms — 1-line fix, immediate UX win
2. **Trigram bitmap pre-filter** (§9.3-gram plan) for `q ≥ 3` chars:
   `Uint32List` per trigram, AND bitsets at query time. <16 ms per
   keystroke. Memory ~5 MB with Bloom-filter or pack-bucketing.
3. FlexSearch via JS interop — works but 300 KB JS + boundary
   crossing per keystroke. Trigram-in-Dart is faster.

### Top-10 ranked fixes

| # | Change | Files | Cost | Δ user-felt | Risk |
|---|---|---|---:|---|---|
| **1** | **Remove `SvgPicture.network` from `_IconCell`**; keep on icon-detail sheet only | `pack_detail_page.dart:580`, `:255-264` | 1 h | **huge**: kills 50+ HTTPS req/scroll on /pack/<x>; fixes offline; fixes "right half blank" | low |
| **2** | **Replace `setState()` on ScrollEndNotification with ValueNotifier<int>**; only `_IconCell.build` listens via ValueListenableBuilder | `pack_detail_page.dart:174-182` + `_IconCell` | 2 h | **medium-large**: scroll-end jank vanishes; 15 k filter scan no longer per fling | low |
| **3** | **Debounce search keystrokes 60-80 ms** | `search_page.dart:87-99`, `pack_detail_page.dart:105-114`, `all_packs_page.dart:72-81` | 1 h | medium: search feels instant; cheaper URL stack | low |
| **4** | Add `RepaintBoundary` around `_IconCell` outer container | `pack_detail_page.dart:520-545` | 30 min | medium: hover snappiness on long lists | low |
| **5** | Hoist `Theme.of` out of `PackTile` and `_PaletteRow` — mirror `_CellPalette` pattern | `pack_tile.dart:18-26`, `search_page.dart:613-620`, `home_page.dart` | 1.5 h | small-medium: tile rebuilds ~2× cheaper | low |
| **6** | Trigram pre-filter for queries ≥ 3 chars in `IconCatalog._parse` | `bootstrap/icon_catalog.dart`, `search_page.dart:163-170` | 1 day | medium-large: search feels instant on mobile too | medium (verify memory ≤ 5 MB) |
| **7** | Cache `ui.Picture` of painted glyph in `_IconifyPainter`, LRU ~2000 | `iconifyx_core/lib/src/iconify_icon.dart` | 3 h | medium: scroll-back over seen cells ~2× faster | low |
| **8** | Wire `performance.measureUserAgentSpecificMemory()` → prompt user reload at heap threshold; needs COOP/COEP headers | `web/index.html`, bootstrap probe | 3 h | medium for heavy users (crash gone) | medium (COOP/COEP can break embeds) |
| **9** | Split `selectorBuilder` so grid sliver listens only to q + style; count text only to filter-length | `pack_detail_page.dart:331-357`, `:483-487` | 2 h | small-medium: typing in filter doesn't tear down pinned title sliver | low |
| **10** | Replace `_PaletteRow.AnimatedContainer` with plain `Container` (mirrors HoverBox flicker rule) | `search_page.dart:633-639` | 20 min | small: search arrow-nav less mushy | low |

Top-3 deliver biggest measurable improvement at ~4 h total.

### Anti-recommendations (don't do)

- DON'T preload icon TTFs — they're already lazy, would force 112 MB upfront
- DON'T switch from CanvasKit — duotone CustomPainter unsupported on HTML
- DON'T shard `packs.json` (204 KB raw, 32 KB brotli — one HTTP/2 frame)
- DON'T add per-cell `RepaintBoundary` to `PackTile` — masonry sliver already isolates
- DON'T precompile glyph→`ui.Picture` at build time — bundles ~50 MB of never-rendered icons
- DON'T introduce `flutter_svg` for `IconifyThumb` — TTF render is 10× faster
- DON'T precache 112 MB icon fonts in a service worker — cripples mobile cache budget
- DON'T refactor `IconifyIcon` away from `CustomPaint` — single-layer composition is faster than Stack+FittedBox

---

## §24 — AI workflow + hooks + skills + memory enrichment

**Verdict: 5 highest-ROI improvements achievable in one afternoon —
PreToolUse Bash guard for `bun run generate`, settings allowlist for
read-only commands, 3 new memory entries (parallel-agent workflow,
no-auto-push-to-main, profile-first), CLAUDE.md split into 5 on-
demand `docs/agent/*.md` files, and `bun run` script aliases for
the 4 long-form command chains the user repeats.**

### Hooks plan (`.claude/settings.json` at repo root)

| Event | Matcher | Behaviour |
|---|---|---|
| `PreToolUse` | `Bash` matching `^bun run generate(\s\|$)` without `--dry-run` / `--check` / `--new-only` | **Block** — exit 2 with `"Full regen mutates 225 packages. Use --dry-run / --check / --new-only / --set, or re-run after explicit OK."` |
| `PreToolUse` | `Bash` matching `^git push.* (main\|HEAD:main\|origin main)` | **Block** — direct push to main; require PR or explicit confirm |
| `PreToolUse` | `Bash` matching `^git commit --amend\|^git rebase` | **Block** — codifies "always new commit, never rewrite history" |
| `PreToolUse` | `Bash` matching `^rm -rf .*/manifests\b\|^rm .*manifests/.*\.json` | **Hard block** — defends invariant #3; point at `feedback_codepoint_stability` |
| `PostToolUse` | `Edit\|Write` on `tools/generator/src/*.ts` | Echo: `"Generator source changed. Likely need: bun run generate -- --dry-run."` Non-blocking. |
| `PostToolUse` | `Edit\|Write` on `packages/iconifyx_*/lib/*` | Echo loud warning citing CLAUDE.md File Ownership table |
| `PostToolUse` | `Bash` after non-dry-run `bun run generate` | Echo first 40 lines of `COVERAGE.md` diff vs HEAD + new paint-order-risk entries |
| `UserPromptSubmit` | always | Inject one-line `git status --short` count + branch + dirty-manifest flag |
| `Stop` | always | If manifests dirty and no commit this session, echo reminder |

All as tiny shell one-liners or `tools/agent-hooks/*.sh`. <100 ms.
**DO NOT auto-run `bun run generate` on edits** — 80 s warm regen
burns ~10-30 min/session.

### Custom skills (bundle: `iconifyx-tools`)

| Skill | Trigger | Cost |
|---|---|---:|
| `regen` | "regen", "regenerate" | 1 h |
| `pack-open` | "show me <prefix>" | 1 h |
| `icon-inspect` | "inspect <prefix>:<name>" | 2 h |
| `audit` | "audit", "show coverage" | 1.5 h |
| `shake-test` | "tree shake test" | 2 h |
| `research-plan` | "add to plan" | 1 h |
| `iconifyx-deep` | "deep dive", "explain pipeline" | 2 h |
| `website-dev` | "run website" | 30 min |
| `parallel-audit` | "run agents", "research X" | 3 h |

Skip a "bundled iconifyx supervisor" — user explicitly prefers many
parallel granular agents over bundled.

### Memory entries to add

| Name | Type | Content |
|---|---|---|
| `workflow_parallel_research_agents.md` | feedback | User runs 8+ granular agents in parallel; each appends to RESEARCH_PLAN.md §N; main agent merges + commits. Never centralise. |
| `workflow_research_plan_append.md` | feedback | RESEARCH_PLAN.md is append-only, numbered, every section ends with verdict + file refs. New agents reserve next free §N. |
| `rule_no_auto_push_to_main.md` | feedback | Never `git push` to main without explicit user request. Auto-mode classifier blocks; document so agents stop trying. Always NEW commits — never amend, never rebase. |
| `rule_subprocess_isolation_and_bisect.md` | feedback | Native panics (resvg etc.) abort JS. Wrap in `Bun.spawn`, bisect on non-zero exit. Apply pattern to any new native tool. |
| `rule_profile_first.md` | feedback | Before perf "fix", profile in --release. Debug is 5-10× slower and misleads. 600-rebuilds/sec SliverLayoutBuilder bug only diagnosed because profiled. |
| `rule_document_everything_from_agents.md` | feedback | Every parallel agent output captured in writing. Don't summarise away. Don't merge similar verdicts — keep distinct angles. |
| `repo_layout_quick.md` | reference | 10-line skim: generator src, manifests, per-set packages, meta, website, example, two-icon-test. Saves agents a `find .` pass. |

Updates to existing entries:
- `reference_audit_reports.md` — add `FONT_AUDIT.md`, "regenerated every regen even if subprocesses panic"
- `feedback_stroke_and_glyph_recovery.md` — cross-link to new subprocess-isolation rule
- `feedback_oref_hover_pattern.md` — note `mix` package incompatible with Flutter 3.44+

### CLAUDE.md restructure

**Repo-root CLAUDE.md (target ~2.5 k tokens, down from ~10 k):**
- Repo layout (one diagram)
- 5 hard invariants only, one paragraph each
- File-ownership table verbatim
- Four-line "if generator src changed, regen" reminder
- One-paragraph operations pointer at `bun run` script names
- Pointer: `"For deeper context use /iconifyx-deep <topic>"`

**On-demand `docs/agent/*.md` files** loaded by `iconifyx-deep` skill:
- `pipeline.md` — current §1 + §5a/§5a-bis
- `duotone.md` — §5b (4 detection paths) + kind enum semantics
- `stroke-fill.md` — §5a + §5e (paint-order risk)
- `treeshake.md` — invariant #1 + `two_icon_test` protocol
- `audits.md` — §5d expanded

Per-turn context cost drops ~60 %.

### Parallel-agent coordination — keep human-in-loop

**Don't build a coordinator.** Convention via `parallel-audit` skill:
1. Each fan-out call assigns explicit `§N` slot in dispatch prompt
2. Subagents write to `docs/agent-drafts/§N-<topic>.md` instead of
   RESEARCH_PLAN.md directly
3. Main agent reviews + concatenates + numbers atomically

This is what's effectively happening already.

### `bun run` script aliases (root `package.json`)

```json
"website:dev":     "cd packages/iconifyx/website && fvm flutter run -d chrome --release",
"website:debug":   "cd packages/iconifyx/website && fvm flutter run -d chrome",
"website:analyze": "cd packages/iconifyx/website && fvm flutter analyze lib",
"example:run":     "cd packages/iconifyx/example && fvm flutter run -d macos",
"shake:test":      "cd test_apps/two_icon_test && fvm flutter pub get && fvm flutter build macos --release --tree-shake-icons && find build/macos -name '*.ttf' | xargs ls -la",
"audit:font":      "cat FONT_AUDIT.md | head -60",
"audit:stroke":    "cat STROKE_AUDIT.md | head -60",
"audit:coverage":  "cat COVERAGE.md | head -60"
```

DO NOT introduce Makefile / Justfile — adds toolchain.

### Settings.json allowlist (`.claude/settings.local.json`)

Allow (no prompt): `git status/log/diff/show`, `ls`, `find`, `rg`,
`grep`, `wc`, `file`, `cat tools/generator/manifests/*`, `cat
*AUDIT*.md`, `cat COVERAGE.md`, `bun test*`, `bun run generate
-- --dry-run/--check/--new-only*`, `bun website:analyze`, `bun
audit:*`, `fvm flutter analyze*`, `fvm flutter pub get*`,
`WebSearch`.

Deny: `git push origin main*`, `git commit --amend*`, `git rebase*`,
`rm -rf tools/generator/manifests*`, `rm tools/generator/manifests
/*.json`.

Still prompted: `bun run generate` without flags, `fvm flutter
build *`, `git push` to any branch except blocked main, `bun
install/update`, all `Edit`/`Write` (gated separately).

### Anti-recommendations

1. **DON'T auto-regen on `Edit` to generator src** — 80 s × 5-20
   edits/session = 10-30 min wasted
2. **DON'T add a single supervising orchestrator** — contradicts
   user's "many parallel granular agents" preference
3. **DON'T add pre-push test gating** — user pushes WIP all day
4. **DON'T add "auto-fix stroke-audit regressions" skill** — audit
   is intentionally advisory; user wants to SEE deltas
5. **DON'T add "validate all manifests on every Bash"** — 225 JSON
   files × every call = noticeable lag; do it in Stop hook
6. **DON'T auto-load every `docs/agent/*.md` on session start** —
   defeats the on-demand split
7. **DON'T add husky-style pre-commit** — bun has no equivalent,
   `.husky/` adds npm baggage; use Claude `PreToolUse` hook instead

---

## §25 — Multi-colour → mono/two-tone reduction (empirical)

**Verdict: With concrete per-pack data, only 3 packs (vscode-icons,
streamline-color, partial circle-flags) benefit from mono reduction
without losing the icon. The rest of the 22 k drop is mostly emoji
(twemoji, noto, fluent-emoji) where mono is fundamentally lossy
— ship them as a separate SVG-asset companion or document as out-
of-scope. Top-3 wins (~23-32 h total): §14 stroke-detection
(already planned, ~2 080 icons), vtracer integration (~8-12 k icons),
circle-flag silhouette via mask-carrier (~700 flags).**

### Empirical colour distribution (measured against @iconify/json 2.2.472)

| Pack | Total | 1 c | 2 c | 3 c | 4+ c | gradient | `<mask>` |
|---|---:|---:|---:|---:|---:|---:|---:|
| **circle-flags** | 731 | 0 | 0 | 156 | 270 | 0 | 731 (100 %) |
| **twemoji** | 4 169 | 158 | 631 | 454 | **2 926** | 0 | 0 |
| **noto** | 3 800 | 78 | 116 | 451 | **3 156** | **2 086 (55 %)** | 0 |
| **fluent-emoji-flat** | 3 174 | 88 | 499 | 289 | **2 298** | 3 | 0 |
| **vscode-icons** | 1 493 | **498** | **463** | 202 | 330 | 304 | 20 |
| **streamline-color** | 2 000 | 326 | **1 294** | 380 | 0 | 0 | 0 |

Key reframings from the data:
- **circle-flags carries `<mask>` on 100 % of bodies** — NOT
  `lets-icons:*-duotone-line` pattern. Current `bodyUsesMaskPattern`
  matches but `trySplitMaskInternalBody` requires self-closing
  elements + faint-bold split — flags violate both.
- **noto is gradient-heavy** (55 % use `<linearGradient>` for
  shading). Any non-gradient approach leaves half the pack.
- **vscode-icons has 75 zero-colour + 423 single-colour + 463
  two-colour = 64 % ≤ 2 colours**, recoverable by §14 with NO new
  infrastructure.
- **streamline-color has zero 4+-colour icons** — entire pack
  reachable by §14 stroke-detection + §2 area extension.

### Approach comparison

| # | Approach | Best for | Recovery | Cost | Visual quality | ROI |
|---|---|---|---:|---:|---|---:|
| 1 | Luminance silhouette → Potrace mono | circle-flags, vscode app, some fluent-emoji | ~5 200 | 6-10 h | flags: GOOD; emoji faces: BAD; vscode file-type: GOOD | **2** |
| 2 | Canny edge → Potrace outline | emoji faces / interior | ~2 000 | 12-16 h | TTF too small for hair-thin lines; noisy | 5 |
| 3 | k-means → 2 buckets (paint-order duotone) | vscode-icons, simple emoji, streamline residue | ~3 000 | 8-12 h | GOOD when k=2 separates cleanly | **3** |
| 4 | **vtracer multi-colour + reduce to top-2 layers** | circle-flags, twemoji, fluent-emoji, noto (partial) | **8 000-12 000** | 16-24 h | BEST automated — preserves shapes (§1 plan) | **1** |
| 5 | Semantic group extraction | none (Iconify bodies lack semantic names) | <50 | high | N/A | Reject |
| 6 | Per-category curated rules | emoji only | <500 | very high | brittle | Reject |
| 7 | **Drop emoji + ship SVG-asset companion** | noto, twemoji, fluent-emoji-flat | all emoji via different API | 24-32 h | original colour preserved | **4** |

### Per-pack recommendation

| Pack | Approach | Recovered | Rationale |
|---|---|---:|---|
| **circle-flags** (731) | Mask-carrier silhouette (Approach 1 narrow) | ~700 | Flags-as-discs — honest silhouette ("flag pack placeholder"). One-line config: `silhouetteOnlySets: [circle-flags]`. |
| **twemoji** (4 169) | DROP officially + opt-in Approach 3/4 for 789 ≤2-colour subset | ~789 | 70 % is 4+ colour; mono destroys identity. Document workaround → `flutter_emoji_picker` or raw twemoji CDN PNGs. |
| **noto** (3 800) | DROP officially | <200 | Gradient-heavy + organic. vtracer produces 5-8-layer unusable output at 24 px. |
| **fluent-emoji-flat** (3 174) | Approach 4 (vtracer) for 587 ≤2-colour; silhouette opt-in for ~2 587 rest | ~1 200-1 800 | "Flat" misleading (most 4+); object/symbol emoji (`pool-8-ball`, medals) survive vtracer; faces still bad |
| **vscode-icons** (1 493) | **§14 improvements only — NO new approach** | ~960 | 75 zero + 423 single + 463 two-colour all recoverable by §14 stroke-detection + white-as-FG + shoelace. 330 with 4+ via Approach 3 (file icon + colour dot) |
| **streamline-color** (2 000) | **§14 stroke-detection (already planned)** | ~1 500 | 1 294 of 2 000 are exactly 2-colour — §14 unlocks mechanically. 380 three-colour need §2 "top-2 by area" extension. |

**Bottom-line total**: ~5 100 icons recoverable from 22 k drop with
NO new approaches beyond §14 + §1 (vtracer) + simple silhouette
path. Of remaining ~10 000 mostly-emoji, the honest call is DO NOT
pursue mono reduction.

### Top-3 recommendations

1. **§14 stroke-detection + white-as-FG (4 h, ~2 080 icons)** —
   already planned. Strictly best icons-recovered-per-hour. No new
   dep.
2. **vtracer + 2-layer reduction (16-24 h, ~8 000-12 000 icons)** —
   §1 implementation. Biggest absolute recovery. Gate per-pack.
3. **Circle-flag silhouette via mask-carrier flatten (3-4 h, ~700
   icons)** — surgical config-driven fix. One pack 100 % lost → 100 %
   recovered as discs. Document trade-off in LICENSE-3RD-PARTY.md.

### Hybrid alternative — `iconifyx_<x>_color` SVG-asset companion

For packs mono can't recover. Structure:
```
packages/iconifyx_twemoji_color/
├── assets/svg/<icon>.svg           (one per icon, original body)
├── lib/iconifyx_twemoji_color.dart
└── lib/src/sets/twemoji_color.dart (static const name→asset path)
```

Adds `flutter_svg` dep to `iconifyx_core`. Twemoji's 4 169 SVGs are
~15 MB raw, ~6 MB gzipped. Per-set-package layout means apps that
don't depend on it ship 0 bytes.

**Tree-shake risk**: `flutter_svg` doesn't tree-shake asset maps;
emit `static const` per icon with literal path so Flutter asset
shaker only ships referenced. **NEEDS VERIFICATION** via
`flutter build --tree-shake-icons`.

**API divergence**: `IconifyColorIcon(TwemojiColorIcons.firstPlace
Medal, size: 24)` is fundamentally different widget. Acceptable —
the kind IS different.

**When to build**: only if Approaches 1+3+4 leave a pack < 20 %
recovery AND user explicitly wants the pack. Otherwise drop with
docs.

### What NOT to do

- **DON'T ship mono emoji (twemoji/noto/fluent human emoji)** —
  reduction destroys icon. Document limitation; point users at
  `flutter_emoji_picker` or system emoji.
- **DON'T invest in Canny edge detection** — TTF render at 16-24 px
  lacks dynamic range for hair-thin outlines; noisier than
  silhouette.
- **DON'T pursue semantic group extraction** — Iconify bodies don't
  carry semantic group names; only geometric signal available
  (colour, area, position) — Approaches 1/3/4 already exploit.
- **DON'T ship SVG-asset companion unless user explicitly asks** —
  bundle-size + API divergence are real costs.

### Files

- `tools/generator/src/svg_preprocess.ts` — extend
  `extractConcreteFills` → `extractConcretePaints` (stroke-aware),
  add `flattenToMaskCarrier`, refine `trySplitTwoColorBody`
- `tools/generator/src/pipeline.ts:594-627` — paint-order drop site
  where new recovery passes splice in
- `tools/generator/config.yaml` — gain `silhouetteOnlySets`,
  `vtracerSets`, optional `colorAssetPackSets`
- `tools/generator/src/stroke_fill_worker.ts` — template for new
  `vtracer_worker.ts` (panic-isolation pattern ports directly)

### Cross-reference

- §1 (vtracer) — this is the implementation gate. §25 contributes
  the 2-layer reduction step + per-pack opt-in framework.
- §14 (stroke + white-as-FG) — explicitly the #1 recommendation in
  §25; recovers ~2 080 with no new approach.
- §20 (Figma/ecosystem tools) — proposes OKLab K-means for 3-colour
  reduction, complementary to §25's Approach 3.

---

## §26 — Visual-diff tool design (`iconifyx-visual-diff`)

**Verdict: Build Phase 1 (~1 day, pure TS). Render upstream + TTF
glyph at 64×64 grayscale, dHash + pixelmatch + ink ratio, rule-based
classifier (8 rules cover Catppuccin blanks / gravity-ui blobs /
streamline body-on-fg / lets-icons mask / duotone half-failures /
meteocons empty outlines). Outputs JSONL + MD with `{prefix, icon,
status, reason, problem, remediation}`. Day 1 replaces manual
website scanning. Promote to Phase 3 Rust kernel (§17 Area 2 #2)
only if wall-clock > 5 min becomes painful.**

### CLI surface

```bash
bun run visual-diff                              # full scan
bun run visual-diff --set logos --icon adobe-after-effects
bun run visual-diff --only different             # JSONL filtered
bun run visual-diff --reason filled-blob         # one bucket
bun run visual-diff --confirm streamline-color:ai-chip-spark-flat
bun run visual-diff --baseline                   # snapshot expected
```

### Outputs

- `VISUAL_DIFF.jsonl` — 340 k rows (~80 MB, gitignored)
- `VISUAL_DIFF.md` — pack-grouped human report (committed)
- `VISUAL_DIFF.html` — self-contained dashboard with PNG sprite
- `.cache/visual_diff/raster/<prefix>/<sha>.{up,tt,df}.png`
- `.cache/visual_diff/allowlist.yaml` — user-curated expected diffs

### Sample JSONL row

```json
{"prefix":"streamline-color","icon":"ai-chip-spark-flat",
 "status":"different","confidence":"high","primaryReason":"FILLED_BLOB",
 "problem":"shipped as solid filled square — two-colour split classified
  small accent path as background; foreground letterform absorbed",
 "remediation":"§14 stroke-aware extractConcretePaints + shoelace 1.3× gap",
 "metrics":{"hamming":21,"ssim":0.31,"pixelMatch":0.46,
            "inkRatioUpstream":0.21,"inkRatioOurs":0.78,
            "coverage":0.89,"mirrorMatch":false}}
```

### Comparison strategy (3 layers)

| Layer | Cost/icon | Used as | Threshold |
|---|---|---|---|
| **A. dHash 64-bit** | ~0.5 ms | First-pass filter | Hamming < 4 = same; > 14 = different; 4-14 = needs-review |
| **B. Pixelmatch + ink stats** | ~3 ms | Classifier input | mismatch%, inkRatio, coverage, cx/cy centroid |
| **C. SSIM-lite** | ~8 ms | Disambiguator on ~5 % needs-review only | luminance + structure score |

Both upstream + TTF rendered via SAME rasterizer (`oslllo-svg2`) at
64×64 grayscale → AA symmetric → no false positives from rasterizer
mismatch.

### Classifier rules (18 total; Phase 1 = rules 1-8)

| # | Reason | Heuristic | Remediation |
|---|---|---|---|
| 1 | `PAINT_ORDER_DROPPED` | `deprecated:true && reason==='paintOrderRisk'` | §1 vtracer — intentional, not regression |
| 2 | `VALIDATOR_DROPPED` | `deprecated:true && reason∈{unsupported,malformedPath,coordOverflow}` | §3 / §7 |
| 3 | `MISSING_TTF` | font file or fontkit error | manifest↔pubspec sync (A7/§16) |
| 4 | `EMPTY_GLYPH` | `inkOurs<0.005 && inkUp>0.05` | §3 svg2ttf path drop |
| 5 | **`FILLED_BLOB`** | `inkOurs>0.7 && coverage>0.85 && inkUp<0.5` | §5e paint-order OR §14 layer-flip — **most common** |
| 6 | `MISSING_CUTOUTS` | `inkOurs > inkUp×1.4 && pixelMatch>0.3` | `iconNeedsRasterTrace` per-icon fallback missed |
| 7 | `LAYER_ORDER_FLIP` | duotone AND swapping primary/secondary drops Hamming < 4 | §14 white-as-FG / shoelace |
| 8 | `DUOTONE_HALF_BROKEN` | duotone AND secondary glyph `inkRatio < 0.005` | §16-A6 sync audit |
| 9 | `DUOTONE_COLLAPSED` | source has opacity<1 OR 2-paint; ours mono | duotone detection missed |
| 10 | `DUOTONE_FALSE_POSITIVE` | source mono; ours has non-empty secondary | over-trigger in `splitDuotoneBody` |
| 11 | `MIRRORED` | `pixelMatch(ours, mirror(upstream))<0.05` AND `(upstream)>0.4` | `svgpath` transform-flatten regression |
| 12 | `ROTATED_90` | `pixelMatch(ours, rot90(upstream))<0.05` | transform-flatten regression |
| 13 | `VERTICAL_DRIFT` | `cy` diff > 0.15 × em AND pixelMatch<0.2 after shift | viewBox normalisation |
| 14 | `HORIZONTAL_DRIFT` | same with `cx` | viewBox normalisation |
| 15 | `SCALE_DRIFT` | bbox ratio >1.6 or <0.6 AND pixelMatch<0.2 after scale | em-square scaling regression |
| 16 | `MISSING_STROKES` | upstream low ink + many edges; ours ink<0.005 | stroke-only missed by `rasterFillSignal` |
| 17 | `EXTRA_INK` | `inkOurs > inkUp×1.2` AND not blob | over-aggressive raster-trace widening |
| 18 | `MOSTLY_WHITE_SOURCE` | `inkUp<0.02 && source fill="#fff" only` | colour-mapped flatten needed (Catppuccin) |
| 99 | `UNKNOWN` | no match | manual triage |

Pure TypeScript, rule-based, **NOT ML**. Each rule is an auditable
predicate + one-line problem string. Adding a new rule = one function
+ one table row; rerun produces new explanations from cached metrics.

### Architecture decision

**Phase 1 (~1 day)**: Pure TS. `oslllo-svg2 + fontkit + pixelmatch`.
~5-7 min on 8-core via `p-limit(8)`. Acceptable as regen post-step.
Rules 1-8 only — covers ~90 % of known failure modes.

**Phase 2 (~3 days)**: Rules 9-18 + HTML dashboard + allowlist +
baseline regression gate.

**Phase 3 (~1 week)**: Rust kernel via `tiny-skia + skrifa` (§17
Area 2 #2) ONLY if Phase 2 wall-clock > 5 min painful. ~5 min → 30 s.
Classifier stays TS so rule table evolves without recompiling.

### §26 update (2026-05-16): Phase 2 corpus-run unblocked by Approach E

Phase 1 wall-clock was 5-8 s/icon (single-shot `render-icon` per
icon). That made a corpus sweep across 340 k icons ~600 hours —
unusable. The persistent render server (`render-server.ts`, shipped
as `a87ab25b-v2`) drops it to **~25.8 ms mean / icon** end-to-end
including upstream resvg + glyph rasterize + Flutter render + diff.

New numbers (verified locally, M-series, 100-icon mixed-pack bench):

| Metric | Old (single-shot) | New (Approach E) | Speedup |
|---|---:|---:|---:|
| Bootstrap | ~10 s per icon | ~2 s once | — |
| Per-icon mean | ~5-8 s | 26 ms | ~250× |
| 100-icon wall | ~8-13 min | 2.6 s | ~250× |
| Whole corpus (340k) | ~600 h | ~2.4 h | ~250× |
| 5 % stratified sample | ~30 h | ~7 min | ~250× |

The `visual-diff --corpus` mode is now shipped. CLI:

```bash
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus --sample 200 --seed 12345           # 200 random icons
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus --prefix mdi                         # all of mdi
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus --sample 17000 --seed 42             # 5 % stratified sample
```

Output at `docs/audit/visual-diff/corpus/`:
- `rows.jsonl` — one row per icon: `{iconRef, status, primaryReason,
  mismatchPct, problem, remediation, ms, ...}`
- `summary.json` — totals + status / reason histograms
- `CORPUS_REPORT.md` — first-30 `different` examples + verdict tables

Phase 3 (Rust kernel) is no longer needed for performance. Phase 2's
remaining work is the rule expansion (9-18), HTML dashboard, and
allowlist file — none of which are gated on render speed.

### Cross-reference vs existing plans

| Plan | Overlap | What visual-diff adds |
|---|---|---|
| §4 visual regression | Same rasterize stack | §4 is regression (CI fail on hash change); visual-diff is discovery + explanation |
| §16-A14 suspicious-glyph | dHash + ink-ratio | A14 is rule 5+4 only; visual-diff is 18-rule generalisation |
| §17 Area 2 #2 Rust diff | Kernel intent | §17 = kernel; visual-diff = TS classifier on top |
| `FONT_AUDIT.md` | Empty codepoint | FONT_AUDIT finds `commands===0`; visual-diff finds blank/blob/mirrored/drifted that fontkit can't see |

**Net addition**: the explainable-classifier layer. None of existing
plans deliver `{prefix, icon, reason, remediation}` — they deliver
`{prefix, icon, similarityScore}` or `{prefix, icon, isEmpty}`.

### False-positive strategy

1. **3 buckets**: `same` / `needs-review` / `different`. Only
   `different` blocks CI.
2. **Per-rule confidence floor**: low-confidence rules default to
   `needs-review`.
3. **`PAINT_ORDER_DROPPED` + `VALIDATOR_DROPPED` are status
   `dropped-on-purpose`**, not `different`.
4. **Allowlist** (`.cache/visual_diff/allowlist.yaml`) — user curates
   via `--confirm <prefix>:<icon> --note "..."`.
5. **Baseline regression gate** — `--baseline` snapshots current;
   subsequent runs only fail CI on NEW `different` entries.
   Eliminates "440 historical issues block every PR" anti-pattern.

### First-iteration scope (day-1 minimum)

Files to build:
- `tools/generator/src/visual_diff.ts` — `runVisualDiff(prefix?)`
- `tools/generator/src/visual_diff_report.ts` — `writeVisualDiffMd()`
- `tools/generator/src/index.ts` — wire `visual-diff` subcommand
- `pipeline.ts` — call after `verifyFontsAgainstManifests`

Phase 1 rules 1-8 only. Skip HTML dashboard, mirror/rotation/drift,
allowlist file, baseline gate. **User stops manually checking
icons in the website tomorrow.** That's the goal.

Only NEW dep: `pixelmatch` (~150 LOC, MIT, no transitive deps).

---

## §27 — Sheet back-button routing bug (root cause + universal fix) ✅ DONE

✅ Shipped 2026-05-16 — universal fix lives in
`packages/iconifyx/website/lib/router/url_history.dart`
(`HistoryAwareRouteInformationProvider`). It intercepts
`routerReportsNewRouteInformation` and converts the default
`RouteInformationReportingType.none` to `neglect` (=
`history.replaceState`) whenever the new URI has the same path as
the previously-reported URI or is a path-prefix of it (pop-back).
Strictly-forward navigation keeps the default push. Wired into
`AppCoordinator.routeInformationProvider` via getter override.
Also tightened the shell shortcut for ⌘K / `/`: `push(SearchRoute)`
→ `pushOrMoveToTop(SearchRoute)`.

---

**Verdict: The sheet IS a proper `PopupRoute`; closing DOES pop the
zenrouter path. The bug lives in how zenrouter (2.0.3) translates
path mutations into browser history. EVERY `notifyListeners()`
becomes a push, never a replace. Closing a sheet pushes a NEW history
entry whose URL coincidentally matches the previous one — so browser-
back walks INTO closed sheets. Same bug also pollutes filter
keystrokes (one history entry per character) across pack-detail,
all-packs, search.**

### Walk-through

1. User on `/pack/mdi`. History: `[..., /packs, /pack/mdi]`
2. Tap icon "home" → `push(IconDetailRoute)` → `IconDetailRoute` on
   `shellStack`. `notifyListeners` fires; `currentConfiguration`
   returns `/pack/mdi/icon/home`. **Flutter Router reports default
   `RouteInformationReportingType.none` which engine treats as push.
   zenrouter does NOT override `shouldReplaceRouteInformation`.**
   History: `[..., /pack/mdi, /pack/mdi/icon/home]`
3. Close sheet → `Navigator.pop` → `StupidSimpleSheetRoute.didPop` →
   `PopScope.onPopInvokedWithResult` → `path.remove(this,
   discard:false)`. Route off stack. `notifyListeners`. URI back to
   `/pack/mdi`. **Another push, not replace.** History: `[...,
   /pack/mdi, /pack/mdi/icon/home, /pack/mdi]`
4. Tap "star" → URL `/pack/mdi/icon/star` (push)
5. Close → URL `/pack/mdi` (push)
6. **Browser BACK** → URL = `/pack/mdi/icon/star` → `parseRouteFromUri`
   returns FRESH `IconDetailRoute` → `coordinator.navigate(route)` →
   `path.navigate` does `indexOf(target)`. Previous IconDetailRoute
   removed in step 3 → `index == -1` → new route push-ed →
   **sheet re-opens**.

The structural mistake: **closing-the-sheet pseudo-navigation push
(step 3) creates a history entry that, when revisited, takes you
BACK INTO the sheet you just closed.**

### Fix recommendation

**Option A (recommended)**: override `RouterDelegate.reportConfiguration`
at the `CoordinatorRouterDelegate` level. When the new URI is a
prefix of (i.e. popping back to) the previous URI, return
`RouteInformationReportingType.replace`. Subclass the zenrouter
delegate in `AppCoordinator`.

**Option B (rejected)**: make sheet `toUri()` return parent route's
URI. Sacrifices deep-link-by-URL for icon detail (`/pack/mdi/icon/
home`) which user values for sharing.

### Other instances of same bug

| Location | Symptom | Same fix |
|---|---|---|
| **Search palette** ([search_route.dart:88](packages/iconifyx/website/lib/router/routes/shell/search_route.dart#L88)) | Cmd-K opens, Esc closes, browser-back re-opens | YES + change `app_shell_layout.dart:39-44` `push` → `pushOrMoveToTop` |
| **Pack-detail filter** ([pack_detail_page.dart:105-114](packages/iconifyx/website/lib/features/pack/pack_detail_page.dart#L105)) | Type "star" → 4 history entries `?q=s, ?q=st, ?q=sta, ?q=star` | YES — query-only changes must always be `replace` |
| **All-packs filter + category** ([all_packs_page.dart:62-80](packages/iconifyx/website/lib/features/home/all_packs_page.dart#L62)) | Same per-keystroke pollution | YES |
| **Search page typing** | Same | YES |

### Universal invariant to enforce

> **A path-stack mutation that does not change the URL's path
> segments (only changes queries, or shrinks back to a parent path
> previously on the stack) MUST report with `RouteInformation
> ReportingType.replace`. Only strictly forward navigation (new
> path segments first encountered) should push.**

Enforce in `CoordinatorRouterDelegate`. Retain last-reported URI;
on each `currentConfiguration` read, compare path segments:
- equal OR new URI is prefix of old → `replace`
- otherwise → `push`

### Regression test

`integration_test/back_button_test.dart` running on `flutter test
--platform chrome`:

1. Drive: /packs → /pack/mdi → tap home icon (sheet) → close →
   tap star icon → close → `js_util.callMethod(window.history,
   'back', [])`
2. Assert: `find.byType(IconDetailPage)` is NONE; `find.byType(
   PackDetailPage)` is one.

Faster unit-level test: stub `TestPlatformDispatcher` to record
every `routeInformationUpdated` call. Type 4 chars in filter →
assert all 4 reports have `replace: true`.

### Files affected by the fix

- `packages/iconifyx/website/lib/router/coordinator.dart` —
  delegate override lives here
- `app_shell_layout.dart:39-44` — change shortcut `push` →
  `pushOrMoveToTop`
- `~/.pub-cache/hosted/pub.dev/zenrouter-2.0.3/lib/src/coordinator/
  router.dart:64,105` — offending no-replace report (consider
  upstream PR after local fix lands)

### Opinion

This bug class was baked in the moment `RouteQueryParameters`
updates via `markNeedRebuild` met sheet-as-route. Both decisions
reasonable individually; combined they make browser-back unusable
in any non-trivial flow. The architectural fix belongs in zenrouter
(override defaults); until upstream lands, do the local override.
**Don't paper over by making sheets non-URL-backed — that loses
real value.**

---

## §28 — Multi-pack tree-shake: EMPIRICAL findings + invariant correction ✅ DONE

> ✅ **RESOLVED in §32 (single-TTF-per-pack via cmap format 12).**
> The 12.1 MB → 2.5 KB delta for the same 3-pack scenario is now
> the shipped behaviour. Historical record below preserved.

**Original verdict (2026-05-15): CLAUDE.md §1 invariant claim is
OVERSTATED. Tree-shake works at the glyph level — the sibling TTF
containing a referenced codepoint shrinks to ~700-1 000 B. BUT every
OTHER sibling TTF in the same auto-split pack ships at FULL SIZE
because Flutter's bundler has no "drop empty TTF" step. Net result
for the user's exact scenario (3 icons from 3 packs: mdi + lucide +
tabler): 12.1 MB shaken vs 15.8 MB unshaken — only 24 % reduction,
NOT 99 %.** Full empirical report at
[docs/TREESHAKE_VERIFICATION.md](TREESHAKE_VERIFICATION.md).

### The user's exact question — measured answer

> "If I use one icon from each of three packs (`MdiIcons.home` +
> `LucideIcons.search` + `TablerIcons.user`), does my app bundle
> grow only by those three glyphs?"

**No.** Measured (Flutter 3.41.9 stable via fvm, macOS release build):

| Scenario | TTFs bundled | Total bytes | vs naive 3 × 700 B |
|---|---|---:|---|
| With `--tree-shake-icons` | 12 files | **12 640 740 B (12.1 MB)** | **~4 200×** |
| Without | 12 files | 16 526 756 B (15.8 MB) | — |
| Naive expectation (3 glyphs) | 3 files | ~3 KB | 1× |

Tree-shake reduces by **24 %**, not 99 %.

### Why — the auto-split sibling-TTF tax

Flutter's `font-subset` runs against the TTF that **contains** the
referenced `(fontFamily, codepoint)` pair:

- `MdiIcons.home` → codepoint in `Mdi_2.ttf` → that file shrunk to
  664 B
- `LucideIcons.search` → codepoint in `Lucide_2.ttf` → shrunk to 848 B
- `TablerIcons.user` → codepoint in `Tabler_5.ttf` → shrunk to 960 B

Total of the three SUBSET TTFs: ~2.5 KB — matches the naive
expectation perfectly.

But each pack auto-splits at the 6 000-icon cap (§4 invariant in
CLAUDE.md):
- `mdi`: Mdi.ttf (825 KB) + Mdi_2.ttf + Mdi_3.ttf (307 KB)
- `lucide`: Lucide.ttf (2.5 MB) + Lucide_2.ttf
- `tabler`: Tabler.ttf + Tabler_2..Tabler_5.ttf + TablerSecondary.ttf
  (~9 MB combined)

**Every sibling TTF that doesn't hold the referenced codepoint ships
at FULL SIZE** because:
1. `pubspec.yaml` declares every sibling as an asset
2. Flutter's asset bundler ships every declared asset
3. `font-subset` only RUNS on TTFs holding a referenced codepoint;
   non-holders are NOT processed at all (not dropped, not subset)

That's the "tax": every additional sibling in a referenced pack
adds its full size to the bundle.

### Scenarios verified (all pass)

| # | Scenario | Result |
|---|---|---|
| 1 | One icon from one pack | ~700 B shrunk file only |
| 2 | Two icons from same pack | Same shrunk file, slightly larger |
| 3 | **THE USER'S CASE: 3 icons from 3 packs** | **12.1 MB total — the sibling tax** |
| 4 | One duotone icon (PhIcons.acornDuotone) | Both Ph.ttf AND PhSecondary.ttf shaken simultaneously ✓ |
| 5 | 10 icons from 10 packs | Linear scaling on sibling tax |
| 6 | Indirect const var (`const icon = MdiIcons.home`) | Shakes correctly ✓ |
| 7 | const list `[MdiIcons.home, ...]` | Shakes correctly ✓ |
| 8 | Conditional `useHome ? MdiIcons.home : MdiIcons.search` | Both branches survive shake ✓ |
| 9 | **Programmatic IconData at runtime** | **Build FAILS-FAST**: "This application cannot tree shake icons fonts" — correct protective behavior ✓ |

### CLAUDE.md §1 invariant — what's true vs what was overstated

**HOLDS (extension-type wrapping is tree-shake-transparent)**:
- const vars trace through the record correctly
- const lists trace correctly
- conditional const refs both survive
- duotone shakes both Primary + Secondary TTFs
- runtime-constructed `IconData` triggers `font-subset` fail-fast
  (correct protective behavior)

**OVERSTATED**:
> §1 wording: "exactly those two sets' fonts (~2 MB pre-shake)"

In reality, only the SINGLE sibling TTF holding the referenced
codepoint shrinks; OTHER siblings ship full. For tabler that's
~9 MB of tax per referenced Tabler icon.

### Pack size implications (single-TTF vs multi-split packs)

For users with strict bundle budgets, **prefer single-TTF packs**:

| Single-TTF (entire pack ≤ 6 000 icons, no auto-split) | Multi-split (auto-split sibling tax) |
|---|---|
| `iconifyx_carbon` (~750 B per icon bundled) | `iconifyx_tabler` (~9 MB tax) |
| `iconifyx_heroicons` | `iconifyx_mdi` (~1.1 MB tax) |
| `iconifyx_feather` | `iconifyx_material_symbols` (multiple variants × split) |
| `iconifyx_fa6_solid` | `iconifyx_lucide` (~2.5 MB tax) |
| `iconifyx_octicon` | `iconifyx_solar` |
| `iconifyx_bi` | `iconifyx_iconoir` |

### Generator-side fix candidates

1. **Popularity-based codepoint allocator** — pack the top N most-
   commonly-referenced icons (estimated via Iconify search analytics,
   or via a static "popular subset" list per pack) into the PRIMARY
   `<Prefix>.ttf`. Common references then avoid the sibling tax.
   - Cost: ~12 h. Manifest schema gains a `popularitySlot:
     number` field. Codepoint allocator becomes 2-pass: popular
     icons fill the primary font first, rest spill into siblings.
   - Risk: requires upstream "popular icons" data per pack OR
     a heuristic (e.g. icons with shortest names, icons matching
     known core icon names like `home/search/user/menu/...`).
   - Recovery: ~80 % of common single-icon references would hit the
     primary TTF only.

2. **Sibling-TTF subset emission** — preprocess at build time:
   for each pack, emit per-app build a single TTF containing
   ONLY the referenced codepoints. Requires app-level codegen
   (currently TTF emission happens at package-publish time).
   - Cost: high (~5 days). Likely impractical without Flutter
     pipeline hooks.

3. **Document the trade-off** + recommend single-TTF packs in
   README for bundle-conscious users (cheapest fix; ships docs only).

### Regression suite proposal (extends §16 A5)

CI workflow (scoped to release builds, not every PR):

```yaml
- name: Tree-shake bundle size regression
  run: |
    cd test_apps/three_icon_test
    fvm flutter build macos --release --tree-shake-icons
    actual=$(find build/macos -name "*.ttf" -exec stat -f %z {} \; | awk '{s+=$1} END {print s}')
    baseline=12640740
    threshold=$((baseline * 110 / 100))  # +10% allowance
    test "$actual" -le "$threshold" || { echo "Bundle regressed: $actual > $threshold"; exit 1; }
```

Catches:
- Accidental `IconifyIconData` class-wrapping regression (would
  jump to no-shake 15.8 MB)
- Upstream Iconify pack growth introducing new auto-splits that
  bloat known scenarios

### What this DOESN'T change

- Per-set-package layout still correct: apps depending only on
  `iconifyx_mdi` + `iconifyx_lucide` still ship ONLY those two
  packs' fonts (not every iconifyx pack). The bundle savings are
  enormous compared to the alternative (depending on the meta
  `iconifyx` package would ship 43 MB of fonts).
- Single-pack scenarios are still excellent: one icon from one
  pack → that pack's single sibling shaken to ~700 B.
- Tree-shake invariant for the extension type wrapping HOLDS
  empirically.

### Update CLAUDE.md §1 to reflect reality

Recommended change to the invariant section:

> Tree-shake reduces each referenced TTF to ~700-1 000 bytes
> (one per `(fontFamily, codepoint)` reference). Auto-split packs
> ship one full-size TTF per non-referenced sibling — e.g. using
> `MdiIcons.home` ships Mdi_2.ttf shrunk to ~700 B AND ships
> Mdi.ttf + Mdi_3.ttf at full size. For strict bundle budgets,
> prefer single-TTF packs (carbon / heroicons / feather / fa6-solid
> / octicon / bi).

### Files

- `/Users/obenkucuk/dev/icons/docs/TREESHAKE_VERIFICATION.md` —
  full empirical report with all 9 scenario byte counts
- `CLAUDE.md` §1 — needs the wording update above
- `tools/generator/src/codepoint_allocator.ts` — popularity-based
  allocation candidate
- New: `.github/workflows/treeshake-regression.yml` — CI gate

---

## §29 — Research-plan gap audit (meta) ✅ DONE (documented)

**Verdict: Plan is comprehensive but has TWO STRUCTURAL WEAKNESSES.
(1) NO MEASUREMENT LAYER — §15 already called this out for §13;
the same critique applies to §1, §3, §8, §11, §20, §25. (2) NO
FORMAL API/LIFECYCLE POLICY — invariants live in CLAUDE.md +
memory entries but no semver / deprecation / breaking-change
rules exist. Dispatch 3 next-wave agents to close the biggest
gaps: Agent A (font-builder choice), Agent B (vtracer prototype),
Agent C (visual-diff Phase 1).**

### Top-5 abstract points blocking implementation

| # | Section | What's abstract | Unblock | Cost |
|---|---|---|---|---:|
| 1 | §1 vtracer params | `colorPrecision=6, filterSpeckle=6, layerDifference=24` claimed without prototype on real iconifyx bodies | Stratified-sample run on 500 paint-order-dropped icons at 3 param triples | 12 h |
| 2 | §3/§8/§20 font builder | opentype.js vs fontTools — three sections recommend differently; never picks one | A/B both subprocess prototypes on 5 known-empty packs; pick by silent-empty count + bundle bytes | 8 h |
| 3 | §8 picosvg gate | "Eliminates ~70 % retry pain" with no measurement | Write subprocess script; run against current 569 silent empties; count caught | 6 h |
| 4 | §9 trigram details | "Memory ~5 MB with Bloom-filter OR pack-bucketing" — two designs presented as one | Prototype both on real `icons_index.json`; record (memory, p95 latency, FP rate) | 8 h |
| 5 | §20 usvg pre-pass | "Supersedes ~50 % of §7" without verifying byte-identical TTF output | Run usvg on 1 000 icons; diff AST vs §7's parseBody; verify byte-identical TTF | 16 h |

### Top unverified claims (need empirical measurement)

| Section | Claim | Verification | Effort |
|---|---|---|---:|
| §1 | "~10-14 k icons" recovery via vtracer | Run on 22 k paint-order-dropped, per-pack counts | 10 h |
| §3 | "569 silent empties across 37 fonts" | Reproduce against current main; cite commit | 0.5 h |
| §11 | "p95 ~30 ms in WASM" names.bin scan | Bench on M-series + low-end Android Chrome | 4 h |
| §13 | "120 s → 19 s warm-cache" | §15 already disputes; profile-first delivers ground truth | 0.5 h |
| §17 | "30-50 s warm" Rust crate | Measure subprocess vs in-process | 8 h |
| §20 | "~2-4 k icons" via OKLab k-means | Prototype k-means on 3-colour subset vs vtracer | 8 h |
| §23 | "After ~20 unique packs → ~10 MB font memory + crash" | `performance.measureUserAgentSpecificMemory()` walk-through | 2 h |
| §26 | "5-7 min on 8-core via p-limit(8)" | Build Phase 1 + time it | 8 h |

### Top conflicts / supersessions

| Conflict | Resolution |
|---|---|
| §3 (opentype.js) vs §8 (fontTools) vs §20 (fontTools w/ cu2qu argument) | **Pick fontTools** — §20's cu2qu cubic→quadratic argument is decisive. Edit §3 to "deferred". |
| §13 (manifest-diff + persistent pool) vs §15 (rejects both) | **§15 supersedes**. Mark §13 inline as superseded. Promote §15's ROI table. |
| §7 (htmlparser2 AST migration) vs §20 (usvg as pre-pass) | §20 supersedes ~50 % of §7. Decide order: usvg first; cut §7 scope to splitters only. |
| §17 vs §18 Rust boundary | §17 new crate is high-ROI; §18 rewrite of existing modules low-ROI. Promote the reconciliation paragraph buried at bottom of §18. |
| §4 (TS render stack) vs §17/§26 (Rust kernel) | Phase 1 TS, migrate to Rust Phase 3 — explicit in §26 but not §4. Cross-link. |
| §13.x sort `Object.entries` determinism | §15 verified already sorted — REMOVE from §13. |
| §22 Rec 3 per-pack versioning vs §21 deploy | §21 single workflow; §22 needs per-pack semver + pub.dev publish strategy. **Two separate workflows OR decide not to publish.** |
| §23 row 1 `SvgPicture.network` removal vs website CLAUDE.md §5 | Re-verify `pack_detail_page.dart:580`. Either fix code or update CLAUDE.md. |

### Mentioned-but-not-investigated (next-wave candidates)

- **FlexSearch via JS interop** (§9, §23) — backup option, never benchmarked
- **`performance.measureUserAgentSpecificMemory()` + COOP/COEP** — header impact on jsDelivr/iframe embed unspecified
- **harfbuzzjs / harfbuzz_rs verification** (§8, §17) — proposed twice; never benched against fontkit
- **`bun:sqlite` cache migration** (§15) — no schema, no migration plan
- **Service worker strategy** — `--pwa-strategy none` in §21; interaction with `kUseCdn` jsDelivr unspecified
- **GitHub Actions matrix sharding** (§15 M3) — half a section; warrants its own dive
- **Catppuccin colour-mapped opt-in** — load-bearing path with no dedicated investigation
- **`flutter_svg` for color companion packs** (§25) — tree-shake risk flagged, never investigated
- **Allowlist YAML format** (§26) — schema unspecified
- **`zenrouter` 2.0.3 upstream PR** (§27) — mentioned, never planned

### Implicit cross-section dependencies (not called out)

- §16 A14 (suspicious-glyph) also requires §3 `deprecatedReason` + §17 tiny-skia (beyond §4)
- §13/§15 per-font TTF cache requires §16 A10 byte-determinism baseline
- §11 CDN sharding requires §16 A1 manifest internal-consistency (otherwise sharded JSON ships broken pointers)
- §9 lazy FontLoader requires §11 names.bin (search-by-trigram doesn't need fonts, grid render does — lazy load order matters)
- §27 zenrouter fix is prerequisite for §10 selection tray URL share
- §22 Rec 3 per-pack versioning requires §16 A3 identifier-rename detection (semver bump semantics need a contract)
- §17 vtracer + §25 approach 4 are the SAME code path — need ordering
- §7 AST migration requires §5 no-ink predicate as single source of truth
- §24 PreToolUse hooks need explicit `.claude/settings.json` scope decision
- §21 deploy day-1 requires §11 phased rollout `kUseCdn` const

### Missing topics — propose §28-§40

| § | Title | Why critical |
|---|---|---|
| ✅ §28 | iOS / mobile bundle size budget | (Renumber: now §28 is tree-shake verify; future iOS section needs a different number) — plan is web/macOS-centric; no iOS verification |
| §30 | Accessibility — `Semantics` + screen reader + RTL | `IconifyIcon` wraps `Semantics` but no `semanticLabel` propagation plan |
| §31 | i18n — icon name translations + multi-language search | Iconify has CN/JP aliases for some packs; search is ASCII-only |
| §32 | Dark-mode colour semantics for paint-order duotones | `paintOrderSecondaryFallback = white` is wrong in dark mode; theme-aware default missing |
| §33 | Generator security + supply-chain | oslllo-svg-fixer runs untrusted SVG through resvg; vtracer pulls prebuilt binary. SBOM + lock-pinning unaddressed |
| §34 | Deprecation lifecycle / breaking-change policy | §22 Rec 3 introduces semver but no lifecycle. Need public policy |
| §35 | Onboarding: contributor docs + first-time setup audit | oslllo-svg-fixer requires darwin/linux prebuilts; Windows contributors silently blocked |
| §36 | `iconifyx_core` + Flutter `final class IconData` migration | Memory entry notes upcoming Flutter change that breaks extension-type representation. **One Flutter release from failing.** |
| §37 | Cross-platform render parity (web CanvasKit vs iOS/Android/Windows Skia) | TextPainter font-fallback differs; duotone paint-order not verified on iOS |
| §38 | Hosting cost projection (jsDelivr limits, Pages 100 GB/mo bandwidth) | §11/§12 push to jsDelivr; no projection at 10 k DAU |
| §39 | Test infrastructure inventory + coverage target | `bun test` mentioned; no coverage report, no missing-tests audit |
| §40 | `@iconify/json` upstream tracking + auto-PR | Manual `bun update`; no GitHub Action to auto-PR on upstream bumps |
| §41 | CanvasKit font registry memory-leak post-mortem | §9/§23 mention the bug; no investigation of Flutter upstream patch |

### Next-wave research agents (3) — priorities

**Agent A — Font-builder decision via measurement**
1. `bun --cpu-profile` baseline cold + warm regen (§15 M1)
2. Stand up opentype.js AND fontTools (uv subprocess) prototypes
3. Build 5 most-empty packs (meteocons, devicon, token-branded,
   logos, lets-icons) through each
4. Measure: silent empties remaining, post-shake bundle bytes,
   regen wall-time, cu2qu correctness on logo wordmarks
5. Pick exactly one; update §3/§8/§20 inline.

**Resolves**: §1 abstract #2; §2 unverified claims §3+§8; conflicts
§3↔§8↔§20.

**Agent B — vtracer prototype + per-pack recovery**
1. Wire `@neplex/vectorizer` into standalone CLI
2. Stratified sample 500 paint-order-dropped across twemoji / noto /
   fluent-emoji-flat / circle-flags / logos
3. At 3 parameter triples each, measure §26-style classifier output
   on traced vs upstream
4. Output: parameter table, per-pack recovery counts, §25 per-pack
   policy decision.

**Resolves**: §1 unverified "10-14 k"; §1 abstract #1, #3; §25
abstract #13.

**Agent C — Visual-diff Phase 1 + suspicious-glyph baseline**
1. Build §26 Phase 1 rules 1-8 (minimum viable diff)
2. Curate §16 A14 known-bad set (20 reference PNGs with dHashes)
3. Run diff full-corpus; record wall-time, bucket sizes,
   allowlist seed
4. Commit `goldens.json` + baseline `VISUAL_DIFF.md`

**Resolves**: §4 abstract; §16 A14 abstract; §26 abstract; **enables
CI gate for everything else**.

### Bottom line

> **If you fix only one thing first: dispatch Agent A.** It
> collapses §3 + §8 + §20 into one decision, unblocks Agent B
> (vtracer pipeline needs to know which font builder targets it),
> and unblocks Agent C (visual diff baseline depends on what the
> font builder ships).

The plan is comprehensive but needs:
1. **A measurement layer** — profile-first should be a process rule,
   not a §-by-§ note.
2. **A formal API/lifecycle policy** (§34 above) — semver,
   deprecation, breaking-change rules. §22 Rec 3 needs §34 to be
   implementable. §36 (`final class IconData`) is one upstream
   change from breaking everything; nobody owns it.

---

## §30 — Implementation roadmap (waves + critical path + first-PR series) ✅ DONE (documented)

**Verdict: Ship Wave 1 + Wave 2 in next 3-4 weeks (~50 h, mostly
trivial PRs). Closes EVERY known correctness bug (§19, §27),
569 silent empties (§3), 6 new audit reports (§16, §4, §26),
GitHub Pages live (§21), tree-shake test covers all 225 packs (A5).
After: Wave 3 (speed) + Wave 4 (recovery) + Wave 6 (web perf) run in
parallel. SKIP §17 Rust this quarter. SKIP §8 Python toolchain
unless §3-quick + §4 prove insufficient.**

### The 8 waves (ordered)

**Wave 0 — Profile first (mandatory, ~4-6 h)**
Per §15 M1: no perf work above this line. Stage-level `console.time`
in `pipeline.ts:135-302`, `bun --cpu-profile`, per-pack aggregation,
APFS `existsSync`/`readdir` cost on 43 k-entry `tabler/`. Ship-gate:
`docs/PROFILE_BASELINE.md` committed.

**Wave 1 — Quick wins + foundations (~22 h, 8 parallel items)**

| § | Task | h |
|---|---|---:|
| §19 | Search-trim fix (3 trim deletions + dead code) | 0.5 |
| §27 | Routing replace-vs-push override | 4 |
| §3 | Iterate-until-empty rebuild loop | 3 |
| §5 | Unified `elementHasNoInk` + alpha promotion | 3-4 |
| §6 | setStrokeWidth proportional + style/group inheritance | 2-3 |
| §16-A10 | Determinism self-check + `ttfSha256` baseline — ✅ shipped (`bun run audit determinism`) | 3 |
| §21 | GitHub Pages deploy workflow | 2-3 |
| §16-A6 | Duotone primary/secondary sync audit | 1.5 |

All independent. Run as parallel small PRs.

**Wave 2 — Audit infrastructure (~28 h)**
Builds the EYES before any large refactor.

| § | Task | h |
|---|---|---:|
| §16-A1/A2/A3 | Combined `MANIFEST_LINT.md` — ✅ shipped + §16-A2 ✅ remediated (`bun run audit orphan-const-fix --apply`, 319 → 0) | 4 |
| §16-A5 | Per-pack tree-shake automation (rotated sample) | 5 |
| §16-A8 | Upstream regression detector + `deprecatedReason` — ✅ shipped (`bun run audit upstream-regressions`) | 2 |
| §4 | Golden file regression (curated 20-icon list) | 2 |
| §4 | pixelmatch infra + raster64 cache | 6 |
| §16-A14 | Suspicious-glyph (blob/blank) on §4 raster | 2 |
| §26 | Visual-diff Phase 1 (rules 1-8 JSONL+MD) | 6-8 |

Inside-wave dep: §4 raster precedes §16-A14 + §26. Otherwise parallel.

**Wave 3 — Speed + cache (~15 h, gated by Wave 0)**

| § | Task | h |
|---|---|---:|
| §15 | `Bun.hash` over `crypto.sha1` | 0.5 |
| §15 | `--skip-meta` dev-mode flag | 1 |
| §15 | Batched stroke-fill worker (one tempIn across packs) | 2 |
| §15 | Per-font TTF cache w/ full `iconToSvg` + flags + lib key | 4-5 |
| §15 | SQLite-backed `.cache/strokefill/` via `bun:sqlite` | 5 |
| §15 | raster64 cache in same SQLite DB | 2 |

**MUST land Wave 1 §16-A10 first** — cache only safe with byte-
determinism baseline. **Defer indefinitely**: §13 manifest-diff
incremental (cross-pack pipeline edits invalidate everything).

**Wave 4 — Coverage recovery (~2-3 wk)**

| § | Task | h |
|---|---|---:|
| §14 | Stroke-aware `extractConcretePaints` + shoelace + white-as-FG | 4 |
| §2 | Area-based duotone tail (overlaps §14) | 3-4 |
| §20 | `usvg` subprocess normaliser pre-pass | 1.5 d |
| §1 | vtracer multi-colour worker (panic-bisect borrowed) | 2 d |
| §25 | Circle-flag silhouette mask-carrier flatten | 3-4 |
| §20 | OKLab/RGB k-means k=2 for 3-colour bodies | 1 d |

Deps: §14/§2 follow §5; §1 requires Wave 2 §26 to MEASURE quality;
§25 piggybacks on §14 + §1. Estimated recovery: 2 080 + 8-12 k + 700
+ 2-4 k = **13-19 k of 22 k drop**.

**Wave 5 — Structural / API (~1-2 wk)**
Order matters — A3 rename-detection MUST be live before alias-split
lands.

| § | Task | h |
|---|---|---:|
| §22 R3 | Per-pack versioning (hash → bump) | 3 |
| §22 R5 | `PackInfo` (extend `IconSetLicense`) — ✅ shipped (every pack now emits `packInfo` const with `hasDuotone` / `hasPaintOrder` flags; `iconSetLicense` preserved for back-compat) | 2 |
| §22 R2 | Per-pack category data layer | 4 |
| §22 R1 | Alias-map split — **gated on A3** | 6 |
| §22 R4 | Category-meta packages (`iconifyx_logos`, etc.) | 3 |

**Wave 6 — Web app perf (~1 wk, parallel with Wave 4)**
Generator-independent. Different reviewer track.

| § | Task | h |
|---|---|---:|
| §23 #1 | Remove `SvgPicture.network` from `_IconCell` | 1 |
| §23 #2 | ScrollEndNotification → ValueNotifier | 2 |
| §23 #3 | Search debounce 60-80 ms | 1 |
| §23 #4 | `RepaintBoundary` on `_IconCell` | 0.5 |
| §23 #5 | Hoist `Theme.of` out of `PackTile`/`_PaletteRow` | 1.5 |
| §9 | `IconifyIcon` `ui.Picture` LRU cache | 3 |
| §9 | Lazy `FontLoader` per-pack | 1-2 d |
| §10 | Icon-detail page restructure | 3 |
| §10 | Selection tray (gated on §27) | 1 d |
| §12 | `packs.json` CDN single-file | 3-4 |
| §11 | Per-pack JSON shards + `names.bin` phased rollout | 4-6 d |

**Wave 7 — Deploy + day-2 perf**
Day-1 = Wave 1 §21 lands. Day-2 = Wave 6 §11/§12 migrate JSON to
jsDelivr behind `kUseCdn`. Roll forward one phase at a time.

**Wave 8 — Optional / deferred (this quarter: DON'T)**
- **§17 Rust crate** — 80 % of warm time is non-CPU; only worth
  Rust for audit primitives AND only if Wave 3+4 leave a ceiling.
- **§3 opentype.js / §8 fontTools rewrite** — re-evaluate after
  Wave 1's iterate-until-empty + Wave 2's visual-diff measure
  silent empties.
- **§7 htmlparser2 AST** — §20 usvg pre-pass removes ~50 % of
  motivation; defer.
- **§8 Python toolchain** — single-toolchain user pref. Skip
  unless silent-empty count > 100 post-Wave 1.
- **§6 paper.js stroke→path geometric** — current rasterize-trace
  is good enough.

### Critical path (5-7 items)

1. **§19 + §27 (today)** — trivial; ship today; unblocks Wave 6 §10
2. **§16-A10 determinism baseline** — foundation for every cache /
   rewrite; without it Wave 3 is unverified
3. **§4 + §26 visual-diff** — project's missing eye. Every recent
   bug surfaced only via manual website browsing. Replaces ALL
   manual-spot-check workflows.
4. **§16-A1/A2/A3/A5/A6/A8 lint suite** — closes silent-fail classes
   that COVERAGE/STROKE/FONT miss. ~12 h combined.
5. **§14 stroke-aware paint extraction** — single highest icons/h
   ratio: 1 300 streamline icons recovered in ~1 h; ~780 more via
   shoelace
6. **§1 vtracer multi-colour** — biggest absolute recovery (10-14 k
   of 22 k drop). Worth its 2 d cost ONLY after §26 can grade
   output quality.
7. **§15 per-font TTF cache + SQLite** — only Wave 3 item that
   survives §15's own scepticism. ~30-50 s warm regen reduction.

NOTE absences: §17 (Rust — too speculative), §22 (structural — QoL),
§11 (CDN — perf not correctness).

### Anti-sequence (DON'T do these orderings)

1. **DON'T §17 Rust before §15 TS-only** — §18 explicit: 80 % of
   warm time is non-CPU. Rust pays back ONLY if shipping vtracer +
   visual-diff in same crate AND §15 plateau is hit. None true today.
2. **DON'T §22 R1 alias-split before §16-A3 rename-audit** —
   collision-reshuffle ships silently green locally, breaks in
   fresh clones.
3. **DON'T §25 vtracer integration before §16-A14 / §26 visual-diff**
   — would trade 22 k drops for 14 k blurry blobs with no way to
   grade.
4. **DON'T §15 per-font TTF cache before §16-A10 determinism** —
   cache-key bug ships byte-corrupted TTFs to consumers.
5. **DON'T §3 opentype.js rewrite before §4 goldens** — curve-
   conversion regressions would slip through. Iterate-until-empty
   quick part is fine; the rewrite is the risky part.
6. **DON'T §11 CDN sharding before §9 lazy FontLoader** — shards
   reference codepoints in fonts the website doesn't have loaded.
7. **DON'T §10 selection tray before §27 routing fix** — selection-
   state-via-URL compounds history pollution.
8. **DON'T §13 manifest-diff incremental.** §15 rejects it.
9. **DON'T introduce Python (§8) on day 1.** Single-toolchain pref.
10. **DON'T merge per-set Dart packages.** Violates CLAUDE.md §6
    tree-shake invariant.

### First PR series (next 2 weeks, ~40 h across 12 PRs, ≤ 2 h review each)

| # | Title | Files | Risk | Acceptance | h |
|--:|---|---|:--:|---|---:|
| 1 | Fix search-bar space-eater bug | `search_page.dart`, `all_packs_page.dart`, `pack_detail_page.dart`, `app_shell_layout.dart` | low | typing `mdi line` → URL `?q=mdi%20line` | 0.5 |
| 2 | Routing replace-vs-push override in Coordinator | `lib/router/coordinator.dart`, `app_shell_layout.dart:39-44` | medium | back-button after sheet returns to grid; filter keystrokes = 1 history entry | 4 |
| 3 | Profile baseline (console.time, no code change) | `pipeline.ts`, new `docs/PROFILE_BASELINE.md` | none | stage-level timings committed | 4 |
| 4 | Iterate-until-empty font rebuild loop | `pipeline.ts`, `font_verify.ts`, `manifest.ts` (`deprecatedReason`) | low | `FONT_AUDIT.md` empties 570 → ~0; manifest byte-stable | 4 |
| 5 | Unified `elementHasNoInk` predicate + alpha promotion | `svg_preprocess.ts`, tests | low | 6-8 unit tests; full regen produces identical manifest | 4 |
| 6 | setStrokeWidth proportional scaling | `svg_preprocess.ts` | low | lucide-thin/bold visually consistent across sizes | 3 |
| 7 | Determinism self-check + `ttfSha256` | new `determinism_check.ts`, `manifest.ts` | low | regen-twice-byte-diff exits 0; sha256 baselines committed | 4 |
| 8 | `MANIFEST_LINT.md` (A1+A2+A3) | new `manifest_lint.ts` | low | runs every regen; no regressions on current state | 4 |
| 9 | A5 per-pack tree-shake automation | new `tools/generator/test/shake_probe.test.ts` | low | rotates 1 pack per regen; green local + CI | 5 |
| 10 | Duotone primary/secondary sync (A6) | `font_verify.ts` | low | new FONT_AUDIT section; 0 half-broken duotones | 1.5 |
| 11 | Stroke-aware duotone (§14 item 1) | `svg_preprocess.ts`, tests, regen 3 packs | medium | ~1 300 streamline-color flip blob → two-tone | 4 |
| 12 | GitHub Pages deploy workflow | `.github/workflows/deploy-web.yml` | low | live at `https://Bthn.github.io/icons/` | 2-3 |

PRs 1+2 ship day 1 (correctness, no generator risk).
PRs 3-7 are Wave 1 foundations.
PRs 8-10 are Wave 2 audit infrastructure.
PRs 11-12 are mixed-wave but standalone.

### Risk concentration check

**Wave 4 pile-up**: §1 + §20 + §25 all touch `svg_preprocess.ts` +
`pipeline.ts`. **Mitigation**: serialise — §14 + §2 first (TS-only,
lowest risk), then `usvg` pre-pass alone, then vtracer alone, then
k-means. Each behind a `config.yaml` flag. `VISUAL_DIFF.md` deltas
reviewed between each.

**Wave 5 pile-up**: §22 R1 + R2 both rewrite `dart_codegen.ts`.
**Mitigation**: ship R3 (versioning) + R5 (PackInfo) first (no
codegen tree changes), then R2 (additive new file), then R1
(riskiest, needs A3 green).

**Wave 3 pile-up**: per-font TTF cache + SQLite migration touch
`font_builder.ts` + `stroke_fill.ts` simultaneously. **Mitigation**:
SQLite migration first (no behaviour change, only storage), verify
with A10 + goldens, THEN cache wrapping.

**Cross-wave**: don't merge Wave 3 + Wave 4 PRs in same week —
cache-induced bytes drift + new-pipeline-branch behaviour drift
would be ambiguous.

### Re-research triggers (stop-and-rethink signals)

- **Wave 0**: `svgicons2svgfont` > 60 % of warm time → skip Wave 3
  caching, jump to §3 opentype.js rewrite. `JSON.stringify(tabler.
  json)` > 20 % → bespoke streaming serialiser (not in any plan).
- **Wave 1**: §3 iterate-until-empty drops only < 200 empties → §3
  structural rewrite climbs priority. §16-A10 surfaces non-
  determinism TODAY → block Wave 3 until root-caused.
- **Wave 2**: §26 visual-diff Phase 1 > 12 min wall-clock → jump to
  §17 Area 2 #2 Rust kernel (the ONLY defensible Rust use-case).
- **Wave 3**: Per-font TTF cache hit-rate < 50 % on warm regen →
  cache key is wrong; reprofile, don't ship.
- **Wave 4**: §1 vtracer output mostly `filled-blob` (> 40 %) at
  24 px → drop vtracer for emoji, ship only for circle-flags +
  2-colour residue. §20 `usvg` pre-pass changes > 2 k manifest
  entries → suspend, audit.
- **Wave 5**: A5 tree-shake probe fails post-R1 → revert immediately
  (tree-shake invariant is non-negotiable per CLAUDE.md §1).
- **Wave 6**: §11 names.bin search latency > 50 ms p95 → keep
  bundled `icons_index.json` for search, only shard pack-detail.
- **Hard veto**: re-research if any wave breaches tree-shake
  invariant, codepoint stability, OR byte-determinism. **Only
  three veto conditions.**

### Bottom line

Ship Wave 1 + Wave 2 next 3-4 weeks (~50 h, ≤ 2 h per PR). After:
parallel Wave 3 / 4 / 6 with three independent reviewer tracks.
Skip §17 Rust this quarter unless §26 visual-diff takes painfully
long. Skip §8 Python unless §3-quick + §4 prove insufficient.

---

## §31 — Tree-shake sibling-TTF tax: zero-config auto-fix research ✅ OBSOLETE

> ✅ **OBSOLETE — superseded by §32.** §32 found a generator-side path
> (cmap format 12 + Supplementary PUA, empirically verified) that
> delivers zero-config tree-shake on ALL platforms WITHOUT a Flutter
> SDK PR. Historical investigation below preserved as record.

**Original verdict (2026-05-15): With current Flutter SDK, "consumer
runs `flutter build` with zero config, 50 icons across 10 packs =
35 KB" is NOT achievable on all platforms. The single blocker is one
line in `packages/flutter_tools/lib/src/build_system/targets/assets.dart`
that we don't control. Best achievable today: ~80 % reduction via
popularity-reallocation + Android-only Gradle post-build strip; real
fix requires Flutter SDK PR (issue #64106, dormant 6 years).**

*Update (2026-05-16): the underlying assumption — that we couldn't
move icons out of BMP — was empirically wrong. §32's cmap-format-12 +
supp-PUA approach skips the Flutter SDK blocker entirely. The
~30-line `assets.dart` PR may still be a worthwhile upstream
contribution for the broader Flutter ecosystem, but iconifyx no
longer depends on it.*

### The single line that's blocking us

`flutter_tools` source code (verified May 2026, master) —
`assets.dart` font-copy loop:

```dart
doCopy = !await iconTreeShaker.subsetFont(input, outputPath, relativePath, quiet);
if (doCopy) {
  await (content.file as File).copy(file.path);   // ← THE BLOCKER
}
```

`IconTreeShaker.subsetFont` returns `false` when:
- tree-shake is disabled or input < 12 bytes, OR
- **the font family is not in `_iconData!`** — i.e. zero referenced
  codepoints in that TTF (this is OUR case for sibling TTFs)

A `false` return does NOT mean "drop". Caller's fallback is
**unconditional**: `await content.file.copy(file.path)` — the
original TTF is copied byte-for-byte into `flutter_assets/`,
`FontManifest.json` keeps the entry.

**There is NO "drop unreferenced TTF" code path anywhere in
`flutter_tools`.** The behaviour is deliberate (every pubspec-
declared asset ships) and predates icon-tree-shake by years.

### Upstream issue landscape

| # | Title | Status | Relevance |
|---|---|---|---|
| **#64106** | "Tree shake unused assets" | **Open P3, 6 years dormant**, assigned dcharkes | Canonical bug; maintainer note "hard due to dynamic asset loading" |
| #157216 | Icon tree shake 3rd-party not working on Windows | Closed by #184249 | Desktop quoting bug; orthogonal |
| #172449 | Larger APK after removing last Symbol | Closed (dup of #157216) | Same symptom |
| #154986 | Web tree-shake doesn't work well | Open P2 | Web-only, not multi-TTF |
| #96514 | Conditional bundling of assets | Closed without implementation | Would fix us if revived |
| #146264 | `hook/build.dart` DataAssets | Experimental, gated `flutter config --enable-dart-data-assets` | Possible long-term mechanism |
| #129757 | Build hooks + Code assets | Stable since Flutter 3.38 / Dart 3.10 | Code assets only; font story still gated |

**No upstream issue targets our exact bug.** #64106 is dormant; a
coherent comment with empirical data (3-pack scenario: 12.1 MB
instead of 3 KB, ~99 % waste) would be a credible rallying point.

The surgical patch surface: ~30 lines in `assets.dart` — gate the
unconditional `copy(file.path)` behind a pubspec key
(`flutter.unreferencedFontHandling: drop`) or CLI flag, and also
strip the entry from `FontManifest.json`. One PR, scoped, opt-in
(preserves dynamic-font consumers), reviewable in days.

### Workaround verdict table

| Mechanism | Zero-user-config? | Hit rate | Cost (h) | Risk |
|---|---|---|---:|---|
| **A. Popularity-based codepoint reallocator** (top-N → primary TTF) | YES | ~70-80 % typical; **0 % worst case** | 12-20 | ONE long-tail reference reintroduces 5-9 MB sibling tax. Doesn't meet hard requirement. |
| **B. Single mega-TTF per pack** (raise BMP cap via supp-PUA) | YES | 100 % where feasible | 40-80 | svg2ttf supp-PUA unverified; Flutter glyph renderer fragile at supp-PUA codepoints. Likely infeasible. |
| **C. Runtime FontLoader.load() with plain assets** | NO (breaks const tree-shake) | N/A | 30 | const_finder needs font declared as font; declaring as plain asset = font-subset never runs. Worse. |
| **D. Gradle plugin / iOS script_phase / web hook** | Android YES (Flutter auto-apply), iOS partial, **web NO** | 100 % where it runs | 60-120 (3 platforms) | iOS = Podfile edit per Flutter docs; web has no native post-build hook. Fragile across Flutter versions. |
| **E. Dart `hook/build.dart` DataAssets** | YES if `flutter config --enable-dart-data-assets` flipped | 100 % theoretical | 20-40 prototype | Experimental, may shift; font registration via data-assets incomplete (#146264 still open). |
| **F. Per-pack package fragmentation** (`iconifyx_mdi_a/_b/_c`) | YES if user knows which slice | 100 % if known; **~0 % otherwise** | 8-12 | Doubles pkg count to ~500; impossible to know upfront which slice an icon is in. UX disaster. |
| **G. Document + recommend single-TTF packs** | YES | Variable | 1 | Honest, doesn't meet requirement |
| **H. Upstream Flutter SDK PR** | YES once landed (+1 pubspec line) | 100 % | 40 + months review | Out of our control; Flutter team font-asset triage slow (issue #64106 dormant 6 years) |

### Detail — Option D (native build hooks)

**Android**: Flutter packages CAN ship `android/build.gradle` that
adds a task to the consumer app's build via Flutter plugin manifest
auto-apply mechanism (used by `firebase_messaging`, etc.). A
post-`assembleRelease` task can:
1. Read `build/intermediates/flutter/release/flutter_assets/
   FontManifest.json`
2. Scan AOT kernel for IconData refs
3. Delete TTFs with zero refs
4. Rewrite the manifest
5. Re-zip assets jar pre-signing

**Zero-config on Android. Works today.**

**iOS**: No auto-apply equivalent. CocoaPods script_phases require
consumer's Podfile to opt in. Closest path: make `iconifyx_core` a
plugin (not pure Dart) with iOS `script_phase` declared in its
`.podspec` — Flutter's plugin tooling injects on `flutter pub get`.
Verified pattern but increases maintenance + iOS pipeline shifted
twice in 2025.

**Web**: No post-build hook in `flutter build web`. Only path is a
wrapper Dart CLI (`dart run iconifyx:strip`) — **violates
zero-config constraint**.

### Detail — Option A's worst-case problem

User's hard requirement: "50 icons across 10 packs = 35 KB".
Popularity reallocation puts top-N icons in primary TTF. At 95 %
primary hit:
- 47.5 icons in primary (~33 KB shaken) ✓
- 2.5 icons in siblings → each reintroduces FULL sibling TTF
  (5-9 MB each) → **~25 MB worst case**

For real apps using 5-50 icons, P(at least one cold miss across
all packs) → 1 as references grow. **Popularity reallocation
improves the TYPICAL case, not the WORST case.** Does not satisfy
the user's hard constraint.

### Honest answer

**NO.** With current Flutter SDK (3.41 stable, 3.44 beta, master
May 2026) and ZERO user-side configuration, iconifyx cannot
guarantee "50 icons across 10 packs = 35 KB of fonts." Cause is
in Flutter's `assets.dart` font-copy loop; there is no "drop
unreferenced TTF" step anywhere in `flutter_tools`.

Closest today, no SDK change: **A + D-Android = ~80 % reduction
of worst case**. Android consumer-zero-config. iOS partial (plugin
podspec auto-inject is fragile). Web fails (no post-build hook).

**Only clean, zero-config, all-platforms answer is a Flutter SDK
PR.**

### Three-phase proposal

#### Short-term (~10 h, this week) — improves typical case, doesn't meet hard requirement

1. **Popularity-based codepoint reallocator** in
   `tools/generator/src/codepoint_allocator.ts` (~6 h)
   - Curated `popularIcons` list per pack (Iconify search analytics
     seed + hand-picked ~500 names: `home/search/menu/user/...`)
   - Two-pass allocation: popular → primary `<Prefix>.ttf` first,
     long-tail spills to `_2`/`_3`
   - Manifest gains `popularitySlot` field
   - Reduces sibling-tax probability by ~70-80 % for typical apps
2. **Update `CLAUDE.md` §1 + README** (~1 h) — honest documentation
   of sibling-TTF tax; recommend single-TTF packs (carbon,
   heroicons, feather, fa6_solid, octicon, bi) for bundle-strict
   users
3. **Bundle-regression CI gate** (~3 h) — `test_apps/
   three_icon_test/` + GitHub Action asserting canonical 3-pack
   scenario stays ≤ 12.1 MB + 10 %. Prevents class-wrapping
   regression + catches Iconify growth introducing new auto-splits.

Files: `tools/generator/data/popular_icons.json` (curated list),
`codepoint_allocator.ts` updates, `test_apps/three_icon_test/`,
`.github/workflows/bundle-regression.yml`.

**Caveat**: This is a TYPICAL-case improvement, not a worst-case
fix. Honest README disclaimer required.

**MAJOR VERSION BUMP REQUIRED** — popularity reallocation moves
existing codepoints across siblings → breaks CLAUDE.md §3 invariant
(codepoint stability append-only). Consumers pinned to `^0.1.0`
keep old codepoints; `^1.0.0` gets new layout. ~3-6 mo migration.

#### Medium-term (1-2 months, ~80-120 h) — meets requirement on Android only

4. **`iconifyx_core` becomes Flutter plugin (not pure Dart pkg) with Gradle post-build task**
   - `iconifyx_core/android/build.gradle` registers task after
     `assembleRelease`
   - Parses AOT kernel for IconData refs
   - Drops TTFs with zero referenced codepoints
   - Rewrites `FontManifest.json`
   - Re-zips assets jar pre-signing
   - **Zero consumer config on Android** (Flutter plugin auto-apply)
5. **iOS via plugin `.podspec` `script_phase`** — same strip on
   `Runner.app/Frameworks/App.framework/flutter_assets/`. Fragile
   (iOS plugin pipeline shifted twice in 2025); needs version-
   pinning.
6. **Web NOT covered** — document that web builds require either
   popularity-reallocation only OR manual `dart run iconifyx:strip`.

#### Long-term (3-6 months) — meets requirement everywhere

7. **Upstream Flutter SDK PR** opting into "drop unreferenced
   fonts":
   ```yaml
   flutter:
     unreferenced_font_handling: drop  # default: keep (back-compat)
   ```
   ~30 lines in `assets.dart` (gate the `copy` fallback) + manifest
   filter + tests. Rally behind dormant #64106; attach our 12.1 MB
   empirical evidence.
8. **OR in parallel**: experimental migration to `hook/build.dart`
   DataAssets (#146264). Register fonts dynamically from a build
   hook running AFTER kernel snapshot, so we know which families
   are referenced before declaring them. Higher risk (experimental
   flag), but **the only zero-config web answer** that doesn't
   require an SDK PR.

### The single biggest blocker

**One line** in `packages/flutter_tools/lib/src/build_system/
targets/assets.dart` — the unconditional
`await (content.file as File).copy(file.path)` fallback that runs
when `iconTreeShaker.subsetFont` returns `false`. **This is
Flutter's responsibility, not ours.** No generator cleverness
eliminates it because the asset bundler runs AFTER our package
emit. The fix is a ~30-line opt-in patch + a pubspec key, gated
behind issue #64106. Owner: Flutter team (dcharkes assignee).

We unblock by: (a) attaching our empirical 12.1 MB measurement to
#64106 with a written motivation, (b) submitting the PR ourselves
— Flutter accepts external font-tooling PRs (cf. #184249).

Until that lands, our **best zero-config delivery is ~80 %
reduction via popularity reallocation + Android Gradle post-build
strip**, with honest documentation that web + iOS bundle sizes
remain governed by the sibling-TTF tax.

The hard "50 icons = 35 KB" requirement is **not achievable on all
platforms today without modifying Flutter SDK.**

### Sources (verified)

- [icon_tree_shaker.dart (flutter master)](https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter_tools/lib/src/build_system/targets/icon_tree_shaker.dart)
- [assets.dart (flutter master)](https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter_tools/lib/src/build_system/targets/assets.dart)
- [Issue #64106 — Tree shake unused assets](https://github.com/flutter/flutter/issues/64106)
- [Issue #157216 — Icon tree shake 3rd-party not working](https://github.com/flutter/flutter/issues/157216)
- [Issue #154986 — web tree-shake](https://github.com/flutter/flutter/issues/154986)
- [Issue #96514 — Conditional asset bundling proposal](https://github.com/flutter/flutter/issues/96514)
- [Issue #146264 — hook/build.dart DataAssets](https://github.com/flutter/flutter/issues/146264)
- [PR #184249 — fix tree-shake for desktop](https://github.com/flutter/flutter/pull/184249)
- [Flutter Gradle plugin apply docs](https://docs.flutter.dev/release/breaking-changes/flutter-gradle-plugin-apply)
- Local: [docs/TREESHAKE_VERIFICATION.md](TREESHAKE_VERIFICATION.md), §28 above

---

## Implementation status quick reference

| § | Topic | Status |
|---|---|---|
| §1-§12 | Initial 12 research streams | 📋 documented, partial impl |
| §13/§15 | Speed plan + cross-check | 📋 documented (not impl) |
| §14 | Layer-order survey | 📋 documented (not impl) |
| §16 | Audit gap analysis | 📋 documented; **A6** ✅ shipped (mid-§32); **A10** ✅ shipped (`bun run audit determinism`) |
| §17/§18 | Rust crates + port verdict | 📋 documented (no port) |
| §19 | Search-bar space-eater bug | 📋 root-cause analysed (fix not committed) |
| §20-§27 | Various web + tooling research | 📋 documented; **§21** ✅ shipped (deploy workflow) |
| §28 | Tree-shake empirical findings | ✅ resolved by §32 |
| §29 | Gap audit | ✅ documented |
| §30 | Implementation roadmap | ✅ documented |
| §31 | Zero-config research | ✅ obsolete (superseded by §32) |
| §32 | Single-TTF-per-pack | ✅ **SHIPPED** (5 commits) |
| §33 | Solar/Phosphor alignment bug + audit-litmus | 🚧 OPEN (5 agents running) |

---

## §32 — Single-TTF-per-pack via cmap format 12 + supp PUA: ✅ **SHIPPED**

> 🚀 **STATUS: SHIPPED in commits 79beb0d → fc5f6d4** (5 commits over
> 2026-05-15→16). Generator now collapses every multi-sibling pack into
> a single TTF mid-pipeline. Empirically measured: 10 packs × 5 icons =
> **17.66 KB total bundled fonts** (vs ~30-50 MB before). CI gate at
> `.github/workflows/treeshake-regression.yml` enforces the invariant.
> Full pack regen (225 packs, ~30 multi-split collapsed). Secondary-
> font rebuild bug (§16-A6) discovered + fixed mid-flight (commit
> fc5f6d4).

**Original verdict (2026-05-16, pre-implementation): VERIFIED. cmap
format 12 + Supplementary PUA codepoints render correctly across
macOS desktop release, Flutter web CanvasKit release, and iOS
simulator. Tree-shake `font-subset` correctly subsets supp-PUA
references (724 B for one icon, vs 1736 B baseline). SOLVES the
sibling-TTF tax (§28) WITHOUT Flutter SDK PR / Android Gradle plugin
/ popularity reallocation / configurator. CLAUDE.md §4's "renderer
fragile in supp PUA" claim is empirically false as of Flutter 3.44.**

### Test methodology

Built `/tmp/supp-pua-test/Mdi_merged.ttf` (1 736 B) via `fontTools`
(Python uv venv) containing:
- BMP PUA glyph at U+E000 (MDI `1-2-3` icon from `Mdi.ttf`)
- Supplementary PUA glyph at U+F0000 (MDI `fridge-industrial-alert-
  outline` icon from `Mdi_2.ttf`, codepoint remapped)
- cmap subtables: format 4 (BMP only, U+E000) + format 12 (32-bit,
  both codepoints, platforms 0/4 and 3/10)

Flutter test app `/tmp/supp_pua_test/` renders both icons via:
```dart
Icon(const IconData(0xE000, fontFamily: 'Mdi'), size: 64),       // BMP
Icon(const IconData(0xF0000, fontFamily: 'Mdi'), size: 64),      // Supp PUA
```

### Empirical results

| Platform | Build | BMP (U+E000) renders | Supp PUA (U+F0000) renders |
|---|---|---|---|
| **macOS desktop** | release | YES (123 digits) | **YES** (fridge-alert icon, correct shape) |
| **Flutter web (CanvasKit)** | release | YES | **YES** (correct shape) |
| **iOS simulator** (iPhone 17, iOS 26.4) | debug* | YES | **YES** |

*iOS simulator rejects `--release`; debug uses same Impeller/Skia
text renderer as release. Physical device confirmation recommended
but not blocking.

**No `.notdef` boxes, no baseline drift, no missing antialias, no
fallback substitution. Visual quality identical to BMP rendering.**

### Tree-shake bundle-size validation

All measured against merged TTF (1 736 B unshaken), macOS release
builds with default `--tree-shake-icons`:

| Scenario | Shaken TTF | cmap codepoints kept | numGlyphs |
|---|---:|---|---:|
| No icon reference | 1 736 B (unchanged) | E000, F0000 | 5 |
| BMP only (`IconData(0xE000)`) | **752 B** | E000 | 2 |
| Supp PUA only (`IconData(0xF0000)`) | **724 B** | F0000 | 2 |
| Both | **928 B** | E000, F0000 | 3 |

Web release: same 724 B. Flutter logs:
*"Font asset Mdi_merged.ttf was tree-shaken, reducing it from 1736
to 724 bytes (58.3% reduction)"*.

**`font-subset` walks format-12 cmap, drops unreferenced glyph,
emits properly-formed minimised TTF — including for supp PUA.**

### What this solves

The user's hard requirement from §31 is now achievable:

> "10 packs × 5 icons = ~50 × 700 B ≈ 35 KB, zero user config"

With single-TTF-per-pack via cmap format 12:
- One reference to MdiIcons.home → `Mdi.ttf` shrunk to ~700 B
- No sibling tax (there are no siblings anymore — single TTF)
- Zero Flutter SDK changes needed
- Zero Gradle plugin / iOS script_phase / web build hook needed
- Zero user-config — `flutter build` works as-is

§31's three-phase plan is **OBSOLETE**. Replace with single-phase
generator-side migration.

### Implementation plan (single phase, ~3-4 days)

#### Phase A: fontTools merge subprocess (~1.5 d)

New `tools/generator/src/font_merger.ts`:
- After existing `svgicons2svgfont + svg2ttf` chain emits
  `Mdi.ttf + Mdi_2.ttf + Mdi_3.ttf`
- Spawn Python subprocess via `uv` running fontTools
- Script: load all sibling TTFs, remap secondary/tertiary
  codepoints (currently U+E000+ in their own TTF) to supp PUA
  (U+F0000+), merge all glyphs into one TTF with cmap format 12
  preserved, emit as single `Mdi.ttf`
- Delete original sibling files

This is **NOT a full font-builder rewrite** (§3 / §8 / §20). It's
a post-process step on top of existing svgicons2svgfont output. We
keep the proven svg-to-glyph emission, only do the merge in
fontTools. Cheap (~150 LOC Python + ~50 LOC TS bridge).

#### Phase B: codepoint allocator update (~0.5 d)

`codepoint_allocator.ts` two-tier allocation:
- Existing icons keep their BMP PUA codepoints (preserved per
  CLAUDE.md §3 stability invariant)
- New icons added beyond BMP cap (6000) → allocated to supp PUA
  (U+F0000–U+10FFFF)
- Manifest schema gains `tier: 'bmp' | 'supp'` field
- For packs currently using auto-split: existing Mdi.ttf icons
  stay at U+E000+; ex-Mdi_2.ttf icons remap to U+F0000+, ex-Mdi_3
  to U+F1800+, etc.

#### Phase C: manifest schema migration (~0.5 d)

- New optional `tier` field (additive)
- Existing manifests retroactively get `tier: 'bmp'` for all
  current icons
- Ex-sibling icons in same pack: codepoint changes — **major
  version bump required for those packs ONLY**
- Pubspec for affected packs: `0.1.x` → `1.0.0`; eski codepoint'lere
  pinned consumers stay on `^0.1.0`, switch to `^1.0.0` for the
  new layout
- Generator emits `MIGRATION.md` per affected pack listing renamed
  codepoints + the icon names

#### Phase D: tree-shake CI regression test (~0.5 d)

Generalise §28's `test_apps/three_icon_test/` with assertions:
- 3 icons from 3 different packs MUST shrink to < 5 KB total
- 10 icons from 10 different packs MUST shrink to < 15 KB
- Fail if any sibling TTF appears in `build/.../assets/`

#### Phase E: docs (~0.5 d)

- Update `CLAUDE.md` §4 — remove the "fragile in supp PUA" claim;
  document the new single-TTF approach + cmap format 12
- Update `CLAUDE.md` §1 (tree-shake) — remove the "auto-split
  sibling-tax" caveat now that auto-split is gone
- Update `README.md` — headline number changes from "~700 B per
  icon, but multi-split pack tax applies" to plain "~700 B per
  icon"
- Update `docs/RESEARCH_PLAN.md` §28 + §31 with cross-references
  to §32 as the realised fix
- Update `docs/TREESHAKE_VERIFICATION.md` with the new measurements

### Affected packs

~30 packs currently use auto-split (icon count > 6 000):
- mdi (14 k → 1 TTF instead of 3)
- material-symbols (×6 variants × split = many siblings → ONE TTF
  per variant)
- tabler (30 k → 1 TTF instead of 7)
- lucide (variants × split → 1 TTF)
- iconoir
- solar
- streamline (multiple)
- ~25 more

Other ~195 packs already single-TTF — untouched.

### Migration impact for downstream consumers

**Consumers on ^0.x**: zero impact. Their bundle still uses old
multi-TTF packs.

**Consumers upgrading to ^1.0**:
- BMP-codepoint icons (the first 6 000 of each pack): zero impact,
  codepoints unchanged
- Supp-PUA-codepoint icons (ex-sibling icons): identifier-stable
  (`MdiIcons.foo`) but underlying `IconData(...)` codepoint
  changes. Since users always reference via the const identifier,
  this is invisible — UNLESS users wrote raw `IconData(0xE000,
  fontFamily: 'Mdi_2', ...)` (anti-pattern, but possible). The
  test app A5 (§16) catches this regression.

### Cross-section updates

- **§3 / §8 / §20** font-builder rewrite: still useful for cu2qu
  cubic→quadratic (570 silent empties), BUT no longer the priority
  it was — tree-shake fix is no longer dependent on it. Demote
  from critical path.
- **§28**: cross-ref this section as the realised fix; keep §28 as
  historical record of the bug.
- **§30 roadmap**: insert §32 implementation into Wave 1
  (foundations) as a 3-4 day item. Top priority.
- **§31**: cross-ref §32 as the realised fix. Keep §31 as
  historical record of the investigation. §31's three-phase plan
  (popularity + Gradle plugin + SDK PR) is OBSOLETE.
- **CLAUDE.md §4**: rewrite. The "do not use supplementary PUA"
  rule is REVOKED.

### Caveats (verify before shipping)

1. **iOS release on physical device** not measurable (simulator
   rejects --release; debug uses same renderer, but physical-
   device test would close the loop)
2. **Android** not tested (out of test scope). Skia rendering
   path similar to macOS Impeller; expect equivalent behaviour
   but verify with `flutter build apk --release`
3. **fontTools-emitted format-12 cmap** has worked in every test;
   hand-rolled or older font tools that emit only format 4 will
   silently drop supp-PUA mappings — stay on fontTools, do not
   regress to svg2ttf for the merge step
4. **`uv` toolchain dependency** introduced — minor but worth
   noting per single-toolchain user preference. Mitigation:
   pin fontTools version in `tools/generator/pyproject.toml`,
   `uv` venv created at first generator run, cached via
   `.cache/.venv`

### Verdict

Single biggest reversal of any §-section so far. The "Flutter SDK
PR" blocker named in §31 has DISSOLVED — Flutter SDK never had a
bug per se; we mis-diagnosed by relying on CLAUDE.md §4's
unverified "fragile" claim. Empirical test removes the constraint.

**The user's hard requirement is now achievable in ~3-4 days of
generator-side work. No Flutter PR, no Gradle plugin, no
configurator, no user action.**

### Files referenced (verified)

- Test report: `/tmp/supp_pua_test/` (artifacts not committed)
- Merge script: `/tmp/supp-pua-test/merge_ttf.py`
- Merged TTF: `/tmp/supp_pua_test/assets/fonts/Mdi_merged.ttf`
  (1 736 B baseline)
- Shaken outputs: `shaken_supp_only.ttf` (724 B),
  `shaken_bmp_only.ttf` (752 B), `shaken_both.ttf` (928 B)
- Source TTFs (unmodified):
  `packages/iconifyx_mdi/assets/fonts/Mdi.ttf`,
  `Mdi_2.ttf`

---

## Cross-cutting recommendations

### Tools shortlist (consolidated)

**Adopt (TS-side, npm):**
- `@neplex/vectorizer` — vtracer multi-color trace (§1)
- `svg-pathdata` — already in deps; path bbox for area heuristic (§2,5)
- `htmlparser2 + domhandler + domutils + dom-serializer` — already
  transitive, promote to explicit (§7)
- `pixelmatch` — visual regression diff (§4)
- `opentype.js` — replacement font builder (§3 structural)
- `fontkit` — already in deps; keep for verification (§3,4)

**Adopt (Python subprocess via uv):**
- `picosvg` — pre-validator (§8) — highest signal-per-hour Python add
- `fonttools` — alternative font builder (§3,8) — pick this OR
  opentype.js, not both

**Adopt (web Dart):**
- `quiver` — LRU cache (already in pubspec) (§9)
- `package:http` — CDN fetch (already standard) (§11,12)
- `package:js` / `dart:js_interop` — localStorage + FlexSearch backup
  (§9,10)

**Trial:**
- Rust sibling crate `tools/generator-rust/` with `resvg` +
  `visioncortex-potrace` for panic-safe in-process trace (§8)
- `harfbuzzjs` (WASM) for empty-glyph verification (§8)
- `paper.js` for geometric stroke→path (§6, deferred)

**Reject:**
- StarVector / ML vectorizers — GPU-only, no deterministic npm
- nanoemoji — COLRv1 territory, we ship monochrome
- Lyon (Rust path geom) — TS impl sufficient at our scale
- OKLab colour clustering — RGB-Euclidean 50× cheaper, 95 % accuracy
- 3-gram per-keyword CDN shards — combinatorial blowup
- Service worker for v1 — Flutter web's existing SW handles app shell
- Cloudflare Pages / Workers — jsDelivr is OSS-flavoured infra,
  zero auth boundary

### Recommended sequence (12 weeks of incremental work)

**Week 1-2 (correctness quick wins):**
- Iterate-until-empty rebuild (§3)
- Canonical no-ink predicate (§5)
- Area-based duotone classification (§2)
- setStrokeWidth proportional scaling (§6)
- Golden file tests for known regressions (§4)

**Week 3-4 (visual + audit):**
- Visual diff pipeline (§4)
- Static HTML dashboard (§4)
- TextPainter + Picture cache (§9)
- RepaintBoundary on cells (§9)

**Week 5-7 (structural — pick one of two paths):**
- Path A: opentype.js replacement (§3) — stays in TS
- Path B: fontTools subprocess + picosvg (§8) — adds Python toolchain

**Week 8-9 (multi-colour recovery):**
- vtracer integration (§1) — recovers ~10-14 k icons

**Week 10-11 (web infrastructure):**
- icons_index.json sharding + jsDelivr (§11)
- packs.json CDN (§12)
- Lazy per-pack FontLoader (§9)

**Week 12 (UX polish):**
- Selection tray + bulk export (§10)
- Icon-detail restructure (§10)
- Square-default grid with compare toggle (§10)

### Determinism + manifest invariants

ALL changes preserve:
- Codepoint stability (manifests append-only, never shift existing)
- Deterministic font output (`ts: 0`, sorted-key emit, hash-content
  verify via `ttfSha256`)
- Tree-shake invariants (extension type record, `@staticIconProvider`,
  const IconData fields)

### CI / repro

Single mise.toml or Dockerfile pinning Bun 1.3 + Python 3.12 + Rust
1.85 + uv. GitHub Actions setup via `jdx/mise-action@v2` (~15 s cold).
`bun test` for golden regressions. `audit_gate.ts` fails CI on
new visual regressions.

---

## Status — what's already landed (May 2026)

These were implemented during the investigation that produced this plan:
- `iconifyx_core/IconifyIconData` extension type with `kindCode` field
- Single `IconifyIconData.duo(p, s, kind: ...)` constructor
- `IconifyIcon` widget with kind-aware composition + CustomPaint
- 4 duotone split paths in `svg_preprocess.ts` (opacity, two-color,
  mask-internal, colour-mapped)
- Animation flattening (`flattenAnimations`) for line-md reveal/
  transition animations
- `flattenAnimations` visibility-aware heuristic (min dashoffset, max
  opacity)
- `fontkit`-based post-build verification → `FONT_AUDIT.md`
- Per-icon controls in website (primary / secondary colour, opacity
  sliders, swap layers)
- `IconRecord.toIconifyData()` forwards kind from icons_index.json
  tuple's 4th slot (critical fix — paint-order packs were rendering
  as hint-layer at runtime)

Most of the agents' recommendations BUILD on top of these.

---

## §33 — ✅ RESOLVED: Solar/Phosphor duotone alignment bug + audit-infra litmus test

> ✅ **STATUS: RESOLVED 2026-05-16 (user-verified).** Root cause
> identified by parallel-agent investigation (a3b2cc0b
> glyph-metrics audit caught the metric-frame mismatch; adfadae8
> paint-algo review independently exonerated the widget). Fix
> shipped: every emitted TTF now passes through
> `canonicalize_ttf.py` post-process, forcing identical 1000-em-quad
> metric tables on primary AND secondary fonts. Pre-fix: 1/295 TTF
> canonical → post-fix: **295/295 canonical**. Companion clamp-BoxFit
> in `_IconifyPainter.paint` preserves wide-glyph logos wordmark
> support without re-introducing the previous up-scale regression.

### One-paragraph fix summary

`svg2ttf` recomputes `head` / `hhea` / `OS/2` from the union of actual
glyph extents on save, leaving every pack and every tier (primary vs
secondary) at a subtly different metric frame. Flutter's `TextPainter`
reads those tables for line-height + glyph paint origin, so duotone
primary + secondary TTFs ended up rendering in mismatched reference
frames — visible as Solar `add-circle-bold-duotone`'s "halka
left-shifted, artı pinned to halka's left edge" alignment. Forcing
identical canonical 1000-em-quad metric tables on every emitted TTF
aligns the layers by construction. The key implementation detail
that wasn't obvious upfront: fontTools requires `recalcBBoxes=False`
on the `TTFont` *constructor* (not on `save()`) for the canonical
enforcement to survive serialization.

### ✅ Audit-infra litmus test: PASSED

The visual-diff CLI Phase 1 (`a8d3f33e` shipped in commit `14d4c94`)
empirically verifies the fix AND confirms the audit infrastructure
can detect this class of bug going forward:

- **Pre-fix stale TTF state** (reproduced via `git checkout` to an
  earlier commit): primary centroid x=158, secondary centroid x=421
  → centroid delta **26.3 % of em** → classifier rule
  `DUOTONE_BBOX_MISMATCH` correctly fires with verdict
  *"centroid drift 26.3% / 0.0% of em — layers will overlay
  misaligned"*.
- **Post-fix HEAD state**: primary centroid (500.0, 499.8), secondary
  centroid (500.3, 499.9), centroid delta (0.3, 0.0) em-units =
  **0.0 %** → no classifier rule fires → **clean diff** in the audit
  report.

This means future regressions in any pack would be flagged
automatically — no more relying on humans scrolling the website to
find them. §33's closing criterion #2 (audit detects this class
before the user does) is **met**.

Visual-diff CLI artifacts: `tools/generator/audit/visual-diff/` +
output dir `docs/audit/visual-diff/solar__add-circle-bold-duotone/`
(SVG / primary glyph PNG / secondary glyph PNG / report.json + MD +
ROOT_CAUSE.md investigation walkthrough). Full Phase 2 spec at
§33b below.

### The user-visible bug

After §32 shipped, the website still showed misaligned duotone icons
for Solar + Phosphor (and likely IC, Iconamoon — all multi-split
duotone packs).

User report verbatim (Turkish): *"solar da hâlâ yanlış görünüyor.
Yuvarlak kare içinde daha solda duruyor. Artı da yuvarlak içinde en
solda duruyor."*

Concrete case: `SolarIcons.addCircleBoldDuotone`. Upstream body has
two paths — primary = artı (cross) `9-15` of 24-viewBox, secondary =
halka (ring) `2-22` of 24-viewBox. After build:
- `Solar.ttf` glyph at cp 0xE013: advance=1000 lsb=0 xMin=342
  xMax=658 (artı, content width 316 unit, centred)
- `SolarSecondary.ttf` glyph at cp 0xE013: advance=1000 lsb=0
  xMin=79 xMax=917 (halka, content width 838 unit, near-full em)

By math, `IconifyIcon` `_IconifyPainter.paint` with `Offset.zero` for
both should render both layers centred (artı at 68.4-131.6 px,
halka at 15.8-183.4 px in a 200-px canvas). Two paint attempts
(BoxFit-emulation + plain-zero) didn't fix it. **Either Flutter
TextPainter for icon glyphs has semantics I don't yet understand, OR
the bug is OUTSIDE `_IconifyPainter.paint` (widget wrapper / cell
layout / website-side issue).**

### Why this is critical: audit infrastructure litmus test

This is a **SIMPLE visual bug** — anyone opening the website + scrolling
Solar's pack page sees it within seconds. Yet our current audit stack
(`COVERAGE.md`, `STROKE_AUDIT.md`, `FONT_AUDIT.md`) reports
zero anomalies for this icon. The audit infrastructure is **blind** to
visual misalignment — only checks structural correctness (font has
glyph, glyph has commands, codepoint reserved).

If our audits CAN'T detect a bug this obvious, the audit
infrastructure must be upgraded. This bug becomes the canonical
LITMUS TEST for §4 visual regression / §26 visual-diff Phase 1: any
new audit tool we ship must flag `solar:add-circle-bold-duotone` as
high-anomaly without human intervention.

### 5 parallel agents dispatched

| Agent ID | Brief | What it produces |
|---|---|---|
| `a8d3f33e` | Visual-diff CLI Phase 1 design + prototype | `tools/generator/audit/visual-diff/` CLI; SVG vs TTF vs Flutter-render PNG comparison; per-pair classifier verdict |
| `a3b2cc0b` | Glyph-metrics audit | `GLYPH_METRICS_AUDIT.md`; flags duotone pairs with primary/secondary bbox mismatch (the exact diagnostic this bug needs) |
| `a87ab25b` | Flutter render-to-PNG harness | `bun run render-icon <pack>:<name>` reliable programmatic PNG export — foundation for golden-file regression tests |
| `a3b0af36` | Focused debugging — Solar add-circle root cause | Empirical PNG dump + layer-by-layer comparison; identifies exactly which paint step misaligns |
| `adfadae8` | Independent paint algorithm review (second-opinion agent) | Validated TextPainter semantics from Flutter source; correct `paint()` algorithm proposal |

This is a multi-angle attack. The Solar bug fix doesn't need ALL of
these — but the AUDIT INFRA upgrade does.

### Required outcomes

1. **Bug fixed**: Solar / Phosphor / IC / Iconamoon duotone alignment
   correct on macOS native release + Flutter web CanvasKit release.
2. **`solar:add-circle-bold-duotone` shows up as anomaly** in at
   least one new audit tool BEFORE the fix lands. This proves the
   audit can detect the class.
3. **CI gate**: `treeshake-regression.yml` companion workflow that
   also runs visual-diff against a golden set including this icon.
   Future regressions blocked by green-gate.

### Cross-references

- §4 visual regression — this is its FIRST real test case
- §16-A14 suspicious-glyph (visually-anomalous) — should fire on this bug
- §16-A6 duotone primary/secondary sync — alignment is the **rendering**
  consequence of A6's bbox mismatch case
- §26 visual-diff classifier — rules 1-8 should detect this
- §17 Area 2 #2 Rust raster-and-diff — same problem at speed

### What this tells us about iconifyx audit maturity

Pre-§33: audits surfaced "missing glyph" and "stroke ratio"
quantitatively but **rendering correctness** was assumed-correct as
long as svgicons2svgfont + svg2ttf accepted the body. That assumption
just broke. Going forward:

- Every regen MUST include a visual-diff pass over the corpus.
- The visual-diff tool's classifier must include a "primary-secondary
  bbox-mismatch" rule that fires before render — not after user reports.
- The CI gate must include a golden visual-diff over a curated set
  of high-risk icons (every duotone style across mdi / solar / ph /
  ic / iconamoon / lets-icons / cif / cryptocurrency-color).

### When to declare audit infra "adequate"

A future bug equivalent to this one (any pack, any layer, any visual
mismatch) must be detected by `bun run generate` output BEFORE the
developer sees it in the website. If a human still has to scroll a
pack page to find it, infra is INADEQUATE.

§33 closes when:
1. Solar bug fixed + verified across all multi-split duotone packs
2. Visual-diff CLI (a8d3f33e output) detects this class in its corpus run
3. Glyph-metrics audit (a3b2cc0b output) flags this class in `GLYPH_METRICS_AUDIT.md`
4. CI gate green on the fixed state

Pending agent results.

---

## §33b — Visual-diff CLI tool — Phase 1 (delivered)

> ✅ **STATUS: Phase 1 SHIPPED.** Single-icon (pack, name) visual
> comparator at `tools/generator/audit/visual-diff/`. Produces an
> upstream-SVG-vs-TTF-primary-vs-TTF-secondary-vs-Flutter-rendered
> four-pane raster comparison + classifier verdict in ~15-30 s
> (cold flutter test) or ~2 s (`--skip-flutter`).

### What landed

```
tools/generator/audit/visual-diff/
├── cli.ts                # Bun orchestrator
├── rasterize_glyph.py    # fontTools + Pillow per-glyph PNG renderer
└── run.sh                # convenience wrapper
```

Outputs land in `docs/audit/visual-diff/<prefix>__<name>/`:

| File | Source | Notes |
|---|---|---|
| `upstream.svg` | `@iconify/json` body wrapped with viewBox + `xmlns:xlink` | written for human inspection |
| `upstream.png` | `@resvg/resvg-js` rasterised SVG | canvas matches `--size` |
| `glyph-primary.png` | fontTools `BoundsPen + RecordingPen` → Pillow `ImageDraw.polygon` | em-box mode (x∈[0,advance], y∈[descent,ascent]) — surfaces the alignment-bug class because two glyphs with different x-extents render side-by-side |
| `glyph-primary.bbox.json` | same | `{advance, lsb, unitsPerEm, bbox, glyphName}` |
| `glyph-secondary.png` | same on `<Family>Secondary.ttf` | optional — only for duotone |
| `glyph-secondary.bbox.json` | same | optional |
| `flutter-rendered.png` | existing `tools/generator/audit/render/render-icon.ts` (`fvm flutter test` + `RepaintBoundary.toImage`) | what consumers actually see |
| `diff-pixelmatch.png` | pixelmatch upstream vs flutter | only when `--skip-flutter` is omitted |
| `report.json` | full machine-readable record | bbox, advances, glyph names, ink ratios, centroid drift, classifier verdict |
| `REPORT.md` | per-icon human-readable summary | embeds the PNGs + the classifier table |

### Flutter render approach (vs alternatives evaluated)

Reuses the **existing** `bun run render-icon` harness (built by the
parallel `a87ab25b` agent). That harness picked **Approach A —
`flutter_test` in a headless isolate** after evaluating five
approaches:

| # | Approach | Verdict |
|---|---|---|
| **A** | `flutter test` running a `testWidgets` that does `RepaintBoundary.toImage` directly (no goldens, custom env-var protocol, PNG written via `File.writeAsBytes`) | **PICKED** |
| B | `integration_test` driven via a test runner | Rejected — needs a device or web driver |
| C | Pure-Dart raster (`dart:ui`) | Rejected — hits the dart:ui-needs-engine-binding wall in CLI use |
| D | vm-service-driven `flutter run` | Rejected — fragile + requires async app shutdown coordination |
| E | Persistent flutter test process with stdin protocol | Deferred — v2 optimisation for sub-2s repeated calls |

Why A wins: full Skia + asset-bundle font loading without a display
server / a11y permissions / screencapture entitlement. The
`RENDER_OK <path> <bytes>` stdout marker gives the bun wrapper a
clean success protocol that doesn't depend on golden filename
conventions. Each invocation costs ~10-15 s cold (pubspec rewrite +
`flutter pub get` + test compile), ~5-8 s warm.

### Classifier (Phase 1 — 8 rules of 18)

`cli.ts:classify(resolved, diff, primaryGlyph, secondaryGlyph)` —
ordered checks, first match wins, every match emits
`{status, primaryReason, confidence, problem, remediation}`:

| # | Reason code | Heuristic |
|---|---|---|
| 4 | `EMPTY_GLYPH` | flutter ink < 0.005 ∧ upstream ink > 0.05 |
| 8 | `DUOTONE_HALF_BROKEN` | manifest declares duotone ∧ secondary glyph has empty bbox |
| 7a (new) | `DUOTONE_BBOX_MISMATCH` | duotone ∧ \|primaryCentroid – secondaryCentroid\| > 4% of em (X or Y) — **the exact rule that fires on the Solar add-circle bug** |
| 5 | `FILLED_BLOB` | flutter ink > 0.7 ∧ upstream ink < 0.5 |
| 13/14 | `HORIZONTAL/VERTICAL_DRIFT` | centroid drift > 6% of canvas ∧ mismatchPct < 40% |
| 17 | `EXTRA_INK` | flutter ink > upstream × 1.2 ∧ mismatchPct > 5% |
| 6 | `MISSING_CUTOUTS` | flutter ink > upstream × 1.4 ∧ mismatchPct > 30% |
| — | `MINOR_DIFF` / `OK` / `UNKNOWN` | catch-alls |

The NEW rule 7a is the headline value-add. The existing
`GLYPH_METRICS_AUDIT.md` already flagged this case (see §33), but
that audit runs over the whole corpus and emits a flat list; the
visual-diff CLI lets a developer point at ONE icon and get a
labeled raster + verdict in seconds — the exact loop the user asked
for.

### CLI surface

```bash
# Phase 1 — one icon
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone
bun run tools/generator/audit/visual-diff/cli.ts ph:acorn-duotone --size 512
# Skip flutter when you only need TTF-side analysis (fast — < 2 s)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --skip-flutter
# Pipeline-friendly wrapper
tools/generator/audit/visual-diff/run.sh solar:add-circle-bold-duotone
```

### Solar `add-circle-bold-duotone` empirical findings (run on regenerated TTFs)

Running the CLI against freshly-regenerated `Solar.ttf` +
`SolarSecondary.ttf` (regen at 2026-05-16 02:14):

- **Primary glyph (`0xe013` in Solar.ttf)**: `add-circle-bold-duotone`
  bbox (343.6, 344.0, 656.4, 655.7), centroid (500.0, 499.8) of em 1000.
- **Secondary glyph (`0xe013` in SolarSecondary.ttf)**: `accessibility-bold-duotone`
  bbox (83.6, 83.2, 917.0, 916.5), centroid (500.3, 499.9) of em 1000.
- **Centroid delta**: (0.3, 0.0) em-units → 0.0% of em. **Not visually misaligned in the current TTFs.**

The full visual-diff report at
[`docs/audit/visual-diff/solar__add-circle-bold-duotone/REPORT.md`](audit/visual-diff/solar__add-circle-bold-duotone/REPORT.md)
captures the four-pane comparison.

**Two secondary observations that are NOT alignment bugs but are still
worth fixing for hygiene:**

1. **Stale TTF in working tree showed broken bboxes.** Before
   `git checkout HEAD -- Solar.ttf`, the WORKING-TREE Solar.ttf had
   primary bbox (1.6, 344, 314, 655) and secondary (4.6, 83, 838, 916) —
   centroids (158, 500) and (421, 500) — a 26%-of-em horizontal drift
   that EXACTLY reproduces the user's "halka sola kaymış, artı halkanın
   solunda" symptom. After regen, the centroids return to (500, 500).
   **The user's reported bug came from a STALE local build.** A
   regen + flutter clean clears it.

2. **`SolarSecondary.ttf` cmap dedup**: `0xe013 → accessibility-bold-duotone`
   (NOT `add-circle-bold-duotone`). svg2ttf's `deduplicateGlyps`
   collapses byte-identical glyphs into one — the secondary halka
   from accessibility-bold-duotone is byte-identical to add-circle's
   secondary (both `M22 12c0 5.523…`), so svg2ttf keeps one glyph and
   maps both codepoints to it. 1135 cmap entries in SolarSecondary
   (~47% of duotone Solar icons) point to `accessibility-bold-duotone`
   or `4k-bold-duotone` instead of their own glyph name. **Visually
   harmless** when the secondary bodies were genuinely identical
   upstream (which is the case for every Solar duotone share), but
   surfaces in tooling as "wrong glyph name" and breaks debug clarity.
   Remediation: optionally annotate manifest with `secondaryGlyphAlias`
   or set svg2ttf `name`-only dedup. Tracked as a §16-A-style
   correctness audit improvement.

### Diff classification false-positive note

When upstream is rendered at 50% opacity (the iconify body has
`opacity=".5"` on the secondary path) but flutter renders the
secondary at 40% (`IconifyIcon.secondaryOpacity` default), the
pixel-diff between `upstream.png` and `flutter-rendered.png` shows a
~10% mismatch even with perfect glyph alignment. The Phase 1
classifier treats `mismatchPct ∈ [0.02, 0.10]` as `needs-review`
(low-confidence). A future Phase 2 rule will normalise opacities
before pixelmatch or, alternatively, render upstream at the same
40% secondary alpha that `IconifyIcon` ships with.

### Cross-references vs sibling agents

| Sibling agent | Overlap | Visual-diff CLI adds |
|---|---|---|
| `a3b2cc0b` glyph-metrics audit | Same bbox source (fontTools) | per-icon raster preview + flutter-rendered comparison |
| `a87ab25b` render-icon | Wraps it | side-by-side w/ resvg + TTF raster + classifier |
| §26 18-rule classifier | Phase 1 covers rules 4/5/6/7a/8/13/14/17 | concrete TS impl + report.json contract |
| §33 Solar bug investigation | Same input case | proves audit can detect the class (rule 7a fires on the stale-TTF state) |

### Phase 2 (partial — shipped in `a87ab25b-v2`)

- ✅ **Persistent flutter test process (Approach E)** — `render-server.ts`
  serves rendering via 127.0.0.1 TCP. Per-icon ~26 ms (was 5-8 s).
  Bench `bun run render-server --bench 100` validates target.
- ✅ **Corpus mode** — `bun run visual-diff --corpus
  [--prefix mdi] [--sample N] [--seed N]`. Produces `rows.jsonl`,
  `summary.json`, `CORPUS_REPORT.md` under `docs/audit/visual-diff/corpus/`.
  Reuses the same `diffOne()` pipeline as the single-icon mode; the
  only difference is the injected `RenderServer` for fast Flutter
  render. 5 % stratified sample (~17 k icons) ~7 min; whole corpus
  ~2.4 h sequential.

Still deferred (NOT in `a87ab25b-v2` scope):

- HTML dashboard (single self-contained `VISUAL_DIFF.html` with sprite-sheet)
- Allowlist + baseline regression gate
- Rules 9–18 (mirror/rotation/layer-order-flip/colour-mapped flatten)

