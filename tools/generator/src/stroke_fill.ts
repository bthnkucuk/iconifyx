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
 */

// Path to oslllo-svg-fixer constructor. We `require` lazily because importing
// it eagerly pulls in piscina (worker pool) even when we don't process any
// stroke sets.
let _SVGFixer: ((src: string, dest: string, opts?: object) => { fix: () => Promise<unknown> }) | null = null;
async function getFixer(): Promise<NonNullable<typeof _SVGFixer>> {
  if (_SVGFixer) return _SVGFixer;
  // @ts-expect-error — oslllo-svg-fixer has no type definitions.
  const mod = await import('oslllo-svg-fixer');
  _SVGFixer =
    (mod as { default: typeof _SVGFixer }).default ??
    (mod as unknown as typeof _SVGFixer);
  return _SVGFixer!;
}

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache', 'strokefill');

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

/**
 * Pre-process every icon body in `icons` through stroke→fill conversion.
 * Mutates each `ResolvedIcon` in place to point its `body` at the new
 * filled-outline form. Returns the same array for chaining.
 *
 * Icons whose stroke-fill conversion errors out keep their original body
 * (they'll render filled instead of outlined, which is wrong but better
 * than missing).
 */
export async function strokeFillBatch(
  prefix: string,
  icons: ResolvedIcon[]
): Promise<{ converted: number; cacheHits: number; failures: number }> {
  if (icons.length === 0) {
    return { converted: 0, cacheHits: 0, failures: 0 };
  }

  const cacheDir = path.join(CACHE_ROOT, prefix);
  await mkdir(cacheDir, { recursive: true });

  // First pass: figure out which icons we already have cached vs. need.
  type Pending = { icon: ResolvedIcon; cachePath: string; sourceSvg: string };
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
    return { converted: 0, cacheHits, failures: 0 };
  }

  log.info(
    `  "${prefix}": stroke-fill ${pending.length} icon${pending.length === 1 ? '' : 's'} (${cacheHits} cached)`
  );

  // Second pass: write pending SVGs into a temp dir, run oslllo-svg-fixer,
  // read results back, copy into the per-prefix cache.
  const tempIn = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-in-${prefix}-`));
  const tempOut = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-out-${prefix}-`));
  let failures = 0;

  try {
    // We use the icon's sha as the temp filename so we can map results back.
    const written: { hash: string; pending: Pending }[] = [];
    for (const p of pending) {
      const hash = sha1(p.sourceSvg);
      await writeFile(path.join(tempIn, `${hash}.svg`), p.sourceSvg);
      written.push({ hash, pending: p });
    }

    const SVGFixer = await getFixer();
    try {
      await SVGFixer(tempIn, tempOut, { showProgressBar: false }).fix();
    } catch (err) {
      log.warn(
        `  "${prefix}": stroke-fill batch failed (${err instanceof Error ? err.message.slice(0, 80) : err}); keeping originals`
      );
      return { converted: 0, cacheHits, failures: pending.length };
    }

    for (const w of written) {
      const outPath = path.join(tempOut, `${w.hash}.svg`);
      if (!existsSync(outPath)) {
        failures += 1;
        continue;
      }
      const fixed = await readFile(outPath, 'utf8');
      // Sanity: the fixed output should still be SVG with at least one path.
      if (!/<path\b/.test(fixed)) {
        failures += 1;
        continue;
      }
      // Strip the outer <svg> tags; the rest of the pipeline expects an
      // Iconify-style "body" (children only).
      const bodyMatch = fixed.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      const newBody = bodyMatch ? bodyMatch[1]! : fixed;
      w.pending.icon.body = newBody.trim();
      await writeFile(w.pending.cachePath, w.pending.icon.body, 'utf8');
    }
  } finally {
    await rm(tempIn, { recursive: true, force: true });
    await rm(tempOut, { recursive: true, force: true });
  }

  return {
    converted: pending.length - failures,
    cacheHits,
    failures,
  };
}
