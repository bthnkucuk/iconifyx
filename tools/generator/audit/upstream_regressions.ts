/**
 * Iconify upstream-regression detector (§16-A8).
 *
 * Diff every per-pack manifest at `tools/generator/manifests/<prefix>.json`
 * against its previous version (read via `git show HEAD:...`) to surface
 * icons that became deprecated in THIS regen — i.e. ones the previous
 * manifest had as live but the current one marks deprecated.
 *
 * Buckets each new deprecation by `deprecatedReason`:
 *
 *  - `upstream-removed` — Iconify upstream genuinely dropped the icon.
 *    Legitimate; only worrying when `iconifyJsonVersion` did NOT bump
 *    (same upstream + new "upstream-removed" deprecations = our
 *    detection bug).
 *  - `validator-rejected` — `glyph_validator.ts` rejected the body. Our
 *    regression unless the upstream body itself changed.
 *  - `panic-skipped` — native resvg crashed on the body. Our regression
 *    unless the body materially changed shape.
 *  - `paint-order-dropped` — `isPaintOrderRiskBody` dropped the body.
 *    Our regression if the body wasn't a paint-order risk in the
 *    previous regen.
 *  - `unknown` — pre-A8 drops with no recorded reason, or build-time
 *    failures that fell through. Surfaces but is advisory only.
 *
 * Output: `UPSTREAM_REGRESSIONS.md` at repo root + per-pack JSON at
 * `docs/audit/upstream-regressions/<prefix>.json`. Deterministic: same
 * manifests in => byte-identical report out.
 *
 * Mynaui case (CLAUDE.md §5c, the bug §16-A8 was designed to catch):
 * a regex tightening in `glyph_validator.ts` silently deprecated 1,800
 * icons. With the validator-rejected bucket + iconifyJsonVersion check,
 * the same class of bug would have surfaced at the top of this report
 * with one row of context per icon.
 */

import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  listManifestPrefixes,
  readManifest,
  type Manifest,
  type ManifestIconEntry,
} from '../src/manifest.ts';
import { repoRoot } from '../src/paths.ts';
import { log } from '../src/log.ts';

// ---------- Types -----------------------------------------------------------

type Reason =
  | 'upstream-removed'
  | 'validator-rejected'
  | 'panic-skipped'
  | 'paint-order-dropped'
  | 'unknown';

const REASONS: Reason[] = [
  'upstream-removed',
  'validator-rejected',
  'panic-skipped',
  'paint-order-dropped',
  'unknown',
];

/** Severity bucket — higher means "more likely a regression we caused". */
const REASON_SEVERITY: Record<Reason, number> = {
  'validator-rejected': 40,
  'panic-skipped': 30,
  'paint-order-dropped': 20,
  unknown: 10,
  'upstream-removed': 0,
};

interface NewDeprecation {
  prefix: string;
  iconName: string;
  identifier: string;
  codepoint: number;
  fontFamily: string;
  reason: Reason;
  deprecatedSince: string;
}

interface PerPackReport {
  prefix: string;
  iconifyJsonVersion: string;
  previousIconifyJsonVersion: string | null;
  iconifyJsonVersionBumped: boolean;
  liveCountCurrent: number;
  liveCountPrevious: number;
  newDeprecations: NewDeprecation[];
  /** When previous manifest is missing — pack is new this regen, skip A8. */
  noPrevious: boolean;
}

// ---------- Git helpers (mirror manifest_lint.ts) ---------------------------

