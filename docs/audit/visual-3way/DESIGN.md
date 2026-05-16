# Visual three-way audit — design + Phase 3 deferral rationale

> Status: **Phase 1.5 shipped (2026-05-16).** Single-icon `--3way` flag,
> `--corpus PATH` mode, static HTML dashboard, 50-icon baseline corpus
> committed at `docs/audit/visual-3way/baseline/`. Phase 2 corpus-walk
> targets the full ~166 k non-synthetic icon set and adds an allowlist
> gating CI. Phase 3 (Rust kernel) is deferred — see §"When to port to
> Rust" below.

## Why three-way

Phase 1 of the visual-diff tool compared ONE pair: upstream Iconify SVG
rasterised by resvg vs the Flutter widget composition rendered through
the `render-icon` harness. That tells us *whether* a consumer sees what
the source SVG describes. It does NOT tell us *where in the pipeline*
the discrepancy entered:

```
  Iconify SVG  →  generator/preprocess  →  TTF  →  IconifyIcon  →  Flutter pixels
                       (Phase 1 sees only the endpoints)
```

The three-way audit splits the comparison into three pairwise diffs that
isolate the locality of the bug:

| Pair | Measures | Bug classes it catches |
|---|---|---|
| **SVG ↔ TTF** | generator + font build correctness | paint-order drop, stroke-fill rasterize-trace miss, evenodd cutouts lost, svg2ttf glyph drop, duotone split bug, identifier dedup, em-quad regression |
| **TTF ↔ Flutter** | widget paint + composition | wrong `kind` dispatch, paint-origin off, secondary opacity convention drift, `FontLoader` registration regression, BoxFit emulation bug |
| **SVG ↔ Flutter** | end-to-end "what the user sees" | same as Phase 1 — confirms the cascade |

A bug that fires the SVG↔TTF diff while leaving TTF↔Flutter clean is in
the generator. A bug that fires TTF↔Flutter while leaving SVG↔TTF clean
is in the widget. A bug that fires both is a cascade. A bug that fires
only SVG↔Flutter while the intermediates agree is almost always the
40 %-vs-50 % secondary-opacity quirk (Phase 2 normalises that).

This locality information turns audit output from *"there's a problem
somewhere"* into *"check `svg_preprocess.ts:trySplitTwoColorBody`"*.

## Architecture (Phase 1.5)

```
                                      bun cli.ts (orchestrator)
                                              │
       ┌──────────────────────┬───────────────┼───────────────┬─────────────────────┐
       ▼                      ▼               ▼               ▼                     ▼
   @resvg/resvg-js     rasterize_glyph.py  rasterize_glyph.py  render-icon.ts   pixelmatch + dHash
   (upstream.png)      (primary, TTF)      (secondary, TTF)    (flutter-rendered)  + SSIM-lite
                                              ↓
                                      compose primary+secondary
                                      in pure TS (paint-kind aware)
                                              ↓
                                      ttf-composed.png
                                              ↓
                              ┌───────────────┼────────────────┐
                              ▼               ▼                ▼
                     diff-svg-vs-ttf   diff-ttf-vs-flutter  diff-svg-vs-flutter
                              \               │                /
                               \              │               /
                                ▼             ▼              ▼
                                  classify3way() — locality-aware
                                              ↓
                                   report.json + REPORT.md + dashboard cell
```

The orchestrator is pure TS/Bun. Per-icon work is:
- ~10 ms resvg rasterize (in-process via napi binding)
- ~150 ms python rasterize_glyph.py (subprocess; one per glyph)
- ~10 ms pure-TS compose + diff + dHash + SSIM
- ~3-8 s flutter test (cold, persists across icons in the same pack)

Cold corpus runs measure 50 icons in **~3:35 wall-clock** end-to-end on
M-series (8-worker baseline). Without `--3way` (Phase 1) it was ~30 s
per icon cold; with `--3way --skip-flutter` it's **~28 s for 50 icons**
(~560 ms each).

## Language + architecture decision

**Phase 1.5 stays in TS/Bun.** Empirical:

