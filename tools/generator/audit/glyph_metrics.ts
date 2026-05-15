/**
 * Glyph-metrics audit.
 *
 * Scans every TTF under packages/iconifyx_<prefix>/assets/fonts/<Font>.ttf
 * and looks for glyph-level metric anomalies that can silently break
 * rendering:
 *
 *  1. **Font-level (head/hhea/OS2) drift** — units-per-em != 1000, head
 *     bbox outside the canonical 0..1000 em-box, hhea/OS/2 ascender or
 *     descender values asymmetric beyond ±1 unit. The merge step in
 *     `python/merge_fonts.py` forces these to 1000-em-quad on merged
 *     fonts, but Secondary TTFs and any un-merged single-tier pack still
 *     pick up whatever bbox `svg2ttf` computed from glyph extents — so
 *     primary and secondary can disagree.
 *
 *  2. **Duotone primary/secondary bbox mismatch** — for every
 *     `icons[name].duotone = true` entry in the manifest, open the
 *     matching glyph in `<Family>.ttf` AND `<Family>Secondary.ttf` and
 *     compute `|xMin_p - xMin_s| + |xMax_p - xMax_s|`. Anything > 200
 *     units (= 4 % of an em-quad) renders visibly out of alignment in
 *     `IconifyIcon`'s `CustomPaint` composition. Discovered via the
 *     `solar:add-circle-bold-duotone` regression (primary 342..658,
 *     secondary 79..917, score 522).
 *
 *  3. **cmap dedup collisions** — `svg2ttf` runs an outline-hash dedup
 *     pass which can collapse multiple icon names into a single glyph
 *     name in the GLYF table. The cmap still maps every original
 *     codepoint, but the resolved glyph is shared — so every consumer
 *     who renders codepoint A or B or C gets the SAME letterform.
 *     Symptom in the wild: `SolarSecondary.accessibility-bold-duotone`
 *     appears at 68 different codepoints.
 *
 *  4. **Glyph-level outliers** — `advance != 1000` (breaks horizontal
 *     centring in TextPainter), or `content_width = xMax-xMin` outside
 *     `[100, 1100]` (likely empty blob, or overflow beyond em-box).
 *
 * Outputs:
 *  - `GLYPH_METRICS_AUDIT.md` at repo root — summary + top offenders.
 *  - `docs/audit/glyph-metrics/<prefix>.json` per pack — machine-readable
 *    detail (every flagged glyph, every flagged mismatch).
 *
 * Determinism: every row is sorted by (severity desc, prefix, icon,
 * codepoint); JSON output sorts keys; sample counts are clamped before
 * formatting. Same TTFs in => byte-identical markdown + JSON out.
 */

import path from 'node:path';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import {
  readManifest,
  listManifestPrefixes,
  type Manifest,
  type ManifestIconEntry,
} from '../src/manifest.ts';
import { repoRoot, setPackageFontsDir } from '../src/paths.ts';
import { log } from '../src/log.ts';

// ---------- Tunable thresholds ----------------------------------------------
// Mismatch score above which a duotone pair is flagged as misaligned.
// 4 % of an em-quad — empirically the smallest gap visible at typical icon
// sizes (24-48 px); the `solar:add-circle-bold-duotone` bug scored 522.
const DUOTONE_MISMATCH_THRESHOLD = 200;
// Glyph content_width outside [MIN, MAX] is flagged.
const GLYPH_WIDTH_MIN = 100;
const GLYPH_WIDTH_MAX = 1100;
// Canonical em-box. merge_fonts.py forces all merged fonts to this.
const CANONICAL_UPM = 1000;
const CANONICAL_BBOX_MAX = 1000;
// Top-N rows to render in each markdown table; the full lists live in
// the per-pack JSON to keep the markdown reviewable.
const TOP_N_DUOTONE = 50;
const TOP_N_DEDUP = 50;
const TOP_N_OUTLIER = 50;

// ---------- Python helper plumbing ------------------------------------------

const HELPER_PY = path.join(import.meta.dir, 'glyph_metrics_extract.py');
const PYTHON_BIN = path.resolve(
  import.meta.dir,
  '..',
  'python',
  '.venv',
  'bin',
  'python'
);

interface GlyphRecord {
  cp: number;
  name: string;
  adv?: number | null;
  lsb?: number | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  contours?: number;
  empty?: boolean;
  missing_glyph?: boolean;
}

interface FontExtract {
  path: string;
  head?: {
    unitsPerEm: number | null;
    xMin: number | null;
    xMax: number | null;
    yMin: number | null;
    yMax: number | null;
  };
  hhea?: {
    ascent: number | null;
    descent: number | null;
    advanceWidthMax: number | null;
  };
  os2?: {
    usWinAscent: number | null;
    usWinDescent: number | null;
    sTypoAscender: number | null;
    sTypoDescender: number | null;
  } | null;
  glyphs?: GlyphRecord[];
  error?: string;
}

