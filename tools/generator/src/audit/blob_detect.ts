/**
 * §16 A14 — Perceptual-hash blob detector.
 *
 * Audit subcommand: `bun run audit blob-detect`.
 *
 * For every glyph in every shipped pack TTF, rasterise to 96x96 and score
 * three signals:
 *
 *   fillRatio    - painted_pixels / total_pixels
 *   edgeEntropy  - Shannon entropy of the FIND_EDGES grayscale histogram
 *   dHashCluster - count of OTHER glyphs in the same pack that share the
 *                  same 64-bit perceptual hash
 *
 * Any glyph satisfying ALL THREE of:
 *
 *   fillRatio  > 0.7
 *   edgeEntropy < 0.35
 *   dHashCluster > 3   (i.e. cluster size, including self, >= 4)
 *
 * is flagged `BLOB_RISK` — a monochrome blob that likely escaped the
 * paint-order drop in §5e. Output is informational only; manifests are
 * NOT mutated.
 *
 * Outputs:
 *   docs/audit/blob-detect/<prefix>.json — per-pack flagged glyphs.
 *   BLOB_DETECT.md                       — repo-root summary report.
 *
 * Performance: per-pack TTF results are cached at
 *   tools/generator/.cache/blob-detect/<prefix>__<family>__<sha1>.json
 * Re-running with unchanged TTFs is near-instant. Python venv lives at
 *   tools/generator/.cache/blob-detect-venv/
 * and is reused across runs.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

import { log } from '../log.ts';
import {
  manifestsDir,
  type Manifest,
  type ManifestIconEntry,
} from '../manifest.ts';
import { repoRoot, setPackageFontsDir } from '../paths.ts';

// ─── Tuning constants ──────────────────────────────────────────────────────

export const BLOB_FILL_RATIO_THRESHOLD = 0.7;
export const BLOB_EDGE_ENTROPY_THRESHOLD = 0.35;
/** Cluster size including the glyph itself; "> 3" means cluster >= 4. */
export const BLOB_DHASH_CLUSTER_THRESHOLD = 3;
export const RASTER_SIZE = 96;
/** Max codepoints handed to a single Python subprocess. */
export const BATCH_SIZE = 4000;
/**
 * Max parallel pack workers. Each spawns one Python subprocess per
 * batch, so concurrency × Pillow's per-glyph allocations is the
 * memory bound; default tracks the cpu count (capped at 8) to stay
 * under ~2 GB RSS on a 10-core M-series. Override with
 * $AUDIT_CONCURRENCY for benchmarking.
 */
function defaultPackConcurrency(): number {
  const cpus = navigator?.hardwareConcurrency ?? 4;
  return Math.min(8, Math.max(2, cpus));
}

const CACHE_ROOT = path.join(
  repoRoot(),
  'tools',
  'generator',
  '.cache',
  'blob-detect'
);
const VENV_DIR = path.join(
  repoRoot(),
  'tools',
  'generator',
  '.cache',
  'blob-detect-venv'
);
const PYTHON_SCRIPT = path.join(
  import.meta.dir,
  'python',
  'blob_detect.py'
);
const REQUIREMENTS_FILE = path.join(
  import.meta.dir,
  'python',
  'requirements.txt'
);
const OUTPUT_DIR = path.join(repoRoot(), 'docs', 'audit', 'blob-detect');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GlyphMetrics {
  codepoint: number;
  name: string;
  fillRatio: number;
  edgeEntropy: number;
  dHash: string;
}

export interface SkippedGlyph {
  codepoint: number;
  name: string;
  reason: string;
}

export interface PackFontResult {
  prefix: string;
  family: string;
  ttfPath: string;
  ttfSha1: string;
  metrics: GlyphMetrics[];
  skipped: SkippedGlyph[];
}

export interface FlaggedGlyph {
  name: string;
  codepoint: number;
  fillRatio: number;
  edgeEntropy: number;
  /** Cluster size INCLUDING the glyph itself. */
  dHashCluster: number;
  /** Sibling names in the cluster (excludes self), capped at 16. */
  cluster: string[];
}

