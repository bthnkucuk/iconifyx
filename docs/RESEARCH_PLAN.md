# iconifyx — Research-driven improvement plan

Consolidated findings from 12 parallel research agents (May 2026). Each
section is one investigation; sections end with cited file paths and a
verdict. Top-of-document index lists the work in priority order.

This is a **plan** — most items are not implemented yet. Cross-reference
against `git log` to see what's landed.

## Priority queue (highest impact / hour first)

### A. Tool — generator pipeline

1. **Iterate-until-empty rebuild loop** (font-build) — 3 h, eliminates all
   ~570 silent empty glyphs immediately. See §3.
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

**Verdict (immediate): Adopt iterate-until-empty rebuild. Verdict
(structural): Replace svgicons2svgfont + svg2ttf with opentype.js.**

Current pipeline: SVG body → `svgicons2svgfont` → SVG-font intermediate
(a 2018-deprecated XML format) → `svg2ttf` → TTF. svg2ttf silently
coerces some features (open paths, complex curves) producing
empty-outline glyphs. Last regen: **569 silent empties across 37 fonts**
— meteocons 157/432 (36 %), devicon 115, token-branded 98.

### Quick fix (3 h): iterate-until-empty

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

All five required packages already in `bun.lock` via transitive deps:
- `htmlparser2@10.1.0` (via cheerio → @iconify/tools)
- `domhandler@5.0.3`, `domutils@3.2.2`, `dom-serializer@2.0.0`
- `css-tree@2.3.1` (via svgo, not actually needed — 20-line custom parser
  suffices)

Add them as explicit `dependencies` in `tools/generator/package.json` so
SVGO/cheerio bumps can't accidentally remove them.

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

### A1+A2+A3 — Combined manifest + codegen + identifier lint

**Cost**: ~4 h combined. **ROI**: high.

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
The manifest is supposed to preserve identifiers
(`codepoint_allocator.ts:102-114` copies them verbatim), but there
is no audit that the contract holds end-to-end. Catches the
alphabetical-collision-reshuffle bug: `MdiIcons.foo` becoming
`MdiIcons.foo_2` after an upstream icon rename, which compiles green
locally (manifest preserved) and breaks in a fresh clone.

**Risk if skipped**: Manifest desync (e.g. duotone flag without
secondary font) emits Dart consts referencing a `MdiSecondary` font
+ codepoint that doesn't exist → blank glyph at runtime, invisible
to `FONT_AUDIT.md` because it only walks `manifest.fonts`.

### A8 — Iconify upstream regression detector

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

- **A10 — Determinism self-check** (regen-twice byte-diff). ~3 h.
  Foundational for the planned cache work (§15) but doesn't catch a
  present bug. SHA256 every TTF / .dart / manifest, regen cold, diff.
  Doubles as `ttfSha256` baseline for future cache-key validation.

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
