/**
 * Stroke-fill worker — invoked as a SUBPROCESS from `stroke_fill.ts`.
 *
 * Replicates what `oslllo-svg-fixer` does internally (resize → rasterize via
 * `oslllo-svg2`/resvg → trace via `oslllo-potrace`) but SKIPS the fixer's
 * `checkFillState` step, which forces the first <path> element's fill to
 * black. That step is fine for flat single-path icons, but for any icon
 * that uses `<defs><mask>...</mask></defs>` and a masked consumer rect
 * (Solar bold variants, icon-park-twotone, icon-park-solid, line-md,
 * pepicons-pop, pepicons-pencil, lets-icons duotones, …), the FIRST <path>
 * lives INSIDE the mask. Forcing its fill from `#fff` to `#000` inside the
 * mask makes that path invisible, so the icon's main body silently
 * disappears — accumulator-bold shipped as just two top tabs and a missing
 * battery body for this reason.
 *
 * resvg itself handles `<mask>` correctly; only the pre-rasterize tampering
 * breaks it.
 *
 * `oslllo-svg-fixer` transitively depends on `resvg`, a native Rust crate.
 * Some malformed SVG bodies — the foreground halves of certain duotone-
 * split emoji glyphs in particular — make resvg panic in `geom.rs` with
 * `called Option::unwrap() on a None value`, which abort()s the process
 * via SIGABRT. A native panic is unrecoverable from JavaScript: a normal
 * try/catch only catches JS exceptions, so without isolation a single bad
 * icon kills the entire generator run mid-flight.
 *
 * Isolating the call here means a panic only kills the worker subprocess;
 * the parent (`stroke_fill.ts`) sees a non-zero exit code, bisects the
 * input batch to locate the bad icon, and continues with the rest.
 *
 * CLI: `bun run stroke_fill_worker.ts <inDir> <outDir>`
 *   - `inDir` contains one `.svg` per icon (already wrapped in the
 *     pipeline's standard outer `<svg>`).
 *   - `outDir` is created/managed by the parent; the worker writes one
 *     `.svg` per successfully-traced icon, same filename as the input.
 *
 * Exit codes:
 *   0  — every input traced successfully (or per-icon failures left no
 *        output but the process exited cleanly).
 *   1  — JS-level error thrown before processing began.
 *   2  — usage error.
 *   abort signal / non-zero exit > 1 — native panic in resvg or similar.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRACE_RESOLUTION = 600;

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error('usage: stroke_fill_worker.ts <inDir> <outDir>');
  process.exit(2);
}

// Both libraries are CommonJS; load via dynamic import. Type defs aren't
// shipped — we treat the returned values as `any`.
// @ts-expect-error untyped third-party
const Svg2 = (await import('oslllo-svg2')).default;
// @ts-expect-error untyped third-party
const Potrace = (await import('oslllo-potrace')).default;

try {
  const entries = await readdir(inDir);
  for (const entry of entries) {
    if (!entry.endsWith('.svg')) continue;
    const inPath = path.join(inDir, entry);
    const outPath = path.join(outDir, entry);
    const svgText = await readFile(inPath, 'utf8');

    // Original dimensions from the input SVG. Falls back to 24x24 if the
    // viewBox can't be parsed (defensive — every pipeline-emitted SVG has
    // an explicit viewBox).
    const vbMatch = svgText.match(/viewBox=["']([^"']+)["']/);
    let originW = 24;
    let originH = 24;
    if (vbMatch) {
      const parts = vbMatch[1]!.trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        originW = parts[2]!;
        originH = parts[3]!;
      }
    }

    // Resize to trace resolution. Preserve aspect ratio.
    const aspect = originH / originW;
    const traceW = TRACE_RESOLUTION;
    const traceH = Math.round(traceW * aspect);

    // Rasterize to PNG. `transparent: false` paints the background white so
    // Potrace's black-on-white tracing has a clean signal even when the
    // SVG uses transparent paints internally.
    const resized = Svg2(svgText).svg.resize({ width: traceW, height: traceH }).toElement();
    const pngBuffer = await Svg2(resized.outerHTML)
      .png({ transparent: false })
      .toBuffer();

    // Trace. `svgSize` scales Potrace's output coordinates back to the
    // original viewBox dimensions (Potrace counts in PNG pixels; we want
    // path coords in the source 0..24 / 0..32 / etc. range).
    const scale = originW / traceW;
    const traced: string = await Potrace(pngBuffer, { svgSize: scale }).trace();

    // Restore the original viewBox so the traced SVG slots back into the
    // pipeline at the right dimensions. oslllo-potrace emits its own
    // outer <svg> with width/height + an implicit viewBox at PNG-pixel
    // scale; we patch it to match the original.
    const finalSvg = traced.replace(
      /<svg\b[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${originW} ${originH}">`
    );

    await writeFile(outPath, finalSvg, 'utf8');
  }
  process.exit(0);
} catch (err) {
  // Surface the error message but keep it short — the parent doesn't
  // forward worker stderr by default unless we configure it.
  const msg = err instanceof Error ? err.message : String(err);
  console.error('fixer-error:', msg.slice(0, 200));
  process.exit(1);
}
// Native Rust panics abort the process before we get here; parent observes
// a non-zero exit code / signal and falls back to bisect.
