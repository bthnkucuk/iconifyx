#!/usr/bin/env bun
/**
 * vtracer_qa — fast statistical QA for a pack just enabled in
 * `config.vtracerSets`.
 *
 * Samples N random duotone icons from the regenerated manifest, runs a
 * lightweight three-layer comparison (upstream resvg PNG, TTF primary
 * glyph PNG, TTF secondary glyph PNG), and buckets each into one of:
 *
 *   - IDENTICAL_OK         primary + secondary both have content; primary
 *                          ink ratio reasonably close to upstream silhouette
 *   - MOSTLY_OK_MINOR_DIFF small structural deviation but both layers
 *                          present and roughly aligned
 *   - LAYER_ORDER_FLIP     primary much SPARSER than secondary (background
 *                          should be larger — vtracer area sort may have
 *                          flipped)
 *   - BLOB_OR_BLANK        primary empty, or secondary empty + paint-order
 *                          required, or primary covers >95 % canvas with
 *                          secondary <5 % (foreground detail lost)
 *
 * Print summary + ASCII bar; exit 0 if recovery rate ≥ THRESHOLD, else 1.
 *
 * Reuses the existing visual-diff rasterize_glyph.py via the python venv
 * for glyph rasterisation; uses @resvg/resvg-js inline for upstream SVG.
 *
 * Usage:
 *   bun run tools/generator/audit/vtracer_qa.ts <prefix> [--sample N]
 *                                               [--size N] [--seed N]
 *                                               [--threshold PCT]
 *                                               [--write-md PATH]
 *
 *   bun run tools/generator/audit/vtracer_qa.ts fluent-emoji-flat
 *   bun run tools/generator/audit/vtracer_qa.ts noto --sample 40 --seed 42
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const HARNESS_DIR = dirname(import.meta.url.replace('file://', ''));
const REPO_ROOT = resolvePath(HARNESS_DIR, '../../..');
const MANIFEST_DIR = join(REPO_ROOT, 'tools/generator/manifests');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const PYTHON_BIN = join(REPO_ROOT, 'tools/generator/python/.venv/bin/python');
const RASTERIZE_SCRIPT = join(
  REPO_ROOT,
  'tools/generator/audit/visual-diff/rasterize_glyph.py'
);
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
  throw new Error('cannot find @iconify/json json/ dir');
}

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

interface GlyphReport {
  glyphName: string;
  unitsPerEm: number;
  empty?: boolean;
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
}

interface Args {
  prefix: string;
  sample: number;
  size: number;
  seed: number;
  threshold: number;
  writeMd?: string;
  onlyVtracerKind: boolean;
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0) {
    console.error(
      'usage: vtracer_qa <prefix> [--sample N] [--size N] [--seed N] [--threshold PCT] [--write-md PATH]'
    );
    process.exit(2);
  }
  let prefix: string | undefined;
  let sample = 30;
  let size = 256;
  let seed = 1;
  let threshold = 70;
  let writeMd: string | undefined;
  let onlyVtracerKind = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      if (prefix) {
        console.error(`unexpected positional arg: ${a}`);
        process.exit(2);
      }
      prefix = a;
      continue;
    }
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        console.error(`flag ${a} requires a value`);
        process.exit(2);
      }
      return v as string;
    };
    switch (a) {
      case '--sample':
        sample = parseInt(next(), 10);
        break;
      case '--size':
        size = parseInt(next(), 10);
        break;
      case '--seed':
        seed = parseInt(next(), 10);
        break;
      case '--threshold':
        threshold = parseFloat(next());
        break;
      case '--write-md':
        writeMd = next();
        break;
      case '--all-duotone':
        onlyVtracerKind = false;
        break;
      default:
        console.error(`unknown flag: ${a}`);
        process.exit(2);
    }
  }
  if (!prefix) {
    console.error('missing prefix');
    process.exit(2);
  }
  return { prefix, sample, size, seed, threshold, writeMd, onlyVtracerKind };
}

// Deterministic PRNG so re-runs are reproducible for cherry-picked seeds.
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`python exit=${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

async function rasterizeGlyph(
  ttfPath: string,
  codepoint: number,
  size: number,
  outPng: string,
  reportPath: string
): Promise<GlyphReport> {
  await runPython([
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
    'bbox',
    '--out',
    outPng,
    '--report',
    reportPath,
  ]);
  return JSON.parse(await readFile(reportPath, 'utf8')) as GlyphReport;
}

interface UpstreamIcon {
  body: string;
  width: number;
  height: number;
}
async function readUpstreamPack(prefix: string): Promise<{
  width: number;
  height: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
}> {
  const p = join(resolveIconifyJsonDir(), `${prefix}.json`);
  return JSON.parse(await readFile(p, 'utf8'));
}

function buildUpstreamSvg(icon: UpstreamIcon): string {
  const styled = icon.body.replace(/currentColor/g, '#000000');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${icon.width} ${icon.height}" ` +
    `width="${icon.width}" height="${icon.height}">${styled}</svg>`
  );
}

async function rasterizeUpstream(
  icon: UpstreamIcon,
  size: number,
  outPng: string
): Promise<void> {
  const svg = buildUpstreamSvg(icon);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(255,255,255,0)',
  });
  await writeFile(outPng, resvg.render().asPng());
}

async function inkRatio(pngPath: string): Promise<number> {
  const buf = await readFile(pngPath);
  const png = PNG.sync.read(buf);
  const { data, width, height } = png;
  let ink = 0;
  const total = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]!;
      if (a < 16) continue; // mostly transparent → background
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const alpha = a / 255;
      const cr = r * alpha + 255 * (1 - alpha);
      const cg = g * alpha + 255 * (1 - alpha);
      const cb = b * alpha + 255 * (1 - alpha);
      const lum = (cr * 299 + cg * 587 + cb * 114) / 1000;
      if (lum < 200) ink++;
    }
  }
  return ink / total;
}

type Verdict =
  | 'IDENTICAL_OK'
  | 'MOSTLY_OK_MINOR_DIFF'
  | 'LAYER_ORDER_FLIP'
  | 'BLOB_OR_BLANK';

interface Sample {
  iconName: string;
  primaryEmpty: boolean;
  secondaryEmpty: boolean;
  inkUpstream: number;
  inkPrimary: number;
  inkSecondary: number;
  centroidDriftEmFracX: number;
  centroidDriftEmFracY: number;
  verdict: Verdict;
  rationale: string;
}

function classify(s: {
  primary: GlyphReport;
  secondary: GlyphReport;
  inkUpstream: number;
  inkPrimary: number;
  inkSecondary: number;
}): { verdict: Verdict; rationale: string } {
  const { primary, secondary, inkUpstream, inkPrimary, inkSecondary } = s;
  if (primary.empty || !primary.bbox) {
    return {
      verdict: 'BLOB_OR_BLANK',
      rationale: 'primary glyph empty',
    };
  }
  if (secondary.empty || !secondary.bbox) {
    return {
      verdict: 'BLOB_OR_BLANK',
      rationale: 'secondary glyph empty — paint-order broken',
    };
  }
  // Layer flip: vtracer should put the larger-area region as primary
  // (background) and smaller as secondary (foreground). If the rendered
  // primary ink ratio is dramatically smaller than secondary, the area
  // sort likely flipped — the icon will paint inverted.
  if (inkPrimary > 0 && inkSecondary > inkPrimary * 2.0 && inkPrimary < 0.15) {
    return {
      verdict: 'LAYER_ORDER_FLIP',
      rationale: `secondary ink ${inkSecondary.toFixed(3)} >> primary ${inkPrimary.toFixed(3)}`,
    };
  }
  // Blob: primary nearly fills the canvas + secondary barely contributes.
  // The icon will paint as one near-solid silhouette with no foreground
  // detail.
  if (inkPrimary > 0.85 && inkSecondary < 0.05) {
    return {
      verdict: 'BLOB_OR_BLANK',
      rationale: `primary blob ${inkPrimary.toFixed(3)} + secondary detail ${inkSecondary.toFixed(3)}`,
    };
  }
  // Compare combined ink to upstream silhouette to detect grossly
  // wrong coverage (e.g. primary much sparser than the silhouette).
  // Upstream is rendered with fill="#000000" so currentColor parts are
  // black; the resulting ink ratio approximates the icon footprint.
  // Composite-coverage = max(p, s) since they may overlap.
  const composite = Math.max(inkPrimary, inkSecondary);
  // Coverage gap relative to upstream: if our combined coverage is much
  // less than upstream, vtracer dropped substantial geometry.
  if (inkUpstream > 0.2 && composite < inkUpstream * 0.45) {
    return {
      verdict: 'BLOB_OR_BLANK',
      rationale: `coverage gap upstream=${inkUpstream.toFixed(3)} composite=${composite.toFixed(3)}`,
    };
  }
  // Minor drift: coverage matches but ratios shifted by 25%+
  const drift =
    Math.abs(composite - inkUpstream) / Math.max(inkUpstream, 0.001);
  if (drift > 0.25) {
    return {
      verdict: 'MOSTLY_OK_MINOR_DIFF',
      rationale: `coverage drift ${(drift * 100).toFixed(0)}%`,
    };
  }
  return {
    verdict: 'IDENTICAL_OK',
    rationale: `composite=${composite.toFixed(3)} upstream=${inkUpstream.toFixed(3)}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const manifestPath = join(MANIFEST_DIR, `${args.prefix}.json`);
  if (!existsSync(manifestPath)) {
    console.error(`no manifest for ${args.prefix} at ${manifestPath}`);
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const pkgDir = join(PACKAGES_DIR, manifest.subPackage);

  const liveDuotone = Object.entries(manifest.icons).filter(
    ([, ic]) =>
      !ic.deprecated &&
      ic.duotone &&
      (args.onlyVtracerKind ? ic.duotoneKind === 'paintOrder' : true)
  );
  console.log(
    `manifest: live duotone (paintOrder)=${liveDuotone.length} / total live=${Object.values(manifest.icons).filter((i) => !i.deprecated).length}`
  );
  if (liveDuotone.length === 0) {
    console.error('no paintOrder duotone icons found — pack may not have been regenerated with vtracer enabled');
    process.exit(2);
  }

  const upstreamPack = await readUpstreamPack(args.prefix);
  const upstreamW = upstreamPack.width ?? 24;
  const upstreamH = upstreamPack.height ?? 24;

  const rng = mulberry32(args.seed);
  const sampleN = Math.min(args.sample, liveDuotone.length);
  const picked = shuffle(liveDuotone, rng).slice(0, sampleN);

  const workDir = join(tmpdir(), `iconifyx-vtracer-qa-${args.prefix}-${args.seed}`);
  await mkdir(workDir, { recursive: true });

  const results: Sample[] = [];
  let i = 0;
  for (const [name, ic] of picked) {
    i++;
    const primaryTtf = join(pkgDir, `assets/fonts/${ic.fontFamily}.ttf`);
    const secondaryTtf = join(pkgDir, `assets/fonts/${ic.fontFamily}Secondary.ttf`);
    if (!existsSync(primaryTtf) || !existsSync(secondaryTtf)) {
      console.error(`  skip ${name}: missing TTF ${primaryTtf} / ${secondaryTtf}`);
      continue;
    }
    const upstream = upstreamPack.icons[name];
    if (!upstream) {
      console.error(`  skip ${name}: upstream not found`);
      continue;
    }
    const slug = name.replace(/[^a-z0-9]/gi, '_');
    const upstreamPng = join(workDir, `${slug}.upstream.png`);
    const primaryPng = join(workDir, `${slug}.primary.png`);
    const primaryReport = join(workDir, `${slug}.primary.json`);
    const secondaryPng = join(workDir, `${slug}.secondary.png`);
    const secondaryReport = join(workDir, `${slug}.secondary.json`);

    try {
      await rasterizeUpstream(
        {
          body: upstream.body,
          width: upstream.width ?? upstreamW,
          height: upstream.height ?? upstreamH,
        },
        args.size,
        upstreamPng
      );
      const primary = await rasterizeGlyph(
        primaryTtf,
        ic.codepoint,
        args.size,
        primaryPng,
        primaryReport
      );
      const secondary = await rasterizeGlyph(
        secondaryTtf,
        ic.codepoint,
        args.size,
        secondaryPng,
        secondaryReport
      );
      const [inkUpstream, inkPrimary, inkSecondary] = await Promise.all([
        inkRatio(upstreamPng),
        inkRatio(primaryPng),
        inkRatio(secondaryPng),
      ]);
      const { verdict, rationale } = classify({
        primary,
        secondary,
        inkUpstream,
        inkPrimary,
        inkSecondary,
      });
      const pBbox = primary.bbox;
      const sBbox = secondary.bbox;
      const upe = primary.unitsPerEm || 1000;
      const dx =
        pBbox && sBbox ? Math.abs(pBbox.cx - sBbox.cx) / upe : 0;
      const dy =
        pBbox && sBbox ? Math.abs(pBbox.cy - sBbox.cy) / upe : 0;
      results.push({
        iconName: name,
        primaryEmpty: !!primary.empty,
        secondaryEmpty: !!secondary.empty,
        inkUpstream,
        inkPrimary,
        inkSecondary,
        centroidDriftEmFracX: dx,
        centroidDriftEmFracY: dy,
        verdict,
        rationale,
      });
      process.stdout.write(
        `[${String(i).padStart(3)}/${sampleN}] ${name.padEnd(40)} ${verdict.padEnd(20)} ${rationale}\n`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  error ${name}: ${msg.slice(0, 200)}`);
    }
  }

  const buckets: Record<Verdict, number> = {
    IDENTICAL_OK: 0,
    MOSTLY_OK_MINOR_DIFF: 0,
    LAYER_ORDER_FLIP: 0,
    BLOB_OR_BLANK: 0,
  };
  for (const r of results) buckets[r.verdict]++;
  const total = results.length;
  const clean = buckets.IDENTICAL_OK + buckets.MOSTLY_OK_MINOR_DIFF;
  const cleanPct = total > 0 ? (clean / total) * 100 : 0;

  console.log('');
  console.log(`=== vtracer QA summary: ${args.prefix} (n=${total}, seed=${args.seed}) ===`);
  for (const v of Object.keys(buckets) as Verdict[]) {
    const n = buckets[v];
    const pct = total > 0 ? (n / total) * 100 : 0;
    const bar = '#'.repeat(Math.round(pct / 2));
    console.log(`  ${v.padEnd(22)} ${String(n).padStart(3)} (${pct.toFixed(1)}%) ${bar}`);
  }
  console.log('');
  console.log(`  clean rate (IDENTICAL_OK + MOSTLY_OK_MINOR_DIFF) = ${cleanPct.toFixed(1)}%`);
  console.log(`  threshold = ${args.threshold}%`);

  if (args.writeMd) {
    await mkdir(dirname(args.writeMd), { recursive: true });
    const md: string[] = [];
    md.push(`# vtracer QA: ${args.prefix}`);
    md.push('');
    md.push(
      `Sample n=${total} (seed=${args.seed}, canvas=${args.size}px). ` +
        `Source: live paintOrder-duotone icons in manifest after vtracer pass.`
    );
    md.push('');
    md.push('## Summary');
    md.push('');
    md.push('| Bucket | Count | % |');
    md.push('|---|---:|---:|');
    for (const v of Object.keys(buckets) as Verdict[]) {
      const n = buckets[v];
      const pct = total > 0 ? (n / total) * 100 : 0;
      md.push(`| ${v} | ${n} | ${pct.toFixed(1)} % |`);
    }
    md.push('');
    md.push(`**Clean rate**: ${cleanPct.toFixed(1)} %  `);
    md.push(`**Threshold**: ${args.threshold} %  `);
    md.push(
      `**Decision**: ${cleanPct >= args.threshold ? 'ENABLE in production' : 'KEEP DISABLED'}`
    );
    md.push('');
    md.push('## Per-icon verdicts');
    md.push('');
    md.push('| Icon | Verdict | inkU | inkP | inkS | drift (em) | Rationale |');
    md.push('|---|---|---:|---:|---:|---|---|');
    for (const r of results) {
      md.push(
        `| \`${r.iconName}\` | ${r.verdict} | ${r.inkUpstream.toFixed(3)} | ${r.inkPrimary.toFixed(3)} | ${r.inkSecondary.toFixed(3)} | (${r.centroidDriftEmFracX.toFixed(3)}, ${r.centroidDriftEmFracY.toFixed(3)}) | ${r.rationale} |`
      );
    }
    md.push('');
    await writeFile(args.writeMd, md.join('\n'), 'utf8');
    console.log(`wrote ${args.writeMd}`);
  }

  process.exit(cleanPct >= args.threshold ? 0 : 1);
}

main().catch((err) => {
  console.error(`vtracer_qa: ${err.message ?? err}`);
  process.exit(1);
});