// ─── Cluster analysis ──────────────────────────────────────────────────────

/**
 * Group metrics by dHash and return cluster size for every entry.
 * Exported for unit tests.
 */
export function computeDHashClusters(
  metrics: GlyphMetrics[]
): Map<string, GlyphMetrics[]> {
  const buckets = new Map<string, GlyphMetrics[]>();
  for (const m of metrics) {
    const arr = buckets.get(m.dHash);
    if (arr === undefined) {
      buckets.set(m.dHash, [m]);
    } else {
      arr.push(m);
    }
  }
  return buckets;
}

/**
 * Apply the three-signal threshold and emit one FlaggedGlyph per blob.
 * Exported for unit tests.
 */
export function flagBlobs(
  metrics: GlyphMetrics[],
  opts: {
    fillRatio?: number;
    edgeEntropy?: number;
    clusterMin?: number;
  } = {}
): FlaggedGlyph[] {
  const fillT = opts.fillRatio ?? BLOB_FILL_RATIO_THRESHOLD;
  const edgeT = opts.edgeEntropy ?? BLOB_EDGE_ENTROPY_THRESHOLD;
  const clusterT = opts.clusterMin ?? BLOB_DHASH_CLUSTER_THRESHOLD;

  const clusters = computeDHashClusters(metrics);
  const flagged: FlaggedGlyph[] = [];
  for (const m of metrics) {
    if (m.fillRatio <= fillT) continue;
    if (m.edgeEntropy >= edgeT) continue;
    const cluster = clusters.get(m.dHash) ?? [m];
    if (cluster.length <= clusterT) continue;
    const siblings = cluster
      .filter((c) => c.name !== m.name)
      .slice(0, 16)
      .map((c) => c.name);
    flagged.push({
      name: m.name,
      codepoint: m.codepoint,
      fillRatio: m.fillRatio,
      edgeEntropy: m.edgeEntropy,
      dHashCluster: cluster.length,
      cluster: siblings,
    });
  }
  // Sort by cluster size desc, then name asc — deterministic output.
  flagged.sort((a, b) => {
    if (a.dHashCluster !== b.dHashCluster) {
      return b.dHashCluster - a.dHashCluster;
    }
    return a.name.localeCompare(b.name);
  });
  return flagged;
}

// ─── Python venv management ────────────────────────────────────────────────

function ensurePythonVenv(): string {
  const venvPython = path.join(VENV_DIR, 'bin', 'python');
  if (existsSync(venvPython)) {
    // Cheap re-validation: check fontTools imports.
    const probe = spawnSync(venvPython, ['-c', 'import fontTools, PIL'], {
      stdio: 'ignore',
    });
    if (probe.status === 0) return venvPython;
  }

  log.step('Creating Python venv for blob_detect (uv venv + pip install)');
  const created = spawnSync(
    'uv',
    ['venv', VENV_DIR, '--python', '3.12'],
    { stdio: 'inherit' }
  );
  if (created.status !== 0) {
    throw new Error('uv venv failed — is uv installed? (brew install uv)');
  }
  const installed = spawnSync(
    'uv',
    ['pip', 'install', '--python', venvPython, '-r', REQUIREMENTS_FILE],
    { stdio: 'inherit' }
  );
  if (installed.status !== 0) {
    throw new Error('uv pip install failed');
  }
  return venvPython;
}

// ─── TTF sha1 cache ────────────────────────────────────────────────────────

async function sha1OfFile(p: string): Promise<string> {
  const buf = await readFile(p);
  return createHash('sha1').update(buf).digest('hex');
}

function cacheFileFor(
  prefix: string,
  family: string,
  sha1: string
): string {
  return path.join(CACHE_ROOT, `${prefix}__${family}__${sha1}.json`);
}

