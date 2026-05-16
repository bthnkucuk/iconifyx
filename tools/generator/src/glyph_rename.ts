import path from 'node:path';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';

import { log } from './log.ts';
import type { Manifest } from './manifest.ts';

/**
 * Post-build glyph rename. Calls the sibling Python script
 * `python/rename_glyphs.py` (fontTools) in a subprocess to rewrite the
 * just-built TTFs so every cmap codepoint resolves to a glyph whose
 * post-table name matches the manifest's icon name.
 *
 * Background — `svg2ttf` deduplicates glyphs by outline hash. When two
 * svgicons2svgfont inputs happen to produce identical outlines (e.g.
 * different Solar duotone secondary layers that share a backdrop), the
 * dedup pass keeps the FIRST encountered glyph name (alphabetically)
 * and aliases the other codepoints to that same glyph. Visual rendering
 * is unaffected — same outline either way — but:
 *
 *   - `font_verify.ts`'s cmap-name reconciliation flags the mismatch.
 *   - Third-party tooling (`fonttools ttx`, browser dev tools) reads
 *     the wrong icon identity at the aliased codepoints.
 *   - Hash-based glyph identity is semantically wrong (the same glyph
 *     should not carry multiple "real" icon names).
 *
 * The Python script duplicates the dedup victim under each aliased
 * codepoint's correct name (deep-copy of glyf + hmtx + glyphOrder)
 * and rewrites the cmap subtables. The fix is deterministic
 * (`recalcTimestamp=False`, `recalcBBoxes=False`); svg2ttf's `ts:0`
 * head-table timestamp is preserved. Last regen surfaced **18,513
 * collisions across 166 packs** — empirically dropped to **<100** after
 * this pass.
 *
 * Cost: ~40% TTF bloat on duotone-secondary fonts (Solar's 347 KB →
 * 483 KB). Primary fonts are largely unaffected because their outlines
 * are already distinct by construction.
 */
export interface GlyphRenameStats {
  /** Glyphs renamed in place (the canonical codepoint already pointed at the right glyph). */
  renamed: number;
  /**
   * Glyphs duplicated under a new name (aliased codepoints — the dedup
   * victim's first codepoint kept the original glyph; every other
   * codepoint got a deep-copy under its own name).
   */
  duplicated: number;
  /** Codepoints not in the codepoint_map (no manifest entry to rename to). */
  skipped: number;
}

/**
 * Rewrite each (family, ttf) pair so that the emitted post-table glyph
 * names match the manifest's icon names at every codepoint. The output
 * map is keyed identically to the input; values are the new TTF buffers
 * (so the caller can write them to disk as it normally would).
 *
 * The TS layer:
 *   1. Builds a `{ codepoint → iconName }` map from the manifest (one
 *      per emitted font, primary + Secondary distinguished).
 *   2. Writes the input TTF + map JSON to a per-call tmp dir.
 *   3. Spawns the Python script via `uv run --no-project --with fonttools`.
 *   4. Reads the rewritten TTF back, aggregates stats.
 *
 * If `uv` is unavailable in the environment (CI / contributor without
 * uv installed), the rename is skipped with a warning and the original
 * TTFs are returned unchanged — the pipeline still completes; the
 * cmap-name collisions just remain visible in `FONT_AUDIT.md`.
 */
