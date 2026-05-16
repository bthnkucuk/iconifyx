# Regen speed investigation — Solar pack stroke-fill at 5 icons/sec (10-20× spec)

**Date:** 2026-05-16
**Trigger:** Solar regen invoked to apply §33 duotone fix (`406b8c3f`). Expected ~30-60s for a single pack; observed 22+ min and counting.

## Observed numbers

| Source | Throughput claim | Reality (this run) |
|---|---|---|
| CLAUDE.md §5a | `10-20 s per ~1000 icons` (50-100 icons/sec) | **5 icons/sec** |
| Pipeline log | `0 cached` (cache invalidated by §6 changes) | every icon hit Potrace + resvg |

Solar dispatched **9832 icons** through `stroke_fill_worker.ts`. After 22 minutes the output dir held **6535 of 9832** (66%) → projected total **~33 min**.

## Root causes

1. **Cache invalidation by §6 changes** — `strokeIsFillLike` + `iconNeedsRasterTrace` (DOM-based) and `scaleStrokeWidths` shipped together in commits `cd25801f`–`fa96f71a`. Even unchanged Solar bodies now hash differently because the SCALING + DETECTION code generates different `preprocessed body` inputs to stroke-fill, and that body is part of the cache key.

   Empirically: `0 cached` of 9832 → effectively a cold cache for this pack.

2. **Single-worker sequential execution.** `stroke_fill.ts:strokeFillBatchMulti` spawns ONE `stroke_fill_worker.ts` subprocess per batch. The worker reads `<inDir>/<icon>.svg`, runs Svg2→PNG resvg rasterization at `TRACE_RESOLUTION = 600`, then `oslllo-potrace`, writes `<outDir>/<icon>.svg`. All sequential per process. **Single thread = one CPU.** On an 8-core M-series this leaves 7 cores idle.

3. **Per-icon cost dominated by rasterize at 600×600 + Potrace trace.** Measured ~200 ms/icon end-to-end. That's NOT pathological — Potrace is genuinely O(pixel-count) — but the spec's `10-20s per 1000 icons` was optimistic / based on smaller/simpler packs.

4. **Orphan worker contention (now killed).** A prior regen attempt left an orphan `stroke_fill_worker.ts` at PID 13550 (started 16:29, 11 minutes runtime when discovered). It was competing for CPU + filesystem with the current run's worker (PID 17534) → throughput halved until it was killed at 16:42. The remaining 17534 has been running solo since.

## Proposed fixes

In order of impact / cost:

### A. Worker pool (CPU-count parallelism) — projected 4-8× speedup

Change `stroke_fill.ts:strokeFillBatchMulti` to shard the input across `min(cpus, 8)` workers. Each worker gets its own `inDir/outDir` chunk. The pipeline already uses worker-pool concurrency at the PACK level (`min(cpus, 8)`), so the pattern exists — just bring it down to the STROKE-FILL batch level.

Implementation: split the input array N ways by index, spawn N workers in parallel, await all `Promise.all` style, then merge outputs into one dir. The bisect-on-panic logic stays the same per-worker.

**Risk:** RSS multiplied by N (each worker resvg + Potrace loads ~150 MB). On the 7 GB CI runner this is fine (~1.2 GB for 8 workers); on developer machines also fine.

### B. Lower `TRACE_RESOLUTION` from 600 → 400 — 2-3× speedup with marginal quality loss

Potrace cost is O(W×H). 600² = 360k px, 400² = 160k px. Visual quality holds for monochrome icons since the source SVG is already at a normalized viewBox and there are no thin sub-pixel details after rasterize at 400.

Need to validate via `visual-diff --3way` against a sampling of currently-known-good icons before flipping.

### C. Stable cache key — eliminate spurious invalidations

The current key includes the preprocessed-body bytes verbatim. Any preprocessing change (§6's `scaleStrokeWidths` etc.) flips the key for every icon even if the stroke-fill output would be byte-identical. Two paths to fix:

- **Hash the rasterized PNG** (not the source SVG) so cache keys reflect "what Potrace will actually see". Requires running the rasterize step ONCE before cache lookup — chicken-and-egg.
- **Bump a generator pipeline version** explicitly only on stroke-fill-affecting changes. Cheaper but error-prone manually.

### D. §13 #2 — persistent subprocess pool — already designed

RESEARCH_PLAN §13 #2 documents a persistent worker pool that holds resvg + Potrace + svgicons2svgfont resident across packs. Currently each pack spawns fresh workers (~500ms startup each). For full regen across 225 packs this is ~2 min of startup overhead alone. Designed at ~4h effort.

## Current run

Letting the active worker finish (~11 more min projected) so the Solar fix artifacts get committed. Tracking via `Monitor` task `bg3bh7ibr` — prints `+N/30s` every 30 seconds + a `STROKE_FILL_DONE` line on completion.

## Follow-up actions

1. After this run completes, regen artifacts get committed → push → Pages re-deploys with the Solar fix live.
2. **Open a TODO** for fix (A) — worker pool. Estimated 2h. The biggest win.
3. **Open a TODO** for fix (B) — TRACE_RESOLUTION reduction, gated on visual-diff validation. Estimated 1h.
4. **Open a TODO** for fix (C) — cache key reform. Estimated 3h.

Section §13 of `RESEARCH_PLAN.md` already covers (D) at a higher level.