// ─── Python subprocess invocation ──────────────────────────────────────────

interface PythonResponse {
  ttf: string;
  size: number;
  results: GlyphMetrics[];
  skipped: SkippedGlyph[];
}

function rasterizeBatch(
  python: string,
  ttfPath: string,
  glyphs: { codepoint: number; name: string }[],
  size: number
): Promise<PythonResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ ttf: ttfPath, size, glyphs });
    const child = spawn(python, [PYTHON_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `blob_detect.py failed (exit ${code}, signal ${signal}): ${Buffer.concat(stderrChunks).toString('utf8')}`
          )
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as PythonResponse);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(payload);
  });
}

async function rasterizeFont(
  python: string,
  prefix: string,
  family: string,
  ttfPath: string,
  glyphs: { codepoint: number; name: string }[]
): Promise<PackFontResult> {
  const sha1 = await sha1OfFile(ttfPath);
  const cachePath = cacheFileFor(prefix, family, sha1);
  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, 'utf8');
    return JSON.parse(raw) as PackFontResult;
  }
  const allMetrics: GlyphMetrics[] = [];
  const allSkipped: SkippedGlyph[] = [];
  for (let i = 0; i < glyphs.length; i += BATCH_SIZE) {
    const batch = glyphs.slice(i, i + BATCH_SIZE);
    const r = await rasterizeBatch(python, ttfPath, batch, RASTER_SIZE);
    allMetrics.push(...r.results);
    allSkipped.push(...r.skipped);
  }
  const result: PackFontResult = {
    prefix,
    family,
    ttfPath,
    ttfSha1: sha1,
    metrics: allMetrics,
    skipped: allSkipped,
  };
  await mkdir(CACHE_ROOT, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result), 'utf8');
  return result;
}

// ─── Pack iteration ────────────────────────────────────────────────────────

async function loadAllManifests(): Promise<Manifest[]> {
  const dir = manifestsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: Manifest[] = [];
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    const raw = await readFile(path.join(dir, f), 'utf8');
    out.push(JSON.parse(raw) as Manifest);
  }
  return out;
}

function livePrimaryGlyphs(
  manifest: Manifest,
  family: string
): { codepoint: number; name: string }[] {
  const out: { codepoint: number; name: string }[] = [];
  for (const [name, ic] of Object.entries(manifest.icons) as [
    string,
    ManifestIconEntry,
  ][]) {
    if (ic.deprecated) continue;
    if (ic.fontFamily !== family) continue;
    out.push({ codepoint: ic.codepoint, name });
  }
  return out;
}

export interface PackBlobReport {
  prefix: string;
  glyphsScanned: number;
  flagged: FlaggedGlyph[];
  /** Top-cluster size encountered in this pack (max dHash bucket). */
  topClusterSize: number;
}

async function processPack(
  python: string,
  manifest: Manifest
): Promise<PackBlobReport> {
  const allFlagged: FlaggedGlyph[] = [];
  let glyphsScanned = 0;
  let topClusterSize = 0;
  for (const fontEntry of manifest.fonts) {
    // Only scan PRIMARY fonts. Duotone secondary fonts hold the
    // hint/foreground layer at intentionally low ink — they're not
    // meant to render standalone, so blob-scoring them produces
    // false positives. Run §5e against the visible primary instead.
    if (fontEntry.family.endsWith('Secondary')) continue;
    const glyphs = livePrimaryGlyphs(manifest, fontEntry.family);
    if (glyphs.length === 0) continue;
    const ttfPath = path.join(
      setPackageFontsDir(manifest.prefix),
      `${fontEntry.family}.ttf`
    );
    if (!existsSync(ttfPath)) continue;
    const r = await rasterizeFont(
      python,
      manifest.prefix,
      fontEntry.family,
      ttfPath,
      glyphs
    );
    glyphsScanned += r.metrics.length;
    const clusters = computeDHashClusters(r.metrics);
    for (const arr of clusters.values()) {
      if (arr.length > topClusterSize) topClusterSize = arr.length;
    }
    const flagged = flagBlobs(r.metrics);
    allFlagged.push(...flagged);
  }
  return {
    prefix: manifest.prefix,
    glyphsScanned,
    flagged: allFlagged,
    topClusterSize,
  };
}