export async function renameGlyphsInTtfs(
  manifest: Manifest,
  ttfs: Map<string, Buffer>
): Promise<{ ttfs: Map<string, Buffer>; stats: GlyphRenameStats }> {
  const aggregated: GlyphRenameStats = { renamed: 0, duplicated: 0, skipped: 0 };
  if (ttfs.size === 0) return { ttfs, stats: aggregated };

  // Probe `uv` once. We treat its absence as a soft-fail rather than
  // crashing the whole pipeline — the rename is a polish pass, not a
  // correctness gate. Visual rendering is identical with or without it.
  const uvAvailable = await probeUv();
  if (!uvAvailable) {
    log.warn(
      `glyph-rename: \`uv\` not available; skipping post-build rename (cmap-name collisions will persist for "${manifest.prefix}")`
    );
    return { ttfs, stats: aggregated };
  }

  const out = new Map<string, Buffer>();
  for (const [family, ttf] of ttfs) {
    const cpMap = buildCodepointMapForFont(manifest, family);
    if (cpMap.size === 0) {
      // Nothing to rename for this family (no live icons or pure-solo set).
      out.set(family, ttf);
      continue;
    }

    const tmp = await mkdtemp(path.join(tmpdir(), 'iconifyx-rename-'));
    try {
      const inTtfPath = path.join(tmp, `${family}.in.ttf`);
      const outTtfPath = path.join(tmp, `${family}.out.ttf`);
      const mapPath = path.join(tmp, 'map.json');

      await writeFile(inTtfPath, ttf);
      // JSON map: keys are codepoint as a decimal STRING (JSON object
      // keys can't be integers); values are the iconify icon names.
      const mapObj: Record<string, string> = {};
      for (const [cp, name] of cpMap) mapObj[cp.toString(10)] = name;
      await writeFile(mapPath, JSON.stringify(mapObj), 'utf8');

      const scriptPath = path.resolve(
        import.meta.dir,
        '..',
        'python',
        'rename_glyphs.py'
      );
      const proc = Bun.spawn(
        [
          'uv',
          'run',
          '--no-project',
          '--with',
          'fonttools',
          'python3',
          scriptPath,
          inTtfPath,
          mapPath,
          outTtfPath,
        ],
        { stdout: 'pipe', stderr: 'pipe' }
      );
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        log.warn(
          `glyph-rename: subprocess exited ${exitCode} for "${manifest.prefix}" font ${family}: ${stderr.slice(0, 200)}`
        );
        // Soft-fail: keep the original TTF. Pipeline continues.
        out.set(family, ttf);
        continue;
      }
      const trimmedStdout = stdout.trim();
      // The script's last (or only) printed line is a JSON stats record.
      const lastLine = trimmedStdout.split('\n').pop() ?? '';
      try {
        const parsed = JSON.parse(lastLine) as GlyphRenameStats;
        aggregated.renamed += parsed.renamed ?? 0;
        aggregated.duplicated += parsed.duplicated ?? 0;
        aggregated.skipped += parsed.skipped ?? 0;
      } catch {
        // Best-effort: missing stats line shouldn't break the build.
      }

      out.set(family, Buffer.from(readFileSync(outTtfPath)));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  return { ttfs: out, stats: aggregated };
}

/**
 * Build a `{ codepoint → iconName }` map for one font family in the
 * manifest, distinguishing primary vs. Secondary by the `Secondary`
 * suffix convention (mirrors `font_builder.ts` + `font_verify.ts`).
 *
 * The names are the unsanitised Iconify icon names (not the Dart
 * identifier). They go into the TTF's post table, which is consumed by
 * font tooling — not by Dart codegen — so the original kebab-case is
 * the right value.
 */
function buildCodepointMapForFont(
  manifest: Manifest,
  family: string
): Map<number, string> {
  const isSecondary = family.endsWith('Secondary');
  const primaryFamily = isSecondary
    ? family.slice(0, -'Secondary'.length)
    : family;
  const map = new Map<number, string>();
  for (const [iconName, e] of Object.entries(manifest.icons)) {
    if (e.deprecated) continue;
    if (e.fontFamily !== primaryFamily) continue;
    if (isSecondary && !e.duotone) continue;
    map.set(e.codepoint, iconName);
  }
  return map;
}

let uvProbeCache: boolean | null = null;
async function probeUv(): Promise<boolean> {
  if (uvProbeCache !== null) return uvProbeCache;
  try {
    const proc = Bun.spawn(['uv', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exit = await proc.exited;
    uvProbeCache = exit === 0;
  } catch {
    uvProbeCache = false;
  }
  return uvProbeCache;
}
