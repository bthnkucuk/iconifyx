/**
 * §16 A4 — Codepoint exhaustion forecast.
 *
 * Audit subcommand: `bun run audit codepoint-exhaustion`.
 *
 * Surfaces per-font slot pressure against the BMP PUA soft cap so we
 * anticipate the next sibling-split (and the next supp-PUA tier flip)
 * BEFORE consumers see a surprise bundle-size shift. CLAUDE.md §3-§4
 * pin the codepoint layout:
 *
 *   - BMP PUA `U+E000..U+F8FF` (6,400 slots) is the soft cap region; the
 *     allocator (`ICONS_PER_FONT_SOFT_CAP = 6000`) starts a new sibling
 *     font once the first one reaches 6,000 live entries.
 *   - Supp PUA `U+F0000..U+10FFFF` (131,072 slots) holds remapped
 *     ex-sibling icons after `font_merger.ts` collapses multi-sibling
 *     groups into a single TTF via cmap format 12.
 *
 * For every `(prefix, font)` entry we report live + reserved (deprecated)
 * counts, the BMP PUA slots remaining, whether the supp-PUA tier is
 * already in use, and a headroom percentage against the soft cap. The
 * report sorts most-likely-to-split-next first; entries with < 10%
 * headroom get a `warn` badge so they jump off the page.
 *
 * Read-only. Walks committed manifests; never mutates state.
 *
 * Outputs:
 *   CODEPOINT_EXHAUSTION.md                              — repo-root summary table.
 *   docs/audit/codepoint-exhaustion/codepoint_exhaustion.json — machine-readable detail.
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { log } from '../src/log.ts';
import {
  listManifestPrefixes,
  readManifest,
  type Manifest,
  type ManifestFontEntry,
  type ManifestIconEntry,
} from '../src/manifest.ts';
import {
  ICONS_PER_FONT_SOFT_CAP,
  PUA_END,
  PUA_START,
} from '../src/codepoint_allocator.ts';
import { repoRoot } from '../src/paths.ts';

/** BMP PUA slot count (U+E000..U+F8FF). */
export const BMP_PUA_SLOTS = PUA_END - PUA_START + 1;
/** Supp PUA boundary — codepoints at-or-above this live in plane 15/16. */
export const SUPP_PUA_START = 0xf0000;
/** Threshold (% headroom) below which a font flips to the `warn` badge. */
export const HEADROOM_WARN_THRESHOLD = 10;

export interface FontRow {
  prefix: string;
  family: string;
  liveCount: number;
  reservedCount: number;
  bmpUsed: number;
  bmpRemaining: number;
  suppUsed: number;
  /** Soft-cap headroom percentage: 100*(1 - liveBmp/SOFT_CAP). */
  headroomPct: number;
  severity: 'info' | 'warn';
}

interface AuditPayload {
  schemaVersion: 1;
  generatedAt: string;
  thresholds: {
    softCap: number;
    bmpPuaSlots: number;
    headroomWarnThreshold: number;
  };
  fonts: FontRow[];
}

interface RunOptions {
  prefixes?: Set<string>;
}

export async function runCodepointExhaustionAudit(
  opts: RunOptions = {}
): Promise<void> {
  const startedAt = Date.now();
  log.step('codepoint-exhaustion audit');

  const allPrefixes = (await listManifestPrefixes()).sort();
  const prefixes = opts.prefixes
    ? allPrefixes.filter((p) => opts.prefixes!.has(p))
    : allPrefixes;

  const rows: FontRow[] = [];
  for (const prefix of prefixes) {
    const manifest = await readManifest(prefix);
    if (!manifest) continue;
    rows.push(...computeFontRows(manifest));
  }

  rows.sort(rowCompare);

  // ---------- Per-audit JSON ----------
  const auditDir = path.join(repoRoot(), 'docs', 'audit', 'codepoint-exhaustion');
  await mkdir(auditDir, { recursive: true });
  const payload: AuditPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    thresholds: {
      softCap: ICONS_PER_FONT_SOFT_CAP,
      bmpPuaSlots: BMP_PUA_SLOTS,
      headroomWarnThreshold: HEADROOM_WARN_THRESHOLD,
    },
    fonts: rows,
  };
  await writeFile(
    path.join(auditDir, 'codepoint_exhaustion.json'),
    stableStringify(payload) + '\n',
    'utf8'
  );

  // ---------- Repo-root markdown ----------
  const md = renderMarkdown(payload);
  await writeFile(
    path.join(repoRoot(), 'CODEPOINT_EXHAUSTION.md'),
    md,
    'utf8'
  );

  const warnCount = rows.filter((r) => r.severity === 'warn').length;
  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.success(
    `codepoint-exhaustion audit done in ${dt}s; ${rows.length.toLocaleString('en-US')} fonts across ${prefixes.length} packs (${warnCount} below ${HEADROOM_WARN_THRESHOLD}% headroom)`
  );
}

// ---------- Core computation -----------------------------------------------