// ─── Output writers ────────────────────────────────────────────────────────

async function writePackJson(report: PackBlobReport): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `${report.prefix}.json`);
  // Only write a JSON file if there's at least one flagged glyph;
  // otherwise rotate clean by removing any prior file.
  if (report.flagged.length === 0) {
    // Delete prior file if it exists (kept clean for git).
    const old = await readdir(OUTPUT_DIR).catch(() => [] as string[]);
    if (old.includes(`${report.prefix}.json`)) {
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(outPath);
      } catch {
        // ignore
      }
    }
    return;
  }
  await writeFile(outPath, JSON.stringify(report.flagged, null, 2) + '\n', 'utf8');
}

async function writeAggregateReport(
  reports: PackBlobReport[],
  totalGlyphs: number
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const flaggedReports = reports.filter((r) => r.flagged.length > 0);
  const totalFlagged = reports.reduce((s, r) => s + r.flagged.length, 0);

  // Top dHash clusters across the entire run (one row per unique cluster).
  // FlaggedGlyph.cluster is capped at 16 siblings so two members of a
  // 170-glyph cluster don't necessarily share an identical `cluster`
  // array. We dedupe on (prefix, dHashCluster, first 3 alphabetical
  // member names) — same cluster size + same lowest-alphabetical
  // members is overwhelmingly the same cluster.
  const topClusters: {
    prefix: string;
    size: number;
    sampleNames: string[];
  }[] = [];
  for (const r of reports) {
    const seenClusters = new Set<string>();
    for (const g of r.flagged) {
      const members = [g.name, ...g.cluster].sort();
      const clusterKey = `${r.prefix}|${g.dHashCluster}|${members.slice(0, 3).join('|')}`;
      if (seenClusters.has(clusterKey)) continue;
      seenClusters.add(clusterKey);
      topClusters.push({
        prefix: r.prefix,
        size: g.dHashCluster,
        sampleNames: members.slice(0, 5),
      });
    }
  }
  topClusters.sort((a, b) => b.size - a.size);
  const top5 = topClusters.slice(0, 5);

  const lines: string[] = [];
  lines.push('# Blob-risk audit (§16 A14)');
  lines.push('');
  lines.push(
    `Generated ${today}. Each glyph in every primary TTF is rasterised ` +
      `to a ${RASTER_SIZE}×${RASTER_SIZE} grayscale image and scored on three ` +
      `signals; a glyph is flagged \`BLOB_RISK\` only when ALL three exceed ` +
      `their thresholds:`
  );
  lines.push('');
  lines.push(`- \`fillRatio > ${BLOB_FILL_RATIO_THRESHOLD}\` — painted_pixels / total_pixels.`);
  lines.push(`- \`edgeEntropy < ${BLOB_EDGE_ENTROPY_THRESHOLD}\` — Shannon entropy of FIND_EDGES histogram.`);
  lines.push(`- \`dHashCluster > ${BLOB_DHASH_CLUSTER_THRESHOLD}\` — pack-local perceptual-hash cluster size (including self).`);
  lines.push('');
  lines.push(
    'Flagged glyphs are candidate paint-order-drop regressions, but ' +
      'the report is **informational only** — manifests are never mutated. ' +
      'Spot-check before opening regen tickets.'
  );
  lines.push('');
  lines.push(`- **Total glyphs scanned:** ${totalGlyphs.toLocaleString('en-US')}`);
  lines.push(`- **Glyphs flagged BLOB_RISK:** ${totalFlagged.toLocaleString('en-US')}`);
  lines.push(`- **Packs with at least one flag:** ${flaggedReports.length}`);
  lines.push('');

  if (flaggedReports.length === 0) {
    lines.push('_No blob-risk glyphs detected._');
    lines.push('');
  } else {
    lines.push('## Top dHash clusters');
    lines.push('');
    if (top5.length === 0) {
      lines.push('_No clusters above the threshold._');
    } else {
      lines.push('| Pack | Cluster size | Sample names |');
      lines.push('|---|---:|---|');
      for (const c of top5) {
        lines.push(
          `| \`${c.prefix}\` | ${c.size} | ${c.sampleNames
            .map((n) => `\`${n}\``)
            .join(', ')} |`
        );
      }
    }
    lines.push('');

    lines.push('## Per-pack summary');
    lines.push('');
    lines.push('| Pack | Glyphs scanned | Flagged | Top cluster |');
    lines.push('|---|---:|---:|---:|');
    const sortedPacks = [...flaggedReports].sort(
      (a, b) => b.flagged.length - a.flagged.length
    );
    for (const r of sortedPacks) {
      lines.push(
        `| \`${r.prefix}\` | ${r.glyphsScanned.toLocaleString('en-US')} | ${r.flagged.length.toLocaleString('en-US')} | ${r.topClusterSize} |`
      );
    }
    lines.push('');
    lines.push(
      `Per-pack drill-down JSON: \`docs/audit/blob-detect/<prefix>.json\``
    );
    lines.push('');
  }

  await writeFile(path.join(repoRoot(), 'BLOB_DETECT.md'), lines.join('\n'), 'utf8');
}

