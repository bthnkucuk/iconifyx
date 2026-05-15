# `visual-diff` — single-icon comparator (Phase 1)

A reliable, scriptable way to compare **(a) upstream Iconify SVG**,
**(b) the emitted TTF glyph (rasterised)**, and **(c) the Flutter-rendered
composition** for any `(prefix, icon)` pair — and flag the mismatch with a
machine-readable verdict.

Built so the user-reported Solar/Phosphor "duotone halves don't align" bug
class (RESEARCH_PLAN §33) can be diagnosed in one command instead of the
manual *edit → regen → flutter build → screencapture → eyeball* loop.

## Quickstart

```bash
# Full Phase-1 diff (3 PNG panels + diff overlay + classifier verdict)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone

# Fast TTF-only mode (skips flutter render — ~2 s vs ~30 s)
bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --skip-flutter

# Bigger canvas (good for inspecting alignment at scale)
bun run tools/generator/audit/visual-diff/cli.ts ph:acorn-duotone --size 512

# Convenience wrapper that handles cwd
tools/generator/audit/visual-diff/run.sh solar:add-circle-bold-duotone --skip-flutter
```

## Output layout

```
docs/audit/visual-diff/<prefix>__<name>/
├── upstream.svg               # iconify body wrapped with viewBox + xlink ns
├── upstream.png               # resvg rasterised at --size
├── glyph-primary.png          # TTF primary glyph via fontTools + Pillow (em-box)
├── glyph-primary.bbox.json    # advance, lsb, unitsPerEm, bbox, centroid
├── glyph-secondary.png        # TTF secondary glyph (only when duotone)
├── glyph-secondary.bbox.json
├── flutter-rendered.png       # `bun run render-icon` output (only without --skip-flutter)
├── diff-pixelmatch.png        # pixelmatch upstream vs flutter (same condition)
├── report.json                # everything above, machine-readable
└── REPORT.md                  # human-readable, embeds the PNGs + verdict table
```

## Classifier rules (Phase 1: 7 of 18)

| Reason | Heuristic | Status |
|---|---|---|
| `EMPTY_GLYPH` | primary glyph has no outline | `different` |
| `DUOTONE_HALF_BROKEN` | secondary glyph empty when duotone declared | `different` |
| **`DUOTONE_BBOX_MISMATCH`** | duotone, centroids differ > 4 % of em (X or Y) — **the §33 Solar litmus rule** | `different` |
| `FILLED_BLOB` | flutter ink > 0.7 ∧ upstream ink < 0.5 | `different` |
| `HORIZONTAL_DRIFT` / `VERTICAL_DRIFT` | centroid drift > 6 % of canvas ∧ mismatch < 40 % | `different` |
| `EXTRA_INK` | flutter ink > 1.2 × upstream ∧ mismatch > 5 % | `different` |
| `MISSING_CUTOUTS` | flutter ink > 1.4 × upstream ∧ mismatch > 30 % | `different` |
| `MINOR_DIFF` | mismatch ∈ [2 %, 10 %] | `needs-review` |
| `OK` / `TTF_OK` | catch-alls | `same` |

The TTF-only rules (`EMPTY_GLYPH`, `DUOTONE_HALF_BROKEN`,
`DUOTONE_BBOX_MISMATCH`) fire **even when `--skip-flutter`** — they're
high-signal and don't depend on the slower flutter render.

Add a new rule by extending `cli.ts:classify()` — one function, one
table row. No rebuild step, no schema migration.

## Architecture

```
                    +-------------------------+
                    |  cli.ts (bun TS)        |
                    +-----+---+-----+---------+
                          |   |     |
        +-----------------+   |     +-----------------+
        |                     |                       |
        v                     v                       v
+----------------+    +--------------+         +-----------------+
| @resvg/resvg-js|    | rasterize_   |         | render-icon.ts  |
|  (upstream SVG)|    |  glyph.py    |         | (flutter_test)  |
+-------+--------+    +------+-------+         +--------+--------+
        |                    |                          |
        v                    v                          v
   upstream.png       glyph-primary.png /        flutter-rendered.png
                      glyph-secondary.png
                                          \
                                           \
                                            v
                                +---------+---------+
                                | pixelmatch (npm)  |
                                | diff-pixelmatch   |
                                | + classifier      |
                                +-------------------+
                                          |
                                          v
                                  report.json + REPORT.md
```

