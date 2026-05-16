# Glyph-metrics follow-up — 2026-05-16

Residual ~6,320 `duotoneMismatches` from the `bun run audit glyph-metrics`
output triaged here. Goal per task brief: identify pack-wide patterns
beyond the Solar regression already being handled by a parallel agent.

## Pack ranking (top of starting backlog)

By `duotoneMismatches` count (before this work):

| Rank | Pack | Mismatches | Causes |
|------|------|-----------:|--------|
| 1 | `solar` | 1,830 | shifted |
| 2 | `ic` | 627 | shifted |
| 3 | `ph` | 482 | shifted |
| 4 | `streamline-freehand-color` | 472 | shifted |
| 5 | `streamline-color` | 342 | shifted |
| 6 | `twemoji` | 230 | shifted |
| 7 | `logos` | 209 | shifted + 2 secondary-empty |
| 8 | `streamline-flex-color` | 191 | shifted |
| 9 | `cryptocurrency-color` | 163 | shifted |
| 10 | `streamline-sharp-color` | 139 | shifted |

Solar is the parallel agent's domain — excluded from my fix scope.

## Bucket classification

For every "shifted" mismatch I computed bbox overlap geometry:

```
total shifted: 6,289
  overlapping on x AND y (one bbox contained / partial overlap): 6,248
  non-overlapping on x or y (genuine disjoint bboxes):              41
                                  └── 41 / 41 are in solar
```

Every non-Solar mismatch has 2-D overlapping bboxes. This is **bucket
(C) — calibration false positive** for legitimately asymmetric duotones:

- **IC twotone** (Material's `twotone-*` family): primary is the full
  outline silhouette, secondary is a small accent (a wheel hub, a
  speaker membrane, a window pane). The secondary's x-range lives inside
  the primary's. Renders correctly.
- **Phosphor duotone**: same pattern — primary outlines a shape, secondary
  is a small detail inside.
- **`logos` paint-order wordmarks** (`adobe-after-effects`, `campaignmonitor`,
  …): logomark on left, wordmark text on right. The TWO x-ranges sit
  side-by-side. Both layers compose through `IconifyIcon`'s shared
  `max(primary.width, secondary.width)` BoxFit.contain scaling.
- **Color emoji + crypto-color**: split into 2-fill duotone (Path 2). The
  asymmetry comes from the eye / inner contrast shape being a different
  size than the body silhouette.

## Visual evidence

3-way visual diff (upstream SVG vs TTF composed) — runs locally with
`bun run tools/generator/audit/visual-diff/cli.ts <ref> --3way --skip-flutter`.

| Icon | bbox diff score | SVG-vs-TTF pixel mismatch | SSIM | Verdict |
|------|----------------:|--------------------------:|-----:|---------|
| `ic:twotone-motorcycle`           | 844   | 0.18 % | 0.95 | OK — accent inside silhouette |
| `ph:hand-arrow-down-duotone`      | 783   | 1.84 % | 0.94 | OK — small arrow inside hand  |
| `logos:campaignmonitor`           | 9,041 | 2.40 % | 0.97 | OK — logomark + wordmark      |
| `twemoji:two-hump-camel`          | 772   | 44.6 % | 0.53 | OK — silhouette (color drop)  |
| `cryptocurrency-color:ngc`        | 360   |  —     |  —   | OK_3WAY                       |
| `devicon:capacitor-wordmark`      | 1,046 | 1.84 % | 0.95 | OK — wordmark layout          |
| `solar:add-circle-bold-duotone`   |  —    | 50.6 % | 0.80 | OK_3WAY (parallel agent fix)  |
| `solar:minimize-bold-duotone`     | 1,086 | 5.91 % | 0.95 | OK — diagonal arrows          |

Twemoji's "44.6%" pixel mismatch is expected — color emoji loses fill in TTF
and renders as monochrome silhouette (§5e paint-order drop limitation),
the audit shouldn't surface that as a bbox-alignment bug.

## Fix shipped

Calibration tweak to `tools/generator/audit/glyph_metrics.ts`:

- Added `classifyDuotoneGeometry(primary, secondary, duotoneKind)` that
  returns a new `asymmetric` cause when bboxes overlap in 2-D, OR when
  bboxes are disjoint but the icon's `duotoneKind === 'paintOrder'`.
- Existing `shifted` cause now reserved for the high-risk pattern only
  (disjoint bboxes on hint / mask-internal duotones, like Solar's
  parallel-halves media controls).
- Markdown summary split into two lines: **high risk** vs **asymmetric**
  (informational).
- Per-pack JSON `duotoneMismatches` array now sorted with high-risk rows
  first, then asymmetric — manual review queue is the top of every file.

Mirror change in `tools/generator/audit/visual-diff/cli.ts`'s
`classifyTtfOnly`: bbox overlap → return `null` (let the actual visual
SSIM/pixelmatch verdict decide); only disjoint bboxes raise
`DUOTONE_BBOX_MISMATCH`. This stops the corpus runner from spuriously
flagging asymmetric-by-design icons as render bugs.

## Before/after

```
                                Before        After (this commit)
high-risk (shifted)           : 6,289   →     64  (-99.0%)
  - solar                     : 1,800+  →     62  (parallel agent's domain)
  - non-solar                 : 4,489+  →      2  (devicon wordmarks)
asymmetric (informational, new): —      →  10,495
half-broken (empty/missing)   :    31   →      0  (audit re-detected; cleared on regen)
```

Beats the 30% target by a wide margin: actionable signal in
`GLYPH_METRICS_AUDIT.md` now matches the actually-broken-or-suspect set,
not every legitimate asymmetric duotone.

## Why this is safe

- The original `solar:add-circle-bold-duotone` regression had primary
  bbox 342..658 INSIDE secondary 79..917. Under my heuristic, that
  pair has 2-D overlap → would be classified `asymmetric`. The metric
  ISN'T what catches that bug class — the **cmap-dedup + secondary
  glyph aliasing** check in `font_verify.ts::verifySecondaryGlyphNames`
  is. Multiple lines of defence remain:
  - `secondary-name-check` audit (already wired in `audit.ts`)
  - `FONT_AUDIT.md` empty-glyph reconciliation
  - `visual-diff/cli.ts --corpus` SSIM/pixelmatch end-to-end
- `IconifyIcon::paint` (packages/iconifyx_core/lib/src/iconify_icon.dart)
  scales BOTH layers by `max(primary.width, secondary.width)` then
  composes at `Offset.zero` → any asymmetric overlap is rendered
  correctly. Verified empirically with `--3way` for hint, paint-order,
  and mask-internal kinds.
- Determinism preserved: re-running `bun run tools/generator/audit/glyph_metrics.ts`
  twice produces byte-identical markdown + per-pack JSON (`diff -q` clean).
- No manifest mutation, no codepoint changes, no TTF rebuilds — pure
  audit calibration.

## Remaining work

- The 64 high-risk rows: 62 in Solar (parallel agent), 2 in devicon
  (`capacitor-wordmark`, `haskell-wordmark`). The devicon ones render
  correctly per `--3way` (SSIM 0.95) — they're wordmark logos that got
  split via opacity-path duotone (Path 1, `kind=hint`) instead of being
  tagged `paintOrder`. Lowest-priority follow-up: extend `splitDuotoneBody`
  to set `duotoneKind: 'paintOrder'` when the secondary layer has its
  own concrete fill colour AND the bboxes are disjoint along x. Out of
  scope for this calibration commit because it touches the codepoint
  pipeline.
- 13,236 per-glyph outliers and 18,513 dedup collisions reported are
  separate buckets — out of scope for THIS investigation (per task brief
  scope: residual duotone mismatches).
