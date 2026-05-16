#!/usr/bin/env bun
/**
 * `visual-diff` — three-way visual comparator for iconifyx (Phase 1.5).
 *
 * Phase 1 produced one icon's worth of: upstream-SVG vs TTF-primary vs
 * TTF-secondary vs Flutter-rendered, plus a single pixelmatch diff (upstream
 * vs Flutter). Phase 1.5 generalises that to:
 *
 *   • `--3way`  — emit ALL three pairwise diffs (SVG↔TTF, TTF↔Flutter,
 *                 SVG↔Flutter) with pixelmatch + dHash + SSIM-lite metrics.
 *                 Adds classifier rules that exploit the TRIPLE comparison
 *                 to localise the bug to a pipeline stage:
 *                   - SVG vs TTF mismatch  → generator/font-build issue
 *                   - TTF vs Flutter mismatch → widget paint/composition issue
 *                   - both same → end-to-end OK
 *
 *   • `--corpus PATH` — iterate a curated icon list (`.txt` with one
 *                 `prefix:name` per line, or a JSON list). Emits per-icon
 *                 results into `<out>/<slug>/` and aggregates into
 *                 `<out>/corpus.json` + `<out>/corpus.html` (dashboard).
 *
 *   • Single-icon mode (existing behaviour) is preserved — pass a single
 *     `prefix:name` positional and no `--corpus` flag.
 *
 * Outputs (single-icon, `--3way`):
 *   docs/audit/visual-3way/<prefix>__<name>/
 *     upstream.svg            iconify body wrapped with viewBox + xlink ns
 *     upstream.png            @resvg/resvg-js
 *     glyph-primary.png       fontTools + Pillow (em-mode)
 *     glyph-primary.bbox.json
 *     glyph-secondary.png     (duotone only)
 *     glyph-secondary.bbox.json
 *     flutter-rendered.png    fvm flutter test + RepaintBoundary.toImage
 *     ttf-composed.png        primary+secondary composed in pure-TS (paint-kind aware)
 *     diff-svg-vs-ttf.png     pixelmatch upstream.png  vs ttf-composed.png
 *     diff-ttf-vs-flutter.png pixelmatch ttf-composed.png vs flutter-rendered.png
 *     diff-svg-vs-flutter.png pixelmatch upstream.png  vs flutter-rendered.png
 *     report.json             machine-readable verdict + all metrics
 *     REPORT.md               human-readable, embeds PNGs
 *
 * Usage:
 *   bun run tools/generator/audit/visual-diff/cli.ts solar:add-circle-bold-duotone
 *   bun run tools/generator/audit/visual-diff/cli.ts mdi:home --3way
 *   bun run tools/generator/audit/visual-diff/cli.ts --corpus path/to/corpus.txt --3way
 *
 * Constraints:
 *   - Reuses the `tools/generator/audit/render/` flutter harness.
 *   - Reuses the existing python venv at tools/generator/python/.venv.
 *   - No new build step; pure TypeScript orchestrator + subprocesses.
 */

import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

function resolveIconifyJsonDir(): string {
  const direct = [
    join(REPO_ROOT, 'node_modules/@iconify/json/json'),
    join(REPO_ROOT, 'tools/generator/node_modules/@iconify/json/json'),
  ];
  for (const c of direct) if (existsSync(c)) return c;
  const bunRoots = [
    join(REPO_ROOT, 'node_modules/.bun'),
    join(REPO_ROOT, 'tools/generator/node_modules/.bun'),
  ];
  for (const r of bunRoots) {
    if (!existsSync(r)) continue;
    try {
      const entries = readdirSync(r);
      const match = entries.find((e) => e.startsWith('@iconify+json@'));
      if (match) {
        const guess = join(r, match, 'node_modules/@iconify/json/json');
        if (existsSync(guess)) return guess;
      }
    } catch {
      // try next root
    }
  }
  throw new Error(
    'cannot find @iconify/json json/ dir; tried direct paths and .bun/@iconify+json@*'
  );
}

// Default output base. Phase 1.5 writes to `visual-3way/`; Phase 1 wrote to
// `visual-diff/`. CLI flag --out PATH overrides.
const DEFAULT_OUTPUT_BASE_3WAY = join(REPO_ROOT, 'docs/audit/visual-3way');
const DEFAULT_OUTPUT_BASE_1WAY = join(REPO_ROOT, 'docs/audit/visual-diff');

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

type Mode = 'single' | 'corpus';

interface CliArgs {
  mode: Mode;
  iconRef?: string;          // single-mode positional
  corpusFile?: string;       // corpus-mode --corpus PATH
  size: number;
  skipFlutter: boolean;
  threeWay: boolean;         // --3way: emit SVG↔TTF + TTF↔Flutter diffs
  outBase?: string;          // --out: override docs/audit/visual-3way/
  buildDashboard: boolean;   // --dashboard: write corpus.html + corpus.json after run
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let iconRef: string | undefined;
  let corpusFile: string | undefined;
  let size = 256;
  let skipFlutter = false;
  let threeWay = false;
  let outBase: string | undefined;
  let buildDashboard = false;
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
      case '--3way':
      case '--three-way':
        threeWay = true;
        break;
      case '--corpus':
        corpusFile = next();
        break;
      case '--out':
        outBase = resolvePath(next());
        break;
      case '--dashboard':
        buildDashboard = true;
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

  const mode: Mode = corpusFile ? 'corpus' : 'single';
  if (mode === 'single') {
    if (!iconRef) usage('missing icon reference (e.g. solar:add-circle-bold-duotone) or use --corpus PATH');
    if (!iconRef.includes(':'))
      usage(`icon reference must be "prefix:name" — got "${iconRef}"`);
  } else {
    if (iconRef)
      usage(`--corpus and a positional icon ref are mutually exclusive`);
    if (!existsSync(corpusFile!))
      usage(`corpus file not found: ${corpusFile}`);
  }
  // Default output base depends on mode.
  if (!outBase) {
    outBase = threeWay ? DEFAULT_OUTPUT_BASE_3WAY : DEFAULT_OUTPUT_BASE_1WAY;
  }
  return {
    mode,
    iconRef,
    corpusFile,
    size,
    skipFlutter,
    threeWay,
    outBase,
    buildDashboard,
    verbose,
  };
}

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error(
    'usage: bun visual-diff <prefix:name> [--size N] [--3way] [--skip-flutter] [--verbose]'
  );
  console.error(
    '       bun visual-diff --corpus PATH [--3way] [--size N] [--skip-flutter] [--dashboard]'
  );
  console.error('');
  console.error('  --3way            also emit SVG↔TTF and TTF↔Flutter diffs (default: SVG↔Flutter only)');
  console.error('  --corpus PATH     run a curated icon list; PATH is .txt (one prefix:name per line) or .json');
  console.error('  --out PATH        override output base (default docs/audit/visual-3way for --3way)');
  console.error('  --dashboard       after a --corpus run, write corpus.html + corpus.json');
  console.error('  --size N          canvas px (default 256)');
  console.error('  --skip-flutter    skip the slow Flutter render; TTF-only comparison');
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

// Cache loaded iconify JSONs since corpus mode hits each prefix many times.
interface IconifyJsonFile {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string; width?: number; height?: number }>;
}
const iconifyCache = new Map<string, IconifyJsonFile>();

