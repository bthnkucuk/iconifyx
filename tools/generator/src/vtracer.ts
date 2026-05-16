import path from 'node:path';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { log } from './log.ts';
import { iconToSvg } from './svg_preprocess.ts';
import type { ResolvedIcon } from './load_iconify.ts';

/**
 * vtracer orchestrator — drives subprocess-isolated multi-colour
 * recovery of paint-order-dropped icons.
 *
 * Pipeline shape mirrors `stroke_fill.ts` so the cross-pack behaviour
 * stays familiar:
 *
 *   1. Hash each input body → cache key.
 *   2. Cache hit  → read `{primary, secondary}` JSON from disk, mutate
 *      the in-memory icon in place + signal "recovered".
 *   3. Cache miss → queue for the worker.
 *   4. Spawn ONE `bun` subprocess per `vtraceBatch` call (one
 *      pack-at-a-time today; cross-pack batching is a separate
 *      pipeline-phase change — see RESEARCH_PLAN.md §15).
 *   5. On worker exit ≠ 0 (native panic), bisect the input pool to
 *      isolate the bad glyph, mark it `panicSkipped`, and continue.
 *
 * Recovered icons are emitted as a `(primary, secondary)` pair — the
 * caller routes the secondary into the existing duotone Secondary
 * font path with `kind: paintOrder`. Icons that vtracer couldn't
 * reduce to ≥2 distinct layers fall through to the existing paint-
 * order drop (same as before this feature landed).
 *
 * ## Cache layout
 *
 *   tools/generator/.cache/vtrace/<prefix>/<wyhash16>.json
 *
 * JSON shape:
 *
 *   { ok: true,  primary: "<path .../>", secondary: "<path .../>" }
 *   { ok: false, reason: "monochrome" | "no-layers" }
 *
 * Gitignored. Cache key is the SHA of the pipeline-wrapped SVG body
 * (the same input the worker rasterises) — same body → same trace.
 *
 * ## Determinism
 *
 * vtracer parameters are pinned in `vtracer_worker.ts:VTRACER_CONFIG`.
 * Any change there invalidates every cache entry on the next regen
 * (the worker output bytes will differ → callers re-hash). If we ever
 * need to flush the cache explicitly, `rm -rf
 * tools/generator/.cache/vtrace/` does it.
 *
 * @see ./vtracer_worker.ts (the subprocess implementation)
 * @see ./stroke_fill.ts    (template for subprocess + bisect harness)
 */

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache', 'vtrace');
const WORKER_PATH = path.resolve(import.meta.dir, 'vtracer_worker.ts');

/**
 * Spawn the vtracer worker. Returns true on clean exit, false on any
 * non-zero exit code (including SIGABRT / native panic). The caller
 * inspects `outDir` to see which icons were processed before the
 * crash — partial output is preserved.
 */
async function runVtraceWorker(inDir: string, outDir: string): Promise<boolean> {
  const proc = Bun.spawn(['bun', 'run', WORKER_PATH, inDir, outDir], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const short = stderrText.trim().slice(0, 200);
    log.warn(
      `  vtracer worker died (exit=${exitCode})${short ? `: ${short}` : ''}`
    );
    return false;
  }
  return true;
}

/**
 * Content-addressed cache key. Same wyhash16 as `stroke_fill.ts`, so
 * the keying convention is consistent across the .cache/ subdirs.
 */
function hashKey(s: string): string {
  return Bun.hash(s).toString(16).padStart(16, '0').slice(0, 16);
}

export interface VtraceRecovered {
  /** Source icon (mutated in place with `body = primary`). */
  icon: ResolvedIcon;
  /** Secondary body fragment (no outer `<svg>`). */
  secondary: string;
}

export interface VtraceBatchResult {
  /** Icons recovered as duotone primary + secondary pairs. */
  recovered: VtraceRecovered[];
  /** Cache hits this batch (subset of `recovered`). */
  cacheHits: number;
  /** Cache misses sent to the worker (subset of `recovered + failed`). */
  cacheMisses: number;
  /**
   * Icon names where the trace ran successfully but produced fewer
   * than 2 distinct colour layers (monochrome → can't be duotone-
   * split). Caller falls back to paint-order drop for these.
   */
  monochromeFailures: string[];
  /**
   * Icon names where the worker died on this body (native panic in
   * resvg or vtracer). Caller drops them via the existing paint-
   * order drop path; their codepoints stay reserved per CLAUDE.md §3.
   */
  panicSkipped: string[];
  /** Names where the worker emitted no output at all (other failures). */
  otherFailures: string[];
}

type Pending = {
  icon: ResolvedIcon;
  cachePath: string;
  sourceSvg: string;
  tempName: string;
};

/**
 * Run vtracer recovery on `icons` (a list of paint-order-dropped
 * candidates from a single pack). Mutates each recovered `ResolvedIcon`
 * in place so its `body` becomes the primary layer; the matching
 * secondary fragment is returned alongside it for the caller to
 * stash into the duotone Secondary font path.
 *
 * Bodies that fail recovery (monochrome trace, panic, no output) are
 * returned via the failure name-lists; the caller forwards them to
 * the existing paint-order drop. The split between failure modes is
 * preserved so audit reports can distinguish "trace returned mono"
 * from "worker crashed".
 */