/**
 * Spawn a single Python subprocess and feed every TTF path through it
 * via stdin. The helper emits one JSON line per font in input order;
 * we stream-parse so the audit pipelines through quickly.
 *
 * One subprocess for the whole corpus (vs 600 short-lived) keeps the
 * audit under the 60 s budget even on cold caches.
 */
async function runExtractor(paths: string[]): Promise<Map<string, FontExtract>> {
  if (paths.length === 0) return new Map();
  if (!existsSync(PYTHON_BIN)) {
    throw new Error(
      `Python venv not found at ${PYTHON_BIN}. Run 'uv sync' under tools/generator/python.`
    );
  }
  if (!existsSync(HELPER_PY)) {
    throw new Error(`extractor missing: ${HELPER_PY}`);
  }

  const proc = Bun.spawn([PYTHON_BIN, HELPER_PY], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Write all paths up front, close stdin so Python sees EOF.
  const stdinBuf = paths.join('\n') + '\n';
  proc.stdin.write(stdinBuf);
  await proc.stdin.end();

  // Drain stdout (NDJSON).
  const out = await new Response(proc.stdout).text();
  const errText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      `glyph_metrics_extract.py exited ${exitCode}: ${errText.slice(0, 500)}`
    );
  }

  const results = new Map<string, FontExtract>();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as FontExtract;
      if (obj?.path) results.set(obj.path, obj);
    } catch {
      log.warn(`glyph-metrics: bad JSON line skipped`);
    }
  }
  return results;
}

// ---------- Audit row types -------------------------------------------------

interface DuotoneMismatchRow {
  prefix: string;
  icon: string;
  primaryFont: string;
  secondaryFont: string;
  codepoint: number;
  primary: { xMin: number; xMax: number; yMin: number; yMax: number };
  secondary: { xMin: number; xMax: number; yMin: number; yMax: number };
  score: number;
  cause: 'shifted' | 'primary-empty' | 'secondary-empty' | 'primary-missing' | 'secondary-missing';
}

interface DedupCollisionRow {
  prefix: string;
  font: string;
  glyphName: string;
  codepointCount: number;
  /** Up to 4 example icon names that resolved through this glyph. */
  sampleIcons: string[];
}

interface OutlierGlyphRow {
  prefix: string;
  font: string;
  codepoint: number;
  name: string;
  reason: 'narrow' | 'wide' | 'advance' | 'empty-cmap';
  contentWidth?: number;
  advance?: number;
}

interface NonCanonicalFontRow {
  prefix: string;
  font: string;
  unitsPerEm: number | null;
  headBbox: string;
  hheaAsc: number | null;
  hheaDesc: number | null;
  os2WinAsc: number | null;
  os2WinDesc: number | null;
  os2TypoAsc: number | null;
  os2TypoDesc: number | null;
  reasons: string[];
}

interface PerPackReport {
  prefix: string;
  ttfs: {
    font: string;
    path: string;
    head: FontExtract['head'];
    hhea: FontExtract['hhea'];
    os2: FontExtract['os2'];
    glyphCount: number;
    error?: string;
  }[];
  nonCanonical: NonCanonicalFontRow[];
  duotoneMismatches: DuotoneMismatchRow[];
  dedupCollisions: DedupCollisionRow[];
  outliers: OutlierGlyphRow[];
}

// ---------- Auditors --------------------------------------------------------

