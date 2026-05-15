import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { log } from './log.ts';
import type { Manifest } from './manifest.ts';

/**
 * Merge auto-split sibling TTFs into a single TTF using cmap format 12
 * (32-bit Unicode, supports Supplementary Private Use Area U+F0000+).
 *
 * Wraps `tools/generator/python/merge_fonts.py` via a `uv run` subprocess.
 * The Python script does the actual font surgery; this TS layer manages
 * the IO + subprocess + result parsing.
 *
 * Why this exists: see RESEARCH_PLAN.md §32. svgicons2svgfont is BMP-only,
 * so packs > 6000 icons get auto-split into multiple sibling TTFs (Mdi,
 * Mdi_2, Mdi_3, ...). Each sibling reuses the same BMP PUA range
 * 0xE000-0xF8FF. Flutter's `--tree-shake-icons` shrinks only the sibling
 * containing a referenced codepoint; the rest ship full-size. Merging all
 * siblings into one TTF with cmap format 12 eliminates the sibling tax.
 *
 * ## Codepoint policy
 *
 * - **First sibling** (e.g. Mdi.ttf): its BMP codepoints stay verbatim.
 *   This preserves CLAUDE.md §3 codepoint stability for ALL icons in the
 *   first sibling.
 * - **Subsequent siblings** (Mdi_2.ttf, Mdi_3.ttf): their codepoints get
 *   remapped sequentially into supp PUA starting at `suppStart`
 *   (default U+F0000). Each ex-sibling icon gets a NEW codepoint.
 *   Identifier (e.g. `MdiIcons.account`) is unchanged for consumers.
 *
 * The remap is returned so the caller can update the manifest.
 */

const PYTHON_DIR = path.resolve(import.meta.dir, '..', 'python');
const MERGE_SCRIPT = path.join(PYTHON_DIR, 'merge_fonts.py');
const PYTHON_VENV_BIN = path.join(PYTHON_DIR, '.venv', 'bin', 'python');

export interface FontMergeInput {
  /**
   * Sibling TTF buffers in stable order. The first entry is the BASE —
   * its codepoints don't move. Subsequent entries get remapped to supp
   * PUA in the order given.
   */
  siblings: Array<{
    /** Logical font-family name (e.g. "Mdi", "Mdi_2", "Mdi_3"). */
    family: string;
    /** Raw TTF bytes. */
    ttf: Buffer;
  }>;
  /**
   * Canonical family name to enforce in the merged TTF's `name` table
   * (e.g. "Mdi" — drops the `_2` / `_3` suffixes).
   */
  canonicalFamily: string;
  /**
   * First supp-PUA codepoint to allocate from. Defaults to 0xF0000.
   * Must be in the supplementary plane (>= 0x10000) and within
   * 0xF0000-0x10FFFF (Supplementary PUA range A or B).
   */
  suppStart?: number;
}

export interface FontMergeResult {
  /** The merged TTF as a Buffer. */
  ttf: Buffer;
  /**
   * Codepoint remap: { siblingFamily -> Map<oldCodepoint, newCodepoint> }.
   * The first sibling is NOT in the result (its codepoints don't move).
   */
  remap: Map<string, Map<number, number>>;
}

/**
 * Merge a stack of sibling TTFs into one. Returns the merged TTF + the
 * codepoint remap for each non-base sibling.
 *
 * If `siblings.length === 1`, returns the input unchanged (no merge
 * needed; the caller should just keep the single TTF as-is).
 */