export async function vtraceBatch(
  prefix: string,
  icons: ResolvedIcon[]
): Promise<VtraceBatchResult> {
  const result: VtraceBatchResult = {
    recovered: [],
    cacheHits: 0,
    cacheMisses: 0,
    monochromeFailures: [],
    panicSkipped: [],
    otherFailures: [],
  };
  if (icons.length === 0) return result;

  const cacheDir = path.join(CACHE_ROOT, prefix);
  await mkdir(cacheDir, { recursive: true });

  const pending: Pending[] = [];

  // First pass: cache hits + queue cache misses.
  for (const ic of icons) {
    const sourceSvg = iconToSvg(ic);
    const hash = hashKey(sourceSvg);
    const cachePath = path.join(cacheDir, `${hash}.json`);
    if (existsSync(cachePath)) {
      const cached = JSON.parse(await readFile(cachePath, 'utf8')) as
        | { ok: true; primary: string; secondary: string }
        | { ok: false; reason: string };
      if (cached.ok) {
        ic.body = cached.primary;
        result.recovered.push({ icon: ic, secondary: cached.secondary });
        result.cacheHits += 1;
      } else if (cached.reason === 'monochrome') {
        result.monochromeFailures.push(ic.name);
      } else {
        result.otherFailures.push(ic.name);
      }
      continue;
    }
    pending.push({ icon: ic, cachePath, sourceSvg, tempName: `${hash}.svg` });
  }

  if (pending.length === 0) {
    if (result.cacheHits > 0 || result.monochromeFailures.length > 0) {
      log.info(
        `  "${prefix}": vtracer cache-only — ${result.cacheHits} recovered, ${result.monochromeFailures.length} monochrome, no misses`
      );
    }
    return result;
  }

  log.info(
    `  "${prefix}": vtracer ${pending.length} icon${pending.length === 1 ? '' : 's'} (${result.cacheHits} cached, ${result.monochromeFailures.length} cached-mono)`
  );
  result.cacheMisses = pending.length;

  await processChunk(pending, result, prefix);
  return result;
}

/**
 * Recursive worker dispatch + bisect-on-crash. Mirrors the design of
 * `stroke_fill.ts:processMultiChunk` but with a single pack prefix —
 * we don't (yet) cross-batch vtracer across packs because the worker
 * is much heavier per icon and overlapping a fresh-cache twemoji run
 * with a fresh-cache noto run would needlessly stretch the
 * back-pressure tail. If wall-clock pressure shows up, the multi-job
 * pattern lives next door and would be a small refactor.
 */
async function processChunk(
  pool: Pending[],
  result: VtraceBatchResult,
  prefix: string
): Promise<void> {
  if (pool.length === 0) return;

  const tempIn = await mkdtemp(path.join(tmpdir(), `iconifyx-vt-in-${prefix}-`));
  const tempOut = await mkdtemp(
    path.join(tmpdir(), `iconifyx-vt-out-${prefix}-`)
  );

  try {
    for (const p of pool) {
      await writeFile(path.join(tempIn, p.tempName), p.sourceSvg, 'utf8');
    }

    const ok = await runVtraceWorker(tempIn, tempOut);

    if (!ok) {
      // Salvage any clean outputs the worker produced before the
      // crash. Each `<hash>.json` that exists corresponds to an icon
      // that was traced successfully.
      const salvagedNames = new Set<string>();
      for (const p of pool) {
        const jsonPath = path.join(
          tempOut,
          p.tempName.replace(/\.svg$/, '.json')
        );
        if (!existsSync(jsonPath)) continue;
        if (await acceptTracedOutput(jsonPath, p, result)) {
          salvagedNames.add(p.tempName);
        }
      }
      const remaining = pool.filter((p) => !salvagedNames.has(p.tempName));

      if (remaining.length === 1) {
        const p = remaining[0]!;
        log.warn(
          `  "${prefix}": skipping bad glyph "${p.icon.name}" (vtracer panic)`
        );
        result.panicSkipped.push(p.icon.name);
        return;
      }
      if (remaining.length === 0) return;

      const mid = Math.floor(remaining.length / 2);
      await processChunk(remaining.slice(0, mid), result, prefix);
      await processChunk(remaining.slice(mid), result, prefix);
      return;
    }

    // Happy path — every input produced an output JSON (success OR
    // structured rejection). Worker output missing means the worker
    // skipped it for some other reason; surface as `otherFailures`.
    for (const p of pool) {
      const jsonPath = path.join(
        tempOut,
        p.tempName.replace(/\.svg$/, '.json')
      );
      if (!existsSync(jsonPath)) {
        result.otherFailures.push(p.icon.name);
        continue;
      }
      await acceptTracedOutput(jsonPath, p, result);
    }
  } finally {
    await rm(tempIn, { recursive: true, force: true });
    await rm(tempOut, { recursive: true, force: true });
  }
}

/**
 * Parse the worker's JSON output for one icon, classify it (success /
 * monochrome / no-layers / unparseable), update the in-memory
 * `ResolvedIcon` on success, and persist the JSON to the on-disk
 * cache so the next run skips the worker entirely.
 *
 * Returns true on success (icon mutated + cache written), false on
 * any rejection path. The boolean is used by the bisect path to
 * decide whether a pool member counts as "salvaged" mid-crash.
 */
async function acceptTracedOutput(
  jsonPath: string,
  pending: Pending,
  result: VtraceBatchResult
): Promise<boolean> {
  let parsed:
    | { ok: true; primary: string; secondary: string }
    | { ok: false; reason: string };
  try {
    parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as typeof parsed;
  } catch {
    result.otherFailures.push(pending.icon.name);
    return false;
  }

  // Persist to cache regardless of success — the worker's "monochrome"
  // verdict is stable for that input, so re-tracing on the next run
  // would just produce the same negative result.
  await writeFile(pending.cachePath, JSON.stringify(parsed), 'utf8');

  if (parsed.ok) {
    pending.icon.body = parsed.primary;
    result.recovered.push({ icon: pending.icon, secondary: parsed.secondary });
    return true;
  }
  if (parsed.reason === 'monochrome') {
    result.monochromeFailures.push(pending.icon.name);
  } else {
    result.otherFailures.push(pending.icon.name);
  }
  return false;
}