function classifyFontMetrics(
  prefix: string,
  fontName: string,
  extract: FontExtract
): NonCanonicalFontRow | null {
  const head = extract.head;
  const hhea = extract.hhea;
  const os2 = extract.os2 ?? null;
  if (!head || !hhea) {
    return {
      prefix,
      font: fontName,
      unitsPerEm: null,
      headBbox: '?',
      hheaAsc: null,
      hheaDesc: null,
      os2WinAsc: null,
      os2WinDesc: null,
      os2TypoAsc: null,
      os2TypoDesc: null,
      reasons: ['missing head/hhea tables'],
    };
  }

  const reasons: string[] = [];
  if (head.unitsPerEm !== CANONICAL_UPM) reasons.push(`unitsPerEm=${head.unitsPerEm}`);
  if ((head.xMin ?? 0) < 0) reasons.push(`head.xMin=${head.xMin}`);
  if ((head.xMax ?? 0) > CANONICAL_BBOX_MAX) reasons.push(`head.xMax=${head.xMax}`);
  if ((head.yMin ?? 0) < 0) reasons.push(`head.yMin=${head.yMin}`);
  if ((head.yMax ?? 0) > CANONICAL_BBOX_MAX) reasons.push(`head.yMax=${head.yMax}`);
  if (hhea.ascent !== CANONICAL_UPM) reasons.push(`hhea.ascent=${hhea.ascent}`);
  if (Math.abs(hhea.descent ?? 0) > 1) reasons.push(`hhea.descent=${hhea.descent}`);
  if (os2) {
    if (os2.usWinAscent !== CANONICAL_UPM) reasons.push(`OS/2.winAsc=${os2.usWinAscent}`);
    if (Math.abs(os2.usWinDescent ?? 0) > 1) reasons.push(`OS/2.winDesc=${os2.usWinDescent}`);
    if (os2.sTypoAscender !== CANONICAL_UPM) reasons.push(`OS/2.typoAsc=${os2.sTypoAscender}`);
    if (Math.abs(os2.sTypoDescender ?? 0) > 1) reasons.push(`OS/2.typoDesc=${os2.sTypoDescender}`);
  }

  if (reasons.length === 0) return null;
  return {
    prefix,
    font: fontName,
    unitsPerEm: head.unitsPerEm,
    headBbox: `${head.xMin}..${head.xMax} / ${head.yMin}..${head.yMax}`,
    hheaAsc: hhea.ascent,
    hheaDesc: hhea.descent,
    os2WinAsc: os2?.usWinAscent ?? null,
    os2WinDesc: os2?.usWinDescent ?? null,
    os2TypoAsc: os2?.sTypoAscender ?? null,
    os2TypoDesc: os2?.sTypoDescender ?? null,
    reasons,
  };
}

function findOutliers(
  prefix: string,
  fontName: string,
  glyphs: GlyphRecord[]
): OutlierGlyphRow[] {
  const out: OutlierGlyphRow[] = [];
  for (const g of glyphs) {
    if (g.empty) {
      // Already surfaced via FONT_AUDIT.md's empty-outline check; skip here
      // to avoid double-reporting.
      continue;
    }
    if (g.missing_glyph) {
      out.push({
        prefix,
        font: fontName,
        codepoint: g.cp,
        name: g.name,
        reason: 'empty-cmap',
      });
      continue;
    }
    if (g.xMin == null || g.xMax == null) continue;
    const width = g.xMax - g.xMin;
    if (width < GLYPH_WIDTH_MIN) {
      out.push({
        prefix,
        font: fontName,
        codepoint: g.cp,
        name: g.name,
        reason: 'narrow',
        contentWidth: width,
      });
    } else if (width > GLYPH_WIDTH_MAX) {
      out.push({
        prefix,
        font: fontName,
        codepoint: g.cp,
        name: g.name,
        reason: 'wide',
        contentWidth: width,
      });
    }
    if (typeof g.adv === 'number' && g.adv !== CANONICAL_UPM) {
      out.push({
        prefix,
        font: fontName,
        codepoint: g.cp,
        name: g.name,
        reason: 'advance',
        advance: g.adv,
      });
    }
  }
  return out;
}

/**
 * cmap-dedup detection. We group cmap entries by their resolved glyph NAME
 * (since svg2ttf collapses identical outlines under the FIRST seen name and
 * remaps all duplicate codepoints onto it). Any glyph name with > 1 distinct
 * codepoint is a likely dedup collision — every consumer rendering any of
 * those codepoints gets the same letterform.
 */
function findDedupCollisions(
  prefix: string,
  fontName: string,
  glyphs: GlyphRecord[]
): DedupCollisionRow[] {
  const byName = new Map<string, number[]>();
  for (const g of glyphs) {
    if (g.empty || g.missing_glyph) continue;
    const cps = byName.get(g.name) ?? [];
    cps.push(g.cp);
    byName.set(g.name, cps);
  }
  const rows: DedupCollisionRow[] = [];
  for (const [name, cps] of byName) {
    const uniq = Array.from(new Set(cps)).sort((a, b) => a - b);
    if (uniq.length < 2) continue;
    rows.push({
      prefix,
      font: fontName,
      glyphName: name,
      codepointCount: uniq.length,
      sampleIcons: [],
      // sampleIcons resolved later once we know icon-name <-> codepoint
    });
    // Stash codepoints temporarily on the row for later resolution.
    (rows[rows.length - 1] as { _cps?: number[] })._cps = uniq.slice(0, 6);
  }
  return rows;
}

