/**
 * vtracer worker — invoked as a SUBPROCESS from `vtracer.ts`.
 *
 * Recovers paint-order-dropped icons (the foreground halves of 3+ colour
 * emoji bodies, multi-colour gradient logos, circle-flag silhouettes,
 * …) by rasterising the source SVG and re-tracing it with vtracer
 * (`@neplex/vectorizer`, MIT, prebuilt native binding around the
 * `visioncortex/vtracer` Rust crate).
 *
 * vtracer's `colorMode: 'color'` + `hierarchical: 'stacked'` mode emits
 * up to ~8 stacked colour layers from a raster source. We reduce those
 * layers to the top-2 by polygon area (largest area → background /
 * primary; second-largest → foreground / secondary) and emit them as
 * normalised `<path fill="currentColor"/>` fragments for the existing
 * duotone Primary + Secondary font pipeline. The remaining layers are
 * discarded — they're typically anti-alias artefacts or specular
 * highlights that would render as visual noise in a monochrome TTF.
 *
 * ## Why a subprocess
 *
 * Both `@resvg/resvg-js` (the rasteriser) and `@neplex/vectorizer`
 * (the tracer) wrap native Rust crates that can panic on malformed
 * inputs — same failure class as `oslllo-svg-fixer` (see
 * `stroke_fill_worker.ts`). A native panic is unrecoverable from JS:
 * `process.abort()` kills the whole runtime. Isolating the call in a
 * subprocess lets the parent observe a non-zero exit code, bisect the
 * input batch, and continue past the offending icon.
 *
 * ## CLI contract
 *
 *   bun run vtracer_worker.ts <inDir> <outDir>
 *
 * - `inDir`  : directory of input `.svg` files (each one a complete
 *              pipeline-wrapped SVG, e.g. the output of `iconToSvg`).
 * - `outDir` : directory the worker creates `<hash>.json` files in,
 *              one per successfully traced input. JSON shape:
 *
 *              { primary: "<g>...</g>", secondary: "<g>...</g>" }
 *
 *              The two strings are SVG-body fragments (no outer
 *              `<svg>` element) with all paints normalised to
 *              `currentColor`, ready to plug into the existing
 *              duotone Primary/Secondary build path.
 *
 * Exit codes:
 *   0  — every input either traced cleanly or got a structured
 *        "couldn't reduce to ≥2 layers" rejection in JSON.
 *   1  — JS-level error before the loop started.
 *   2  — usage error.
 *   abort signal / non-zero exit > 1 — native panic; parent bisects.
 *
 * @see ./vtracer.ts            (orchestrator + cache + bisect harness)
 * @see ./stroke_fill_worker.ts (the template for subprocess + panic isolation)
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import { vectorize } from '@neplex/vectorizer';
import { SVGPathData } from 'svg-pathdata';

// vtracer config enum values. The package declares them as `const enum`
// in its .d.ts which conflicts with `verbatimModuleSyntax` in this
// project's tsconfig (TS2748 — "cannot access ambient const enums").
// The runtime values are stable numeric literals; mirroring them here
// keeps the worker honest while sidestepping the const-enum issue.
// Confirmed against @neplex/vectorizer@0.0.5 (and these values are
// part of vtracer's stable public API since v0.6).
const ColorMode = { Color: 0, Binary: 1 } as const;
const Hierarchical = { Stacked: 0, Cutout: 1 } as const;
const PathSimplifyMode = { None: 0, Polygon: 1, Spline: 2 } as const;

// Rasterise to this width before tracing. Big enough that vtracer can
// recover small foreground letterforms (emoji facial features, flag
// emblems) but small enough to keep per-icon trace time under ~200 ms
// on M-series hardware. Empirically: 256 produces a clean trace for
// 24x24 / 36x36 emoji sources without blowing the runtime budget.
const TRACE_RESOLUTION = 256;

// Pinned vtracer config. Determinism + reproducibility require the
// same parameters everywhere; change here and ALL existing cache
// entries are invalidated (their hash key already includes the body
// only — see `vtracer.ts` for the rationale — but a parameter bump
// is a global cache flush).
const VTRACER_CONFIG = {
  colorMode: ColorMode.Color,
  hierarchical: Hierarchical.Stacked,
  filterSpeckle: 6,
  colorPrecision: 6,
  layerDifference: 24,
  mode: PathSimplifyMode.Spline,
  cornerThreshold: 60,
  lengthThreshold: 4.0,
  maxIterations: 10,
  spliceThreshold: 45,
};

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error('usage: vtracer_worker.ts <inDir> <outDir>');
  process.exit(2);
}

try {
  const entries = await readdir(inDir);
  for (const entry of entries) {
    if (!entry.endsWith('.svg')) continue;
    const inPath = path.join(inDir, entry);
    const outPath = path.join(outDir, entry.replace(/\.svg$/, '.json'));
    const svgText = await readFile(inPath, 'utf8');

    // Original viewBox is captured so the emitted body fragments live
    // in the same coordinate space as the source (the font builder
    // wraps fragments back into the original viewBox).
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

    // ───────────────────────────────────────────── rasterise
    const resvg = new Resvg(svgText, {
      fitTo: { mode: 'width', value: TRACE_RESOLUTION },
      background: 'rgba(0,0,0,0)',
    });
    const png = resvg.render().asPng();

    // ───────────────────────────────────────────── trace
    const tracedSvg: string = await vectorize(png, VTRACER_CONFIG);

    // Extract every `<path fill="…" d="…"/>` element vtracer emits.
    // The output uses absolute PNG-pixel coordinates; we'll rescale
    // back to the original viewBox below.
    const PATH_RE = /<path\b[^/>]*\/>/g;
    const FILL_RE = /\bfill\s*=\s*["']([^"']+)["']/;
    const D_RE = /\bd\s*=\s*["']([^"']+)["']/;
    type Layer = { fill: string; d: string; area: number };
    const layers: Layer[] = [];
    let m: RegExpExecArray | null;
    while ((m = PATH_RE.exec(tracedSvg)) !== null) {
      const el = m[0];
      const fillMatch = el.match(FILL_RE);
      const dMatch = el.match(D_RE);
      if (!fillMatch || !dMatch) continue;
      const fill = fillMatch[1]!.trim().toLowerCase();
      // vtracer also emits a background path when the source has any
      // transparency; that path uses the source's edge colour and tends
      // to dominate by area. We accept it as a layer like any other and
      // let the colour-merge step below collapse it with the largest
      // foreground colour if they're close. Pure white from a
      // transparent background is filtered via the colour-merge area
      // check (smaller area than primary → discarded).
      if (fill === 'none' || fill.startsWith('url(')) continue;
      const d = dMatch[1]!;
      const area = shoelaceAreaOfPath(d);
      layers.push({ fill, d, area });
    }

    if (layers.length === 0) {
      // No usable layers — caller treats this as a trace failure and
      // falls back to the paint-order drop.
      await writeFile(
        outPath,
        JSON.stringify({ ok: false, reason: 'no-layers' }),
        'utf8'
      );
      continue;
    }

    // Group by colour (vtracer emits one <path> per connected region,
    // not per colour — three pupils on a face get three <path> entries
    // all with the same fill). Summed area per colour drives the
    // background/foreground decision.
    const byColour = new Map<string, { area: number; ds: string[] }>();
    for (const l of layers) {
      const cur = byColour.get(l.fill);
      if (cur) {
        cur.area += l.area;
        cur.ds.push(l.d);
      } else {
        byColour.set(l.fill, { area: l.area, ds: [l.d] });
      }
    }
    const colourEntries = [...byColour.entries()].sort(
      (a, b) => b[1].area - a[1].area
    );

    if (colourEntries.length < 2) {
      // Only one colour survived; the icon is effectively monochrome.
      // Caller can still keep it as a solo icon if it wants, but we
      // signal "no duotone available" so it doesn't get force-merged.
      await writeFile(
        outPath,
        JSON.stringify({ ok: false, reason: 'monochrome' }),
        'utf8'
      );
      continue;
    }

    // The two largest-area colours: primary = background, secondary =
    // foreground. Remaining colours are folded into whichever bucket
    // (primary/secondary) they're closer to in RGB-Euclidean distance.
    // This recovers detail (a third-largest colour like dark facial
    // outline → fold into secondary if secondary is dark) without
    // emitting unrenderable extra layers.
    const [primaryColour, secondaryColour] = colourEntries.slice(0, 2);

    const primaryDs = [...primaryColour![1].ds];
    const secondaryDs = [...secondaryColour![1].ds];

    for (let i = 2; i < colourEntries.length; i++) {
      const [colour, info] = colourEntries[i]!;
      const dp = rgbDist(colour, primaryColour![0]);
      const ds = rgbDist(colour, secondaryColour![0]);
      // Closer to secondary → fold into secondary; otherwise primary.
      if (ds < dp) secondaryDs.push(...info.ds);
      else primaryDs.push(...info.ds);
    }

    // Rescale path coordinates from PNG pixels back to the source
    // viewBox so the resulting fragments fit alongside the existing
    // pipeline-emitted bodies. `tracedSvg` uses px coords up to
    // TRACE_RESOLUTION (and aspect-scaled height); we want them in
    // 0..originW × 0..originH.
    //
    // The PNG height isn't always exactly TRACE_RESOLUTION (resvg
    // preserves aspect ratio), but `originH/originW === pngH/pngW` by
    // construction so a single scale factor suffices.
    const scale = originW / TRACE_RESOLUTION;
    const primaryD = primaryDs.map((d) => scalePath(d, scale)).join(' ');
    const secondaryD = secondaryDs.map((d) => scalePath(d, scale)).join(' ');

    // Wrap each colour group in a single `<path fill="currentColor"
    // d="..."/>` so the downstream svgicons2svgfont stream parses them
    // as one outline per layer. The same wrapping the existing
    // `trySplitTwoColorBody` produces, so the rest of the pipeline
    // treats vtracer-recovered icons identically to two-colour
    // splits — and the per-pack `Secondary` font merge step picks the
    // secondary fragment up via the same code path.
    const primaryBody = `<path fill="currentColor" d="${primaryD}"/>`;
    const secondaryBody = `<path fill="currentColor" d="${secondaryD}"/>`;

    await writeFile(
      outPath,
      JSON.stringify({
        ok: true,
        primary: primaryBody,
        secondary: secondaryBody,
      }),
      'utf8'
    );
  }
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('vtracer-worker-error:', msg.slice(0, 200));
  process.exit(1);
}

/**
 * Euclidean RGB distance between two `#rrggbb` / `#rgb` colours. Used
 * to fold vtracer's extra layers into either the primary or secondary
 * bucket. Falls back to a large distance for anything we can't parse
 * (named colours, rgba()) — that pushes the layer into the primary
 * bucket, which is safer than dropping it.
 */
