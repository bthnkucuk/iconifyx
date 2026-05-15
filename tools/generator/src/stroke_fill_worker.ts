/**
 * Stroke-fill worker — invoked as a SUBPROCESS from `stroke_fill.ts`.
 *
 * Wraps the `oslllo-svg-fixer` call (which transitively pulls in `resvg`,
 * a native Rust crate). Some malformed SVG bodies — notably the
 * foreground halves of duotone-split emoji icons — make resvg panic in
 * `Option::unwrap()` and abort the process via SIGABRT. A native panic
 * can't be caught from JavaScript (try/catch only catches JS exceptions),
 * so without process isolation a single bad glyph crashes the entire
 * generator mid-run.
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
 *   0  — fix() completed (any per-icon failures inside the batch leave
 *        their output missing in `outDir`, but the process exited cleanly).
 *   1  — JS-level error thrown from `SVGFixer.fix()`.
 *   2  — usage error.
 *   abort signal / non-zero exit > 1 — native panic in resvg or similar.
 */

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error('usage: stroke_fill_worker.ts <inDir> <outDir>');
  process.exit(2);
}

// @ts-expect-error — oslllo-svg-fixer has no type definitions.
const mod = await import('oslllo-svg-fixer');
const SVGFixer =
  (mod as { default?: unknown }).default ??
  (mod as unknown);

try {
  // @ts-expect-error — untyped third-party constructor.
  await SVGFixer(inDir, outDir, { showProgressBar: false }).fix();
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
