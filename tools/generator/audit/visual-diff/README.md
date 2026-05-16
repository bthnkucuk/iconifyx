# `visual-diff` — three-way icon comparator (Phase 1.5)

A scriptable comparator for **(a) upstream Iconify SVG**, **(b) the
emitted TTF glyph (rasterised)**, and **(c) the Flutter-rendered
composition** for any `(prefix, icon)` pair — and flag the mismatch
with a machine-readable verdict.

Phase 1 (May 2026) shipped the single-icon Solar-litmus diff. **Phase
1.5** generalises that to:

1. `--3way` — emit ALL three pairwise diffs (SVG↔TTF, TTF↔Flutter,
   SVG↔Flutter), each scored by pixelmatch + dHash + SSIM-lite. The new
   classifier rules use the locality (which pair mismatches) to point at
   the right pipeline stage instead of the previous "something is wrong
   somewhere" verdict.
2. `--corpus PATH` — iterate a curated icon list, emit per-icon results +
   aggregate JSON + Markdown summary + a static HTML dashboard.
3. Static HTML dashboard generator at `dashboard.ts`.

See [docs/audit/visual-3way/DESIGN.md](../../../../docs/audit/visual-3way/DESIGN.md)
for architecture + the Phase 3 (Rust kernel) deferral rationale.

## Quickstart

```bash
# Phase 1.5: full 3-way diff for one icon (the new default debug loop)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --3way

# TTF-only mode (skips flutter render — ~600 ms vs ~3-8 s)
bun run tools/generator/audit/visual-diff/cli.ts logos:adobe-after-effects --3way --skip-flutter

# Bigger canvas (good for alignment inspection)
bun run tools/generator/audit/visual-diff/cli.ts ph:acorn-duotone --3way --size 512

# Corpus mode (50 curated icons across bug classes, with dashboard)
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus tools/generator/audit/visual-diff/corpora/baseline50.txt \
  --3way --dashboard

# Single-icon Phase-1 legacy mode (1 diff pair, no --3way)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone
```

## Output layout

### Single-icon `--3way` mode

```
docs/audit/visual-3way/<prefix>__<name>/
├── upstream.svg                # iconify body wrapped with viewBox + xlink ns
├── upstream.png                # resvg rasterised at --size (letterboxed to square)
├── glyph-primary.png           # TTF primary glyph via fontTools + Pillow (em-box, even-odd compound fill)
├── glyph-primary.bbox.json     # advance, lsb, unitsPerEm, bbox, centroid
├── glyph-secondary.png         # TTF secondary glyph (only when duotone)
├── glyph-secondary.bbox.json
├── ttf-composed.png            # pure-TS composition of primary+secondary, kind-aware
├── flutter-rendered.png        # `bun run render-icon` output (only without --skip-flutter)
├── diff-svg-vs-ttf.png         # pixelmatch upstream vs ttf-composed
├── diff-ttf-vs-flutter.png     # pixelmatch ttf-composed vs flutter-rendered
├── diff-svg-vs-flutter.png     # pixelmatch upstream vs flutter-rendered (end-to-end)
├── report.json                 # everything above, machine-readable
└── REPORT.md                   # human-readable, embeds the PNGs + verdict table
```

### Single-icon (legacy 1-way) mode

```
docs/audit/visual-diff/<prefix>__<name>/
├── upstream.svg
├── upstream.png
├── glyph-primary.png
├── glyph-primary.bbox.json
├── glyph-secondary.png   # optional
├── glyph-secondary.bbox.json
├── flutter-rendered.png  # if not --skip-flutter
├── diff-pixelmatch.png   # only the SVG vs Flutter end-to-end diff
├── report.json
└── REPORT.md
```

### Corpus mode

```
docs/audit/visual-3way/                 (--out can override)
├── index.html                          # filterable static dashboard
├── corpus.json                         # full machine-readable aggregate
├── corpus.md                           # GH-renderable summary table
└── <prefix>__<name>/                   # per-icon dir, same as single-icon mode
    └── ...
```

## Classifier rules

Phase 1 had 8 rules over SVG-vs-Flutter only. Phase 1.5 keeps those for
the non-3way path (`classify1way()`) and adds locality-aware rules in
`classify3way()`:

| Reason | Heuristic | Status | Confidence |
|---|---|---|---|
| `OK_3WAY` | All three pair diffs vote `same` | `same` | high |
| `EMPTY_GLYPH` | Primary TTF outline empty | `different` | high |
| `DUOTONE_HALF_BROKEN` | Duotone, secondary TTF outline empty | `different` | high |
| `DUOTONE_BBOX_MISMATCH` | Duotone, centroid drift > 4 % em (AND not dedup-shared) | `different` | high |
| `DUOTONE_BBOX_SHARED_SECONDARY` | Duotone, centroid drift but secondary glyph is svg2ttf-deduped | `needs-review` | medium |
| `GENERATOR_FILLED_BLOB` | SVG↔TTF different (TTF mostly ink), TTF↔Flutter same | `different` | high |
| `GENERATOR_BLANK_GLYPH` | SVG↔TTF different (TTF empty), TTF↔Flutter same | `different` | high |
| `GENERATOR_MISSING_CUTOUTS` | SVG↔TTF different (TTF >>ink), TTF↔Flutter same | `different` | high |
| `GENERATOR_DIFF` | SVG↔TTF different, TTF↔Flutter same | `different` | medium |
| `WIDGET_HORIZONTAL_DRIFT` / `WIDGET_VERTICAL_DRIFT` | TTF↔Flutter different with centroid drift, SVG↔TTF same | `different` | high |
| `WIDGET_RENDER_DIFF` | SVG↔TTF same, TTF↔Flutter different | `different` | medium |
| `CASCADE_MISMATCH` | Both SVG↔TTF and TTF↔Flutter different | `different` | medium |
| `OPACITY_NOISE` | SVG↔Flutter different but both intermediates same | `needs-review` | low |
| `MINOR_DIFF_3WAY` | A pair in the mild-mismatch band (2-15 %) | `needs-review` | low |

The 3-signal vote uses these bands (calibrated against baseline50):

|  | same | needs-review | different |
|---|---|---|---|
| pixelmatch mismatch | ≤ 2 % | 2 %–15 % | ≥ 15 % |
| dHash Hamming | ≤ 4 | 4–14 | ≥ 14 |
| SSIM-lite | ≥ 0.98 | 0.85–0.98 | ≤ 0.85 |

A diff is voted `same` if ≥ 2 of 3 metrics fall in the `same` band,
`different` if ≥ 2 land in `different`, else `needs-review`.

Add a rule by editing `cli.ts:classify3way()` — one function, one table
row. No rebuild step, no schema migration.

### Metric formulas (cited)

- **dHash** — Krawetz, *"Looks Like It"*, Hacker Factor 2013.
  Resize-to-9×8 + adjacent-pixel difference → 64-bit perceptual hash.
  Implemented as `dHash()` in `cli.ts` (pure TS).
- **SSIM-lite** — Wang et al. (2004), *"Image Quality Assessment: From
  Error Visibility to Structural Similarity"*. Block-based variant with
  8×8 non-overlapping blocks; constants C₁ = (0.01·L)², C₂ = (0.03·L)²,
  L = 255. Implemented as `ssimLite()` in `cli.ts`.
- **pixelmatch** — Mapbox/pixelmatch v7.x (npm), `threshold: 0.1`,
  `includeAA: false`.

## Architecture

```
                          bun cli.ts (orchestrator)
                                  │
   ┌──────────────┬───────────────┼───────────────┬─────────────────┐
   ▼              ▼               ▼               ▼                 ▼
@resvg/resvg-js  rasterize_glyph  rasterize_glyph  render-icon.ts   pixelmatch+dHash
(upstream.png)   (primary)        (secondary)      (flutter)         +SSIM-lite
                                  ▼
                            compose primary+secondary in pure TS
                            (paint-kind aware)
                                  │
                                  ▼
                          ttf-composed.png
                                  │
                          ┌───────┼────────┐
                          ▼       ▼        ▼
                  diff-svg-vs-ttf  diff-ttf-vs-flutter  diff-svg-vs-flutter
                          \       │        /
                           \      │       /
                            ▼     ▼      ▼
                         classify3way() — locality-aware
                                  │
                                  ▼
                       report.json + REPORT.md
```

### Component dependencies

- **Bun TS orchestrator** — `cli.ts` parses args, manifest-lookups the
  icon, fans out to the rasterizers, runs the diffs, applies the
  classifier, writes outputs.
- **`@resvg/resvg-js`** — rasterises the upstream Iconify SVG body. The
  body is wrapped in a SQUARE viewBox (max(width,height) per side) so
  the output PNG aligns dimension-wise with the TTF composition for
  pixelmatch.
- **`rasterize_glyph.py`** — opens the TTF with fontTools, walks the
  outline via `BoundsPen` + `RecordingPen`, flattens curves, then draws
  each subpath onto a 1-bit mask and XORs them together (emulates
  even-odd compound fill). Without the XOR, outlined glyphs like Lucide
  hearts render as solid silhouettes — a silent disagreement with the
  real consumer view that we hit and fixed during Phase 1.5.
- **`composeTtf()`** in cli.ts — combines primary + secondary PNGs into
  one image in the same kind-aware way `IconifyIcon` does at render
  time. Hint: secondary at 40 % opacity behind primary. PaintOrder:
  primary behind, secondary on top in WHITE
  (paintOrderSecondaryFallback). MaskInternal: same as hint.
