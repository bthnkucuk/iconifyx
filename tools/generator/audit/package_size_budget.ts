/**
 * §16 A15 — Package-size budget regression.
 *
 * Audit subcommand: `bun run audit package-size-budget`.
 *
 * Snapshots per-pack TTF byte totals + Dart const counts on every run
 * and ledger-compares against the previous snapshot. Packs that grew
 * > 10% without an iconify-version bump are flagged as suspicious:
 *
 *   - Cache loss (the strokefill SQLite db was wiped, so a different
 *     trace shipped this round).
 *   - Glyph-complexity inflation (an upstream icon's body got
 *     redrawn with 10× the control points).
 *   - Accidental sibling re-split (the supp-PUA merger collapsed
 *     differently this regen and the BMP tier filled out further).
 *
 * Compounds with §16 A10 (determinism baseline) — A10 tracks BYTE
 * identity per file, A15 tracks SIZE drift per pack. A byte-drift
 * within a determinism window will surface in A10; a slow secular
 * growth across releases will surface in A15.
 *
 * Read-only against pipeline.ts. Owns its ledger at
 * `docs/audit/package-size-ledger.json`. First run on a fresh
 * checkout seeds the ledger; subsequent runs diff + update.
 *
 * Outputs:
 *   PACKAGE_SIZE_BUDGET.md                       — repo-root diff table.
 *   docs/audit/package-size-ledger.json          — per-pack ledger
 *     (current snapshot + bounded history).
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';

import { log } from '../src/log.ts';
import {
  listManifestPrefixes,
  readManifest,
  type Manifest,
  type ManifestIconEntry,
} from '../src/manifest.ts';
import {
  repoRoot,
  setPackageFontsDir,
} from '../src/paths.ts';

export const LEDGER_REL = 'docs/audit/package-size-ledger.json';
const REPORT_REL = 'PACKAGE_SIZE_BUDGET.md';

/** Growth ratio above which a pack flips to the warn badge. */
export const SIZE_GROWTH_WARN_RATIO = 0.10;
/** Max number of historical snapshots retained per pack in the ledger. */
export const HISTORY_RETENTION = 10;

export interface HistoryEntry {
  date: string;
  ttfBytes: number;
  dartConsts: number;
  iconifyJsonVersion: string;
}

export interface LedgerEntry {
  lastIconifyVersion: string;
  ttfBytes: number;
  dartConsts: number;
  duotoneCount: number;
  history: HistoryEntry[];
}

export interface Ledger {
  schemaVersion: 1;
  generatedAt: string;
  thresholds: { sizeGrowthWarnRatio: number };
  packs: Record<string, LedgerEntry>;
}

export interface DiffRow {
  prefix: string;
  ttfBytes: number;
  prevTtfBytes: number;
  bytesDelta: number;
  growthRatio: number;
  dartConsts: number;
  prevDartConsts: number;
  constDelta: number;
  duotoneCount: number;
  iconifyJsonVersion: string;
  prevIconifyVersion: string;
  severity: 'info' | 'warn';
  reason: string;
}

interface RunOptions {
  prefixes?: Set<string>;
  dryRun?: boolean;
}

export async function runPackageSizeBudgetAudit(
  opts: RunOptions = {}
): Promise<void> {
  const startedAt = Date.now();
  log.step('package-size-budget audit');

  const allPrefixes = (await listManifestPrefixes()).sort();
  const prefixes = opts.prefixes
    ? allPrefixes.filter((p) => opts.prefixes!.has(p))
    : allPrefixes;

  const today = new Date().toISOString().slice(0, 10);
  const ledger = await loadLedger();
  const next: Ledger = {
    schemaVersion: 1,
    generatedAt: today,
    thresholds: { sizeGrowthWarnRatio: SIZE_GROWTH_WARN_RATIO },
    packs: {},
  };
  const diffs: DiffRow[] = [];

  for (const prefix of prefixes) {
    const manifest = await readManifest(prefix);
    if (!manifest) continue;
    const snap = await snapshotPack(prefix, manifest);
    const prev = ledger.packs[prefix];
    const diff = computeDiff(prefix, snap, prev, manifest);
    diffs.push(diff);

    // Build the new ledger entry: snapshot + bounded history.
    const history: HistoryEntry[] = prev?.history ? [...prev.history] : [];
    // Only append a new history entry when something actually changed (size
    // or const count differ from the most recent entry).
    const lastH = history[history.length - 1];
    const changed =
      !lastH ||
      lastH.ttfBytes !== snap.ttfBytes ||
      lastH.dartConsts !== snap.dartConsts ||
      lastH.iconifyJsonVersion !== manifest.iconifyJsonVersion;
    if (changed) {
      history.push({
        date: today,
        ttfBytes: snap.ttfBytes,
        dartConsts: snap.dartConsts,
        iconifyJsonVersion: manifest.iconifyJsonVersion,
      });
    }
    while (history.length > HISTORY_RETENTION) history.shift();

    next.packs[prefix] = {
      lastIconifyVersion: manifest.iconifyJsonVersion,
      ttfBytes: snap.ttfBytes,
      dartConsts: snap.dartConsts,
      duotoneCount: snap.duotoneCount,
      history,
    };
  }

  diffs.sort(rowCompare);

  if (!opts.dryRun) {
    await writeLedger(next);
  }

  const md = renderMarkdown({ today, diffs, ledger: next });
  await writeFile(path.join(repoRoot(), REPORT_REL), md, 'utf8');

  const warned = diffs.filter((d) => d.severity === 'warn').length;
  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.success(
    `package-size-budget audit done in ${dt}s; ${diffs.length} pack(s) (${warned} above ${(SIZE_GROWTH_WARN_RATIO * 100).toFixed(0)}% growth without version bump)`
  );
}