function rgbDist(a: string, b: string): number {
  const ra = parseRgb(a);
  const rb = parseRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  const dr = ra[0] - rb[0];
  const dg = ra[1] - rb[1];
  const db = ra[2] - rb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function parseRgb(s: string): [number, number, number] | null {
  const v = s.trim().toLowerCase();
  const m6 = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (m6) {
    return [parseInt(m6[1]!, 16), parseInt(m6[2]!, 16), parseInt(m6[3]!, 16)];
  }
  const m3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m3) {
    return [
      parseInt(m3[1]! + m3[1]!, 16),
      parseInt(m3[2]! + m3[2]!, 16),
      parseInt(m3[3]! + m3[3]!, 16),
    ];
  }
  return null;
}

/**
 * Scale every numeric coordinate in an SVG `d` attribute by `factor`.
 * Treats numbers in isolation — operates on the raw path string
 * because SVGPathData round-tripping inflates spline output by ~30 %
 * (every implicit curve continuation becomes explicit), and we're
 * already operating on vtracer's clean output where the path commands
 * are well-formed.
 *
 * Affine multiplication is correct for relative AND absolute commands
 * since vtracer emits absolutes by default for `PathSimplifyMode.Spline`
 * — multiplying both endpoints and control points by the same factor
 * gives the geometrically scaled path.
 */