/**
 * Compute one row per font entry in the manifest. Counts walk the icon
 * map directly rather than trusting `iconCount` (which only tracks live
 * primary-side counts; the audit also needs reserved + supp/bmp split).
 *
 * Per `font_merger.ts:405-422`, the manifest's `tier` field is set to
 * `'supp'` for ex-sibling icons remapped into the supp PUA region.
 * Icons without a `tier` field are presumed BMP (matches the merger's
 * own fallback in line 409).
 */
export function computeFontRows(manifest: Manifest): FontRow[] {
  // Iconify schema's `info.total` and `fonts: ManifestFontEntry[]` are not
  // declared on the exported `Manifest` interface but are present on every
  // emitted manifest — cast through `any` for ergonomics.
  const fonts: ManifestFontEntry[] = (manifest as any).fonts ?? [];
  const icons: Record<string, ManifestIconEntry> =
    (manifest as any).icons ?? {};

  const live = new Map<string, { bmp: number; supp: number }>();
  const reserved = new Map<string, number>();
  for (const e of Object.values(icons)) {
    const fam = e.fontFamily;
    if (e.deprecated) {
      reserved.set(fam, (reserved.get(fam) ?? 0) + 1);
      continue;
    }
    let bucket = live.get(fam);
    if (!bucket) {
      bucket = { bmp: 0, supp: 0 };
      live.set(fam, bucket);
    }
    const tier = (e as any).tier as 'bmp' | 'supp' | undefined;
    const inSupp = tier === 'supp' || e.codepoint >= SUPP_PUA_START;
    if (inSupp) bucket.supp += 1;
    else bucket.bmp += 1;
  }

  const rows: FontRow[] = [];
  for (const f of fonts) {
    const lb = live.get(f.family) ?? { bmp: 0, supp: 0 };
    const liveCount = lb.bmp + lb.supp;
    const reservedCount = reserved.get(f.family) ?? 0;
    const bmpUsed = lb.bmp;
    const bmpRemaining = Math.max(0, BMP_PUA_SLOTS - bmpUsed);
    const suppUsed = lb.supp;
    const headroomPct = Math.max(
      0,
      100 - (bmpUsed / ICONS_PER_FONT_SOFT_CAP) * 100
    );
    const severity: 'info' | 'warn' =
      headroomPct < HEADROOM_WARN_THRESHOLD ? 'warn' : 'info';
    rows.push({
      prefix: manifest.prefix,
      family: f.family,
      liveCount,
      reservedCount,
      bmpUsed,
      bmpRemaining,
      suppUsed,
      headroomPct: Math.round(headroomPct * 100) / 100,
      severity,
    });
  }
  return rows;
}

// ---------- Sorting / markdown / json --------------------------------------

function rowCompare(a: FontRow, b: FontRow): number {
  // Lower headroom first (most-likely-to-split). Tie-break by prefix asc,
  // then family asc — fully deterministic.
  return (
    a.headroomPct - b.headroomPct ||
    a.prefix.localeCompare(b.prefix) ||
    a.family.localeCompare(b.family)
  );
}

function renderMarkdown(payload: AuditPayload): string {
  const lines: string[] = [];
  lines.push('# CODEPOINT_EXHAUSTION');
  lines.push('');
  lines.push(`_Generated ${payload.generatedAt}._`);
  lines.push('');
  lines.push(
    `Soft cap ${payload.thresholds.softCap.toLocaleString('en-US')} live icons per font / BMP PUA ${payload.thresholds.bmpPuaSlots.toLocaleString('en-US')} slots. Warn badge at < ${payload.thresholds.headroomWarnThreshold}% headroom.`
  );
  lines.push('');

  const warned = payload.fonts.filter((r) => r.severity === 'warn');
  if (warned.length > 0) {
    lines.push(`## Warning — ${warned.length} font(s) below ${payload.thresholds.headroomWarnThreshold}% headroom`);
    lines.push('');
    lines.push(...renderTable(warned));
    lines.push('');
  } else {
    lines.push(`## No fonts below ${payload.thresholds.headroomWarnThreshold}% headroom.`);
    lines.push('');
  }

  lines.push('## All fonts (sorted: lowest headroom first)');
  lines.push('');
  lines.push(...renderTable(payload.fonts));
  lines.push('');
  return lines.join('\n');
}

function renderTable(rows: FontRow[]): string[] {
  const out: string[] = [];
  out.push(
    '| Pack | Font | Live | Deprecated | BMP used | BMP free | Supp PUA | Headroom | Sev |'
  );
  out.push(
    '|---|---|---:|---:|---:|---:|---:|---:|:--:|'
  );
  for (const r of rows) {
    out.push(
      `| \`${r.prefix}\` | \`${r.family}\` | ${r.liveCount.toLocaleString('en-US')} | ${r.reservedCount.toLocaleString('en-US')} | ${r.bmpUsed.toLocaleString('en-US')} | ${r.bmpRemaining.toLocaleString('en-US')} | ${r.suppUsed.toLocaleString('en-US')} | ${r.headroomPct.toFixed(2)}% | ${r.severity === 'warn' ? 'warn' : 'ok'} |`
    );
  }
  return out;
}

/** Recursive deterministic JSON serializer (object keys sorted alpha). */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