export async function mergeFonts(
  input: FontMergeInput
): Promise<FontMergeResult> {
  const { siblings, canonicalFamily, suppStart = 0xf0000 } = input;

  if (siblings.length === 0) {
    throw new Error('mergeFonts called with no siblings');
  }
  if (siblings.length === 1) {
    return { ttf: siblings[0]!.ttf, remap: new Map() };
  }

  if (!existsSync(MERGE_SCRIPT)) {
    throw new Error(`merge_fonts.py missing at ${MERGE_SCRIPT}`);
  }
  if (!existsSync(PYTHON_VENV_BIN)) {
    throw new Error(
      `Python venv not initialised at ${PYTHON_VENV_BIN}. Run: cd tools/generator/python && uv venv && uv pip install fonttools`
    );
  }

  const work = await mkdtemp(path.join(tmpdir(), `iconifyx-merge-`));

  try {
    // Write inputs to disk so the Python script can read them.
    // File name = canonical family stem to make the remap keys readable.
    const inputPaths: string[] = [];
    for (const s of siblings) {
      const filePath = path.join(work, `${s.family}.ttf`);
      await writeFile(filePath, s.ttf);
      inputPaths.push(filePath);
    }

    const outputPath = path.join(work, 'merged.ttf');
    const remapPath = path.join(work, 'remap.json');

    const args = [
      'run',
      '--no-project', // we run from this dir's pyproject manually
      '--with',
      'fonttools',
      MERGE_SCRIPT,
      '--inputs',
      inputPaths.join(':'),
      '--output',
      outputPath,
      '--remap-output',
      remapPath,
      '--family-name',
      canonicalFamily,
      '--supp-start',
      `0x${suppStart.toString(16)}`,
    ];

    const proc = Bun.spawn(['uv', ...args], {
      cwd: PYTHON_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderrText = await new Response(proc.stderr).text();
    const stdoutText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(
        `merge_fonts.py failed (exit=${exitCode}):\n${stderrText.slice(0, 800)}${stdoutText ? `\n--- stdout ---\n${stdoutText.slice(0, 200)}` : ''}`
      );
    }

    const mergedTtf = await readFile(outputPath);
    const remapJson = JSON.parse(await readFile(remapPath, 'utf8')) as Record<
      string,
      Record<string, string>
    >;

    const remap = new Map<string, Map<number, number>>();
    for (const [siblingFamily, perSibling] of Object.entries(remapJson)) {
      const m = new Map<number, number>();
      for (const [oldHex, newHex] of Object.entries(perSibling)) {
        m.set(parseInt(oldHex, 16), parseInt(newHex, 16));
      }
      remap.set(siblingFamily, m);
    }

    log.info(
      `  merged ${siblings.length} fonts -> "${canonicalFamily}.ttf" (${mergedTtf.length} bytes; ${[...remap.values()].reduce((n, m) => n + m.size, 0)} codepoints remapped)`
    );

    return { ttf: mergedTtf, remap };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Group `manifest.fonts` entries by their base family name. A base
 * family is the one without a `_N` suffix; siblings are `<base>_2`,
 * `<base>_3`, etc. Duotone Secondary fonts get grouped separately
 * (`<base>Secondary`, `<base>Secondary_2`, …).
 *
 * Returns `Map<baseFamily, orderedSiblingFamilies>`. Groups of size 1
 * (single-TTF packs and bases with no siblings) are still included —
 * the caller skips them for merge but uses the grouping for manifest
 * cleanup.
 */
function groupSiblingFamilies(
  fontFamilies: readonly string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  // Sort so base comes first then _2, _3, ...
  const sorted = [...fontFamilies].sort((a, b) => {
    const baseA = a.replace(/_\d+$/, '');
    const baseB = b.replace(/_\d+$/, '');
    if (baseA !== baseB) return baseA.localeCompare(baseB);
    const numA = a.match(/_(\d+)$/);
    const numB = b.match(/_(\d+)$/);
    return (numA ? parseInt(numA[1]!) : 1) - (numB ? parseInt(numB[1]!) : 1);
  });
  for (const family of sorted) {
    const base = family.replace(/_\d+$/, '');
    const arr = groups.get(base);
    if (arr) arr.push(family);
    else groups.set(base, [family]);
  }
  return groups;
}

export interface MergeSiblingsResult {
  /**
   * TTF buffers AFTER merge: sibling families (Mdi_2, Mdi_3, …) are
   * removed; their merged content lives under the base family (Mdi).
   * Single-TTF packs are passed through unchanged.
   */
  ttfs: Map<string, Buffer>;
  /** Number of multi-sibling groups that got merged. */
  groupsMerged: number;
  /**
   * Per-sibling codepoint remap, accumulated across all groups.
   * Key = sibling family (e.g. "Mdi_2"); value = oldCp → newCp.
   */
  remap: Map<string, Map<number, number>>;
}

/**
 * Detect multi-sibling font groups in the manifest (e.g. Mdi + Mdi_2 +
 * Mdi_3), merge each group into a single TTF via `mergeFonts()`, and
 * MUTATE the manifest to reflect the collapse:
 *
 *  - Every icon whose `fontFamily` was a non-base sibling (`Mdi_2`,
 *    `Mdi_3`, …) gets:
 *      - `fontFamily` updated to the base family name (`Mdi`)
 *      - `codepoint` remapped to its new supp-PUA codepoint
 *      - `tier` set to `'supp'`
 *  - Every icon whose `fontFamily` was already the base family stays
 *    at the same codepoint, gains `tier: 'bmp'`.
 *  - `manifest.fonts` is collapsed: per-group, only the base entry is
 *    retained; its `iconCount` is the sum of all siblings' live counts.
 *
 * Returns the new TTF map (sibling buffers removed, base entries
 * carrying the merged TTF).
 *
 * Idempotent + safe: a manifest with no multi-sibling groups passes
 * through with `groupsMerged: 0` and the ttfs map untouched.
 */
export async function mergeSiblingsInManifest(
  manifest: Manifest,
  ttfs: Map<string, Buffer>
): Promise<MergeSiblingsResult> {
  const groups = groupSiblingFamilies(manifest.fonts.map((f) => f.family));

  const newTtfs = new Map(ttfs);
  const accumulatedRemap = new Map<string, Map<number, number>>();
  let groupsMerged = 0;

  // Track which sibling -> base mapping each group establishes so we can
  // walk icons after all merges complete.
  const siblingToBase = new Map<string, string>(); // 'Mdi_2' -> 'Mdi'
  const baseSet = new Set<string>(); // {'Mdi', 'MdiSecondary', ...}

  for (const [base, siblings] of groups) {
    for (const sib of siblings) siblingToBase.set(sib, base);
    baseSet.add(base);

    if (siblings.length === 1) continue; // single-TTF group, no merge

    const orderedBuffers: Array<{ family: string; ttf: Buffer }> = [];
    for (const family of siblings) {
      const buf = ttfs.get(family);
      if (!buf) {
        // buildFonts didn't emit this family (it was empty-pruned). Skip.
        continue;
      }
      orderedBuffers.push({ family, ttf: buf });
    }
    if (orderedBuffers.length < 2) continue;

    log.info(
      `  "${manifest.prefix}": merging ${orderedBuffers.length} sibling fonts -> "${base}.ttf"`
    );
    const { ttf: mergedTtf, remap } = await mergeFonts({
      siblings: orderedBuffers,
      canonicalFamily: base,
    });

    // Replace base buffer with merged; drop siblings.
    newTtfs.set(base, mergedTtf);
    for (const { family } of orderedBuffers) {
      if (family !== base) newTtfs.delete(family);
    }
    for (const [siblingFamily, m] of remap) {
      accumulatedRemap.set(siblingFamily, m);
    }
    groupsMerged++;
  }

  if (groupsMerged === 0) {
    return { ttfs: newTtfs, groupsMerged: 0, remap: accumulatedRemap };
  }

  // Manifest mutation: walk icons + collapse fonts list.
  for (const [, entry] of Object.entries(manifest.icons)) {
    const base = siblingToBase.get(entry.fontFamily);
    if (base === undefined) continue; // family not in our group map (shouldn't happen)
    if (base === entry.fontFamily) {
      // Icon already in base; mark BMP tier if not already.
      if (entry.tier === undefined) entry.tier = 'bmp';
      continue;
    }
    // Icon in a sibling — remap.
    const perSibling = accumulatedRemap.get(entry.fontFamily);
    if (perSibling) {
      const newCp = perSibling.get(entry.codepoint);
      if (newCp !== undefined) {
        entry.codepoint = newCp;
      }
    }
    entry.fontFamily = base;
    entry.tier = 'supp';
  }

  // Rebuild manifest.fonts: keep ONE entry per base, with total live count.
  const newFonts: typeof manifest.fonts = [];
  for (const base of baseSet) {
    let iconCount = 0;
    for (const e of Object.values(manifest.icons)) {
      if (e.deprecated) continue;
      if (e.fontFamily !== base) continue;
      // Duotone secondary mirroring is handled by the Secondary base
      // entry separately; the primary entry counts only primary icons.
      const isSecondary = base.endsWith('Secondary');
      if (isSecondary && !e.duotone) continue;
      iconCount++;
    }
    if (iconCount === 0) continue;
    // Preserve any nextCodepoint cursor from the original base entry
    // (might be useful for future allocations even after merge).
    const oldBase = manifest.fonts.find((f) => f.family === base);
    newFonts.push({
      family: base,
      nextCodepoint: oldBase?.nextCodepoint ?? 0xe000,
      iconCount,
    });
  }
  manifest.fonts = newFonts;

  return { ttfs: newTtfs, groupsMerged, remap: accumulatedRemap };
}

/**
 * Ensure the Python venv for the merge tool exists. Called once at
 * generator startup. If missing, runs `uv venv && uv pip install
 * fonttools` to materialise it. Idempotent — exits early if already
 * present.
 */
export async function ensurePythonVenv(): Promise<void> {
  if (existsSync(PYTHON_VENV_BIN)) return;

  log.info('  setting up Python venv for font merge (one-time)...');

  await mkdir(PYTHON_DIR, { recursive: true });

  const venvProc = Bun.spawn(['uv', 'venv'], {
    cwd: PYTHON_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const venvErr = await new Response(venvProc.stderr).text();
  if ((await venvProc.exited) !== 0) {
    throw new Error(`uv venv failed: ${venvErr.slice(0, 400)}`);
  }

  const installProc = Bun.spawn(['uv', 'pip', 'install', 'fonttools'], {
    cwd: PYTHON_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const installErr = await new Response(installProc.stderr).text();
  if ((await installProc.exited) !== 0) {
    throw new Error(`uv pip install fonttools failed: ${installErr.slice(0, 400)}`);
  }

  log.info('  Python venv ready.');
}