### Component dependencies

- **Bun TS orchestrator** — `cli.ts` parses args, looks up the icon in
  `tools/generator/manifests/<prefix>.json`, fans out to the three
  raster sub-pipelines, runs the pixelmatch diff, applies the
  classifier, writes `report.json` + `REPORT.md`.
- **`@resvg/resvg-js`** — rasterises the upstream Iconify SVG body (wrapped
  with `viewBox` + `xmlns:xlink`). Same renderer the website uses for SVG
  previews; consistent baseline.
- **`rasterize_glyph.py`** — opens the TTF with fontTools, walks the
  outline via `BoundsPen` + `RecordingPen`, flattens quadratic /
  cubic curves, fills each subpath with Pillow `ImageDraw.polygon`.
  Runs in the existing `tools/generator/python/.venv` (uv-managed).
  Default mode `--mode em` paints in em-box position (x∈[0,advance],
  y∈[descent,ascent]) — surfaces alignment bugs because two glyphs
  with different x-extents render at their actual horizontal
  positions. `--mode bbox` does BoxFit.contain on the content bbox
  for "what each layer looks like alone".
- **`render-icon.ts`** (existing sibling tool) — wraps `fvm flutter
  test` running a `testWidgets` that calls `RepaintBoundary.toImage`.
  Each per-set package has its own host dir (`host-iconifyx_<prefix>/`)
  with a pubspec depending only on `iconifyx_core` + that pack,
  preserving the §32 per-set tree-shake invariant.
- **`pixelmatch`** (npm, MIT, dep-free) — pixel-by-pixel diff of
  upstream.png vs flutter-rendered.png. Threshold 0.1, AA off.

## Choice of Flutter render approach

Reused the **existing** `render-icon` harness which already chose
Approach A (`flutter_test` in a headless isolate). The other four
approaches evaluated by the parallel agent:

| Approach | Verdict |
|---|---|
| A. `flutter_test` + `RepaintBoundary.toImage` + env-var protocol | **PICKED** |
| B. `integration_test` driven test | needs a real device or web driver |
| C. Pure-Dart raster via dart:ui | hits dart:ui-needs-engine-binding wall |
| D. vm-service-driven `flutter run` | fragile, requires async app shutdown coordination |
| E. Persistent flutter test process w/ stdin protocol | deferred — v2 optimisation |

Trade-offs:

- ✅ No display server, no a11y permissions, no screencapture entitlement
- ✅ Per-pack pubspec means we measure what consumers actually ship
- ⚠️ ~10-15 s per call cold, ~5-8 s warm — too slow for corpus mode without Approach E
- ⚠️ `flutter_test` may exhibit font-load races with parallel agent invocations sharing host dirs (observed during this Phase 1 development; reproducible only under multi-agent contention)

## Known issues / Phase 2 todo

- **Slow flutter render under contention.** When multiple agents
  invoke `render-icon` simultaneously, the flutter_tester processes
  share asset compilation caches and can hang past the default 10
  minute test timeout. Workaround: run with `--skip-flutter` for fast
  TTF analysis; only run full mode when the host dir is idle.
- **Opacity mismatch between resvg (50 % per Iconify source) and
  flutter (40 % per `IconifyIcon.secondaryOpacity` default).** Causes
  a ~10 % pixel-mismatch even with perfect alignment. Phase 2 will
  normalise opacities before pixelmatch.
- **Corpus mode (`--pack solar` / `--all`)** is out of scope for
  Phase 1.
- **HTML dashboard** is deferred.
- **Allowlist + baseline regression gate** are deferred.