| Workload | Phase 1.5 path | Wall-clock | Bottleneck |
|---|---|---|---|
| Single icon, `--3way --skip-flutter` | bun + python subprocess | ~600 ms | python startup (~300 ms) + 2 rasterize_glyph passes |
| Single icon, `--3way` (with Flutter) | bun + python + flutter test | ~3-8 s | flutter test (~3 s pub-get-cache hit) |
| Corpus 50, `--3way --skip-flutter` | sequential bun + python | ~28 s | python subprocess overhead |
| Corpus 50, `--3way` | sequential bun + python + flutter test | ~3:35 | flutter test serial pack switches |

The 50-icon corpus walk is 12× compute-bound under Flutter renders and
8× under TTF-only. **Neither pixelmatch nor SSIM is the bottleneck** —
they together take <5 ms/icon at 256 px.

Full 340 k corpus extrapolation: 340 000 × 600 ms / 8 workers (TS uses
single thread today) = ~14 hours. Even sharding across 8 workers via
`p-limit(8)` would be ~7 hours single-machine. That's well above the
12-min CI target.

### Where the time goes (Phase 1.5, single icon, skip-flutter)

```
total = 600 ms
├── python rasterize_glyph (primary)   = 280 ms (47 %)
├── python rasterize_glyph (secondary) = 270 ms (45 %)
├── resvg upstream raster              =  18 ms  (3 %)
├── pixelmatch ×3                      =   8 ms  (1 %)
├── compose TTF + dHash + SSIM         =  12 ms  (2 %)
└── orchestration overhead             =  12 ms  (2 %)
```

The python subprocess is **92 %** of TTF-only time. The fix is one of:

1. **Persistent python worker** (Phase 2): a single `rasterize_glyph.py`
   process that reads `(ttfPath, codepoint)` pairs from stdin and writes
   PNG bytes to stdout. Saves the ~300 ms startup × N icons = O(minutes)
   per corpus pass.
2. **Rust kernel** (Phase 3): replace Python with `skrifa + tiny-skia`
   in-process via napi binding (~5 ms/icon, no subprocess startup).
   Same flutter render bottleneck remains.

### When to port to Rust

We've seen 50-icon corpus in 28 s skip-flutter. Linear scale to 340 k
icons skip-flutter:

`28 s × (340 000 / 50) = 190 000 s = 53 hours single-process`

With `p-limit(8)`: ~7 hours. That's *too slow for CI* (gate target is
~12 min) but **plenty fast for "audit-on-demand" + nightly batch**.

Decision tree:

- **Phase 2** (Q3 2026): Persistent python worker + p-limit(8). Target:
  340 k in < 90 min. Acceptable for nightly audit + opt-in CI gate on
  changed packs.
- **Phase 3** (Q4+ 2026): Rust kernel via skrifa + tiny-skia + napi. Run
  ONLY if Phase 2 cannot hit < 30 min full corpus on CI hardware.

We do NOT port to Rust today because:
1. Phase 1.5 ships immediately, validates the rule table, captures the
   bug classes we want to detect.
2. Until we see the actual cost of the python worker pool in CI we don't
   know whether Rust is necessary. RESEARCH_PLAN §17 priced the port at
   ~1 week of pure engineering with significant rebuild risk.
3. The classifier rules are CI-stable text — they'll evolve faster than
   the kernel and don't need to live in Rust.

## Output schema

### Per-icon (`<out>/<prefix>__<name>/report.json`)

```json
{
  "iconRef": "solar:add-circle-bold-duotone",
  "prefix": "solar",
  "iconName": "add-circle-bold-duotone",
  "packageName": "iconifyx_solar",
  "duotone": true,
  "duotoneKind": "hint",
  "primary": {
    "ttf": "...packages/iconifyx_solar/assets/fonts/Solar.ttf",
    "codepoint": "0xe013",
    "glyphName": "add-circle-bold-duotone",
    "advance": 1000,
    "lsb": 0,
    "unitsPerEm": 1000,
    "bbox": { "xMin": 343.6, "yMin": 344.0, "xMax": 656.4, "yMax": 655.7,
              "width": 312.8, "height": 311.7, "cx": 500.0, "cy": 499.8 },
    "empty": false
  },
  "secondary": { /* same shape, or null */ },
  "diffs": {
    "svgVsTtf":    { "mismatchPct": 0.0022, "hamming": 0, "ssim": 0.960, ... },
    "ttfVsFlutter":{ "mismatchPct": 0.0001, "hamming": 0, "ssim": 0.969, ... },
    "svgVsFlutter":{ "mismatchPct": 0.0000, "hamming": 0, "ssim": 0.963, ... }
  },
  "verdict": {
    "status": "same" | "needs-review" | "different",
    "primaryReason": "OK_3WAY",
    "confidence": "high",
    "problem": "—",
    "remediation": "—"
  },
  "files": { /* relative paths to every PNG written */ },
  "timings": { "upstream": 18, "primaryGlyph": 280, "secondaryGlyph": 270,
               "ttfCompose": 8, "flutterRender": 3200, "diffSvgVsTtf": 3,
               "diffTtfVsFlutter": 3, "diffSvgVsFlutter": 3, "total": 3920 }
}
```