async function readUpstreamIcon(prefix: string, name: string): Promise<UpstreamIcon> {
  let data = iconifyCache.get(prefix);
  if (!data) {
    const jsonPath = join(resolveIconifyJsonDir(), `${prefix}.json`);
    if (!existsSync(jsonPath)) {
      throw new Error(`upstream iconify json not found: ${jsonPath}`);
    }
    data = JSON.parse(await readFile(jsonPath, 'utf8')) as IconifyJsonFile;
    iconifyCache.set(prefix, data);
  }
  // Resolve aliases. Iconify aliases just point to a parent name (optionally
  // with width/height overrides). We follow the chain to a concrete body.
  let resolvedName = name;
  let aliasOverrideW: number | undefined;
  let aliasOverrideH: number | undefined;
  for (let i = 0; i < 8; i++) {
    if (data.icons[resolvedName]) break;
    const alias = data.aliases?.[resolvedName];
    if (!alias) {
      throw new Error(`upstream icon "${name}" not found in ${prefix}.json (and no alias)`);
    }
    aliasOverrideW = aliasOverrideW ?? alias.width;
    aliasOverrideH = aliasOverrideH ?? alias.height;
    resolvedName = alias.parent;
  }
  const icon = data.icons[resolvedName];
  if (!icon) throw new Error(`upstream icon "${name}" not found in ${prefix}.json (alias chain too long)`);
  return {
    body: icon.body,
    width: aliasOverrideW ?? icon.width ?? data.width ?? 24,
    height: aliasOverrideH ?? icon.height ?? data.height ?? 24,
  };
}

// --------------------------------------------------------------------------
// Step 1: upstream SVG → PNG via resvg
// --------------------------------------------------------------------------

function buildUpstreamSvg(icon: UpstreamIcon): string {
  // Force `currentColor` → black so the resvg PNG aligns visually with what
  // the consumer app produces (the Flutter widget paints `Colors.black` by
  // default).
  //
  // Wrap the body in a SQUARE viewBox so resvg's fit-to-width produces a
  // square PNG. Non-square viewBoxes (e.g. logos:adobe-after-effects at
  // 256×250) otherwise emit non-square PNGs that won't align with the TTF
  // composition (always square) for pixelmatch. We centre the original
  // viewBox inside the square and pad the rest as white background.
  const side = Math.max(icon.width, icon.height);
  const dx = (side - icon.width) / 2;
  const dy = (side - icon.height) / 2;
  const styled = icon.body.replace(/currentColor/g, '#000000');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${side} ${side}" ` +
    `width="${side}" height="${side}">` +
    `<g transform="translate(${dx} ${dy})">${styled}</g>` +
    `</svg>`
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
    background: 'rgba(255,255,255,255)',
  });
  const png = resvg.render().asPng();
  await writeFile(outPng, png);
}

// --------------------------------------------------------------------------
// Step 2 + 3: TTF glyph → PNG via python helper
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
      '0xffffffff', // white background so it composites the same as the upstream PNG
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
// TTF compose: primary + secondary blended in pure TS (paint-kind aware).
//
// The Flutter widget composes layers based on `kind`:
//   - hint        secondary at 40% opacity BEHIND primary at 100%
//   - paintOrder  primary BEHIND, secondary FOREGROUND at 100% in surface (white)
//   - maskInternal same as hint
//
// We mirror the same composition here using already-rasterized PNGs so that
// (a) the SVG vs TTF diff actually measures the FULL composition the user
// sees, and (b) the TTF vs Flutter diff measures alignment of two
// independently-composed images. Note: the TTF panels are rendered against
// WHITE in `rasterizeGlyph` to match the upstream PNG composite.
// --------------------------------------------------------------------------

async function composeTtf(
  primaryPng: string,
  secondaryPng: string | null,
  kind: 'solo' | 'hint' | 'paintOrder' | 'maskInternal',
  size: number,
  outPng: string
): Promise<void> {
  const primary = await loadPng(primaryPng);
  if (!secondaryPng || kind === 'solo') {
    // No composition needed; just copy.
    await writeFile(outPng, await readFile(primaryPng));
    return;
  }
  const secondary = await loadPng(secondaryPng);
  if (primary.w !== size || primary.h !== size || secondary.w !== size || secondary.h !== size) {
    throw new Error(
      `composeTtf size mismatch: primary ${primary.w}x${primary.h} secondary ${secondary.w}x${secondary.h} expected ${size}x${size}`
    );
  }
  const out = Buffer.alloc(size * size * 4);
  // Source pixels are anti-aliased BLACK-on-WHITE. For each pixel:
  //   inkPrimary = (255 - lum) / 255
  //   inkSecondary = same.
  // Composition output is grayscale; we write RGBA black-on-white.
  for (let i = 0; i < size * size; i++) {
    const off = i * 4;
    const pR = primary.pixels[off]!;
    const pG = primary.pixels[off + 1]!;
    const pB = primary.pixels[off + 2]!;
    const pLum = (pR * 299 + pG * 587 + pB * 114) / 1000;
    const pInk = 1 - pLum / 255; // 0..1
    const sR = secondary.pixels[off]!;
    const sG = secondary.pixels[off + 1]!;
    const sB = secondary.pixels[off + 2]!;
    const sLum = (sR * 299 + sG * 587 + sB * 114) / 1000;
    const sInkRaw = 1 - sLum / 255;

    let ink: number;
    if (kind === 'hint' || kind === 'maskInternal') {
      // Secondary at 40% behind primary at 100%.
      const sInk = sInkRaw * 0.4;
      ink = pInk + (1 - pInk) * sInk;
    } else {
      // paintOrder: primary behind, secondary on top knocked out to white
      // (paintOrderSecondaryFallback). I.e. wherever the secondary has ink,
      // it knocks the primary back to (1 - sInk) * primary, then the
      // secondary paints WHITE on top — net: ink = pInk * (1 - sInkRaw).
      ink = pInk * (1 - sInkRaw);
    }
    const lum = Math.round((1 - ink) * 255);
    out[off] = lum;
    out[off + 1] = lum;
    out[off + 2] = lum;
    out[off + 3] = 255;
  }
  const png = new PNG({ width: size, height: size });
  out.copy(png.data);
  await writeFile(outPng, PNG.sync.write(png));
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
  // White background so the diff with upstream (also rendered against
  // white) measures actual content drift rather than alpha mismatches.
  // pixel-ratio=1 keeps the output PNG dimensions == --size so it lines
  // up with the upstream PNG (resvg fit-to-width) and the TTF composed PNG
  // (canvas == size) for pixelmatch. The render-icon default is 2 which
  // would give us a 512×512 PNG for a 256-px request.
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
      '--pixel-ratio',
      '1',
      '--out',
      outPng,
    ],
    verbose
  );
}

// --------------------------------------------------------------------------
// PNG diff: pixelmatch + dHash + SSIM-lite + ink stats
// --------------------------------------------------------------------------

async function loadPng(path: string): Promise<{ w: number; h: number; pixels: Buffer }> {
  const buf = await readFile(path);
  const png = PNG.sync.read(buf);
  return { w: png.width, h: png.height, pixels: png.data };
}

/**
 * dHash (difference hash): 64-bit perceptual hash. Method:
 *   1. Resize to 9×8 grayscale.
 *   2. For each row, compare adjacent pixels (8 pairs × 8 rows = 64 bits).
 *   3. Bit = 1 if left > right.
 *
 * Hamming distance between two dHashes correlates with visual similarity.
 * Reference: Krawetz, "Looks Like It" (Hacker Factor, 2013) —
 * http://hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html
 * Same algorithm used in `imagehash` (Python), `image-hash` (npm).
 *
 * Computed in pure-TS via nearest-neighbour downscale of the source pixels.
 * Returns a 16-char hex string.
 */