- **`render-icon.ts`** (existing sibling tool) — wraps `fvm flutter test`
  running a `testWidgets` that calls `RepaintBoundary.toImage`. Phase
  1.5 passes `--pixel-ratio 1` so the output PNG is exactly `--size` px
  (default 256), matching the upstream + TTF PNGs for pixelmatch.
- **`pixelmatch`** (npm, MIT) — pixel diff, `threshold: 0.1`.

## Choice of Flutter render approach

Phase 1.5 reuses the **existing** `render-icon` harness which already
chose **Approach A** (`flutter_test` in a headless isolate). The four
alternatives evaluated by the parallel agent:

| # | Approach | Verdict |
|---|---|---|
| A | `flutter test` + `RepaintBoundary.toImage` + env-var protocol | **PICKED** |
| B | `integration_test` driven test | needs a real device or web driver |
| C | Pure-Dart raster via `dart:ui` | hits dart:ui-needs-engine-binding wall |
| D | vm-service-driven `flutter run` | fragile, requires async app shutdown coordination |
| E | Persistent flutter test process w/ stdin protocol | deferred — Phase 3 optimisation |

Trade-offs unchanged from Phase 1:

- No display server, no a11y permissions, no screencapture entitlement
- Per-pack pubspec means we measure what consumers actually ship
- ~3-8 s per call warm, ~10-15 s cold (`pub get` + test compile)

## Corpus mode

Pass `--corpus PATH` to iterate a list. Format is either:

- `.txt` — one `prefix:name` per line, `#` comments, blank-line tolerant
- `.json` — array of strings OR `{ "icons": [...] }`

Per-icon results land under `<out>/<slug>/` as in single-icon mode.
After all icons are processed, the orchestrator writes:

- `<out>/corpus.json` — full aggregate (`CorpusSummary` shape) with per-row metrics, by-pack tallies, by-reason histogram
- `<out>/corpus.md` — pack + reason tables + sorted row list (Different → Needs-review → Same)
- `<out>/index.html` — only when `--dashboard` is passed; filterable static dashboard

Bundled curated lists at `tools/generator/audit/visual-diff/corpora/`:

- `baseline50.txt` — 50 icons across all known bug classes (mdi solo, solar hint duotone, ph hint duotone, logos paint-order, emojione paint-order, lets-icons mask-internal, lucide/tabler stroke-fill, twemoji + circle-flags vtracer, devicon known-empty)

Add more lists alongside without code changes.

## Pipeline integration policy

**Phase 1.5 is opt-in CLI, not run on every `bun run generate`.**

Full corpus walk is ~3.5 h skip-flutter, ~12 h with flutter renders
(single-process; ~30 min with the Phase 2 worker pool). Adding that to
every generate would 10× the developer feedback loop.

The right surface is a **CI gate on PRs that touch
`tools/generator/manifests/*.json`** — only the changed packs run, which
is ~1-3 packs / PR / < 90 s. That ships in Phase 2.

## Known issues / Phase 2 todo

- **Sequential flutter renders, no persistent test process.** Each
  invocation costs a cold `flutter test` (~3-8 s). Approach E persistent-
  process variant is the next big speedup.
- **Opacity mismatch** between resvg (50 % per Iconify source) and
  Flutter (40 % per `IconifyIcon.secondaryOpacity` default). Causes the
  `OPACITY_NOISE` rule to fire on ~few icons; Phase 2 normalises before
  pixelmatch.
- **Color packs are intentionally lossy.** logos/emojione/twemoji/circle-
  flags all flag `GENERATOR_DIFF` because their TTF representation is
  monochrome by definition. The classifier surfaces them as
  medium-confidence diffs — Phase 2 adds an allowlist mechanism so these
  known-lossy classes don't block CI.
- **Linear corpus run.** Today the orchestrator is single-process. Phase
  2 plugs `p-limit(8)` + a persistent python worker for ~8× speedup.

## Phase 2 deliverables

- Persistent python `rasterize_glyph_server.py` (stdin protocol)
- `--fail-on different` CLI flag for CI gating
- `--pack PREFIX` shortcut (auto-builds corpus from a manifest)
- Allowlist `corpora/baseline.allowlist.json` for acknowledged diffs
- GitHub Action on PRs touching `manifests/**` — auto-comments dashboard URL

## Phase 3 (deferred)

- Rust kernel via `skrifa + tiny-skia + napi` — kills the python
  subprocess overhead, enabling full-corpus runs in < 30 min on CI
- Only worth porting when Phase 2 hits real CI wall-clock pain. See
  DESIGN.md for the empirical decision tree.
