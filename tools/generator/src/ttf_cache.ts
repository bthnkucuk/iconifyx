import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ManifestFontEntry } from './manifest.ts';
import type { ResolvedIcon } from './load_iconify.ts';
import { iconToSvg } from './svg_preprocess.ts';
import { log } from './log.ts';
import pkgJson from '../package.json' with { type: 'json' };

/**
 * Per-font TTF cache (RESEARCH_PLAN.md §15).
 *
 * The (svgicons2svgfont → svg2ttf) pipeline is by far the slowest stage of
 * `bun run generate` once the stroke-fill rasterize-trace cache is warm. A
 * typical regen rebuilds every TTF even when the icon set's input bodies
 * are byte-identical to the previous run. That is wasted work: TTF output
 * is deterministic (ts: 0 in svg2ttf), so for the same input we always get
 * the same bytes — perfect cache target.
 *
 * Key components (kept TIGHTER than the original §13 proposal so a cache
 * hit is a strict proof of byte-identity, not a heuristic match):
 *
 *   - fontName + stream options (fontHeight, normalize, centerHorizontally)
 *   - svg2ttf options (`ts: 0`)
 *   - For every member, sorted by codepoint:
 *       * iconify name (for tiebreaking when two icons share a codepoint
 *         across deprecations + adds in the same run — shouldn't happen
 *         but make the key bulletproof)
 *       * codepoint
 *       * iconToSvg(resolvedIcon) — the fully-preprocessed SVG that
 *         actually gets fed into svgicons2svgfont. This catches every
 *         preprocess pipeline change (duotone splits, animation flatten,
 *         stroke-fill rasterize-trace, color-mapped normalize, …).
 *   - Library versions read from package.json — bump svgicons2svgfont or
 *     svg2ttf and every cache entry invalidates.
 *
 * Cache location: `tools/generator/.cache/ttf/<sha256>.ttf` (gitignored;
 * already covered by `tools/generator/.cache/` in .gitignore).
 *
 * On cache hit: read bytes from disk and return — skipping the entire
 * svgicons2svgfont + svg2ttf chain. Saves ~30-50 s on warm regens.
 *
 * On cache miss: call the underlying builder, write result to cache, return.
 *
 * @see RESEARCH_PLAN.md §15
 */

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache', 'ttf');

const PKG = pkgJson as {
  dependencies: Record<string, string>;
};

/**
 * Library versions baked into the cache key. Reading these from
 * package.json (rather than hard-coding) means bumping a generator dep
 * automatically invalidates every cached TTF — no chance of accidentally
 * shipping bytes built against an older svg2ttf.
 */
const SVGICONS2SVGFONT_VERSION = PKG.dependencies['svgicons2svgfont'] ?? 'unknown';
const SVG2TTF_VERSION = PKG.dependencies['svg2ttf'] ?? 'unknown';

/** Bumped manually when the cache key shape changes (forces a wipe). */
const CACHE_SCHEMA_VERSION = 1;

export interface CacheStats {
  hits: number;
  misses: number;
  bytesReused: number;
}

const stats: CacheStats = { hits: 0, misses: 0, bytesReused: 0 };

export function getCacheStats(): Readonly<CacheStats> {
  return stats;
}

export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.bytesReused = 0;
}

/**
 * Compute the cache key for a font build invocation.
 *
 * The input is the SAME data the underlying `buildOneFont` consumes — same
 * font name, same stream options, same member list, same per-member
 * preprocessed SVG. By hashing all of these together we guarantee:
 *
 *   - Adding / removing / renaming an icon → different key
 *   - Codepoint reallocation → different key (codepoint is included)
 *   - Any preprocess change to a body → different key (iconToSvg captures
 *     the post-preprocess body)
 *   - Stream options change → different key
 *   - Library bump → different key
 *
 * @internal exported for tests
 */