function dHash(pixels: Buffer, w: number, h: number): string {
  const dw = 9;
  const dh = 8;
  const small = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / dw));
      const sy = Math.min(h - 1, Math.floor((y * h) / dh));
      const i = (sy * w + sx) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const a = pixels[i + 3]!;
      // Composite over white.
      const alpha = a / 255;
      const cr = r * alpha + 255 * (1 - alpha);
      const cg = g * alpha + 255 * (1 - alpha);
      const cb = b * alpha + 255 * (1 - alpha);
      const lum = (cr * 299 + cg * 587 + cb * 114) / 1000;
      small[y * dw + x] = Math.round(lum);
    }
  }
  let bits = '';
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw - 1; x++) {
      bits += small[y * dw + x]! > small[y * dw + x + 1]! ? '1' : '0';
    }
  }
  // Convert 64-bit string → 16-char hex.
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('dHash hex length mismatch');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>>= 1;
    }
  }
  return d;
}

/**
 * SSIM-lite — simplified single-scale Structural Similarity Index.
 * Reference: Wang, Bovik, Sheikh, Simoncelli (2004), "Image Quality
 * Assessment: From Error Visibility to Structural Similarity",
 * IEEE Trans. Image Processing 13(4):600-612.
 *
 *   SSIM(x,y) = ((2·μxμy + C1)(2·σxy + C2)) /
 *               ((μx² + μy² + C1)(σx² + σy² + C2))
 *
 * Computed over 8×8 non-overlapping blocks (instead of Gaussian-windowed)
 * for speed; constants C1 = (0.01·L)², C2 = (0.03·L)², L = 255 (8-bit
 * grayscale dynamic range). Returns the mean over all blocks ∈ [-1, 1];
 * 1.0 = identical.
 *
 * Block-based SSIM is the lightweight variant used in the original
 * "BlockSSIM" reference. Loses some fidelity vs Gaussian-windowed but is
 * 10× faster and good enough as a third-source disambiguator on top of
 * dHash + pixelmatch.
 */
function ssimLite(
  pa: Buffer,
  pb: Buffer,
  w: number,
  h: number,
  blockSize: number = 8
): number {
  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;
  let acc = 0;
  let blocks = 0;
  const aLum = new Float64Array(w * h);
  const bLum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    aLum[i] =
      (pa[off]! * 299 + pa[off + 1]! * 587 + pa[off + 2]! * 114) / 1000;
    bLum[i] =
      (pb[off]! * 299 + pb[off + 1]! * 587 + pb[off + 2]! * 114) / 1000;
  }
  for (let by = 0; by + blockSize <= h; by += blockSize) {
    for (let bx = 0; bx + blockSize <= w; bx += blockSize) {
      let sumA = 0;
      let sumB = 0;
      const n = blockSize * blockSize;
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          const idx = (by + y) * w + (bx + x);
          sumA += aLum[idx]!;
          sumB += bLum[idx]!;
        }
      }
      const muA = sumA / n;
      const muB = sumB / n;
      let varA = 0;
      let varB = 0;
      let covAB = 0;
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          const idx = (by + y) * w + (bx + x);
          const da = aLum[idx]! - muA;
          const db = bLum[idx]! - muB;
          varA += da * da;
          varB += db * db;
          covAB += da * db;
        }
      }
      varA /= n - 1;
      varB /= n - 1;
      covAB /= n - 1;
      const num = (2 * muA * muB + C1) * (2 * covAB + C2);
      const den = (muA * muA + muB * muB + C1) * (varA + varB + C2);
      acc += den === 0 ? 1 : num / den;
      blocks++;
    }
  }
  return blocks > 0 ? acc / blocks : 1;
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
  dHashA: string;
  dHashB: string;
  hamming: number;
  ssim: number;
}

function inkStats(
  pixels: Buffer,
  w: number,
  h: number
): { ink: number; cx: number; cy: number } {
  let inkCount = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const a = pixels[i + 3]!;
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
  outDiff: string | null
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
  if (outDiff) {
    const outPng = new PNG({ width: a.w, height: a.h });
    diffPixels.copy(outPng.data);
    await writeFile(outDiff, PNG.sync.write(outPng));
  }
  const sa = inkStats(a.pixels, a.w, a.h);
  const sb = inkStats(b.pixels, b.w, b.h);
  const ha = dHash(a.pixels, a.w, a.h);
  const hb = dHash(b.pixels, b.w, b.h);
  const ssim = ssimLite(a.pixels, b.pixels, a.w, a.h);
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
    dHashA: ha,
    dHashB: hb,
    hamming: hammingHex(ha, hb),
    ssim,
  };
}

// --------------------------------------------------------------------------
// Classifier
//
// Phase 1 had one diff axis (SVG vs Flutter). Phase 1.5 has three
// pairwise comparisons:
//
//   1. SVG vs TTF       → measures the GENERATOR + FONT BUILD pipeline.
//      A mismatch here points at: paint-order drop, stroke-fill miss,
//      svg2ttf glyph drop, duotone split bug, identifier dedup.
//
//   2. TTF vs Flutter   → measures the WIDGET RENDER path.
//      A mismatch here points at: IconifyIcon kind dispatch wrong,
//      paint origin off, secondary opacity mismatch, FontLoader missing.
//
//   3. SVG vs Flutter   → end-to-end. Existing Phase 1 rule.
//
// The new rules below USE the locality information (which pair mismatches)
// to attribute the bug to the right pipeline stage, instead of saying
// "something is wrong somewhere".
// --------------------------------------------------------------------------

interface ClassifierVerdict {
  status: 'same' | 'needs-review' | 'different';
  primaryReason: string;
  confidence: 'low' | 'medium' | 'high';
  problem: string;
  remediation: string;
}

interface ThreeWayMetrics {
  svgVsTtf: DiffResult | null;
  ttfVsFlutter: DiffResult | null;
  svgVsFlutter: DiffResult | null;
}