// ---------- Snapshot --------------------------------------------------------

interface PackSnapshot {
  ttfBytes: number;
  dartConsts: number;
  duotoneCount: number;
}

async function snapshotPack(
  prefix: string,
  manifest: Manifest
): Promise<PackSnapshot> {
  const fontsDir = setPackageFontsDir(prefix);
  let ttfBytes = 0;
  if (existsSync(fontsDir)) {
    const files = await readdir(fontsDir);
    for (const f of files.sort()) {
      if (!f.endsWith('.ttf')) continue;
      const s = await stat(path.join(fontsDir, f));
      ttfBytes += s.size;
    }
  }
  const { dartConsts, duotoneCount } = countDartConsts(manifest);
  return { ttfBytes, dartConsts, duotoneCount };
}

/**
 * Count of `static const IconifyIconData` fields the codegen emits on
 * the per-pack `<Prefix>Icons` class. From `dart_codegen.ts:67-130`:
 * one const per canonical live entry (aliases live in a separate map
 * file and are NOT included on the class). Computing this from the
 * manifest avoids a Dart file read per pack and is exact.
 */
export function countDartConsts(manifest: Manifest): {
  dartConsts: number;
  duotoneCount: number;
} {
  const icons: Record<string, ManifestIconEntry> = (manifest as any).icons ?? {};
  let dartConsts = 0;
  let duotoneCount = 0;
  for (const e of Object.values(icons)) {
    if (e.deprecated) continue;
    if (e.aliasOf) continue;
    dartConsts += 1;
    if (e.duotone) duotoneCount += 1;
  }
  return { dartConsts, duotoneCount };
}

// ---------- Diff ------------------------------------------------------------

export function computeDiff(
  prefix: string,
  snap: PackSnapshot,
  prev: LedgerEntry | undefined,
  manifest: Manifest
): DiffRow {
  const prevTtfBytes = prev?.ttfBytes ?? 0;
  const prevDartConsts = prev?.dartConsts ?? 0;
  const prevIconifyVersion = prev?.lastIconifyVersion ?? '';
  const bytesDelta = snap.ttfBytes - prevTtfBytes;
  const constDelta = snap.dartConsts - prevDartConsts;
  // Growth ratio against the previous snapshot. For a fresh-baseline
  // pack (prev=0) we report ratio=0 — the first run can't regress.
  const growthRatio =
    prevTtfBytes > 0 ? (snap.ttfBytes - prevTtfBytes) / prevTtfBytes : 0;

  // The warn condition is "grew more than threshold AND iconify version
  // didn't change". An iconify bump is the legitimate reason for size
  // growth; without one, the growth signals cache loss / glyph
  // inflation / sibling re-split.
  let severity: 'info' | 'warn' = 'info';
  let reason = '';
  if (
    growthRatio > SIZE_GROWTH_WARN_RATIO &&
    manifest.iconifyJsonVersion === prevIconifyVersion &&
    prevIconifyVersion !== ''
  ) {
    severity = 'warn';
    reason = `+${(growthRatio * 100).toFixed(1)}% TTF growth without @iconify/json bump (pinned at ${manifest.iconifyJsonVersion})`;
  } else if (growthRatio > SIZE_GROWTH_WARN_RATIO) {
    reason = `+${(growthRatio * 100).toFixed(1)}% TTF growth — explained by iconify ${prevIconifyVersion || '<new>'} → ${manifest.iconifyJsonVersion} bump`;
  } else if (prev === undefined) {
    reason = 'first snapshot — baseline only';
  }

  return {
    prefix,
    ttfBytes: snap.ttfBytes,
    prevTtfBytes,
    bytesDelta,
    growthRatio,
    dartConsts: snap.dartConsts,
    prevDartConsts,
    constDelta,
    duotoneCount: snap.duotoneCount,
    iconifyJsonVersion: manifest.iconifyJsonVersion,
    prevIconifyVersion,
    severity,
    reason,
  };
}

// ---------- Ledger I/O ------------------------------------------------------

