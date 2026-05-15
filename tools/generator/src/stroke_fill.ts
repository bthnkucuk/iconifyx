import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { log } from './log.ts';
import { iconToSvg } from './svg_preprocess.ts';
import type { ResolvedIcon } from './load_iconify.ts';

/**
 * Convert stroke-only icons into filled-outline icons so that
 * svgicons2svgfont produces correct visual results (a circle outline stays
 * a ring instead of becoming a solid disc).
 *
 * Strategy: use oslllo-svg-fixer (Inkscape-style "stroke to path" via
 * rasterize + Potrace trace) which is the only Node-native option that
 * handles the full set of SVG path features. It's slow (~50-200ms per icon)
 * so output is cached on disk under
 *
 *   tools/generator/.cache/strokefill/<prefix>/<hash>.svg
 *
 * keyed by SHA-1 of the original SVG body. On re-runs only icons whose body
 * changed re-process; the rest read from cache in microseconds.
 *
 * The cache is gitignored and rebuilds idempotently. Deleting it forces a
 * fresh trace next run.
 *
 * ## Process isolation
 *
 * `oslllo-svg-fixer` transitively depends on `resvg`, a native Rust crate.
 * Some malformed SVG bodies — the foreground halves of certain duotone-
 * split emoji glyphs in particular — make resvg panic in `geom.rs` with
 * `called Option::unwrap() on a None value`, which abort()s the process
 * via SIGABRT. A native panic is unrecoverable from JavaScript: a normal
 * try/catch only catches JS exceptions, so without isolation a single bad
 * icon kills the entire generator run mid-flight.
 *
 * The fix is to run `SVGFixer.fix()` in a SUBPROCESS via [Bun.spawn]. If
 * the worker dies on a bad icon, the parent observes a non-zero exit code
 * and bisects the failing batch to locate the offender, then skips it and
 * continues. Cost: one extra `bun` startup per pack (~500 ms); negligible
 * next to the rasterize-trace itself, and only paid on cache misses.
 *
 * @see ./stroke_fill_worker.ts
 */

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache', 'strokefill');
const WORKER_PATH = path.resolve(import.meta.dir, 'stroke_fill_worker.ts');

/**
 * Spawn the stroke-fill worker on a directory of input SVGs. Returns
 * true if the worker exited cleanly, false on any non-zero exit code
 * (including native panic / SIGABRT). The caller is responsible for
 * inspecting `outDir` to determine which icons were successfully
 * traced — partial output is preserved across crashes.
 */
async function runFixerWorker(inDir: string, outDir: string): Promise<boolean> {
  const proc = Bun.spawn(['bun', 'run', WORKER_PATH, inDir, outDir], {
    // Inherit stderr so panic messages surface; stdout is silenced (the
    // worker itself doesn't log on the happy path).
    stdout: 'ignore',
    stderr: 'pipe',
  });
  // Drain stderr so the pipe doesn't fill up + block the worker. We only
  // surface it on failure to keep the regular log noise low.
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const short = stderrText.trim().slice(0, 200);
    log.warn(
      `  stroke-fill worker died (exit=${exitCode})${short ? `: ${short}` : ''}`
    );
    return false;
  }
  return true;
}

/**
 * Content-addressed cache key for an SVG body. Uses `Bun.hash` (wyhash) —
 * non-cryptographic but ~4× faster than `crypto.sha1` on small inputs, and
 * cache keys don't need cryptographic strength. The 16-char hex truncation
 * preserves the original key length.
 *
 * Function name kept as `sha1` to avoid noisy renames in the bisect path —
 * the identity that matters is "same input → same filename", not the
 * specific algorithm.
 */
function sha1(s: string): string {
  return Bun.hash(s).toString(16).padStart(16, '0').slice(0, 16);
}

/**
 * Legacy SHA-1 cache key. Existing cache files under
 * `.cache/strokefill/<prefix>/<sha1>.svg` were written before the wyhash
 * switch; we still read them on cache hits to keep warm-cache regen times
 * stable across the cutover, then re-link them under the new key on first
 * touch. After ~one regen cycle the cache is fully migrated; users who
 * want a clean cut can `rm -rf tools/generator/.cache/strokefill/`.
 */