function classifyTtfOnly(
  resolved: ResolvedIcon,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null
): ClassifierVerdict | null {
  if (primaryGlyph.empty || !primaryGlyph.bbox) {
    return {
      status: 'different',
      primaryReason: 'EMPTY_GLYPH',
      confidence: 'high',
      problem: 'Primary glyph has empty outline in TTF',
      remediation:
        'Check FONT_AUDIT.md; svg2ttf likely dropped this glyph during build',
    };
  }
  if (
    resolved.duotone &&
    secondaryGlyph &&
    (secondaryGlyph.empty || !secondaryGlyph.bbox)
  ) {
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
  if (resolved.duotone && primaryGlyph.bbox && secondaryGlyph?.bbox) {
    const dx =
      Math.abs(primaryGlyph.bbox.cx - secondaryGlyph.bbox.cx) /
      primaryGlyph.unitsPerEm;
    const dy =
      Math.abs(primaryGlyph.bbox.cy - secondaryGlyph.bbox.cy) /
      primaryGlyph.unitsPerEm;
    // svg2ttf collapses byte-identical SVG bodies into one glyph and points
    // many codepoints at it (see §33b on Solar / Phosphor shared rings).
    // When the secondary glyph NAME doesn't match the requested icon's
    // name, the secondary is a shared "ring" body that's symmetrically
    // centred while the primary is the silhouette which can sit off-centre.
    // In that case, a bbox-centroid mismatch is EXPECTED (the primary body
    // is intentionally asymmetric, the secondary is a shared frame), not a
    // bug. Lower confidence to medium and dial status to needs-review for
    // dedup-shared cases so it lands in manual triage instead of failing
    // CI.
    const sharedSecondaryGlyph =
      secondaryGlyph.glyphName !== resolved.iconName;

    // Bbox overlap check — see audit/glyph_metrics.ts:classifyDuotoneGeometry.
    // If primary and secondary bboxes overlap in 2-D, the asymmetry is
    // intentional (small accent inside a silhouette, e.g. ic:twotone-motorcycle,
    // ph:hand-arrow-down-duotone — both visually correct, SSIM ≥ 0.94 against
    // upstream SVG). Only flag DUOTONE_BBOX_MISMATCH when the bboxes are
    // genuinely disjoint along an axis (the solar regression class).
    const pb = primaryGlyph.bbox;
    const sb = secondaryGlyph.bbox;
    const xDisjoint = pb.xMax < sb.xMin || sb.xMax < pb.xMin;
    const yDisjoint = pb.yMax < sb.yMin || sb.yMax < pb.yMin;
    const bboxesOverlap = !xDisjoint && !yDisjoint;
    if (dx > 0.04 || dy > 0.04) {
      if (bboxesOverlap) {
        // Asymmetric-by-design duotone — informational, not a bug.
        return null;
      }
      if (sharedSecondaryGlyph && dx < 0.10 && dy < 0.10) {
        return {
          status: 'needs-review',
          primaryReason: 'DUOTONE_BBOX_SHARED_SECONDARY',
          confidence: 'medium',
          problem:
            `Primary centroid (${primaryGlyph.bbox.cx.toFixed(0)},${primaryGlyph.bbox.cy.toFixed(0)}) ` +
            `differs from secondary (${secondaryGlyph.bbox.cx.toFixed(0)},${secondaryGlyph.bbox.cy.toFixed(0)}) ` +
            `by ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% of em; ` +
            `secondary glyph is the SHARED "${secondaryGlyph.glyphName}" (dedup), so the primary's asymmetry ` +
            `is intentional — not a render bug, but worth eyeballing.`,
          remediation:
            'Manual visual check — typical of Solar / Phosphor duotone families where the secondary is a generic ring',
        };
      }
      return {
        status: 'different',
        primaryReason: 'DUOTONE_BBOX_MISMATCH',
        confidence: 'high',
        problem:
          `Primary glyph centroid (${primaryGlyph.bbox.cx.toFixed(0)},${primaryGlyph.bbox.cy.toFixed(0)}) ` +
          `differs from secondary (${secondaryGlyph.bbox.cx.toFixed(0)},${secondaryGlyph.bbox.cy.toFixed(0)}) ` +
          `by ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% of em — layers will overlay misaligned ` +
          `(bboxes disjoint along ${xDisjoint ? 'x' : 'y'} axis)`,
        remediation:
          'GLYPH_METRICS_AUDIT.md likely flags this pair. Root cause is usually svg2ttf glyph dedup ' +
          '(identical SVG bodies collapsed into one glyph with whichever first-encountered xMin) — see ' +
          'RESEARCH_PLAN §33 for fix.',
      };
    }
  }
  return null;
}

function classify3way(
  resolved: ResolvedIcon,
  m: ThreeWayMetrics,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null
): ClassifierVerdict {
  const ttfVerdict = classifyTtfOnly(resolved, primaryGlyph, secondaryGlyph);
  if (ttfVerdict) return ttfVerdict;

  const SAME = { mismatch: 0.02, hamming: 4, ssim: 0.98 };
  const DIFFERENT = { mismatch: 0.15, hamming: 14, ssim: 0.85 };

  const cls = (d: DiffResult | null): 'same' | 'needs-review' | 'different' | 'n/a' => {
    if (!d) return 'n/a';
    // 3-signal vote with SSIM tiebreaker.
    let sameVotes = 0;
    let diffVotes = 0;
    if (d.mismatchPct <= SAME.mismatch) sameVotes++;
    else if (d.mismatchPct >= DIFFERENT.mismatch) diffVotes++;
    if (d.hamming <= SAME.hamming) sameVotes++;
    else if (d.hamming >= DIFFERENT.hamming) diffVotes++;
    if (d.ssim >= SAME.ssim) sameVotes++;
    else if (d.ssim <= DIFFERENT.ssim) diffVotes++;
    if (sameVotes >= 2) return 'same';
    if (diffVotes >= 2) return 'different';
    return 'needs-review';
  };

  const svgTtf = cls(m.svgVsTtf);
  const ttfFlu = cls(m.ttfVsFlutter);
  const svgFlu = cls(m.svgVsFlutter);

  // Locality rules — the three-way is here for THIS.

  // Both intermediates AND end-to-end same → everything OK.
  if (svgTtf === 'same' && ttfFlu === 'same' && svgFlu === 'same') {
    return {
      status: 'same',
      primaryReason: 'OK_3WAY',
      confidence: 'high',
      problem: '—',
      remediation: '—',
    };
  }

  // SVG vs TTF different, TTF vs Flutter same → bug in generator/build.
  if (svgTtf === 'different' && ttfFlu === 'same') {
    // Differentiate sub-causes from ink + drift metrics.
    const d = m.svgVsTtf!;
    if (d.inkB > 0.7 && d.inkA < 0.5) {
      return {
        status: 'different',
        primaryReason: 'GENERATOR_FILLED_BLOB',
        confidence: 'high',
        problem:
          `TTF glyph is mostly solid ink (${(d.inkB * 100).toFixed(1)}%) ` +
          `while upstream is sparse (${(d.inkA * 100).toFixed(1)}%) — flutter render matches the TTF`,
        remediation:
          'Likely paint-order risk drop (§5e) OR stroke-fill missed evenodd cutouts',
      };
    }
    if (d.inkB < 0.005 && d.inkA > 0.05) {
      return {
        status: 'different',
        primaryReason: 'GENERATOR_BLANK_GLYPH',
        confidence: 'high',
        problem:
          'TTF glyph rasterizes to nothing while upstream SVG has content; flutter render matches the TTF (= empty)',
        remediation:
          'Check FONT_AUDIT.md for empty glyph; root cause is usually svg2ttf path drop or Potrace blank trace',
      };
    }
    if (d.inkB > d.inkA * 1.4 && d.mismatchPct > 0.3) {
      return {
        status: 'different',
        primaryReason: 'GENERATOR_MISSING_CUTOUTS',
        confidence: 'high',
        problem:
          `TTF ink ${d.inkB.toFixed(3)} >> upstream ink ${d.inkA.toFixed(3)} — internal cutouts likely gone (evenodd → nonzero winding)`,
        remediation:
          'per-icon raster-trace fallback should fire (§5a); audit STROKE_AUDIT.md',
      };
    }
    return {
      status: 'different',
      primaryReason: 'GENERATOR_DIFF',
      confidence: 'medium',
      problem:
        `SVG vs TTF mismatch ${(d.mismatchPct * 100).toFixed(1)}% (Hamming ${d.hamming}, SSIM ${d.ssim.toFixed(2)}); ` +
        'flutter render matches the TTF — bug is upstream of widget',
      remediation: 'Diff is in generator/font-build pipeline. Manual triage; bump --size to confirm structural',
    };
  }

  // SVG vs TTF same, TTF vs Flutter different → widget paint bug.
  if (svgTtf === 'same' && ttfFlu === 'different') {
    const d = m.ttfVsFlutter!;
    const driftFracX = Math.abs(d.cxDriftPx) / d.width;
    const driftFracY = Math.abs(d.cyDriftPx) / d.width;
    if ((driftFracX > 0.06 || driftFracY > 0.06) && d.mismatchPct < 0.4) {
      const axis = driftFracX > driftFracY ? 'HORIZONTAL' : 'VERTICAL';
      return {
        status: 'different',
        primaryReason: `WIDGET_${axis}_DRIFT`,
        confidence: 'high',
        problem:
          `Flutter render centroid shifted by (${d.cxDriftPx.toFixed(1)}, ${d.cyDriftPx.toFixed(1)})px ` +
          `from TTF composition (TTF matches SVG; only flutter render is off)`,
        remediation:
          'IconifyIcon paint() origin policy off; check CustomPaint BoxFit emulation in iconify_icon.dart',
      };
    }
    return {
      status: 'different',
      primaryReason: 'WIDGET_RENDER_DIFF',
      confidence: 'medium',
      problem:
        `TTF vs Flutter mismatch ${(d.mismatchPct * 100).toFixed(1)}% (Hamming ${d.hamming}, SSIM ${d.ssim.toFixed(2)}); ` +
        'SVG vs TTF is clean — bug is in widget composition',
      remediation:
        'Likely kind dispatch wrong, secondary opacity off, or FontLoader registration regression',
    };
  }

  // BOTH intermediates different → either both stages have issues, or
  // a single noise source (e.g. opacity diff) shifts every comparison.
  if (svgTtf === 'different' && ttfFlu === 'different') {
    return {
      status: 'different',
      primaryReason: 'CASCADE_MISMATCH',
      confidence: 'medium',
      problem:
        'Both SVG↔TTF and TTF↔Flutter show large diffs; could be cascading bug or systemic (opacity, color, viewBox)',
      remediation:
        'Inspect upstream.png / glyph-primary.png / ttf-composed.png / flutter-rendered.png side by side; ' +
        'check the secondary opacity convention (50% upstream vs 40% IconifyIcon)',
    };
  }

  // SVG vs Flutter different but intermediates same — this is an
  // anomalous configuration that usually means we're seeing the
  // secondary-opacity discrepancy (40% vs 50%).
  if (svgFlu === 'different') {
    return {
      status: 'needs-review',
      primaryReason: 'OPACITY_NOISE',
      confidence: 'low',
      problem:
        `End-to-end SVG↔Flutter shows ${m.svgVsFlutter ? (m.svgVsFlutter.mismatchPct * 100).toFixed(1) : '?'}% mismatch ` +
        'but SVG↔TTF and TTF↔Flutter agree — likely opacity-normalisation discrepancy not a real bug',
      remediation:
        'Phase 2: normalise opacities (iconify 50% secondary vs IconifyIcon 40%) before pixelmatch',
    };
  }

  // Everything mildly off — needs-review.
  if (svgFlu === 'needs-review' || svgTtf === 'needs-review' || ttfFlu === 'needs-review') {
    return {
      status: 'needs-review',
      primaryReason: 'MINOR_DIFF_3WAY',
      confidence: 'low',
      problem:
        'One or more pairwise diffs in the mild-mismatch band (likely AA noise or opacity)',
      remediation: 'Manual inspect; bump --size to confirm if structural',
    };
  }

  return {
    status: 'same',
    primaryReason: 'OK_3WAY',
    confidence: 'medium',
    problem: '—',
    remediation: '—',
  };
}

function classify1way(
  resolved: ResolvedIcon,
  diff: DiffResult,
  primaryGlyph: GlyphReport,
  secondaryGlyph: GlyphReport | null
): ClassifierVerdict {
  // Phase 1 verbatim — preserved for the single-icon, no-3way path.
  const ttfVerdict = classifyTtfOnly(resolved, primaryGlyph, secondaryGlyph);
  if (ttfVerdict) return ttfVerdict;

  const { mismatchPct, inkA, inkB, cxDriftPx, cyDriftPx, width } = diff;
  const driftFracX = Math.abs(cxDriftPx) / width;
  const driftFracY = Math.abs(cyDriftPx) / width;

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
  if (inkB > 0.7 && inkA < 0.5) {
    return {
      status: 'different',
      primaryReason: 'FILLED_BLOB',
      confidence: 'high',
      problem: 'Flutter render is mostly solid ink while upstream is sparse',
      remediation: 'Likely paint-order risk drop (§5e) OR stroke-fill missed evenodd cutouts',
    };
  }
  if ((driftFracX > 0.06 || driftFracY > 0.06) && mismatchPct < 0.4) {
    const axis = driftFracX > driftFracY ? 'HORIZONTAL' : 'VERTICAL';
    return {
      status: 'different',
      primaryReason: `${axis}_DRIFT`,
      confidence: 'medium',
      problem:
        `Centroid shifted by (${cxDriftPx.toFixed(1)}, ${cyDriftPx.toFixed(1)})px out of ${width}px canvas`,
      remediation:
        'Rendering layer alignment regression. Check glyph bbox vs em-quad; ' +
        'IconifyIcon paint() origin policy (RESEARCH_PLAN §33).',
    };
  }
  if (inkB > inkA * 1.2 && mismatchPct > 0.05) {
    return {
      status: 'different',
      primaryReason: 'EXTRA_INK',
      confidence: 'medium',
      problem: `ink ratio ours=${inkB.toFixed(3)} vs upstream=${inkA.toFixed(3)} (20%+ over)`,
      remediation: 'Likely over-aggressive raster-trace; review stroke-fill processing',
    };
  }
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
    return { status: 'same', primaryReason: 'OK', confidence: 'high', problem: '—', remediation: '—' };
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
// Per-icon orchestration
// --------------------------------------------------------------------------

export interface PerIconReport {
  iconRef: string;
  prefix: string;
  iconName: string;
  packageName: string;
  duotone: boolean;
  duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
  primary: GlyphReport;
  secondary: GlyphReport | null;
  // Files written to outDir/<slug>/
  files: {
    upstreamSvg: string;
    upstreamPng: string;
    primaryPng: string;
    secondaryPng: string | null;
    ttfComposedPng: string | null;
    flutterPng: string | null;
    diffSvgVsFlutter: string | null;
    diffSvgVsTtf: string | null;
    diffTtfVsFlutter: string | null;
  };
  diffs: ThreeWayMetrics;
  // For single-icon, non-3way mode the legacy field is filled in:
  legacyDiff: DiffResult | null;
  verdict: ClassifierVerdict;
  fontTtfPath: string;
  secondaryTtfPath: string | null;
  // ms timings (per-stage)
  timings: Record<string, number>;
  error?: string;
}

function kindCode(resolved: ResolvedIcon): 'solo' | 'hint' | 'paintOrder' | 'maskInternal' {
  if (!resolved.duotone) return 'solo';
  return resolved.duotoneKind ?? 'hint';
}

async function runOneIcon(
  iconRef: string,
  size: number,
  outBase: string,
  threeWay: boolean,
  skipFlutter: boolean,
  verbose: boolean
): Promise<PerIconReport> {
  const t0 = Date.now();
  const resolved = await resolveIcon(iconRef);
  const upstream = await readUpstreamIcon(resolved.prefix, resolved.iconName);
  const slug = `${resolved.prefix}__${resolved.iconName}`;
  const outDir = join(outBase, slug);
  await mkdir(outDir, { recursive: true });

  const timings: Record<string, number> = {};
  // ----- 1. upstream SVG -> PNG via resvg
  const upstreamSvg = join(outDir, 'upstream.svg');
  const upstreamPng = join(outDir, 'upstream.png');
  const t1 = Date.now();
  await rasterizeUpstream(upstream, size, upstreamSvg, upstreamPng);
  timings.upstream = Date.now() - t1;

  // ----- 2. TTF primary glyph -> PNG
  const primaryTtf = join(resolved.packageDir, `assets/fonts/${resolved.primaryFamily}.ttf`);
  if (!existsSync(primaryTtf)) {
    throw new Error(`primary TTF not found: ${primaryTtf}`);
  }
  const primaryPng = join(outDir, 'glyph-primary.png');
  const primaryReportPath = join(outDir, 'glyph-primary.bbox.json');
  const t2 = Date.now();
  const primaryGlyph = await rasterizeGlyph(
    primaryTtf,
    resolved.primaryCodepoint,
    size,
    primaryPng,
    primaryReportPath,
    verbose,
    'em'
  );
  timings.primaryGlyph = Date.now() - t2;

  // ----- 3. TTF secondary glyph -> PNG (if duotone)
  let secondaryGlyph: GlyphReport | null = null;
  let secondaryTtf: string | null = null;
  let secondaryPng: string | null = null;
  if (resolved.duotone && resolved.secondaryFamily) {
    secondaryTtf = join(
      resolved.packageDir,
      `assets/fonts/${resolved.secondaryFamily}.ttf`
    );
    if (existsSync(secondaryTtf)) {
      secondaryPng = join(outDir, 'glyph-secondary.png');
      const secondaryReportPath = join(outDir, 'glyph-secondary.bbox.json');
      const t3 = Date.now();
      secondaryGlyph = await rasterizeGlyph(
        secondaryTtf,
        resolved.primaryCodepoint,
        size,
        secondaryPng,
        secondaryReportPath,
        verbose,
        'em'
      );
      timings.secondaryGlyph = Date.now() - t3;
    } else if (verbose) {
      console.error(`WARN: secondary TTF missing: ${secondaryTtf}`);
    }
  }

  // ----- 4. TTF composed = primary + secondary with paint-kind composition.
  // Always produced (even when not duotone — then it's the primary panel).
  let ttfComposedPng: string | null = null;
  if (threeWay) {
    ttfComposedPng = join(outDir, 'ttf-composed.png');
    const t4 = Date.now();
    await composeTtf(primaryPng, secondaryPng, kindCode(resolved), size, ttfComposedPng);
    timings.ttfCompose = Date.now() - t4;
  }

  // ----- 5. Flutter rendered (optional)
  let flutterPng: string | null = null;
  if (!skipFlutter) {
    flutterPng = join(outDir, 'flutter-rendered.png');
    const t5 = Date.now();
    await renderFlutter(iconRef, size, 'duotone', flutterPng, verbose);
    timings.flutterRender = Date.now() - t5;
  }

  // ----- 6. Diffs.
  const diffs: ThreeWayMetrics = {
    svgVsTtf: null,
    ttfVsFlutter: null,
    svgVsFlutter: null,
  };
  let diffSvgVsFlutter: string | null = null;
  let diffSvgVsTtf: string | null = null;
  let diffTtfVsFlutter: string | null = null;
  let legacyDiff: DiffResult | null = null;

  if (threeWay && ttfComposedPng) {
    diffSvgVsTtf = join(outDir, 'diff-svg-vs-ttf.png');
    const tA = Date.now();
    diffs.svgVsTtf = await diffPngs(upstreamPng, ttfComposedPng, diffSvgVsTtf);
    timings.diffSvgVsTtf = Date.now() - tA;
    if (flutterPng) {
      diffTtfVsFlutter = join(outDir, 'diff-ttf-vs-flutter.png');
      const tB = Date.now();
      diffs.ttfVsFlutter = await diffPngs(ttfComposedPng, flutterPng, diffTtfVsFlutter);
      timings.diffTtfVsFlutter = Date.now() - tB;
    }
  }
  if (flutterPng) {
    diffSvgVsFlutter = join(outDir, threeWay ? 'diff-svg-vs-flutter.png' : 'diff-pixelmatch.png');
    const tC = Date.now();
    diffs.svgVsFlutter = await diffPngs(upstreamPng, flutterPng, diffSvgVsFlutter);
    legacyDiff = diffs.svgVsFlutter;
    timings.diffSvgVsFlutter = Date.now() - tC;
  }

  // ----- 7. Verdict.
  let verdict: ClassifierVerdict;
  if (threeWay) {
    verdict = classify3way(resolved, diffs, primaryGlyph, secondaryGlyph);
  } else if (legacyDiff) {
    verdict = classify1way(resolved, legacyDiff, primaryGlyph, secondaryGlyph);
  } else {
    const ttfV = classifyTtfOnly(resolved, primaryGlyph, secondaryGlyph);
    verdict = ttfV ?? {
      status: 'same',
      primaryReason: 'TTF_OK',
      confidence: 'low',
      problem: 'TTF-only checks pass; run without --skip-flutter for end-to-end verdict',
      remediation: '—',
    };
  }

  const report: PerIconReport = {
    iconRef,
    prefix: resolved.prefix,
    iconName: resolved.iconName,
    packageName: resolved.packageName,
    duotone: resolved.duotone,
    duotoneKind: resolved.duotoneKind,
    primary: primaryGlyph,
    secondary: secondaryGlyph,
    files: {
      upstreamSvg,
      upstreamPng,
      primaryPng,
      secondaryPng,
      ttfComposedPng,
      flutterPng,
      diffSvgVsFlutter,
      diffSvgVsTtf,
      diffTtfVsFlutter,
    },
    diffs,
    legacyDiff,
    verdict,
    fontTtfPath: primaryTtf,
    secondaryTtfPath: secondaryTtf,
    timings: { ...timings, total: Date.now() - t0 },
  };

  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeReportMd(outDir, resolved, report);
  return report;
}

// --------------------------------------------------------------------------
// Markdown report (per-icon)
// --------------------------------------------------------------------------

async function writeReportMd(
  outDir: string,
  resolved: ResolvedIcon,
  report: PerIconReport
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { primary, secondary, diffs, verdict, files, legacyDiff } = report;
  const lines: string[] = [];
  lines.push(`# Visual-diff: \`${resolved.prefix}:${resolved.iconName}\``);
  lines.push('');
  lines.push(`Generated ${today}. Phase 1.5 three-way diff (see RESEARCH_PLAN §26 / §33b).`);
  lines.push('');
  lines.push(`- **Package**: \`${resolved.packageName}\``);
  lines.push(`- **Primary codepoint**: \`0x${resolved.primaryCodepoint.toString(16)}\``);
  lines.push(`- **Primary font family**: \`${resolved.primaryFamily}\``);
  lines.push(
    `- **Duotone**: ${resolved.duotone ? `yes (kind=${resolved.duotoneKind ?? 'hint'})` : 'no'}`
  );
  if (resolved.duotone) {
    lines.push(`- **Secondary font family**: \`${resolved.secondaryFamily}\``);
  }
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  lines.push(`- **Status**: \`${verdict.status}\``);
  lines.push(`- **Primary reason**: \`${verdict.primaryReason}\``);
  lines.push(`- **Confidence**: \`${verdict.confidence}\``);
  lines.push(`- **Problem**: ${verdict.problem}`);
  lines.push(`- **Remediation**: ${verdict.remediation}`);
  lines.push('');

  lines.push('## Frames');
  lines.push('');
  lines.push('| Layer | Image |');
  lines.push('|---|---|');
  lines.push('| Upstream Iconify SVG (resvg) | ![upstream](upstream.png) |');
  lines.push('| TTF primary glyph (em-box) | ![glyph-primary](glyph-primary.png) |');
  if (secondary) {
    lines.push('| TTF secondary glyph (em-box) | ![glyph-secondary](glyph-secondary.png) |');
  }
  if (files.ttfComposedPng) {
    lines.push(
      `| TTF composed (pure-TS, kind=${resolved.duotone ? resolved.duotoneKind ?? 'hint' : 'solo'}) | ![ttf-composed](ttf-composed.png) |`
    );
  }
  if (files.flutterPng) {
    lines.push('| Flutter rendered (IconifyIcon, fvm flutter test) | ![flutter](flutter-rendered.png) |');
  }
  lines.push('');
  // Diffs section.
  const diffRows: string[] = [];
  if (files.diffSvgVsTtf && diffs.svgVsTtf) {
    diffRows.push(
      `| SVG vs TTF (generator/build stage) | ![svg-vs-ttf](diff-svg-vs-ttf.png) | mismatch=${(diffs.svgVsTtf.mismatchPct * 100).toFixed(2)}% ham=${diffs.svgVsTtf.hamming} ssim=${diffs.svgVsTtf.ssim.toFixed(3)} |`
    );
  }
  if (files.diffTtfVsFlutter && diffs.ttfVsFlutter) {
    diffRows.push(
      `| TTF vs Flutter (widget render stage) | ![ttf-vs-flutter](diff-ttf-vs-flutter.png) | mismatch=${(diffs.ttfVsFlutter.mismatchPct * 100).toFixed(2)}% ham=${diffs.ttfVsFlutter.hamming} ssim=${diffs.ttfVsFlutter.ssim.toFixed(3)} |`
    );
  }
  if (files.diffSvgVsFlutter && diffs.svgVsFlutter) {
    diffRows.push(
      `| SVG vs Flutter (end-to-end) | ![svg-vs-flutter](${files.diffSvgVsFlutter.endsWith('diff-pixelmatch.png') ? 'diff-pixelmatch.png' : 'diff-svg-vs-flutter.png'}) | mismatch=${(diffs.svgVsFlutter.mismatchPct * 100).toFixed(2)}% ham=${diffs.svgVsFlutter.hamming} ssim=${diffs.svgVsFlutter.ssim.toFixed(3)} |`
    );
  }
  if (diffRows.length > 0) {
    lines.push('## Diffs');
    lines.push('');
    lines.push('| Pair | Heat-map | Metrics |');
    lines.push('|---|---|---|');
    for (const r of diffRows) lines.push(r);
    lines.push('');
  }

  lines.push('## Glyph metrics (raw TTF)');
  lines.push('');
  lines.push('| Layer | Font | Glyph name | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |');
  lines.push('|---|---|---|---:|---:|---|---|---|');
  const fmtBbox = (
    g: GlyphReport,
    fontPath: string,
    role: 'primary' | 'secondary'
  ) => {
    if (!g.bbox) {
      return `| ${role} | \`${fontPath.split('/').pop()}\` | _empty glyph_ | — | — | — | — | — |`;
    }
    return (
      `| ${role} | \`${fontPath.split('/').pop()}\` | ` +
      `\`${g.glyphName}\` | ${g.advance} | ${g.lsb} | ` +
      `${g.bbox.xMin.toFixed(1)}..${g.bbox.xMax.toFixed(1)} | ` +
      `${g.bbox.yMin.toFixed(1)}..${g.bbox.yMax.toFixed(1)} | ` +
      `(${g.bbox.cx.toFixed(0)}, ${g.bbox.cy.toFixed(0)}) |`
    );
  };
  lines.push(fmtBbox(primary, report.fontTtfPath, 'primary'));
  if (secondary && report.secondaryTtfPath) {
    lines.push(fmtBbox(secondary, report.secondaryTtfPath, 'secondary'));
  }
  lines.push('');

  if (legacyDiff || diffs.svgVsFlutter) {
    const d = diffs.svgVsFlutter ?? legacyDiff!;
    lines.push('## End-to-end metrics (SVG vs Flutter)');
    lines.push('');
    lines.push(`- Canvas: ${d.width} × ${d.height}`);
    lines.push(
      `- Mismatch: ${d.mismatchPixels.toLocaleString('en-US')} / ${d.totalPixels.toLocaleString('en-US')} px (${(d.mismatchPct * 100).toFixed(2)} %)`
    );
    lines.push(`- Ink ratio upstream: ${d.inkA.toFixed(4)}`);
    lines.push(`- Ink ratio Flutter:  ${d.inkB.toFixed(4)}`);
    lines.push(`- Centroid drift: (${d.cxDriftPx.toFixed(1)}, ${d.cyDriftPx.toFixed(1)}) px`);
    lines.push(`- dHash: \`${d.dHashA}\` vs \`${d.dHashB}\` (Hamming ${d.hamming}/64)`);
    lines.push(`- SSIM: ${d.ssim.toFixed(4)}`);
    lines.push('');
  }

  if (resolved.duotone && primary.bbox && secondary?.bbox) {
    const dx = secondary.bbox.cx - primary.bbox.cx;
    const dy = secondary.bbox.cy - primary.bbox.cy;
    lines.push('## Duotone alignment (TTF-space)');
    lines.push('');
    lines.push(
      `- **Primary centroid**: (${primary.bbox.cx.toFixed(1)}, ${primary.bbox.cy.toFixed(1)}) in em-units of ${primary.unitsPerEm}`
    );
    lines.push(`- **Secondary centroid**: (${secondary.bbox.cx.toFixed(1)}, ${secondary.bbox.cy.toFixed(1)})`);
    lines.push(`- **Centroid delta**: (${dx.toFixed(1)}, ${dy.toFixed(1)}) em-units`);
    const dxFrac = Math.abs(dx) / primary.unitsPerEm;
    const dyFrac = Math.abs(dy) / primary.unitsPerEm;
    lines.push(
      `- **Fraction of em**: (${(dxFrac * 100).toFixed(1)} %, ${(dyFrac * 100).toFixed(1)} %)`
    );
    if (dxFrac > 0.04 || dyFrac > 0.04) {
      lines.push('');
      lines.push(
        '> WARN: Centroid drift exceeds the 4 % threshold beyond which the two layers ' +
          'will visibly overlay out of alignment.'
      );
    }
    lines.push('');
  }

  await writeFile(join(outDir, 'REPORT.md'), lines.join('\n'), 'utf8');
}

// --------------------------------------------------------------------------
// Corpus mode
// --------------------------------------------------------------------------

function readCorpusFile(path: string): string[] {
  const raw = require('node:fs').readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed && Array.isArray(parsed.icons)) return parsed.icons.map(String);
    throw new Error(`corpus JSON must be array or {icons:[]}; got ${typeof parsed}`);
  }
  // Plain text: one prefix:name per line, # comments, blank-line tolerant.
  return raw
    .split('\n')
    .map((l: string) => l.split('#')[0]!.trim())
    .filter((l: string) => l.length > 0 && l.includes(':'));
}