function buildDuotoneMismatches(
  manifest: Manifest,
  fontExtractsByFamily: Map<string, FontExtract>
): DuotoneMismatchRow[] {
  const rows: DuotoneMismatchRow[] = [];
  for (const [iconName, ic] of Object.entries(manifest.icons)) {
    if (!ic.duotone || ic.deprecated) continue;
    const primaryFam = ic.fontFamily;
    const secondaryFam = `${primaryFam}Secondary`;
    const prim = fontExtractsByFamily.get(primaryFam);
    const sec = fontExtractsByFamily.get(secondaryFam);
    if (!prim || !sec) continue;
    // Build per-codepoint lookup (lazy memoise on the extract object).
    const primMap = ensureCpMap(prim);
    const secMap = ensureCpMap(sec);
    const pg = primMap.get(ic.codepoint);
    const sg = secMap.get(ic.codepoint);
    if (!pg) {
      rows.push({
        prefix: manifest.prefix,
        icon: iconName,
        primaryFont: primaryFam,
        secondaryFont: secondaryFam,
        codepoint: ic.codepoint,
        primary: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        secondary: zeroBbox(sg),
        score: Number.POSITIVE_INFINITY,
        cause: 'primary-missing',
      });
      continue;
    }
    if (!sg) {
      rows.push({
        prefix: manifest.prefix,
        icon: iconName,
        primaryFont: primaryFam,
        secondaryFont: secondaryFam,
        codepoint: ic.codepoint,
        primary: zeroBbox(pg),
        secondary: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        score: Number.POSITIVE_INFINITY,
        cause: 'secondary-missing',
      });
      continue;
    }
    if (pg.empty) {
      rows.push({
        prefix: manifest.prefix,
        icon: iconName,
        primaryFont: primaryFam,
        secondaryFont: secondaryFam,
        codepoint: ic.codepoint,
        primary: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        secondary: zeroBbox(sg),
        score: Number.POSITIVE_INFINITY,
        cause: 'primary-empty',
      });
      continue;
    }
    if (sg.empty) {
      rows.push({
        prefix: manifest.prefix,
        icon: iconName,
        primaryFont: primaryFam,
        secondaryFont: secondaryFam,
        codepoint: ic.codepoint,
        primary: zeroBbox(pg),
        secondary: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        score: Number.POSITIVE_INFINITY,
        cause: 'secondary-empty',
      });
      continue;
    }
    // Both have bboxes.
    const pX = (pg.xMin ?? 0);
    const pX2 = (pg.xMax ?? 0);
    const pY = (pg.yMin ?? 0);
    const pY2 = (pg.yMax ?? 0);
    const sX = (sg.xMin ?? 0);
    const sX2 = (sg.xMax ?? 0);
    const sY = (sg.yMin ?? 0);
    const sY2 = (sg.yMax ?? 0);
    const score = Math.abs(pX - sX) + Math.abs(pX2 - sX2);
    if (score >= DUOTONE_MISMATCH_THRESHOLD) {
      rows.push({
        prefix: manifest.prefix,
        icon: iconName,
        primaryFont: primaryFam,
        secondaryFont: secondaryFam,
        codepoint: ic.codepoint,
        primary: { xMin: pX, xMax: pX2, yMin: pY, yMax: pY2 },
        secondary: { xMin: sX, xMax: sX2, yMin: sY, yMax: sY2 },
        score,
        cause: 'shifted',
      });
    }
  }
  return rows;
}

function zeroBbox(g: GlyphRecord | undefined): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  if (!g || g.empty) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  return {
    xMin: g.xMin ?? 0,
    xMax: g.xMax ?? 0,
    yMin: g.yMin ?? 0,
    yMax: g.yMax ?? 0,
  };
}

const CP_MAP_CACHE = new WeakMap<FontExtract, Map<number, GlyphRecord>>();
function ensureCpMap(extract: FontExtract): Map<number, GlyphRecord> {
  const hit = CP_MAP_CACHE.get(extract);
  if (hit) return hit;
  const m = new Map<number, GlyphRecord>();
  for (const g of extract.glyphs ?? []) {
    m.set(g.cp, g);
  }
  CP_MAP_CACHE.set(extract, m);
  return m;
}

/**
 * Resolve "this glyph maps to N codepoints; what are the human-readable
 * icon names of those codepoints?" — needed for the dedup-collision rows
 * since the GLYF-table name is the FIRST icon that claimed the outline,
 * not necessarily the consumer's icon.
 */
function resolveDedupSamples(
  rows: DedupCollisionRow[],
  manifest: Manifest
): void {
  // Build codepoint -> icon name (live icons in this pack only).
  const cpToIcon = new Map<number, string>();
  for (const [iconName, ic] of Object.entries(manifest.icons)) {
    if (ic.deprecated) continue;
    cpToIcon.set(ic.codepoint, iconName);
  }
  for (const row of rows) {
    const stash = (row as { _cps?: number[] })._cps ?? [];
    const samples: string[] = [];
    for (const cp of stash) {
      const name = cpToIcon.get(cp);
      if (name) samples.push(name);
      if (samples.length >= 4) break;
    }
    row.sampleIcons = samples;
    delete (row as { _cps?: number[] })._cps;
  }
}

// ---------- Driver ----------------------------------------------------------