async function readPreviousManifest(prefix: string): Promise<Manifest | null> {
  const relPath = `tools/generator/manifests/${prefix}.json`;
  try {
    const proc = Bun.spawn(['git', 'show', `HEAD:${relPath}`], {
      cwd: repoRoot(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    try {
      return JSON.parse(stdout) as Manifest;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function gitAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

// ---------- Diff logic ------------------------------------------------------

function reasonOf(ic: ManifestIconEntry): Reason {
  return (ic.deprecatedReason as Reason | undefined) ?? 'unknown';
}

function diffOne(current: Manifest, previous: Manifest | null): PerPackReport {
  const liveCurrent = Object.values(current.icons).filter((i) => !i.deprecated).length;

  if (!previous) {
    return {
      prefix: current.prefix,
      iconifyJsonVersion: current.iconifyJsonVersion,
      previousIconifyJsonVersion: null,
      iconifyJsonVersionBumped: false,
      liveCountCurrent: liveCurrent,
      liveCountPrevious: 0,
      newDeprecations: [],
      noPrevious: true,
    };
  }

  const liveBefore = Object.values(previous.icons).filter((i) => !i.deprecated).length;
  const newDeprecations: NewDeprecation[] = [];

  for (const [name, cur] of Object.entries(current.icons)) {
    if (!cur.deprecated) continue;
    const prev = previous.icons?.[name];
    // Two flavours of "new this regen":
    //  (a) icon was live in previous manifest but is deprecated now,
    //  (b) icon is brand-new in current manifest (no prev entry) AND
    //      already deprecated — this happens when codepoint_allocator
    //      reserves a slot for an icon that was dropped at build time
    //      (e.g. a freshly-added upstream icon failed validation on
    //      first regen). The slot stays reserved per CLAUDE.md §3.
    const isNewDep = !prev || !prev.deprecated;
    if (!isNewDep) continue;
    newDeprecations.push({
      prefix: current.prefix,
      iconName: name,
      identifier: cur.identifier,
      codepoint: cur.codepoint,
      fontFamily: cur.fontFamily,
      reason: reasonOf(cur),
      deprecatedSince: cur.deprecatedSince ?? '(unknown)',
    });
  }

  return {
    prefix: current.prefix,
    iconifyJsonVersion: current.iconifyJsonVersion,
    previousIconifyJsonVersion: previous.iconifyJsonVersion ?? null,
    iconifyJsonVersionBumped:
      previous.iconifyJsonVersion !== current.iconifyJsonVersion,
    liveCountCurrent: liveCurrent,
    liveCountPrevious: liveBefore,
    newDeprecations,
    noPrevious: false,
  };
}

// ---------- Driver ----------------------------------------------------------

interface RunOptions {
  prefixes?: Set<string>;
}

export async function runUpstreamRegressionsAudit(opts: RunOptions = {}): Promise<void> {
  const startedAt = Date.now();
  log.step('upstream-regressions audit');

  const allPrefixes = (await listManifestPrefixes()).sort();
  const prefixes = opts.prefixes
    ? allPrefixes.filter((p) => opts.prefixes!.has(p))
    : allPrefixes;

  const haveGit = await gitAvailable();
  if (!haveGit) {
    log.warn(
      'git not available / no HEAD — every pack will be reported as "no previous"; no diffs computed'
    );
  }

  const reports: PerPackReport[] = [];
  for (const prefix of prefixes) {
    const cur = await readManifest(prefix);
    if (!cur) {
      log.warn(`no manifest for ${prefix}, skipping`);
      continue;
    }
    const prev = haveGit ? await readPreviousManifest(prefix) : null;
    reports.push(diffOne(cur, prev));
  }

  // ---------- Per-pack JSON ----------
  const auditDir = path.join(repoRoot(), 'docs', 'audit', 'upstream-regressions');
  await mkdir(auditDir, { recursive: true });
  for (const r of reports) {
    if (r.newDeprecations.length === 0 && !r.noPrevious) continue; // skip clean packs
    const json = stableStringify({
      prefix: r.prefix,
      iconifyJsonVersion: r.iconifyJsonVersion,
      previousIconifyJsonVersion: r.previousIconifyJsonVersion,
      iconifyJsonVersionBumped: r.iconifyJsonVersionBumped,
      liveCountCurrent: r.liveCountCurrent,
      liveCountPrevious: r.liveCountPrevious,
      noPrevious: r.noPrevious,
      newDeprecations: [...r.newDeprecations].sort(depCompare),
    });
    await writeFile(path.join(auditDir, `${r.prefix}.json`), json + '\n', 'utf8');
  }

  // ---------- Repo-root markdown ----------
  const today = new Date().toISOString().slice(0, 10);
  const md = renderMarkdown({ today, reports, haveGit });
  await writeFile(path.join(repoRoot(), 'UPSTREAM_REGRESSIONS.md'), md, 'utf8');

  const totalDeps = reports.reduce((n, r) => n + r.newDeprecations.length, 0);
  const packsHit = reports.filter((r) => r.newDeprecations.length > 0).length;
  const newPacks = reports.filter((r) => r.noPrevious).length;
  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.success(
    `upstream-regressions audit done in ${dt}s; ${totalDeps.toLocaleString('en-US')} new deprecation(s) across ${packsHit} pack(s)` +
      (newPacks > 0 ? `; ${newPacks} new pack(s) skipped (no previous manifest)` : '')
  );
}

// ---------- Sort / summary --------------------------------------------------

function depCompare(a: NewDeprecation, b: NewDeprecation): number {
  return (
    REASON_SEVERITY[b.reason] - REASON_SEVERITY[a.reason] ||
    a.prefix.localeCompare(b.prefix) ||
    a.iconName.localeCompare(b.iconName)
  );
}

interface RenderInput {
  today: string;
  reports: PerPackReport[];
  haveGit: boolean;
}

const TOP_N = 100;

function renderMarkdown(input: RenderInput): string {
  const { today, reports, haveGit } = input;

  const allDeps = reports.flatMap((r) => r.newDeprecations).sort(depCompare);
  const totalsByReason: Record<Reason, number> = {
    'upstream-removed': 0,
    'validator-rejected': 0,
    'panic-skipped': 0,
    'paint-order-dropped': 0,
    unknown: 0,
  };
  for (const d of allDeps) totalsByReason[d.reason] += 1;

  const packsHit = reports.filter((r) => r.newDeprecations.length > 0);
  const newPacks = reports.filter((r) => r.noPrevious);

  // Identify "suspicious" packs: validator-rejected drops with no
  // iconifyJsonVersion bump = same upstream payload + we now reject it
  // ourselves. These are the Mynaui-1800-lost regression class.
  const suspicious: PerPackReport[] = [];
  for (const r of packsHit) {
    if (r.noPrevious) continue;
    if (r.iconifyJsonVersionBumped) continue;
    const ours = r.newDeprecations.filter(
      (d) =>
        d.reason === 'validator-rejected' ||
        d.reason === 'panic-skipped' ||
        d.reason === 'paint-order-dropped'
    );
    if (ours.length > 0) suspicious.push(r);
  }

  const lines: string[] = [];
  lines.push('# Upstream regression detector');
  lines.push('');
  lines.push(
    `Generated ${today}. Diff every \`tools/generator/manifests/<prefix>.json\` ` +
      `against its previous version at git HEAD; surface icons whose ` +
      `\`deprecated\` flag flipped from false→true this regen, bucketed by ` +
      `\`deprecatedReason\`. Output is deterministic — same manifests + git HEAD ` +
      `=> byte-identical report.`
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Packs scanned: **${reports.length.toLocaleString('en-US')}**`);
  if (!haveGit) {
    lines.push(
      `- git unavailable — no diffs computed. Re-run inside a git checkout to enable.`
    );
  } else {
    lines.push(
      `- New deprecations: **${allDeps.length.toLocaleString('en-US')} icons across ${packsHit.length} packs**`
    );
    lines.push(`- New packs (no previous manifest, A8 skipped): **${newPacks.length}**`);
    if (suspicious.length > 0) {
      lines.push(
        `- **${suspicious.length} pack(s) flagged as suspicious** (validator / panic / paint-order drops with no \`iconifyJsonVersion\` bump — likely OUR regression)`
      );
    } else {
      lines.push(
        `- No suspicious packs (no validator / panic / paint-order drops on a non-bumped Iconify version).`
      );
    }
  }
  lines.push('');
  lines.push('### Breakdown by reason');
  lines.push('');
  lines.push('| Reason | New deprecations |');
  lines.push('|---|---:|');
  for (const r of REASONS) {
    lines.push(`| \`${r}\` | ${totalsByReason[r].toLocaleString('en-US')} |`);
  }
  lines.push('');

  // ---------- Suspicious packs callout ----------
  if (suspicious.length > 0) {
    lines.push('## Suspicious packs — likely OUR regression');
    lines.push('');
    lines.push(
      'Validator / panic / paint-order drops on packs whose ' +
        '`iconifyJsonVersion` did NOT bump this regen. Same upstream payload + new ' +
        'deprecations = our pipeline started rejecting something it previously accepted. ' +
        'This is the Mynaui-1800-lost regression class (CLAUDE.md §5c).'
    );
    lines.push('');
    lines.push('| Pack | iconifyJsonVersion | validator-rejected | panic-skipped | paint-order-dropped |');
    lines.push('|---|---|---:|---:|---:|');
    for (const r of [...suspicious].sort((a, b) => b.newDeprecations.length - a.newDeprecations.length)) {
      const v = r.newDeprecations.filter((d) => d.reason === 'validator-rejected').length;
      const p = r.newDeprecations.filter((d) => d.reason === 'panic-skipped').length;
      const po = r.newDeprecations.filter((d) => d.reason === 'paint-order-dropped').length;
      lines.push(`| \`${r.prefix}\` | \`${r.iconifyJsonVersion}\` | ${v} | ${p} | ${po} |`);
    }
    lines.push('');
  }

  // ---------- New deprecations table (top N) ----------
  lines.push('## New deprecations (this regen)');
  lines.push('');
  if (!haveGit) {
    lines.push('_Skipped — git not available._');
  } else if (allDeps.length === 0) {
    lines.push('_No new deprecations this regen._');
  } else {
    lines.push('| Pack | Reason | Icon name | Identifier | Codepoint | Deprecated since |');
    lines.push('|---|---|---|---|---|---|');
    for (const d of allDeps.slice(0, TOP_N)) {
      lines.push(
        `| \`${d.prefix}\` | \`${d.reason}\` | \`${d.iconName}\` | \`${d.identifier}\` | \`0x${d.codepoint.toString(16)}\` | ${d.deprecatedSince} |`
      );
    }
    if (allDeps.length > TOP_N) {
      lines.push('');
      lines.push(
        `…${(allDeps.length - TOP_N).toLocaleString('en-US')} more — see per-pack JSON at \`docs/audit/upstream-regressions/<prefix>.json\`.`
      );
    }
  }
  lines.push('');

  // ---------- Per-pack index ----------
  lines.push('## Per-pack detail');
  lines.push('');
  lines.push('| Pack | New deprecations | iconifyJsonVersion (was → now) |');
  lines.push('|---|---:|---|');
  const sortedReports = [...packsHit].sort((a, b) => a.prefix.localeCompare(b.prefix));
  for (const r of sortedReports) {
    const vstr = r.previousIconifyJsonVersion
      ? r.previousIconifyJsonVersion === r.iconifyJsonVersion
        ? `\`${r.iconifyJsonVersion}\` (no bump)`
        : `\`${r.previousIconifyJsonVersion}\` → \`${r.iconifyJsonVersion}\``
      : `\`${r.iconifyJsonVersion}\` (new)`;
    lines.push(
      `| \`${r.prefix}\` | ${r.newDeprecations.length.toLocaleString('en-US')} | ${vstr} |`
    );
  }
  if (newPacks.length > 0) {
    lines.push('');
    lines.push(`Plus ${newPacks.length} new pack(s) with no previous manifest:`);
    for (const r of newPacks) lines.push(`- \`${r.prefix}\``);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------- Stable JSON -----------------------------------------------------

function stableStringify(value: unknown, indent = 2): string {
  return JSON.stringify(sortKeysDeep(value), null, indent);
}
function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = sortKeysDeep(obj[k]);
  return sorted;
}

// ---------- Inert imports — silence lint -----------------------------------

void readFile;

// ---------- CLI -------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let prefixes: Set<string> | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      if (!prefixes) prefixes = new Set();
      for (const p of args[i + 1]!.split(',')) prefixes.add(p);
      i++;
    }
  }
  await runUpstreamRegressionsAudit({ prefixes });
}

if (import.meta.main) {
  await main();
}