export interface CorpusSummary {
  generatedAt: string;
  threeWay: boolean;
  size: number;
  total: number;
  ok: number;
  needsReview: number;
  different: number;
  byPack: Record<string, { total: number; ok: number; needsReview: number; different: number }>;
  byReason: Record<string, number>;
  rows: Array<{
    iconRef: string;
    prefix: string;
    iconName: string;
    slug: string;
    status: ClassifierVerdict['status'];
    primaryReason: string;
    confidence: ClassifierVerdict['confidence'];
    duotone: boolean;
    duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
    metrics: {
      svgVsFlutter: { mismatchPct: number; hamming: number; ssim: number } | null;
      svgVsTtf: { mismatchPct: number; hamming: number; ssim: number } | null;
      ttfVsFlutter: { mismatchPct: number; hamming: number; ssim: number } | null;
    };
    timings: Record<string, number>;
    error?: string;
  }>;
}

async function runCorpus(args: CliArgs): Promise<CorpusSummary> {
  const items = readCorpusFile(args.corpusFile!);
  console.log(`corpus: ${items.length} icons, threeWay=${args.threeWay}, skipFlutter=${args.skipFlutter}`);
  const outBase = args.outBase!;
  await mkdir(outBase, { recursive: true });

  const summary: CorpusSummary = {
    generatedAt: new Date().toISOString(),
    threeWay: args.threeWay,
    size: args.size,
    total: items.length,
    ok: 0,
    needsReview: 0,
    different: 0,
    byPack: {},
    byReason: {},
    rows: [],
  };
  let idx = 0;
  for (const ref of items) {
    idx++;
    process.stdout.write(`[${idx}/${items.length}] ${ref} ... `);
    try {
      const r = await runOneIcon(
        ref,
        args.size,
        outBase,
        args.threeWay,
        args.skipFlutter,
        args.verbose
      );
      const dot = (d: DiffResult | null) =>
        d ? { mismatchPct: d.mismatchPct, hamming: d.hamming, ssim: d.ssim } : null;
      summary.rows.push({
        iconRef: r.iconRef,
        prefix: r.prefix,
        iconName: r.iconName,
        slug: `${r.prefix}__${r.iconName}`,
        status: r.verdict.status,
        primaryReason: r.verdict.primaryReason,
        confidence: r.verdict.confidence,
        duotone: r.duotone,
        duotoneKind: r.duotoneKind,
        metrics: {
          svgVsFlutter: dot(r.diffs.svgVsFlutter),
          svgVsTtf: dot(r.diffs.svgVsTtf),
          ttfVsFlutter: dot(r.diffs.ttfVsFlutter),
        },
        timings: r.timings,
      });
      // Aggregate.
      if (r.verdict.status === 'same') summary.ok++;
      else if (r.verdict.status === 'needs-review') summary.needsReview++;
      else summary.different++;
      const packBucket = (summary.byPack[r.prefix] ??= {
        total: 0,
        ok: 0,
        needsReview: 0,
        different: 0,
      });
      packBucket.total++;
      if (r.verdict.status === 'same') packBucket.ok++;
      else if (r.verdict.status === 'needs-review') packBucket.needsReview++;
      else packBucket.different++;
      summary.byReason[r.verdict.primaryReason] =
        (summary.byReason[r.verdict.primaryReason] ?? 0) + 1;
      console.log(`${r.verdict.status} (${r.verdict.primaryReason}) ${r.timings.total ?? '?'}ms`);
    } catch (err: any) {
      summary.rows.push({
        iconRef: ref,
        prefix: ref.split(':')[0]!,
        iconName: ref.split(':').slice(1).join(':'),
        slug: ref.replace(':', '__'),
        status: 'different',
        primaryReason: 'ERROR',
        confidence: 'low',
        duotone: false,
        metrics: { svgVsFlutter: null, svgVsTtf: null, ttfVsFlutter: null },
        timings: {},
        error: err?.message ?? String(err),
      });
      summary.different++;
      summary.byReason.ERROR = (summary.byReason.ERROR ?? 0) + 1;
      console.error(`ERROR: ${err?.message ?? err}`);
    }
  }
  await writeFile(join(outBase, 'corpus.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(
    `\nsummary: ${summary.ok} ok / ${summary.needsReview} needs-review / ${summary.different} different (of ${summary.total})`
  );
  // Markdown summary alongside JSON.
  await writeFile(join(outBase, 'corpus.md'), buildMarkdownSummary(summary), 'utf8');
  return summary;
}

function buildMarkdownSummary(s: CorpusSummary): string {
  const lines: string[] = [];
  lines.push('# Visual three-way audit — corpus run');
  lines.push('');
  lines.push(`Generated: ${s.generatedAt}`);
  lines.push('');
  lines.push(
    `- **Total**: ${s.total}  •  **OK**: ${s.ok}  •  **Needs review**: ${s.needsReview}  •  **Different**: ${s.different}`
  );
  lines.push(`- 3-way mode: ${s.threeWay ? 'yes' : 'no'}  •  canvas: ${s.size}px`);
  lines.push('');
  lines.push('## By pack');
  lines.push('');
  lines.push('| Pack | total | OK | needs-review | different |');
  lines.push('|---|---:|---:|---:|---:|');
  const packs = Object.keys(s.byPack).sort();
  for (const p of packs) {
    const b = s.byPack[p]!;
    lines.push(`| \`${p}\` | ${b.total} | ${b.ok} | ${b.needsReview} | ${b.different} |`);
  }
  lines.push('');
  lines.push('## By classifier reason');
  lines.push('');
  lines.push('| Reason | Count |');
  lines.push('|---|---:|');
  const reasons = Object.entries(s.byReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of reasons) {
    lines.push(`| \`${reason}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Rows (sorted: different > needs-review > same)');
  lines.push('');
  lines.push('| Status | Reason | Icon | dur (ms) |');
  lines.push('|---|---|---|---:|');
  const sortOrder = { different: 0, 'needs-review': 1, same: 2 } as const;
  const rows = [...s.rows].sort((a, b) => {
    const sd = sortOrder[a.status] - sortOrder[b.status];
    if (sd !== 0) return sd;
    return a.iconRef.localeCompare(b.iconRef);
  });
  for (const r of rows) {
    lines.push(
      `| \`${r.status}\` | \`${r.primaryReason}\` | [\`${r.iconRef}\`](${r.slug}/REPORT.md) | ${r.timings.total ?? '—'} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'single') {
    const report = await runOneIcon(
      args.iconRef!,
      args.size,
      args.outBase!,
      args.threeWay,
      args.skipFlutter,
      args.verbose
    );
    console.log(`verdict: ${report.verdict.status} / ${report.verdict.primaryReason}`);
    console.log(`done. all output under ${join(args.outBase!, report.prefix + '__' + report.iconName)}`);
  } else {
    const summary = await runCorpus(args);
    if (args.buildDashboard) {
      // Lazy import to avoid loading dashboard code on single-icon runs.
      const { writeDashboard } = await import('./dashboard.ts');
      await writeDashboard(args.outBase!, summary);
      console.log(`dashboard: ${join(args.outBase!, 'index.html')}`);
    }
  }
}

main().catch((err) => {
  console.error(`visual-diff: ${err.message ?? err}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