export function computeFontCacheKey(input: {
  fontEntry: ManifestFontEntry;
  members: readonly { name: string; codepoint: number }[];
  resolvedByName: Map<string, ResolvedIcon>;
}): string {
  const { fontEntry, members, resolvedByName } = input;

  const sortedMembers = [...members].sort((a, b) => a.codepoint - b.codepoint);

  // Build the digest incrementally instead of stringifying a giant object —
  // members can hold ~6000 entries with multi-KB SVG bodies, so a single
  // JSON.stringify followed by hash would peak at tens of MB of intermediate
  // string allocation. Streaming into the hasher keeps memory flat.
  const hasher = createHash('sha256');

  hasher.update('SCHEMA:' + CACHE_SCHEMA_VERSION + '\n');
  hasher.update('FONT:' + fontEntry.family + '\n');
  hasher.update('OPTS:fontHeight=1000;normalize=true;centerHorizontally=false\n');
  hasher.update('SVG2TTF:ts=0\n');
  hasher.update('LIB:svgicons2svgfont=' + SVGICONS2SVGFONT_VERSION + '\n');
  hasher.update('LIB:svg2ttf=' + SVG2TTF_VERSION + '\n');
  hasher.update('MEMBERS:' + sortedMembers.length + '\n');

  for (const m of sortedMembers) {
    const ic = resolvedByName.get(m.name);
    if (!ic) {
      // Should never happen — the caller validates this; encode the absence
      // in the key so we don't accidentally hit a cache entry built against
      // a different missing-icon situation.
      hasher.update('M:' + m.name + '@' + m.codepoint + ':MISSING\n');
      continue;
    }
    const svg = iconToSvg(ic);
    hasher.update('M:' + m.name + '@' + m.codepoint + ':' + svg.length + ':');
    hasher.update(svg);
    hasher.update('\n');
  }

  return hasher.digest('hex');
}

function cachePathForKey(key: string): string {
  return path.join(CACHE_ROOT, key + '.ttf');
}

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_ROOT)) {
    await mkdir(CACHE_ROOT, { recursive: true });
  }
}

/**
 * Wrap an underlying TTF build with a content-addressed cache.
 *
 * @param input  Same data the underlying builder needs (used to compute the
 *               cache key).
 * @param buildFn The expensive build function — only called on miss.
 * @param options Cache control. `enabled: false` short-circuits both
 *                lookup and write, making the wrapper a pass-through (used
 *                by `--no-cache`).
 */
export async function withTtfCache(
  input: {
    fontEntry: ManifestFontEntry;
    members: readonly { name: string; codepoint: number }[];
    resolvedByName: Map<string, ResolvedIcon>;
  },
  buildFn: () => Promise<Buffer | null>,
  options: { enabled: boolean } = { enabled: true }
): Promise<Buffer | null> {
  if (!options.enabled) {
    return await buildFn();
  }

  const key = computeFontCacheKey(input);
  const cPath = cachePathForKey(key);

  if (existsSync(cPath)) {
    try {
      const bytes = await readFile(cPath);
      stats.hits += 1;
      stats.bytesReused += bytes.length;
      log.info(
        `  cache hit: ${input.fontEntry.family} (${(bytes.length / 1024).toFixed(1)} KB, key=${key.slice(0, 12)}…)`
      );
      return bytes;
    } catch (err) {
      // Cache file corrupted (truncated, permissions, …) — fall through to
      // rebuild. Don't treat a bad cache entry as a fatal error.
      const short = err instanceof Error ? err.message.split('\n')[0]! : String(err);
      log.warn(`  cache read failed for ${input.fontEntry.family}: ${short}`);
    }
  }

  const built = await buildFn();
  if (built !== null) {
    try {
      await ensureCacheDir();
      // Atomic-ish write: write to .tmp and rename so a crashed half-write
      // doesn't leave behind a corrupt cache entry on disk.
      const tmpPath = cPath + '.tmp';
      await writeFile(tmpPath, built);
      await rename(tmpPath, cPath);
    } catch (err) {
      // Failing to write the cache is non-fatal — log + continue. The TTF
      // bytes themselves are good; we'll just re-build next run.
      const short = err instanceof Error ? err.message.split('\n')[0]! : String(err);
      log.warn(`  cache write failed for ${input.fontEntry.family}: ${short}`);
    }
  }
  stats.misses += 1;
  return built;
}

/**
 * Remove the entire on-disk TTF cache. Called by `--clean-cache`.
 */
export async function cleanTtfCache(): Promise<{ removed: boolean }> {
  if (!existsSync(CACHE_ROOT)) return { removed: false };
  await rm(CACHE_ROOT, { recursive: true, force: true });
  return { removed: true };
}

/** Cache root path — exported for tests + diagnostic logging. */
export function ttfCacheRoot(): string {
  return CACHE_ROOT;
}
