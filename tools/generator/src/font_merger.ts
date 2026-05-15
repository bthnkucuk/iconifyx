import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { log } from './log.ts';

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