async function loadLedger(): Promise<Ledger> {
  const filePath = path.join(repoRoot(), LEDGER_REL);
  if (!existsSync(filePath)) {
    return {
      schemaVersion: 1,
      generatedAt: '',
      thresholds: { sizeGrowthWarnRatio: SIZE_GROWTH_WARN_RATIO },
      packs: {},
    };
  }
  const raw = await readFile(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw) as Ledger;
    if (parsed.schemaVersion !== 1 || !parsed.packs) {
      throw new Error('malformed ledger');
    }
    return parsed;
  } catch (e) {
    log.warn(
      `package-size-budget: ledger at ${LEDGER_REL} is unreadable (${e instanceof Error ? e.message : String(e)}); seeding empty`
    );
    return {
      schemaVersion: 1,
      generatedAt: '',
      thresholds: { sizeGrowthWarnRatio: SIZE_GROWTH_WARN_RATIO },
      packs: {},
    };
  }
}

async function writeLedger(ledger: Ledger): Promise<void> {
  const filePath = path.join(repoRoot(), LEDGER_REL);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stableStringify(ledger) + '\n', 'utf8');
}

// ---------- Sort / markdown / json ------------------------------------------

function rowCompare(a: DiffRow, b: DiffRow): number {
  // warn first (severity desc), then largest absolute byte delta first,
  // then alphabetical for ties.
  const sev = (a.severity === 'warn' ? 1 : 0) - (b.severity === 'warn' ? 1 : 0);
  if (sev !== 0) return -sev;
  if (a.bytesDelta !== b.bytesDelta) return Math.abs(b.bytesDelta) - Math.abs(a.bytesDelta);
  return a.prefix.localeCompare(b.prefix);
}

function renderMarkdown(input: {
  today: string;
  diffs: DiffRow[];
  ledger: Ledger;
}): string {
  const { today, diffs, ledger } = input;
  const lines: string[] = [];
  lines.push('# PACKAGE_SIZE_BUDGET');
  lines.push('');
  lines.push(
    `_Generated ${today}. Warn threshold: > ${(SIZE_GROWTH_WARN_RATIO * 100).toFixed(0)}% TTF growth without an @iconify/json version bump._`
  );
  lines.push('');

  const warned = diffs.filter((d) => d.severity === 'warn');
  const totalTtfBytes = diffs.reduce((s, d) => s + d.ttfBytes, 0);
  const totalConsts = diffs.reduce((s, d) => s + d.dartConsts, 0);

  lines.push(
    `Total across ${diffs.length} pack(s): **${formatBytes(totalTtfBytes)}** in TTFs, **${totalConsts.toLocaleString('en-US')}** Dart consts.`
  );
  lines.push('');

  if (warned.length > 0) {
    lines.push(`## Warning — ${warned.length} pack(s) over budget`);
    lines.push('');
    lines.push(...renderTable(warned, /* includeReason */ true));
    lines.push('');
  } else {
    lines.push(`## No packs over the ${(SIZE_GROWTH_WARN_RATIO * 100).toFixed(0)}% growth threshold.`);
    lines.push('');
  }

  // Top-5 changers (any direction) for at-a-glance signal.
  const topChangers = [...diffs]
    .filter((d) => d.prevTtfBytes > 0)
    .sort((a, b) => Math.abs(b.bytesDelta) - Math.abs(a.bytesDelta))
    .slice(0, 5);
  if (topChangers.length > 0) {
    lines.push(`## Top 5 changers (vs last snapshot)`);
    lines.push('');
    lines.push(...renderTable(topChangers, true));
    lines.push('');
  }

  lines.push('## All packs');
  lines.push('');
  lines.push(...renderTable(diffs, false));
  lines.push('');

  if (ledger.generatedAt) {
    lines.push(`_Previous ledger: ${ledger.generatedAt}. History retention: ${HISTORY_RETENTION} entries per pack._`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderTable(rows: DiffRow[], includeReason: boolean): string[] {
  const out: string[] = [];
  if (includeReason) {
    out.push('| Pack | TTF | Δ bytes | Δ % | Consts | Duotones | iconify | Note |');
    out.push('|---|---:|---:|---:|---:|---:|:--:|---|');
  } else {
    out.push('| Pack | TTF | Δ bytes | Δ % | Consts | Duotones | iconify |');
    out.push('|---|---:|---:|---:|---:|---:|:--:|');
  }
  for (const r of rows) {
    const pctStr =
      r.prevTtfBytes > 0
        ? `${(r.growthRatio * 100).toFixed(2)}%`
        : 'new';
    const tail = includeReason ? ` | ${r.reason}` : '';
    out.push(
      `| \`${r.prefix}\` | ${formatBytes(r.ttfBytes)} | ${formatBytesSigned(r.bytesDelta)} | ${pctStr} | ${r.dartConsts.toLocaleString('en-US')} | ${r.duotoneCount.toLocaleString('en-US')} | ${r.iconifyJsonVersion}${tail} |`
    );
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBytesSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ' ';
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

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
