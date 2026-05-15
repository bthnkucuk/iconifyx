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
  /**
   * Optional explicit codepoint remap, shape
   * `Map<siblingFamily, Map<origCp, newCp>>`. Glyphs in a sibling get
   * their codepoint from this map when one is given; unmapped glyphs
   * fall back to sequential supp-PUA allocation.
   *
   * Used for secondary (duotone) merges: a duotone icon's primary and
   * secondary glyphs must share a codepoint, so the secondary merge
   * reuses the primary merge's remap to keep them aligned.
   */
  explicitRemap?: Map<string, Map<number, number>>;
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
  const {
    siblings,
    canonicalFamily,
    suppStart = 0xf0000,
    explicitRemap,
  } = input;

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

    // Optional explicit codepoint remap — serialise to a temp JSON the
    // Python script consumes via `--remap-input`. Used by the secondary
    // (duotone) merge pass so secondary glyphs land at the same codepoints
    // as their primaries.
    if (explicitRemap !== undefined && explicitRemap.size > 0) {
      const remapInputPath = path.join(work, 'remap-input.json');
      const obj: Record<string, Record<string, string>> = {};
      for (const [siblingFamily, m] of explicitRemap) {
        const inner: Record<string, string> = {};
        for (const [origCp, newCp] of m) {
          inner[`0x${origCp.toString(16)}`] = `0x${newCp.toString(16)}`;
        }
        obj[siblingFamily] = inner;
      }
      await writeFile(remapInputPath, JSON.stringify(obj, null, 2), 'utf8');
      args.push('--remap-input', remapInputPath);
    }

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
 * Strip the `_N` auto-split suffix from a font family name to yield its
 * base family.
 *
 * - `Mdi`               → `Mdi`
 * - `Mdi_2` / `Mdi_3`   → `Mdi`
 * - `MdiSecondary`      → `MdiSecondary`
 * - `Mdi_2Secondary` / `Mdi_3Secondary` → `MdiSecondary`
 *
 * The auto-split suffix can land in the MIDDLE of a family name when
 * the pack is duotone (`buildFonts` emits `<primary>Secondary`, so
 * sibling N's secondary is `<primary>_N` + `Secondary`).
 */
function baseFamilyOf(family: string): string {
  return family.replace(/_\d+(?=Secondary$|$)/, '');
}

/** Extract the numeric sibling index, or 1 for the base family. */
function siblingIndexOf(family: string): number {
  const m = family.match(/_(\d+)(?:Secondary)?$/);
  return m ? parseInt(m[1]!, 10) : 1;
}

/**
 * Group `manifest.fonts` entries by their base family name. A base
 * family is the one without a `_N` suffix; siblings are `<base>_2`,
 * `<base>_3`, etc. Duotone Secondary fonts get grouped separately
 * (`<base>Secondary`, `<base>_2Secondary`, …).
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
    const baseA = baseFamilyOf(a);
    const baseB = baseFamilyOf(b);
    if (baseA !== baseB) return baseA.localeCompare(baseB);
    return siblingIndexOf(a) - siblingIndexOf(b);
  });
  for (const family of sorted) {
    const base = baseFamilyOf(family);
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

  // Separate primary groups from secondary groups. Primaries are merged
  // FIRST so the secondary merge can reuse the primary's codepoint remap
  // (duotone primary + secondary glyphs share a codepoint).
  const primaryGroups: Array<[string, string[]]> = [];
  const secondaryGroups: Array<[string, string[]]> = [];
  for (const [base, siblings] of groups) {
    if (base.endsWith('Secondary')) secondaryGroups.push([base, siblings]);
    else primaryGroups.push([base, siblings]);
  }

  // Helper that runs a single merge pass over one group and updates
  // bookkeeping (ttfs, accumulatedRemap, siblingToBase, baseSet).
  const mergeOneGroup = async (
    base: string,
    siblings: string[],
    explicit?: Map<string, Map<number, number>>
  ): Promise<void> => {
    for (const sib of siblings) siblingToBase.set(sib, base);
    baseSet.add(base);

    if (siblings.length === 1) return; // single-TTF group, no merge

    const orderedBuffers: Array<{ family: string; ttf: Buffer }> = [];
    for (const family of siblings) {
      const buf = ttfs.get(family);
      if (!buf) continue; // buildFonts didn't emit this family (empty-pruned)
      orderedBuffers.push({ family, ttf: buf });
    }
    if (orderedBuffers.length < 2) return;

    log.info(
      `  "${manifest.prefix}": merging ${orderedBuffers.length} sibling fonts -> "${base}.ttf"`
    );
    const { ttf: mergedTtf, remap } = await mergeFonts({
      siblings: orderedBuffers,
      canonicalFamily: base,
      explicitRemap: explicit,
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
  };

  // Pass 1: merge primary groups.
  for (const [base, siblings] of primaryGroups) {
    await mergeOneGroup(base, siblings);
  }

  // Pass 2: merge secondary groups. For each secondary group, build an
  // explicit remap from the corresponding primary's remap so duotone
  // primary/secondary glyphs land at matching codepoints.
  //
  // Mapping: secondary sibling `<P>_NSecondary` ↔ primary sibling `<P>_N`.
  for (const [secBase, secSiblings] of secondaryGroups) {
    // Determine the primary base by stripping the `Secondary` suffix.
    const primaryBase = secBase.slice(0, -'Secondary'.length);
    // Construct an explicit remap keyed by SECONDARY sibling stem names.
    // For each secondary sibling `<P>_NSecondary`, look up the primary
    // sibling `<P>_N`'s remap and reuse its codepoint mapping verbatim.
    const explicit = new Map<string, Map<number, number>>();
    for (const secSib of secSiblings) {
      if (secSib === secBase) continue; // base secondary — no remap input
      const idx = siblingIndexOf(secSib); // 2, 3, ...
      const primarySib = `${primaryBase}_${idx}`;
      const primaryRemap = accumulatedRemap.get(primarySib);
      if (primaryRemap) explicit.set(secSib, primaryRemap);
    }
    await mergeOneGroup(secBase, secSiblings, explicit);
  }

  if (groupsMerged === 0) {
    return { ttfs: newTtfs, groupsMerged: 0, remap: accumulatedRemap };
  }

  // Manifest mutation: walk icons + collapse fonts list.
  //
  // Important: `manifest.icons[i].fontFamily` always names the PRIMARY
  // sibling (e.g. `Mdi_2`) — the secondary side of a duotone is implicit
  // (synthesised at codegen time via `secondaryFontFamily(primary)`).
  // So we only need to walk primary families here; the manifest does
  // not store secondary fontFamily values.
  for (const [, entry] of Object.entries(manifest.icons)) {
    const base = siblingToBase.get(entry.fontFamily);
    if (base === undefined) continue; // family not in our group map
    if (base === entry.fontFamily) {
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
  //
  // `ManifestIconEntry.fontFamily` always names the PRIMARY family — the
  // secondary side of a duotone is implicit (synthesised at codegen +
  // runtime as `<primary>Secondary`). So a Secondary base entry's
  // iconCount = number of duotone icons whose primary lives in the
  // matching primary base, NOT a direct fontFamily match (no icon entry
  // has `fontFamily: 'SolarSecondary'`).
  const newFonts: typeof manifest.fonts = [];
  for (const base of baseSet) {
    const isSecondary = base.endsWith('Secondary');
    const primaryBase = isSecondary ? base.slice(0, -'Secondary'.length) : base;
    let iconCount = 0;
    for (const e of Object.values(manifest.icons)) {
      if (e.deprecated) continue;
      if (e.fontFamily !== primaryBase) continue;
      if (isSecondary && !e.duotone) continue;
      iconCount++;
    }
    if (iconCount === 0) continue;
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
 * Force canonical 1000-em-quad font metrics on a batch of TTF byte
 * buffers (head/hhea/OS-2 set to the standard reference frame).
 *
 * Each TTF gets written to a temp file, processed by the Python
 * `canonicalize_ttf.py` helper, then re-read into memory. The returned
 * map preserves the input keys but holds the canonicalised bytes.
 *
 * Why this is critical: `svg2ttf` recomputes head/hhea/OS-2 from the
 * union of glyph extents, so every emitted TTF has subtly different
 * baseline / em-extent assumptions. Flutter's `TextPainter` reads
 * those tables for line-height + glyph paint origin — so primary +
 * secondary duotone TTFs end up in mismatched reference frames and
 * the layers visibly slide apart at render time.
 *
 * After this pass every TTF Flutter sees uses the IDENTICAL 1000-unit
 * em-quad (ascent=1000, descent=0, x/y bounds 0..1000), guaranteeing
 * primary + secondary layers in `IconifyIcon`'s `CustomPaint` overlay
 * pixel-for-pixel co-aligned by construction. See
 * `GLYPH_METRICS_AUDIT.md` for the pre-fix non-canonical-metric
 * baseline (294/295 TTFs drifted).
 */
export async function canonicalizeTtfs(
  ttfs: Map<string, Buffer>
): Promise<Map<string, Buffer>> {
  if (ttfs.size === 0) return ttfs;
  if (!existsSync(PYTHON_VENV_BIN)) return ttfs; // skip if venv missing

  const work = await mkdtemp(path.join(tmpdir(), `iconifyx-canon-`));
  const result = new Map<string, Buffer>();
  try {
    // Write all input TTFs first, then run one Python process to
    // process them all (amortises the ~200ms uv-spawn cost).
    const paths: string[] = [];
    for (const [family, buf] of ttfs) {
      const p = path.join(work, `${family}.ttf`);
      await writeFile(p, buf);
      paths.push(p);
    }
    const proc = Bun.spawn(
      [
        'uv',
        'run',
        '--no-project',
        '--with',
        'fonttools',
        path.join(PYTHON_DIR, 'canonicalize_ttf.py'),
        ...paths,
      ],
      {
        cwd: PYTHON_DIR,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      log.warn(
        `canonicalize_ttf.py exited ${exitCode}: ${stderrText.slice(0, 200)}`
      );
      return ttfs; // best effort — return original if canonicalisation failed
    }
    // Read back the canonicalised bytes.
    for (const [family, _buf] of ttfs) {
      const p = path.join(work, `${family}.ttf`);
      const bytes = await readFile(p);
      result.set(family, bytes);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return result;
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
