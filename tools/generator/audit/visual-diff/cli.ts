#!/usr/bin/env bun
/**
 * `visual-diff` — single-icon (pack, name) visual comparator.
 *
 * Produces a side-by-side comparison of FOUR rasters for any iconifyx
 * icon and surfaces alignment / dedup / paint regressions in seconds:
 *
 *   1. Upstream Iconify SVG, rasterised via resvg            -> upstream.png
 *   2. TTF primary glyph, rasterised via fontTools + Pillow  -> glyph-primary.png
 *   3. TTF secondary glyph (if duotone), same path           -> glyph-secondary.png
 *   4. Flutter-rendered composition via the existing
 *      `render-icon` harness (Approach A — flutter_test in a
 *      headless isolate)                                     -> flutter-rendered.png
 *
 * Then pixel-diffs upstream vs flutter-rendered (the "what consumers see")
 * and writes a `report.json` + per-icon `REPORT.md` containing classifier
 * verdicts (rules adapted from RESEARCH_PLAN §26).
 *
 * Output layout:
 *   docs/audit/visual-diff/<prefix>__<name>/
 *     upstream.svg
 *     upstream.png
 *     glyph-primary.png
 *     glyph-primary.bbox.json
 *     glyph-secondary.png     (optional)
 *     glyph-secondary.bbox.json
 *     flutter-rendered.png
 *     diff-pixelmatch.png
 *     report.json
 *     REPORT.md
 *
 * Usage:
 *   bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone
 *   bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --size 256
 *   bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone --skip-flutter
 *
 * Constraints:
 *   - Phase 1: one icon at a time. Phase 2 (corpus mode) is out of scope.
 *   - Reuses the `tools/generator/audit/render/` harness — no new Flutter app.
 *   - Reuses the existing python venv at tools/generator/python/.venv.
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';

import { Resvg } from '@resvg/resvg-js';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

const HARNESS_DIR = dirname(import.meta.url.replace('file://', ''));
const REPO_ROOT = resolvePath(HARNESS_DIR, '../../../..');
const MANIFEST_DIR = join(REPO_ROOT, 'tools/generator/manifests');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const PYTHON_BIN = join(
  REPO_ROOT,
  'tools/generator/python/.venv/bin/python'
);
const RASTERIZE_SCRIPT = join(HARNESS_DIR, 'rasterize_glyph.py');
const RENDER_ICON_CLI = join(
  REPO_ROOT,
  'tools/generator/audit/render/render-icon.ts'
);
// `@iconify/json` is a workspace dep. With Bun the package may resolve via
// either `node_modules/@iconify/json/` (hoisted symlink) or via the .bun
// subdirectory. Probe both to keep this CLI runnable from any cwd.
const ICONIFY_JSON_CANDIDATES = [
  join(REPO_ROOT, 'node_modules/@iconify/json/json'),
  join(
    REPO_ROOT,
    'node_modules/.bun/@iconify+json@2.2.472/node_modules/@iconify/json/json'
  ),
];
function resolveIconifyJsonDir(): string {
  for (const c of ICONIFY_JSON_CANDIDATES) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `cannot find @iconify/json json/ dir; tried:\n  ${ICONIFY_JSON_CANDIDATES.join('\n  ')}`
  );
}
const OUTPUT_BASE = join(REPO_ROOT, 'docs/audit/visual-diff');

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

interface CliArgs {
  iconRef: string;
  size: number;
  skipFlutter: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0) usage('missing icon reference');
  let iconRef: string | undefined;
  let size = 256;
  let skipFlutter = false;
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      if (iconRef) usage(`unexpected positional arg: ${a}`);
      iconRef = a;
      continue;
    }
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`flag ${a} requires a value`);
      return v as string;
    };
    switch (a) {
      case '--size':
        size = parseInt(next(), 10);
        break;
      case '--skip-flutter':
        skipFlutter = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--help':
      case '-h':
        usage();
        break;
      default:
        usage(`unknown flag: ${a}`);
    }
  }
  if (!iconRef) usage('missing icon reference (e.g. solar:add-circle-bold-duotone)');
  if (!iconRef.includes(':'))
    usage(`icon reference must be "prefix:name" — got "${iconRef}"`);
  return {
    iconRef: iconRef!,
    size,
    skipFlutter,
    verbose,
  };
}

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage: bun visual-diff <prefix:name> [--size N] [--skip-flutter] [--verbose]');
  process.exit(msg ? 2 : 0);
}

// --------------------------------------------------------------------------
// Manifest / iconify lookup
// --------------------------------------------------------------------------

interface ManifestIcon {
  codepoint: number;
  fontFamily: string;
  identifier: string;
  duotone?: boolean;
  duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
  deprecated?: boolean;
}

interface Manifest {
  prefix: string;
  subPackage: string;
  fonts: { family: string }[];
  icons: Record<string, ManifestIcon>;
}

interface ResolvedIcon {
  prefix: string;
  iconName: string;
  packageName: string;
  packageDir: string;
  primaryCodepoint: number;
  primaryFamily: string;
  secondaryFamily?: string;
  duotone: boolean;
  duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
}

async function resolveIcon(iconRef: string): Promise<ResolvedIcon> {
  const [prefix, ...rest] = iconRef.split(':');
  const iconName = rest.join(':');
  const manifestPath = join(MANIFEST_DIR, `${prefix}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest for prefix "${prefix}" at ${manifestPath}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const icon = manifest.icons[iconName!];
  if (!icon) {
    throw new Error(`icon "${iconName}" not found in ${prefix} manifest`);
  }
  if (icon.deprecated) {
    throw new Error(`icon "${iconRef}" is marked deprecated in the manifest`);
  }
  const packageName = manifest.subPackage;
  const packageDir = join(PACKAGES_DIR, packageName);
  if (!existsSync(packageDir)) {
    throw new Error(`package dir not found: ${packageDir}`);
  }
  return {
    prefix: prefix!,
    iconName: iconName!,
    packageName,
    packageDir,
    primaryCodepoint: icon.codepoint,
    primaryFamily: icon.fontFamily,
    secondaryFamily: icon.duotone ? `${icon.fontFamily}Secondary` : undefined,
    duotone: !!icon.duotone,
    duotoneKind: icon.duotoneKind,
  };
}

interface UpstreamIcon {
  body: string;
  width: number;
  height: number;
}

async function readUpstreamIcon(prefix: string, name: string): Promise<UpstreamIcon> {
  const jsonPath = join(resolveIconifyJsonDir(), `${prefix}.json`);
  if (!existsSync(jsonPath)) {
    throw new Error(`upstream iconify json not found: ${jsonPath}`);
  }
  // @iconify/json may be a large file; read once.
  const data = JSON.parse(await readFile(jsonPath, 'utf8')) as {
    width?: number;
    height?: number;
    icons: Record<string, { body: string; width?: number; height?: number }>;
  };
  const icon = data.icons[name];
  if (!icon) throw new Error(`upstream icon "${name}" not found in ${jsonPath}`);
  return {
    body: icon.body,
    width: icon.width ?? data.width ?? 24,
    height: icon.height ?? data.height ?? 24,
  };
}

// --------------------------------------------------------------------------
// Step 1: upstream SVG -> PNG via resvg
// --------------------------------------------------------------------------

function buildUpstreamSvg(icon: UpstreamIcon): string {
  // The fg colour matches Flutter's default RenderObject black so the
  // resvg PNG aligns visually with what the consumer app produces.
  const styled = icon.body
    .replace(/currentColor/g, '#000000')
    .replace(/fill="none"/g, 'fill="none"');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${icon.width} ${icon.height}" ` +
    `width="${icon.width}" height="${icon.height}">${styled}</svg>`
  );
}

async function rasterizeUpstream(
  icon: UpstreamIcon,
  size: number,
  outSvg: string,
  outPng: string
): Promise<void> {
  const svg = buildUpstreamSvg(icon);
  await writeFile(outSvg, svg, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(255,255,255,0)',
  });
  const png = resvg.render().asPng();
  await writeFile(outPng, png);
}

// --------------------------------------------------------------------------
// Step 2 + 3: TTF glyph -> PNG via python helper
// --------------------------------------------------------------------------

interface GlyphReport {
  ttf: string;
  codepoint: string;
  glyphName: string;
  advance: number;
  lsb: number;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    width: number;
    height: number;
    cx: number;
    cy: number;
  } | null;
  empty?: boolean;
  renderMode?: string;
  canvas?: number;
}

function runPython(args: string[], verbose: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      const s = c.toString('utf8');
      stdout += s;
      if (verbose) process.stdout.write(s);
    });
    child.stderr.on('data', (c: Buffer) => {
      const s = c.toString('utf8');
      stderr += s;
      if (verbose) process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `python rasterize_glyph.py exited ${code}\nstderr:\n${stderr}\nstdout:\n${stdout}`
          )
        );
    });
  });
}

async function rasterizeGlyph(
  ttfPath: string,
  codepoint: number,
  size: number,
  outPng: string,
  reportPath: string,
  verbose: boolean,
  mode: 'em' | 'bbox' = 'em'
): Promise<GlyphReport> {
  await runPython(
    [
      RASTERIZE_SCRIPT,
      '--ttf',
      ttfPath,
      '--codepoint',
      `0x${codepoint.toString(16)}`,
      '--size',
      String(size),
      '--bg',
      '0x00ffffff',
      '--fg',
      '0xff000000',
      '--mode',
      mode,
      '--out',
      outPng,
      '--report',
      reportPath,
    ],
    verbose
  );
  return JSON.parse(await readFile(reportPath, 'utf8')) as GlyphReport;
}

// --------------------------------------------------------------------------
// Step 4: invoke render-icon for flutter-rendered
// --------------------------------------------------------------------------

function runBun(args: string[], verbose: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      const s = c.toString('utf8');
      stdout += s;
      if (verbose) process.stdout.write(s);
    });
    child.stderr.on('data', (c: Buffer) => {
      const s = c.toString('utf8');
      stderr += s;
      if (verbose) process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `bun ${args.join(' ')} exited ${code}\nstderr:\n${stderr}\nstdout:\n${stdout}`
          )
        );
    });
  });
}

async function renderFlutter(
  iconRef: string,
  size: number,
  mode: 'duotone' | 'primary-only' | 'secondary-only',
  outPng: string,
  verbose: boolean
): Promise<void> {
  // Use white background so the diff with upstream (also rendered against
  // white) measures actual content drift rather than alpha mismatches.
  await runBun(
    [
      'run',
      RENDER_ICON_CLI,
      iconRef,
      '--size',
      String(size),
      '--mode',
      mode,
      '--color',
      '0xff000000',
      '--bg',
      '0xffffffff',
      '--out',
      outPng,
    ],
    verbose
  );
}

// --------------------------------------------------------------------------
// Diff
// --------------------------------------------------------------------------

async function loadPng(path: string): Promise<{ w: number; h: number; pixels: Buffer }> {
  const buf = await readFile(path);
  const png = PNG.sync.read(buf);
  return { w: png.width, h: png.height, pixels: png.data };
}

interface DiffResult {
  width: number;
  height: number;
  mismatchPixels: number;
  totalPixels: number;
  mismatchPct: number;
  inkA: number;
  inkB: number;
  cxA: number;
  cyA: number;
  cxB: number;
  cyB: number;
  cxDriftPx: number;
  cyDriftPx: number;
}

function inkStats(
  pixels: Buffer,
  w: number,
  h: number
): { ink: number; cx: number; cy: number } {
  let inkCount = 0;
  let sumX = 0;
  let sumY = 0;
  // For an RGBA buffer, treat alpha+luminance < threshold as ink. We
  // assume both inputs are black-on-white at full alpha.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const a = pixels[i + 3]!;
      // Composite over white when alpha < 255.
      const alpha = a / 255;
      const cr = r * alpha + 255 * (1 - alpha);
      const cg = g * alpha + 255 * (1 - alpha);
      const cb = b * alpha + 255 * (1 - alpha);
      const lum = (cr * 299 + cg * 587 + cb * 114) / 1000;
      if (lum < 128) {
        inkCount++;
        sumX += x;
        sumY += y;
      }
    }
  }
  const total = w * h;
  return {
    ink: inkCount / total,
    cx: inkCount > 0 ? sumX / inkCount : w / 2,
    cy: inkCount > 0 ? sumY / inkCount : h / 2,
  };
}

async function diffPngs(
  pathA: string,
  pathB: string,
  outDiff: string
): Promise<DiffResult> {
  const a = await loadPng(pathA);
  const b = await loadPng(pathB);
  if (a.w !== b.w || a.h !== b.h) {
    throw new Error(`size mismatch: ${pathA} ${a.w}x${a.h} vs ${pathB} ${b.w}x${b.h}`);
  }
  const diffPixels = Buffer.alloc(a.w * a.h * 4);
  // @ts-expect-error pixelmatch types differ across versions
  const mismatchPixels = pixelmatch(a.pixels, b.pixels, diffPixels, a.w, a.h, {
    threshold: 0.1,
    includeAA: false,
  });
  const outPng = new PNG({ width: a.w, height: a.h });
  diffPixels.copy(outPng.data);
  await writeFile(outDiff, PNG.sync.write(outPng));
  const sa = inkStats(a.pixels, a.w, a.h);
  const sb = inkStats(b.pixels, b.w, b.h);
  return {
    width: a.w,
    height: a.h,
    mismatchPixels,
    totalPixels: a.w * a.h,
    mismatchPct: mismatchPixels / (a.w * a.h),
    inkA: sa.ink,
    inkB: sb.ink,
    cxA: sa.cx,
    cyA: sa.cy,
    cxB: sb.cx,
    cyB: sb.cy,
    cxDriftPx: sb.cx - sa.cx,
    cyDriftPx: sb.cy - sa.cy,
  };
}

// --------------------------------------------------------------------------
// Classifier
// --------------------------------------------------------------------------

interface ClassifierVerdict {
  status: 'same' | 'needs-review' | 'different';
  primaryReason: string;
  confidence: 'low' | 'medium' | 'high';
  problem: string;
  remediation: string;
}

function classifyTtfOnly(
  resolved: ResolvedIcon,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null
): ClassifierVerdict | null {
  // TTF-only rules — fire even when --skip-flutter omits the pixel diff.

  // Rule 8 (TTF half): primary glyph empty.
  if (primaryGlyph.empty || !primaryGlyph.bbox) {
    return {
      status: 'different',
      primaryReason: 'EMPTY_GLYPH',
      confidence: 'high',
      problem: 'Primary glyph has empty outline in TTF',
      remediation: 'Check FONT_AUDIT.md; svg2ttf likely dropped this glyph during build',
    };
  }
  if (resolved.duotone && secondaryGlyph && (secondaryGlyph.empty || !secondaryGlyph.bbox)) {
    return {
      status: 'different',
      primaryReason: 'DUOTONE_HALF_BROKEN',
      confidence: 'high',
      problem: 'Manifest declares duotone but secondary glyph is empty in <Family>Secondary.ttf',
      remediation: 'svg_preprocess.splitDuotoneBody yielded empty body; check secondary cache or splitter path',
    };
  }
  // Rule 7a: duotone bbox mismatch (TTF-only — independent of flutter render).
  if (
    resolved.duotone &&
    primaryGlyph.bbox &&
    secondaryGlyph?.bbox
  ) {
    const dx = Math.abs(primaryGlyph.bbox.cx - secondaryGlyph.bbox.cx) / primaryGlyph.unitsPerEm;
    const dy = Math.abs(primaryGlyph.bbox.cy - secondaryGlyph.bbox.cy) / primaryGlyph.unitsPerEm;
    if (dx > 0.04 || dy > 0.04) {
      return {
        status: 'different',
        primaryReason: 'DUOTONE_BBOX_MISMATCH',
        confidence: 'high',
        problem:
          `Primary glyph centroid (${primaryGlyph.bbox.cx.toFixed(0)},${primaryGlyph.bbox.cy.toFixed(0)}) ` +
          `differs from secondary (${secondaryGlyph.bbox.cx.toFixed(0)},${secondaryGlyph.bbox.cy.toFixed(0)}) ` +
          `by ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% of em — layers will overlay misaligned`,
        remediation:
          'GLYPH_METRICS_AUDIT.md likely flags this pair. Root cause is usually svg2ttf glyph dedup ' +
          '(identical SVG bodies collapsed into one glyph with whichever first-encountered xMin) — see ' +
          'RESEARCH_PLAN §33 for fix.',
      };
    }
  }
  return null;
}

function classify(
  resolved: ResolvedIcon,
  diff: DiffResult,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null
): ClassifierVerdict {
  // Try TTF-only rules first — bbox mismatch is the highest-signal verdict
  // and doesn't need the flutter render comparison.
  const ttfVerdict = classifyTtfOnly(resolved, primaryGlyph, secondaryGlyph);
  if (ttfVerdict) return ttfVerdict;

  const { mismatchPct, inkA, inkB, cxDriftPx, cyDriftPx, width } = diff;
  // Drift relative to the canvas size; > 4 % is visible at 24-48 px.
  const driftFracX = Math.abs(cxDriftPx) / width;
  const driftFracY = Math.abs(cyDriftPx) / width;

  // Rule 1: deprecated / paint-order-dropped — caller already guards.
  // (deprecated icons throw before reaching classify())

  // Rule 4: EMPTY_GLYPH.
  if (inkB < 0.005 && inkA > 0.05) {
    return {
      status: 'different',
      primaryReason: 'EMPTY_GLYPH',
      confidence: 'high',
      problem: 'Flutter render is blank but upstream SVG has content',
      remediation:
        'Check FONT_AUDIT.md for empty glyph; investigate svg2ttf drop or font_builder retry path',
    };
  }

  // Rule 8: DUOTONE_HALF_BROKEN — secondary glyph empty when duotone expected.
  if (resolved.duotone && secondaryGlyph?.empty) {
    return {
      status: 'different',
      primaryReason: 'DUOTONE_HALF_BROKEN',
      confidence: 'high',
      problem:
        'Manifest declares duotone but secondary glyph is empty in <Family>Secondary.ttf',
      remediation:
        'svg_preprocess.splitDuotoneBody yielded empty body; check secondary cache or splitter path',
    };
  }

  // Rule 7a (NEW): DUOTONE_BBOX_MISMATCH — primary + secondary glyph bboxes
  // differ by enough to visibly shift layers when stacked at em-origin.
  // Threshold: 4 % of em (= 40 of 1000 units, ~10 px at 256 size).
  if (
    resolved.duotone &&
    primaryGlyph.bbox &&
    secondaryGlyph?.bbox
  ) {
    const dx =
      Math.abs(primaryGlyph.bbox.cx - secondaryGlyph.bbox.cx) /
      primaryGlyph.unitsPerEm;
    const dy =
      Math.abs(primaryGlyph.bbox.cy - secondaryGlyph.bbox.cy) /
      primaryGlyph.unitsPerEm;
    if (dx > 0.04 || dy > 0.04) {
      return {
        status: 'different',
        primaryReason: 'DUOTONE_BBOX_MISMATCH',
        confidence: 'high',
        problem:
          `Primary glyph centroid (${primaryGlyph.bbox.cx.toFixed(0)},${primaryGlyph.bbox.cy.toFixed(0)}) ` +
          `differs from secondary (${secondaryGlyph.bbox.cx.toFixed(0)},${secondaryGlyph.bbox.cy.toFixed(0)}) ` +
          `by ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% of em — layers will overlay misaligned`,
        remediation:
          'GLYPH_METRICS_AUDIT.md likely flags this pair. Root cause is usually svg2ttf glyph dedup ' +
          '(identical SVG bodies collapsed into one glyph with whichever first-encountered xMin) — see ' +
          'RESEARCH_PLAN §33 for fix.',
      };
    }
  }

  // Rule 5: FILLED_BLOB — ours much more ink than source.
  if (inkB > 0.7 && inkA < 0.5) {
    return {
      status: 'different',
      primaryReason: 'FILLED_BLOB',
      confidence: 'high',
      problem: 'Flutter render is mostly solid ink while upstream is sparse',
      remediation:
        'Likely paint-order risk drop (§5e) OR stroke-fill missed evenodd cutouts',
    };
  }

  // Rule 13/14: VERTICAL/HORIZONTAL_DRIFT — centroid shift without size change.
  if ((driftFracX > 0.06 || driftFracY > 0.06) && mismatchPct < 0.4) {
    const axis = driftFracX > driftFracY ? 'HORIZONTAL' : 'VERTICAL';
    return {
      status: 'different',
      primaryReason: `${axis}_DRIFT`,
      confidence: 'medium',
      problem:
        `Centroid shifted by (${cxDriftPx.toFixed(1)}, ${cyDriftPx.toFixed(1)})px ` +
        `out of ${width}px canvas; ink ratio similar (${inkA.toFixed(3)} vs ${inkB.toFixed(3)})`,
      remediation:
        'Rendering layer alignment regression. Check glyph bbox vs em-quad; ' +
        'IconifyIcon paint() origin policy (RESEARCH_PLAN §33).',
    };
  }

  // Rule 17: EXTRA_INK
  if (inkB > inkA * 1.2 && mismatchPct > 0.05) {
    return {
      status: 'different',
      primaryReason: 'EXTRA_INK',
      confidence: 'medium',
      problem: `ink ratio ours=${inkB.toFixed(3)} vs upstream=${inkA.toFixed(3)} (20%+ over)`,
      remediation: 'Likely over-aggressive raster-trace; review stroke-fill processing',
    };
  }

  // Rule 6: MISSING_CUTOUTS
  if (inkB > inkA * 1.4 && mismatchPct > 0.3) {
    return {
      status: 'different',
      primaryReason: 'MISSING_CUTOUTS',
      confidence: 'high',
      problem: 'Ours much more ink than upstream; cutouts likely missing',
      remediation: 'per-icon raster-trace fallback should fire (§5a)',
    };
  }

  if (mismatchPct < 0.02) {
    return {
      status: 'same',
      primaryReason: 'OK',
      confidence: 'high',
      problem: '—',
      remediation: '—',
    };
  }

  if (mismatchPct < 0.10) {
    return {
      status: 'needs-review',
      primaryReason: 'MINOR_DIFF',
      confidence: 'low',
      problem: `mismatch ${(mismatchPct * 100).toFixed(2)}% — possible AA noise or minor regression`,
      remediation: 'Manual inspect; bump --size to confirm if structural',
    };
  }

  return {
    status: 'different',
    primaryReason: 'UNKNOWN',
    confidence: 'low',
    problem: `mismatch ${(mismatchPct * 100).toFixed(2)}% but no specific rule matched`,
    remediation: 'Manual triage; consider extending the classifier rule table',
  };
}

// --------------------------------------------------------------------------
// Markdown report
// --------------------------------------------------------------------------

async function writeReportMd(
  outDir: string,
  resolved: ResolvedIcon,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null,
  diff: DiffResult | null,
  verdict: ClassifierVerdict | null,
  fontTtfPath: string,
  secondaryTtfPath: string | null,
  skipFlutter: boolean
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Visual-diff: \`${resolved.prefix}:${resolved.iconName}\``);
  lines.push('');
  lines.push(`Generated ${today}. Phase 1 single-icon diff (see RESEARCH_PLAN §33).`);
  lines.push('');
  lines.push(`- **Package**: \`${resolved.packageName}\``);
  lines.push(`- **Primary codepoint**: \`0x${resolved.primaryCodepoint.toString(16)}\``);
  lines.push(`- **Primary font family**: \`${resolved.primaryFamily}\``);
  lines.push(`- **Duotone**: ${resolved.duotone ? `yes (kind=${resolved.duotoneKind ?? 'hint'})` : 'no'}`);
  if (resolved.duotone) {
    lines.push(`- **Secondary font family**: \`${resolved.secondaryFamily}\``);
  }
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  if (verdict) {
    lines.push(`- **Status**: \`${verdict.status}\``);
    lines.push(`- **Primary reason**: \`${verdict.primaryReason}\``);
    lines.push(`- **Confidence**: \`${verdict.confidence}\``);
    lines.push(`- **Problem**: ${verdict.problem}`);
    lines.push(`- **Remediation**: ${verdict.remediation}`);
  } else {
    lines.push('_Flutter render skipped (`--skip-flutter`) — no end-to-end verdict._');
  }
  lines.push('');

  lines.push('## Frames');
  lines.push('');
  lines.push('| Layer | Image |');
  lines.push('|---|---|');
  lines.push('| Upstream Iconify SVG (resvg) | ![upstream](upstream.png) |');
  lines.push('| TTF primary glyph (em-box) | ![glyph-primary](glyph-primary.png) |');
  if (secondaryGlyph) {
    lines.push('| TTF secondary glyph (em-box) | ![glyph-secondary](glyph-secondary.png) |');
  }
  if (!skipFlutter) {
    lines.push('| Flutter rendered (IconifyIcon, fvm flutter test) | ![flutter](flutter-rendered.png) |');
    lines.push('| Pixel diff (upstream vs Flutter) | ![diff](diff-pixelmatch.png) |');
  }
  lines.push('');

  lines.push('## Glyph metrics (raw TTF)');
  lines.push('');
  lines.push('| Layer | Font | Glyph name in TTF | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |');
  lines.push('|---|---|---|---:|---:|---|---|---|');
  const fmtBbox = (g: GlyphReport, fontPath: string) => {
    if (!g.bbox) {
      return `| primary | \`${fontPath.split('/').pop()}\` | _empty glyph_ | — | — | — | — | — |`;
    }
    return (
      `| ${g === primaryGlyph ? 'primary' : 'secondary'} | \`${fontPath.split('/').pop()}\` | ` +
      `\`${g.glyphName}\` | ${g.advance} | ${g.lsb} | ` +
      `${g.bbox.xMin.toFixed(1)}..${g.bbox.xMax.toFixed(1)} | ` +
      `${g.bbox.yMin.toFixed(1)}..${g.bbox.yMax.toFixed(1)} | ` +
      `(${g.bbox.cx.toFixed(0)}, ${g.bbox.cy.toFixed(0)}) |`
    );
  };
  lines.push(fmtBbox(primaryGlyph, fontTtfPath));
  if (secondaryGlyph && secondaryTtfPath) {
    lines.push(fmtBbox(secondaryGlyph, secondaryTtfPath));
  }
  lines.push('');

  if (diff) {
    lines.push('## Pixel diff (upstream vs Flutter)');
    lines.push('');
    lines.push(`- Canvas: ${diff.width} × ${diff.height}`);
    lines.push(
      `- Mismatch: ${diff.mismatchPixels.toLocaleString('en-US')} / ${diff.totalPixels.toLocaleString('en-US')} ` +
        `px (${(diff.mismatchPct * 100).toFixed(2)} %)`
    );
    lines.push(`- Ink ratio upstream: ${diff.inkA.toFixed(4)}`);
    lines.push(`- Ink ratio Flutter:  ${diff.inkB.toFixed(4)}`);
    lines.push(
      `- Centroid drift: (${diff.cxDriftPx.toFixed(1)}, ${diff.cyDriftPx.toFixed(1)}) px`
    );
    lines.push('');
  }

  if (resolved.duotone && primaryGlyph.bbox && secondaryGlyph?.bbox) {
    const dx = secondaryGlyph.bbox.cx - primaryGlyph.bbox.cx;
    const dy = secondaryGlyph.bbox.cy - primaryGlyph.bbox.cy;
    lines.push('## Duotone alignment (TTF-space)');
    lines.push('');
    lines.push(
      `- **Primary centroid**: (${primaryGlyph.bbox.cx.toFixed(1)}, ` +
        `${primaryGlyph.bbox.cy.toFixed(1)}) in em-units of ${primaryGlyph.unitsPerEm}`
    );
    lines.push(
      `- **Secondary centroid**: (${secondaryGlyph.bbox.cx.toFixed(1)}, ` +
        `${secondaryGlyph.bbox.cy.toFixed(1)})`
    );
    lines.push(`- **Centroid delta**: (${dx.toFixed(1)}, ${dy.toFixed(1)}) em-units`);
    const dxFrac = Math.abs(dx) / primaryGlyph.unitsPerEm;
    const dyFrac = Math.abs(dy) / primaryGlyph.unitsPerEm;
    lines.push(
      `- **Fraction of em**: (${(dxFrac * 100).toFixed(1)} %, ${(dyFrac * 100).toFixed(1)} %)`
    );
    if (dxFrac > 0.04 || dyFrac > 0.04) {
      lines.push('');
      lines.push(
        '> ⚠️ Centroid drift exceeds the 4 % threshold beyond which the two ' +
          'layers will visibly overlay out of alignment when ' +
          '`IconifyIcon` paints both at `Offset.zero`.'
      );
    }
    lines.push('');
  }

  await writeFile(join(outDir, 'REPORT.md'), lines.join('\n'), 'utf8');
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolved = await resolveIcon(args.iconRef);
  const upstream = await readUpstreamIcon(resolved.prefix, resolved.iconName);

  const slug = `${resolved.prefix}__${resolved.iconName}`;
  const outDir = join(OUTPUT_BASE, slug);
  await mkdir(outDir, { recursive: true });

  // ----- Step 1: upstream SVG -> PNG
  const upstreamSvg = join(outDir, 'upstream.svg');
  const upstreamPng = join(outDir, 'upstream.png');
  await rasterizeUpstream(upstream, args.size, upstreamSvg, upstreamPng);
  console.log(`wrote ${upstreamPng}`);

  // ----- Step 2: TTF primary glyph -> PNG
  const primaryTtf = join(resolved.packageDir, `assets/fonts/${resolved.primaryFamily}.ttf`);
  if (!existsSync(primaryTtf)) {
    throw new Error(`primary TTF not found: ${primaryTtf}`);
  }
  const primaryPng = join(outDir, 'glyph-primary.png');
  const primaryReport = join(outDir, 'glyph-primary.bbox.json');
  const primaryGlyph = await rasterizeGlyph(
    primaryTtf,
    resolved.primaryCodepoint,
    args.size,
    primaryPng,
    primaryReport,
    args.verbose,
    'em'
  );
  console.log(
    `wrote ${primaryPng} (glyphName=${primaryGlyph.glyphName} bbox=${primaryGlyph.bbox ? `${primaryGlyph.bbox.xMin.toFixed(0)},${primaryGlyph.bbox.yMin.toFixed(0)} ${primaryGlyph.bbox.xMax.toFixed(0)},${primaryGlyph.bbox.yMax.toFixed(0)}` : 'empty'})`
  );

  // ----- Step 3: TTF secondary glyph -> PNG (if duotone)
  let secondaryGlyph: GlyphReport | null = null;
  let secondaryTtf: string | null = null;
  if (resolved.duotone && resolved.secondaryFamily) {
    secondaryTtf = join(
      resolved.packageDir,
      `assets/fonts/${resolved.secondaryFamily}.ttf`
    );
    if (existsSync(secondaryTtf)) {
      const secondaryPng = join(outDir, 'glyph-secondary.png');
      const secondaryReport = join(outDir, 'glyph-secondary.bbox.json');
      secondaryGlyph = await rasterizeGlyph(
        secondaryTtf,
        resolved.primaryCodepoint, // same cp; secondary fonts share the codepoint
        args.size,
        secondaryPng,
        secondaryReport,
        args.verbose,
        'em'
      );
      console.log(
        `wrote ${secondaryPng} (glyphName=${secondaryGlyph.glyphName} bbox=${secondaryGlyph.bbox ? `${secondaryGlyph.bbox.xMin.toFixed(0)},${secondaryGlyph.bbox.yMin.toFixed(0)} ${secondaryGlyph.bbox.xMax.toFixed(0)},${secondaryGlyph.bbox.yMax.toFixed(0)}` : 'empty'})`
      );
    } else {
      console.error(`WARN: secondary TTF missing: ${secondaryTtf}`);
    }
  }

  // ----- Step 4: Flutter rendered (optional)
  let flutterPng: string | null = null;
  let diff: DiffResult | null = null;
  let verdict: ClassifierVerdict | null = null;
  // Always compute the TTF-only verdict — these are high-signal rules
  // (duotone bbox mismatch, empty primary, empty secondary) that don't
  // require the slower flutter render to fire.
  verdict = classifyTtfOnly(resolved, primaryGlyph, secondaryGlyph);
  if (verdict === null) {
    verdict = {
      status: 'same',
      primaryReason: 'TTF_OK',
      confidence: 'low',
      problem: 'TTF-only checks pass; run without --skip-flutter for end-to-end verdict',
      remediation: '—',
    };
  }
  if (!args.skipFlutter) {
    flutterPng = join(outDir, 'flutter-rendered.png');
    await renderFlutter(args.iconRef, args.size, 'duotone', flutterPng, args.verbose);
    console.log(`wrote ${flutterPng}`);
    const diffPng = join(outDir, 'diff-pixelmatch.png');
    diff = await diffPngs(upstreamPng, flutterPng, diffPng);
    console.log(
      `diff: mismatch=${diff.mismatchPixels.toLocaleString('en-US')} ` +
        `(${(diff.mismatchPct * 100).toFixed(2)}%) ` +
        `inkA=${diff.inkA.toFixed(3)} inkB=${diff.inkB.toFixed(3)} ` +
        `drift=(${diff.cxDriftPx.toFixed(1)},${diff.cyDriftPx.toFixed(1)})px`
    );
    verdict = classify(resolved, diff, primaryGlyph, secondaryGlyph);
    console.log(`verdict: ${verdict.status} / ${verdict.primaryReason}`);
  }

  // ----- Step 5: report.json + REPORT.md
  const reportJson = {
    iconRef: args.iconRef,
    prefix: resolved.prefix,
    iconName: resolved.iconName,
    packageName: resolved.packageName,
    primary: primaryGlyph,
    secondary: secondaryGlyph,
    diff,
    verdict,
    fontTtfPath: primaryTtf,
    secondaryTtfPath: secondaryTtf,
    duotone: resolved.duotone,
    duotoneKind: resolved.duotoneKind,
  };
  await writeFile(
    join(outDir, 'report.json'),
    JSON.stringify(reportJson, null, 2),
    'utf8'
  );
  await writeReportMd(
    outDir,
    resolved,
    primaryGlyph,
    secondaryGlyph,
    diff,
    verdict,
    primaryTtf,
    secondaryTtf,
    args.skipFlutter
  );
  console.log(`wrote ${join(outDir, 'REPORT.md')}`);
  console.log(`done. all output under ${outDir}`);
}

main().catch((err) => {
  console.error(`visual-diff: ${err.message ?? err}`);
  process.exit(1);
});