### Per-corpus (`<out>/corpus.json`)

```json
{
  "generatedAt": "2026-05-16T06:56:26.258Z",
  "threeWay": true,
  "size": 256,
  "total": 50,
  "ok": 34,
  "needsReview": 9,
  "different": 7,
  "byPack": {
    "solar": { "total": 8, "ok": 3, "needsReview": 1, "different": 4 },
    "mdi":   { "total": 10, "ok": 6, "needsReview": 4, "different": 0 },
    ...
  },
  "byReason": {
    "OK_3WAY": 34,
    "MINOR_DIFF_3WAY": 8,
    "DUOTONE_BBOX_MISMATCH": 6,
    "EMPTY_GLYPH": 1,
    "DUOTONE_BBOX_SHARED_SECONDARY": 1
  },
  "rows": [
    { "iconRef": "...", "status": "...", "primaryReason": "...",
      "metrics": { "svgVsTtf": {...}, "ttfVsFlutter": {...}, "svgVsFlutter": {...} } },
    ...
  ]
}
```

### HTML dashboard (`<out>/index.html`)

Single self-contained file: CSS inlined, no external assets, no
JavaScript framework. Filters by status / reason / pack. Each row shows
5 panels: upstream / TTF primary / TTF composed / Flutter / SVG↔Flutter
diff, plus the 3 metric pairs in a side cell. Sortable by status
(different → needs-review → same).

### Markdown summary (`<out>/corpus.md`)

GH-renderable. Pack table + reason table + flat row list. Used as the
CI gate's failure surface when run with `--fail-on different`.

## Classifier rules

Phase 1 rules (5 TTF-only + 7 SVG↔Flutter) are preserved verbatim in the
`classify1way()` path for the non-3way mode. Phase 1.5 adds locality-
aware rules in `classify3way()`:

| Reason | Fires when | Confidence |
|---|---|---|
| `OK_3WAY` | All three diffs `same` | high |
| `EMPTY_GLYPH` (TTF-only) | Primary glyph bbox empty | high |
| `DUOTONE_HALF_BROKEN` (TTF-only) | Duotone, secondary glyph empty | high |
| `DUOTONE_BBOX_MISMATCH` (TTF-only) | Duotone, centroid drift > 4 % of em AND secondary glyph name matches icon | high |
| **NEW** `DUOTONE_BBOX_SHARED_SECONDARY` | Duotone bbox drift but secondary glyph is svg2ttf-deduped (shared body, e.g. Solar's generic ring) | medium |
| **NEW** `GENERATOR_BLANK_GLYPH` | SVG↔TTF different (TTF blank), TTF↔Flutter same | high |
| **NEW** `GENERATOR_FILLED_BLOB` | SVG↔TTF different (TTF solid), TTF↔Flutter same | high |
| **NEW** `GENERATOR_MISSING_CUTOUTS` | SVG↔TTF different (TTF too much ink), TTF↔Flutter same | high |
| **NEW** `GENERATOR_DIFF` | SVG↔TTF different, TTF↔Flutter same, no specific sub-rule | medium |
| **NEW** `WIDGET_HORIZONTAL_DRIFT` / `WIDGET_VERTICAL_DRIFT` | SVG↔TTF same, TTF↔Flutter different with centroid drift | high |
| **NEW** `WIDGET_RENDER_DIFF` | SVG↔TTF same, TTF↔Flutter different (no sub-rule) | medium |
| **NEW** `CASCADE_MISMATCH` | Both SVG↔TTF and TTF↔Flutter different | medium |
| **NEW** `OPACITY_NOISE` | SVG↔Flutter different but intermediates same | low |
| `MINOR_DIFF_3WAY` | One pair in needs-review band | low |

The `classify3way()` function uses a 3-signal vote across pixelmatch
mismatch %, dHash Hamming, and SSIM-lite. A diff is classified as
`same` if at least 2 of 3 metrics fall in the "same" band, `different`
if at least 2 land in the "different" band, else `needs-review`.

Bands (calibrated against the 50-icon corpus):

|  | same | needs-review | different |
|---|---|---|---|
| pixelmatch mismatch | ≤ 2 % | 2 %–15 % | ≥ 15 % |
| dHash Hamming | ≤ 4 | 4–14 | ≥ 14 |
| SSIM-lite | ≥ 0.98 | 0.85–0.98 | ≤ 0.85 |

### Formulas (with citations)

- **dHash**: Krawetz, *"Looks Like It"*, Hacker Factor 2013 —
  http://hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html
  Resize to 9×8 grayscale, compare adjacent pixels per row → 64-bit
  hash. Hamming distance between hashes correlates with visual
  similarity. We implement nearest-neighbour downscale + per-row
  comparison in pure TS (`dHash()` in `cli.ts`).

- **SSIM-lite**: Wang, Bovik, Sheikh, Simoncelli (2004), *"Image Quality
  Assessment: From Error Visibility to Structural Similarity"*, IEEE
  Trans. Image Processing 13(4):600-612. We use the block-based variant
  with 8×8 non-overlapping blocks, C₁=(0.01·L)², C₂=(0.03·L)², L=255.
  Block-SSIM trades fidelity for ~10× speed vs Gaussian-windowed SSIM
  and is good enough as a tiebreaker on top of dHash + pixelmatch.

- **pixelmatch**: Mapbox/pixelmatch v7.x, MIT, dep-free 150-LOC pixel
  diff with anti-aliasing detection. `threshold: 0.1`, `includeAA: false`
  matches §4's RESEARCH_PLAN settings.

## Pipeline integration

**Decision: opt-in CLI, NOT default `bun run generate` post-step.**

Reasoning:
- Full corpus walk is 3-7 hours (skip-flutter, single-process). Adding
  that to every `bun run generate` would 10× the generate time even
  with Phase 2 worker pool, breaking the developer feedback loop.
- The generator already emits 3 audits on every run (COVERAGE.md,
  STROKE_AUDIT.md, FONT_AUDIT.md) that surface MOST of what visual-3way
  would say. Visual-3way is for the cases those don't catch
  (alignment, paint-order quantization, widget rendering).
- The fast path that DOES make sense is the **PR gate**: only check the
  packs whose manifests changed in `git diff`. That's ~1-3 packs per PR
  and runs in < 90 s skip-flutter. CI manifest-only gate ships
  separately as Phase 2.

CLI surface for opt-in use:

```bash
# Single icon, full 3-way + Flutter render (the standard debugging loop)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --3way

# Single icon, fast (TTF-only — generator-level diff)
bun run tools/generator/audit/visual-diff/cli.ts logos:adobe-after-effects --3way --skip-flutter

# Curated corpus (50 icons across bug classes — baseline regression suite)
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus tools/generator/audit/visual-diff/corpora/baseline50.txt \
  --3way --dashboard

# Full pack (--3way + flutter for a single pack — used for "I just changed solar")
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus tools/generator/audit/visual-diff/corpora/solar-all.txt \
  --3way --dashboard
```

The corpus file format is one `prefix:name` per line, `#` comments,
JSON-array alternative. Listed at
`tools/generator/audit/visual-diff/corpora/`.

## Phase 1.5 ship checklist

- [x] `--3way` flag emits 3 pairwise diffs (SVG↔TTF, TTF↔Flutter, SVG↔Flutter)
- [x] Per-glyph TTF rasterizer renders EVEN-ODD compound paths correctly (Lucide outline fix)
- [x] dHash + SSIM-lite metrics, cited formulas, in-CLI implementation
- [x] `--corpus PATH` mode iterates a curated list
- [x] HTML dashboard at `index.html`, filters by status/reason/pack
- [x] Per-icon JSON contract + REPORT.md, locality-aware classifier
- [x] 50-icon baseline corpus + run committed
- [x] Iconify aliases resolved (twemoji etc.)
- [x] Non-square SVG viewBoxes letterboxed to square (logos)
- [x] DUOTONE_BBOX_SHARED_SECONDARY rule for svg2ttf-dedup case
- [x] README + DESIGN doc

## Phase 2 plan

| Item | Cost | Unlocks |
|---|---|---|
| Persistent python worker (`rasterize_glyph_server.py` stdin protocol) | 4-6 h | 5-10× speedup on TTF rasterize; full-pack walks in < 90 s |
| `--pack PREFIX` shortcut (auto-corpus from manifest) | 1 h | "render every icon in solar" |
| Opacity normalisation (50 % upstream vs 40 % IconifyIcon) | 2 h | Removes OPACITY_NOISE false-positives |
| Allowlist `corpora/baseline.allowlist.json` (per-icon expected verdict) | 3 h | CI gate can pass if mismatch is acknowledged |
| GitHub Action on PRs touching manifests | 2 h | Auto-comments dashboard URL + delta vs main |
| `--fail-on different` CLI flag | 1 h | exit non-zero for CI gating |
| Persistent flutter test process (Approach E) | 1 d | Per-icon flutter render < 2 s warm; full corpus end-to-end < 30 min |

## Phase 3 plan (deferred)

| Item | Cost | Unlocks |
|---|---|---|
| Rust kernel (skrifa + tiny-skia + napi) | 1 wk | TTF rasterize ~5 ms/icon; full-corpus 340 k in < 30 min skip-flutter on a beefy CI runner |
| Image-hash + SSIM in Rust | 1 d | Diff stage drops from 5 ms to 0.5 ms/icon |
| Wasm build for browser usage | 2 d | The site could run visual-diff client-side on a single icon |

Phase 3 is contingent on Phase 2 hitting wall-clock pain in CI. Until
then it's net-negative ROI.

## Reference: 50-icon baseline corpus

`tools/generator/audit/visual-diff/corpora/baseline50.txt` covers:

- 10 mdi solo icons (home, account-circle, cog, …)
- 8 solar hint-duotone (add-circle-bold-duotone is the §33 litmus)
- 4 phosphor hint-duotone (acornDuotone, …)
- 4 logos paint-order duotone (adobe-after-effects, react, vue, adobe-photoshop)
- 3 emojione paint-order
- 3 lets-icons mask-internal duotone
- 5 lucide stroke-fill-rasterized
- 3 tabler stroke-fill-rasterized
- 3 material-symbols solo
- 2 twemoji vtracer-recovered (alias-resolved)
- 2 circle-flags vtracer-recovered
- 3 devicon (includes the known EMPTY_GLYPH on capacitor)

Each bug class is represented by ≥2 icons so a single false-positive
doesn't dominate the corpus signal.

## Sample output: baseline run

The committed baseline run at `docs/audit/visual-3way/baseline/` is the
output of:

```bash
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus tools/generator/audit/visual-diff/corpora/baseline50.txt \
  --3way --dashboard
```

Summary: **21 OK / 10 needs-review / 19 different** of 50.

The 19 "different" verdicts break down into:

- **6 high-conf** `DUOTONE_BBOX_MISMATCH` on hint-duotone icons whose
  primary body is intentionally asymmetric (Solar bell/heart/etc).
  These need an allowlist entry per icon — Phase 2.
- **1 high-conf** `EMPTY_GLYPH` on `devicon:capacitor` — actionable bug,
  see FONT_AUDIT.md.
- **1 high-conf** `GENERATOR_FILLED_BLOB` on `emojione:a-button` —
  actionable bug, paint-order or 2-color split candidate.
- **10 medium-conf** `GENERATOR_DIFF` on paint-order packs (logos /
  emojione / twemoji / devicon / circle-flags). These are known lossy
  monochrome conversions from multi-color upstream. Worth manually
  checking each but not regressions per se.
- **1 medium-conf** `DUOTONE_BBOX_MISMATCH` on `logos:vue` — paint-
  order wordmark sits below the V symbol; expected geometry.

The dashboard at `index.html` makes these distinctions visual at a
glance.