async function listAllTtfs(): Promise<string[]> {
  const prefixes = await listManifestPrefixes();
  const out: string[] = [];
  for (const prefix of prefixes) {
    const dir = setPackageFontsDir(prefix);
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of entries.sort()) {
      if (!f.endsWith('.ttf')) continue;
      out.push(path.join(dir, f));
    }
  }
  return out;
}

function fontStemFromPath(p: string): string {
  return path.basename(p, '.ttf');
}

function prefixFromPath(p: string): string {
  // .../packages/iconifyx_<suffix>/assets/fonts/<Font>.ttf
  const segs = p.split(path.sep);
  const i = segs.findIndex((s) => s.startsWith('iconifyx_'));
  if (i < 0) return '';
  // Reverse the `prefix -> package suffix` transform (only `-` -> `_`).
  return segs[i]!.slice('iconifyx_'.length).replace(/_/g, '-');
}

async function readIconifyJsonVersion(): Promise<string> {
  try {
    const pkg = await readFile(
      path.join(import.meta.dir, '..', 'package.json'),
      'utf8'
    );
    const obj = JSON.parse(pkg) as { dependencies?: Record<string, string> };
    return obj.dependencies?.['@iconify/json'] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Note: the in-place prefix derivation from package suffix is one-way ambiguous
 * (foo-bar and foo_bar both map to iconifyx_foo_bar). We resolve by trusting
 * the manifest list: every known prefix is asserted; if the path-derived
 * prefix isn't in the manifest set, we keep it as-is (no-op) and trust the
 * downstream lookup by font family.
 */

interface RunOptions {
  /** Optional set of prefixes to limit the audit to (testing only). */
  prefixes?: Set<string>;
}

export async function runGlyphMetricsAudit(opts: RunOptions = {}): Promise<void> {
  const startedAt = Date.now();
  log.step('glyph-metrics audit');

  const allTtfs = await listAllTtfs();
  const filteredTtfs = opts.prefixes
    ? allTtfs.filter((p) => opts.prefixes!.has(prefixFromPath(p)))
    : allTtfs;

  log.info(`scanning ${filteredTtfs.length} TTFs`);
  const extracts = await runExtractor(filteredTtfs);

  // Per-pack aggregation.
  const reports = new Map<string, PerPackReport>();
  const allPrefixes = new Set<string>();
  for (const ttfPath of filteredTtfs) {
    const prefix = prefixFromPath(ttfPath);
    if (!prefix) continue;
    allPrefixes.add(prefix);
    if (!reports.has(prefix)) {
      reports.set(prefix, {
        prefix,
        ttfs: [],
        nonCanonical: [],
        duotoneMismatches: [],
        dedupCollisions: [],
        outliers: [],
      });
    }
    const report = reports.get(prefix)!;
    const fontName = fontStemFromPath(ttfPath);
    const extract = extracts.get(ttfPath);
    if (!extract || extract.error) {
      report.ttfs.push({
        font: fontName,
        path: ttfPath,
        head: undefined,
        hhea: undefined,
        os2: undefined,
        glyphCount: 0,
        error: extract?.error ?? 'no extract produced',
      });
      continue;
    }
    report.ttfs.push({
      font: fontName,
      path: ttfPath,
      head: extract.head,
      hhea: extract.hhea,
      os2: extract.os2 ?? null,
      glyphCount: extract.glyphs?.length ?? 0,
    });

    const nonCanonical = classifyFontMetrics(prefix, fontName, extract);
    if (nonCanonical) report.nonCanonical.push(nonCanonical);

    report.dedupCollisions.push(
      ...findDedupCollisions(prefix, fontName, extract.glyphs ?? [])
    );

    report.outliers.push(
      ...findOutliers(prefix, fontName, extract.glyphs ?? [])
    );
  }

  // Pair primary <-> secondary glyphs via manifest for duotone mismatch.
  for (const prefix of allPrefixes) {
    const manifest = await readManifest(prefix);
    if (!manifest) continue;

    // Build family -> extract lookup.
    const familyExtracts = new Map<string, FontExtract>();
    for (const ttf of reports.get(prefix)!.ttfs) {
      const ex = extracts.get(ttf.path);
      if (ex) familyExtracts.set(ttf.font, ex);
    }
    const mismatches = buildDuotoneMismatches(manifest, familyExtracts);
    reports.get(prefix)!.duotoneMismatches = mismatches;

    resolveDedupSamples(reports.get(prefix)!.dedupCollisions, manifest);
  }

  // Sort each report's internal arrays deterministically.
  for (const r of reports.values()) {
    r.duotoneMismatches.sort((a, b) => {
      const sb = b.score === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : b.score;
      const sa = a.score === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : a.score;
      return sb - sa || a.icon.localeCompare(b.icon);
    });
    r.dedupCollisions.sort(
      (a, b) =>
        b.codepointCount - a.codepointCount ||
        a.font.localeCompare(b.font) ||
        a.glyphName.localeCompare(b.glyphName)
    );
    r.outliers.sort(
      (a, b) =>
        a.font.localeCompare(b.font) ||
        a.reason.localeCompare(b.reason) ||
        a.codepoint - b.codepoint
    );
    r.nonCanonical.sort((a, b) => a.font.localeCompare(b.font));
    r.ttfs.sort((a, b) => a.font.localeCompare(b.font));
  }

  // ---------- Per-pack JSON ----------
  const auditDir = path.join(repoRoot(), 'docs', 'audit', 'glyph-metrics');
  await mkdir(auditDir, { recursive: true });
  // List dir + remove orphans is intentionally NOT done — we only write the
  // packs we audit this run. Stale files from a previous run with a wider
  // prefix set would persist; that's fine for an audit-only artefact.
  const sortedPrefixes = Array.from(reports.keys()).sort();
  for (const prefix of sortedPrefixes) {
    const r = reports.get(prefix)!;
    const json = stableStringify({
      prefix: r.prefix,
      ttfs: r.ttfs.map((t) => ({
        font: t.font,
        glyphCount: t.glyphCount,
        head: t.head ?? null,
        hhea: t.hhea ?? null,
        os2: t.os2 ?? null,
        error: t.error ?? null,
      })),
      nonCanonical: r.nonCanonical,
      duotoneMismatches: r.duotoneMismatches.map((m) => ({
        ...m,
        score: m.score === Number.POSITIVE_INFINITY ? -1 : m.score,
      })),
      dedupCollisions: r.dedupCollisions,
      outliers: r.outliers,
    });
    await writeFile(path.join(auditDir, `${prefix}.json`), json + '\n', 'utf8');
  }

  // ---------- Repo-root markdown ----------
  const iconifyJsonVersion = await readIconifyJsonVersion();
  const today = new Date().toISOString().slice(0, 10);
  const md = renderMarkdown({
    today,
    iconifyJsonVersion,
    reports: Array.from(reports.values()),
    ttfsScanned: filteredTtfs.length,
  });
  await writeFile(path.join(repoRoot(), 'GLYPH_METRICS_AUDIT.md'), md, 'utf8');

  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.success(
    `glyph-metrics audit done in ${dt}s; wrote GLYPH_METRICS_AUDIT.md + ${sortedPrefixes.length} per-pack JSON`
  );
}

// ---------- Markdown renderer -----------------------------------------------

interface RenderInput {
  today: string;
  iconifyJsonVersion: string;
  reports: PerPackReport[];
  ttfsScanned: number;
}

function renderMarkdown(input: RenderInput): string {
  const { today, iconifyJsonVersion, reports, ttfsScanned } = input;
  const allNonCanonical = reports.flatMap((r) => r.nonCanonical);
  const allDuotoneMismatch = reports.flatMap((r) => r.duotoneMismatches);
  const duotonePacks = new Set(allDuotoneMismatch.map((m) => m.prefix));
  const allDedup = reports.flatMap((r) => r.dedupCollisions);
  const dedupPacks = new Set(allDedup.map((r) => r.prefix));
  const allOutliers = reports.flatMap((r) => r.outliers);

  // Sort highest-risk duotone misses globally.
  const sortedMismatches = [...allDuotoneMismatch].sort((a, b) => {
    const sa = a.score === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : a.score;
    const sb = b.score === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : b.score;
    return sb - sa || a.prefix.localeCompare(b.prefix) || a.icon.localeCompare(b.icon);
  });
  // Top-N dedup globally.
  const sortedDedup = [...allDedup].sort(
    (a, b) =>
      b.codepointCount - a.codepointCount ||
      a.prefix.localeCompare(b.prefix) ||
      a.font.localeCompare(b.font) ||
      a.glyphName.localeCompare(b.glyphName)
  );
  // Outliers: surface most-extreme widths first.
  const sortedOutliers = [...allOutliers].sort((a, b) => {
    const av = outlierSeverity(a);
    const bv = outlierSeverity(b);
    return bv - av || a.prefix.localeCompare(b.prefix) || a.codepoint - b.codepoint;
  });

  const lines: string[] = [];
  lines.push('# Glyph metrics audit');
  lines.push('');
  lines.push(
    `Generated ${today}; \`@iconify/json\` ${iconifyJsonVersion}. ` +
      `Scans every emitted TTF for font-level metric drift, duotone ` +
      `primary/secondary bbox mismatch, cmap-dedup collisions, and ` +
      `per-glyph outliers (narrow / wide / non-1000 advance). ` +
      `Output is deterministic — same input TTFs → byte-identical report.`
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- TTFs scanned: **${ttfsScanned.toLocaleString('en-US')}**`);
  lines.push(
    `- TTFs with non-canonical font metrics: **${allNonCanonical.length.toLocaleString('en-US')}**` +
      (allNonCanonical.length === 0 ? ' — every font is at the canonical 1000-em-quad.' : '')
  );
  const highRiskMismatches = sortedMismatches.filter(
    (m) => m.cause === 'shifted' || m.score === Number.POSITIVE_INFINITY
  );
  lines.push(
    `- Duotone primary/secondary mismatch (score > ${DUOTONE_MISMATCH_THRESHOLD}` +
      ` or half-broken): **${highRiskMismatches.length.toLocaleString('en-US')} icons` +
      ` across ${duotonePacks.size} packs**`
  );
  lines.push(
    `- Glyph dedup collisions (different codepoints sharing one glyph name): ` +
      `**${allDedup.length.toLocaleString('en-US')} cases across ${dedupPacks.size} packs**`
  );
  lines.push(
    `- Per-glyph outliers (narrow / wide / non-1000 advance): ` +
      `**${allOutliers.length.toLocaleString('en-US')}**`
  );
  lines.push('');
  lines.push(
    `Detail per pack: [\`docs/audit/glyph-metrics/<prefix>.json\`](docs/audit/glyph-metrics/). ` +
      `Markdown caps each section at the top ${TOP_N_DUOTONE} rows for readability.`
  );
  lines.push('');

  // -- Duotone mismatch
  lines.push('## Highest-risk duotone alignment misses');
  lines.push('');
  if (sortedMismatches.length === 0) {
    lines.push('_No duotone pairs with mismatch above threshold — primary and secondary glyphs share alignment._');
  } else {
    lines.push(
      `Score = \`|primary.xMin - secondary.xMin| + |primary.xMax - secondary.xMax|\`. ` +
        `Threshold: ${DUOTONE_MISMATCH_THRESHOLD} units (= 4 % of em-quad).`
    );
    lines.push('');
    lines.push('| Pack | Icon | Primary x-bbox | Secondary x-bbox | Score | Cause |');
    lines.push('|---|---|---|---|---:|---|');
    for (const m of sortedMismatches.slice(0, TOP_N_DUOTONE)) {
      const pBbox = `${m.primary.xMin}..${m.primary.xMax}`;
      const sBbox = `${m.secondary.xMin}..${m.secondary.xMax}`;
      const score = m.score === Number.POSITIVE_INFINITY ? '∞' : m.score.toLocaleString('en-US');
      lines.push(`| \`${m.prefix}\` | \`${m.icon}\` | ${pBbox} | ${sBbox} | ${score} | ${m.cause} |`);
    }
    if (sortedMismatches.length > TOP_N_DUOTONE) {
      lines.push('');
      lines.push(
        `…${(sortedMismatches.length - TOP_N_DUOTONE).toLocaleString('en-US')} more — ` +
          `see per-pack JSON.`
      );
    }
  }
  lines.push('');

  // -- Non-canonical metrics
  lines.push('## TTFs with non-canonical head/hhea/OS2 metrics');
  lines.push('');
  if (allNonCanonical.length === 0) {
    lines.push('_Every TTF reports unitsPerEm=1000, head bbox within 0..1000, hhea/OS/2 ascent=1000, descent=0 (within ±1 unit)._');
  } else {
    lines.push('| Pack | TTF | unitsPerEm | head bbox | hhea asc/desc | OS/2 win asc/desc | OS/2 typo asc/desc | Drift |');
    lines.push('|---|---|---:|---|---|---|---|---|');
    for (const r of allNonCanonical.slice(0, 100)) {
      lines.push(
        `| \`${r.prefix}\` | \`${r.font}\` | ${r.unitsPerEm ?? '?'} | ${r.headBbox} | ` +
          `${r.hheaAsc}/${r.hheaDesc} | ${r.os2WinAsc ?? '—'}/${r.os2WinDesc ?? '—'} | ` +
          `${r.os2TypoAsc ?? '—'}/${r.os2TypoDesc ?? '—'} | ${r.reasons.join(', ')} |`
      );
    }
    if (allNonCanonical.length > 100) {
      lines.push('');
      lines.push(`…${(allNonCanonical.length - 100).toLocaleString('en-US')} more — see per-pack JSON.`);
    }
  }
  lines.push('');

  // -- Dedup collisions
  lines.push('## Glyph dedup collisions (cmap collision via path dedup)');
  lines.push('');
  if (sortedDedup.length === 0) {
    lines.push('_No dedup collisions — every emitted glyph maps from exactly one codepoint._');
  } else {
    lines.push(
      `When \`svg2ttf\` collapses identical outlines, all original codepoints ` +
        `still cmap to the SAME glyph name. Every consumer of any of those ` +
        `codepoints renders the FIRST icon's letterform — visually wrong for ` +
        `every icon after the first.`
    );
    lines.push('');
    lines.push('| Pack | TTF | First-claimed glyph | # codepoints | Example icons sharing it |');
    lines.push('|---|---|---|---:|---|');
    for (const r of sortedDedup.slice(0, TOP_N_DEDUP)) {
      const samples = r.sampleIcons.length
        ? r.sampleIcons.map((s) => `\`${s}\``).join(', ')
        : '_no live icon names found_';
      lines.push(
        `| \`${r.prefix}\` | \`${r.font}\` | \`${r.glyphName}\` | ${r.codepointCount.toLocaleString('en-US')} | ${samples} |`
      );
    }
    if (sortedDedup.length > TOP_N_DEDUP) {
      lines.push('');
      lines.push(
        `…${(sortedDedup.length - TOP_N_DEDUP).toLocaleString('en-US')} more — see per-pack JSON.`
      );
    }
  }
  lines.push('');

  // -- Outliers
  lines.push('## Per-glyph metric outliers');
  lines.push('');
  if (sortedOutliers.length === 0) {
    lines.push('_No outliers — every glyph reports advance=1000 and content width in [100, 1100]._');
  } else {
    lines.push(
      `\`narrow\` = content width < ${GLYPH_WIDTH_MIN} (likely render-as-dot). ` +
        `\`wide\` = > ${GLYPH_WIDTH_MAX} (overflows em-box → clipped at consumer). ` +
        `\`advance\` = horizontal advance != ${CANONICAL_UPM} (breaks TextPainter centring).`
    );
    lines.push('');
    lines.push('| Pack | TTF | Codepoint | Glyph | Reason | Width | Advance |');
    lines.push('|---|---|---|---|---|---:|---:|');
    for (const o of sortedOutliers.slice(0, TOP_N_OUTLIER)) {
      lines.push(
        `| \`${o.prefix}\` | \`${o.font}\` | \`0x${o.codepoint.toString(16)}\` | \`${o.name}\` | ${o.reason} | ${o.contentWidth ?? '—'} | ${o.advance ?? '—'} |`
      );
    }
    if (sortedOutliers.length > TOP_N_OUTLIER) {
      lines.push('');
      lines.push(
        `…${(sortedOutliers.length - TOP_N_OUTLIER).toLocaleString('en-US')} more — see per-pack JSON.`
      );
    }
  }
  lines.push('');

  // -- Per-pack index
  lines.push('## Per-pack JSON detail');
  lines.push('');
  lines.push('Click through for the full per-pack breakdown (every flagged glyph, every TTF\'s metrics).');
  lines.push('');
  lines.push('| Pack | TTFs | Non-canonical fonts | Duotone misses | Dedup collisions | Outliers | Detail |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  const sortedReports = [...reports].sort((a, b) => a.prefix.localeCompare(b.prefix));
  for (const r of sortedReports) {
    const totalIssues =
      r.nonCanonical.length +
      r.duotoneMismatches.length +
      r.dedupCollisions.length +
      r.outliers.length;
    if (totalIssues === 0) continue;
    lines.push(
      `| \`${r.prefix}\` | ${r.ttfs.length} | ${r.nonCanonical.length} | ${r.duotoneMismatches.length.toLocaleString('en-US')} | ${r.dedupCollisions.length.toLocaleString('en-US')} | ${r.outliers.length.toLocaleString('en-US')} | [\`${r.prefix}.json\`](docs/audit/glyph-metrics/${r.prefix}.json) |`
    );
  }
  lines.push('');

  return lines.join('\n');
}

function outlierSeverity(r: OutlierGlyphRow): number {
  if (r.reason === 'advance') {
    return Math.abs((r.advance ?? CANONICAL_UPM) - CANONICAL_UPM);
  }
  if (r.contentWidth == null) return 0;
  if (r.reason === 'narrow') return GLYPH_WIDTH_MIN - r.contentWidth;
  if (r.reason === 'wide') return r.contentWidth - GLYPH_WIDTH_MAX;
  return 0;
}

/**
 * Stable JSON pretty-printer (recursive sort_keys + 2-space indent).
 * Bun's `JSON.stringify` doesn't sort by default; we sort to keep diffs
 * minimal regen-to-regen.
 */
function stableStringify(value: unknown, indent = 2): string {
  const sorted = sortKeysDeep(value);
  return JSON.stringify(sorted, null, indent);
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

// ---------- CLI -------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let prefixes: Set<string> | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      if (!prefixes) prefixes = new Set();
      for (const p of args[i + 1]!.split(',')) prefixes.add(p);
      i++;
    }
  }
  await runGlyphMetricsAudit({ prefixes });
}

if (import.meta.main) {
  await main();
}
