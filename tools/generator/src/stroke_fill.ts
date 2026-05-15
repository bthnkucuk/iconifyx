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

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

type Pending = { icon: ResolvedIcon; cachePath: string; sourceSvg: string };

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
  if (icons.length === 0) {
    return { converted: 0, cacheHits: 0, failures: 0, panicSkipped: [] };
  }

  const cacheDir = path.join(CACHE_ROOT, prefix);
  await mkdir(cacheDir, { recursive: true });

  // First pass: figure out which icons we already have cached vs. need.
  const pending: Pending[] = [];
  let cacheHits = 0;

  for (const ic of icons) {
    const sourceSvg = iconToSvg(ic);
    const hash = sha1(sourceSvg);
    const cachePath = path.join(cacheDir, `${hash}.svg`);
    if (existsSync(cachePath)) {
      const cached = await readFile(cachePath, 'utf8');
      ic.body = cached;
      cacheHits += 1;
    } else {
      pending.push({ icon: ic, cachePath, sourceSvg });
    }
  }

  if (pending.length === 0) {
    return { converted: 0, cacheHits, failures: 0, panicSkipped: [] };
  }

  log.info(
    `  "${prefix}": stroke-fill ${pending.length} icon${pending.length === 1 ? '' : 's'} (${cacheHits} cached)`
  );

  const panicSkipped: string[] = [];
  let failures = 0;
  let converted = 0;

  await processChunk(pending, prefix, {
    onConverted: () => {
      converted += 1;
    },
    onFailure: () => {
      failures += 1;
    },
    onPanicSkipped: (name) => {
      panicSkipped.push(name);
    },
  });

  return { converted, cacheHits, failures, panicSkipped };
}

/**
 * Process a chunk of pending icons through one subprocess invocation.
 * On worker crash (native panic), bisect down to the offending icon and
 * skip it. Recursively handles each half, so the worst-case bisect depth
 * is `log2(N)` extra subprocess spawns for a chunk with one bad icon.
 *
 * Successfully-traced icons get their `cachePath` written and `.body`
 * mutated. A bad icon ends in `onPanicSkipped(name)`; the caller treats
 * those as deprecated downstream so they never receive a glyph.
 */
async function processChunk(
  pending: Pending[],
  prefix: string,
  cb: {
    onConverted: () => void;
    onFailure: () => void;
    onPanicSkipped: (name: string) => void;
  }
): Promise<void> {
  if (pending.length === 0) return;

  const tempIn = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-in-${prefix}-`));
  const tempOut = await mkdtemp(
    path.join(tmpdir(), `iconifyx-sf-out-${prefix}-`)
  );

  try {
    const written: { hash: string; pending: Pending }[] = [];
    for (const p of pending) {
      const hash = sha1(p.sourceSvg);
      await writeFile(path.join(tempIn, `${hash}.svg`), p.sourceSvg);
      written.push({ hash, pending: p });
    }

    const ok = await runFixerWorker(tempIn, tempOut);

    if (!ok) {
      // The worker crashed mid-batch. Files that traced cleanly BEFORE
      // the crash may still be in tempOut — salvage those, then bisect
      // the remainder to isolate the offender.
      const salvaged = new Set<string>();
      for (const w of written) {
        const outPath = path.join(tempOut, `${w.hash}.svg`);
        if (!existsSync(outPath)) continue;
        if (await acceptTracedOutput(outPath, w.pending)) {
          salvaged.add(w.hash);
          cb.onConverted();
        }
      }
      const remaining = pending.filter(
        (p) => !salvaged.has(sha1(p.sourceSvg))
      );

      if (remaining.length === 1) {
        const name = remaining[0]!.icon.name;
        log.warn(
          `  "${prefix}": skipping bad glyph "${name}" (stroke-fill panic)`
        );
        cb.onPanicSkipped(name);
        return;
      }
      if (remaining.length === 0) {
        // The crash hit AFTER the last icon — defensive: shouldn't happen
        // but if it does, everything was salvaged so nothing to bisect.
        return;
      }

      // Bisect the remaining icons across two fresh subprocesses.
      const mid = Math.floor(remaining.length / 2);
      await processChunk(remaining.slice(0, mid), prefix, cb);
      await processChunk(remaining.slice(mid), prefix, cb);
      return;
    }

    // Happy path: worker succeeded. Walk the output dir and update each
    // icon's body / cache file.
    for (const w of written) {
      const outPath = path.join(tempOut, `${w.hash}.svg`);
      if (!existsSync(outPath)) {
        cb.onFailure();
        continue;
      }
      if (await acceptTracedOutput(outPath, w.pending)) {
        cb.onConverted();
      } else {
        cb.onFailure();
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