// ─── Entry point ───────────────────────────────────────────────────────────

export interface RunBlobDetectOptions {
  /** Optional explicit set of prefixes to scan; otherwise all manifests. */
  onlyPrefixes?: string[];
}

export async function runBlobDetect(
  opts: RunBlobDetectOptions = {}
): Promise<{
  reports: PackBlobReport[];
  totalGlyphs: number;
  totalFlagged: number;
}> {
  log.step('Blob-risk audit (§16 A14)');
  const python = ensurePythonVenv();

  const manifests = await loadAllManifests();
  const targeted = opts.onlyPrefixes
    ? manifests.filter((m) => opts.onlyPrefixes!.includes(m.prefix))
    : manifests;

  log.info(`scanning ${targeted.length} pack(s)`);

  const concurrency = Math.max(
    1,
    Number(process.env.AUDIT_CONCURRENCY ?? defaultPackConcurrency())
  );
  log.info(`pack concurrency = ${concurrency}`);

  const reports: PackBlobReport[] = [];
  let totalGlyphs = 0;
  let scannedSoFar = 0;
  let lastLog = performance.now();

  // Simple worker-pool: walk the manifest list with `concurrency`
  // in-flight pack jobs. processPack itself is sync-by-batch inside
  // spawnSync; we wrap with await so the pool stays responsive.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= targeted.length) return;
      const m = targeted[idx]!;
      let r: PackBlobReport;
      try {
        r = await processPack(python, m);
      } catch (e) {
        log.warn(`pack ${m.prefix} failed: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      reports.push(r);
      totalGlyphs += r.glyphsScanned;
      await writePackJson(r);

      scannedSoFar += 1;
      const now = performance.now();
      if (now - lastLog > 2000) {
        log.info(
          `progress: ${scannedSoFar}/${targeted.length} packs, ${totalGlyphs.toLocaleString('en-US')} glyphs scored`
        );
        lastLog = now;
      }
    }
  }
  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  const totalFlagged = reports.reduce((s, r) => s + r.flagged.length, 0);
  await writeAggregateReport(reports, totalGlyphs);

  log.success(
    `blob-detect: ${totalGlyphs.toLocaleString('en-US')} glyphs scanned, ${totalFlagged.toLocaleString('en-US')} flagged BLOB_RISK across ${reports.filter((r) => r.flagged.length > 0).length} pack(s)`
  );

  return { reports, totalGlyphs, totalFlagged };
}