function scalePath(d: string, factor: number): string {
  return d.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, (n) => {
    const v = parseFloat(n) * factor;
    // Cap precision so the path doesn't bloat past the source SVG's
    // typical 1-2 decimal places.
    return Number(v.toFixed(3)).toString();
  });
}

/**
 * Shoelace polygon area of an SVG `d` attribute. Inlined here because
 * the formerly-exported version in `svg_preprocess.ts` got refactored
 * out by a parallel agent — re-importing would couple the worker to a
 * file likely to move again. The math is the standard signed-area
 * accumulator with curves flattened to their endpoints (~5% error in
 * pathological cases, comfortably within the "is colour A bigger than
 * colour B?" tolerance the caller actually needs).
 *
 * Returns 0 for unparseable inputs so a bad path can't poison the
 * by-area sort.
 */
function shoelaceAreaOfPath(d: string): number {
  let cmds;
  try {
    cmds = new SVGPathData(d).toAbs().commands;
  } catch {
    return 0;
  }
  if (cmds.length === 0) return 0;

  let total = 0;
  let curX = 0,
    curY = 0;
  let startX = 0,
    startY = 0;
  let subSum = 0;
  let inSubpath = false;

  const flushSubpath = (): void => {
    if (inSubpath) total += Math.abs(subSum) / 2;
    subSum = 0;
    inSubpath = false;
  };

  for (const c of cmds) {
    switch (c.type) {
      case SVGPathData.MOVE_TO: {
        flushSubpath();
        curX = c.x;
        curY = c.y;
        startX = curX;
        startY = curY;
        inSubpath = true;
        break;
      }
      case SVGPathData.LINE_TO:
      case SVGPathData.CURVE_TO:
      case SVGPathData.SMOOTH_CURVE_TO:
      case SVGPathData.QUAD_TO:
      case SVGPathData.SMOOTH_QUAD_TO:
      case SVGPathData.ARC: {
        const cAny = c as { x: number; y: number };
        subSum += curX * cAny.y - cAny.x * curY;
        curX = cAny.x;
        curY = cAny.y;
        break;
      }
      case SVGPathData.HORIZ_LINE_TO: {
        const cAny = c as { x: number };
        subSum += curX * curY - cAny.x * curY;
        curX = cAny.x;
        break;
      }
      case SVGPathData.VERT_LINE_TO: {
        const cAny = c as { y: number };
        subSum += curX * cAny.y - curX * curY;
        curY = cAny.y;
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        subSum += curX * startY - startX * curY;
        flushSubpath();
        curX = startX;
        curY = startY;
        break;
      }
    }
  }
  if (inSubpath) {
    subSum += curX * startY - startX * curY;
    flushSubpath();
  }
  return total;
}