function legacySha1(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

type Pending = { icon: ResolvedIcon; cachePath: string; sourceSvg: string };
type Tagged = { prefix: string; pending: Pending };

/**
 * Per-prefix work item for `strokeFillBatchMulti`. Same shape as the
 * single-prefix `strokeFillBatch(prefix, icons)` invocation but rolled up
 * into a list so multiple packs can share one subprocess spawn.
 */
export interface StrokeFillJob {
  prefix: string;
  icons: ResolvedIcon[];
}

export interface StrokeFillJobResult {
  prefix: string;
  converted: number;
  cacheHits: number;
  failures: number;
  panicSkipped: string[];
}

/**
 * Pre-process every icon body in `icons` through stroke→fill conversion.
 * Mutates each `ResolvedIcon` in place to point its `body` at the new
 * filled-outline form. Returns the same array for chaining.
 *
 * Icons whose stroke-fill conversion errors out keep their original body
 * (they'll render filled instead of outlined, which is wrong but better
 * than missing). Icons that crash the rasterizer (native resvg panic)
 * are isolated via bisect, skipped, and reported back in `panicSkipped`
 * — the pipeline marks those as deprecated so they don't ship.
 */
export async function strokeFillBatch(
  prefix: string,
  icons: ResolvedIcon[]
): Promise<{
  converted: number;
  cacheHits: number;
  failures: number;
  /** Names of icons whose stroke-fill worker died (native panic). */
  panicSkipped: string[];
}> {
  // Thin wrapper around the multi-pack variant: single job, single result.
  const [result] = await strokeFillBatchMulti([{ prefix, icons }]);
  return {
    converted: result!.converted,
    cacheHits: result!.cacheHits,
    failures: result!.failures,
    panicSkipped: result!.panicSkipped,
  };
}

/**
 * Process the strokefill cache + trace pipeline for multiple `(prefix,
 * icons)` jobs in a single coordinated pass. The point is to merge the N
 * subprocess invocations (one per `strokeFillBatch` call) into a single
 * subprocess spawn that processes ALL cache misses across ALL jobs at
 * once.
 *
 * Each job keeps its own cache namespace (`<CACHE_ROOT>/<prefix>/...`),
 * so cache hits / writes are unaffected. Per-job counts (`converted`,
 * `cacheHits`, `failures`, `panicSkipped`) are accounted independently
 * so the caller sees per-pack stats indistinguishable from the legacy
 * one-call-per-pack behaviour.
 *
 * Bisect identity is preserved: when the worker crashes on a poison
 * glyph, the bisect splits the WHOLE remaining pool (across all jobs)
 * in half; the surviving icons trace fine, the dead one ends up
 * accounted to its original pack's `panicSkipped` list. Worst case
 * complexity is unchanged: `O(log N)` extra spawns per crashing icon.
 *
 * Today this is called once per pack with primary + secondary as the two
 * jobs, collapsing 2 subprocess spawns → 1 per pack. Fully cross-pack
 * batching requires structural pipeline phases (see RESEARCH_PLAN.md
 * §15) and is deferred.
 */
export async function strokeFillBatchMulti(
  jobs: StrokeFillJob[]
): Promise<StrokeFillJobResult[]> {
  // Per-job result aggregators. We track per-pack counts so each caller
  // sees stats indistinguishable from the legacy single-pack API.
  const results: Map<string, StrokeFillJobResult> = new Map();
  for (const job of jobs) {
    results.set(job.prefix, {
      prefix: job.prefix,
      converted: 0,
      cacheHits: 0,
      failures: 0,
      panicSkipped: [],
    });
  }

  // First pass per job: resolve cache hits, collect cache misses. Hits
  // mutate the icon body directly + bump the per-job cacheHits counter;
  // misses get queued for the single shared subprocess.
  const allPending: Tagged[] = [];
  let totalCacheHits = 0;

  for (const job of jobs) {
    if (job.icons.length === 0) continue;
    const cacheDir = path.join(CACHE_ROOT, job.prefix);
    await mkdir(cacheDir, { recursive: true });
    const jobResult = results.get(job.prefix)!;

    for (const ic of job.icons) {
      const sourceSvg = iconToSvg(ic);
      const hash = sha1(sourceSvg);
      const cachePath = path.join(cacheDir, `${hash}.svg`);
      if (existsSync(cachePath)) {
        const cached = await readFile(cachePath, 'utf8');
        ic.body = cached;
        jobResult.cacheHits += 1;
        totalCacheHits += 1;
        continue;
      }
      // Legacy SHA-1 cache compatibility (see `legacySha1`). On hit, re-
      // link under the new wyhash key so subsequent regens see a direct
      // hit. One extra `existsSync` per cache miss during the migration
      // window; once every cached body has been re-keyed, the legacy
      // branch turns into a no-op stat.
      const legacyCachePath = path.join(cacheDir, `${legacySha1(sourceSvg)}.svg`);
      if (existsSync(legacyCachePath)) {
        const cached = await readFile(legacyCachePath, 'utf8');
        ic.body = cached;
        jobResult.cacheHits += 1;
        totalCacheHits += 1;
        await writeFile(cachePath, cached, 'utf8');
        continue;
      }
      allPending.push({
        prefix: job.prefix,
        pending: { icon: ic, cachePath, sourceSvg },
      });
    }
  }

  if (allPending.length === 0) {
    if (totalCacheHits > 0) {
      log.info(
        `  stroke-fill: ${totalCacheHits} cached across ${jobs.length} job${jobs.length === 1 ? '' : 's'}, no misses`
      );
    }
    return [...results.values()];
  }

  if (jobs.length === 1) {
    log.info(
      `  "${jobs[0]!.prefix}": stroke-fill ${allPending.length} icon${allPending.length === 1 ? '' : 's'} (${totalCacheHits} cached)`
    );
  } else {
    log.info(
      `  stroke-fill: ${allPending.length} icon${allPending.length === 1 ? '' : 's'} across ${jobs.length} job${jobs.length === 1 ? '' : 's'} (${totalCacheHits} cached) — batched single subprocess`
    );
  }

  await processMultiChunk(allPending, {
    onConverted: (prefix) => {
      results.get(prefix)!.converted += 1;
    },
    onFailure: (prefix) => {
      results.get(prefix)!.failures += 1;
    },
    onPanicSkipped: (prefix, name) => {
      results.get(prefix)!.panicSkipped.push(name);
    },
  });

  return [...results.values()];
}

/**
 * Multi-prefix variant of the original per-pack `processChunk`. Drives a
 * single subprocess invocation that handles cache-misses tagged with
 * their original pack prefix; on worker crash, bisects the WHOLE pool
 * (across prefixes) — survivors land in cache, the dead glyph gets
 * accounted to its source pack's `onPanicSkipped`.
 *
 * Hash collisions across prefixes (two packs whose `iconToSvg` output is
 * byte-identical) would normally collide in the shared `tempIn` dir. We
 * resolve via a suffix on the temp filename — the cache path is still
 * prefix-scoped, but the on-disk temp filename is `<hash>_<idx>.svg`
 * where `idx` is the tagged-pending's position in the input array. The
 * worker is filename-agnostic; it traces whatever lands in `tempIn`.
 */
async function processMultiChunk(
  pool: Tagged[],
  cb: {
    onConverted: (prefix: string) => void;
    onFailure: (prefix: string) => void;
    onPanicSkipped: (prefix: string, name: string) => void;
  }
): Promise<void> {
  if (pool.length === 0) return;

  // Use a single shared temp namespace so we only pay one mkdtemp pair
  // per subprocess invocation. Suffixing input filenames with the index
  // guards against (rare) hash collisions of identical iconToSvg output
  // across two different prefixes.
  const label = pool.length === 1 ? pool[0]!.prefix : `multi-${pool.length}`;
  const tempIn = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-in-${label}-`));
  const tempOut = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-out-${label}-`));

  try {
    const written: { tempName: string; tag: Tagged }[] = [];
    for (let i = 0; i < pool.length; i++) {
      const tag = pool[i]!;
      const hash = sha1(tag.pending.sourceSvg);
      const tempName = `${hash}_${i}.svg`;
      await writeFile(path.join(tempIn, tempName), tag.pending.sourceSvg);
      written.push({ tempName, tag });
    }

    const ok = await runFixerWorker(tempIn, tempOut);

    if (!ok) {
      // Worker crashed. Salvage cleanly-traced files (the bad glyph may
      // have crashed mid-batch, so earlier outputs survive), then bisect
      // the rest across two fresh subprocesses.
      const salvagedNames = new Set<string>();
      for (const w of written) {
        const outPath = path.join(tempOut, w.tempName);
        if (!existsSync(outPath)) continue;
        if (await acceptTracedOutput(outPath, w.tag.pending)) {
          salvagedNames.add(w.tempName);
          cb.onConverted(w.tag.prefix);
        }
      }
      const remaining = pool.filter(
        (_, i) => !salvagedNames.has(written[i]!.tempName)
      );

      if (remaining.length === 1) {
        const tag = remaining[0]!;
        log.warn(
          `  "${tag.prefix}": skipping bad glyph "${tag.pending.icon.name}" (stroke-fill panic)`
        );
        cb.onPanicSkipped(tag.prefix, tag.pending.icon.name);
        return;
      }
      if (remaining.length === 0) {
        // Crash AFTER the final icon — everything salvaged.
        return;
      }

      const mid = Math.floor(remaining.length / 2);
      await processMultiChunk(remaining.slice(0, mid), cb);
      await processMultiChunk(remaining.slice(mid), cb);
      return;
    }

    // Happy path.
    for (const w of written) {
      const outPath = path.join(tempOut, w.tempName);
      if (!existsSync(outPath)) {
        cb.onFailure(w.tag.prefix);
        continue;
      }
      if (await acceptTracedOutput(outPath, w.tag.pending)) {
        cb.onConverted(w.tag.prefix);
      } else {
        cb.onFailure(w.tag.prefix);
      }
    }
  } finally {
    await rm(tempIn, { recursive: true, force: true });
    await rm(tempOut, { recursive: true, force: true });
  }
}

/**
 * Read a traced SVG from `outPath`, strip the outer `<svg>` tag, and
 * commit the result to both `pending.icon.body` (in-memory) and
 * `pending.cachePath` (on-disk cache). Returns true on a clean accept,
 * false if the output is missing/empty/invalid (the caller treats this
 * as a per-icon trace failure).
 */
async function acceptTracedOutput(
  outPath: string,
  pending: Pending
): Promise<boolean> {
  const fixed = await readFile(outPath, 'utf8');
  if (!/<path\b/.test(fixed)) return false;
  const bodyMatch = fixed.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const newBody = (bodyMatch ? bodyMatch[1]! : fixed).trim();
  pending.icon.body = newBody;
  await writeFile(pending.cachePath, newBody, 'utf8');
  return true;
}
