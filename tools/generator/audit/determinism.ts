/**
 * Determinism self-check (§16-A10).
 *
 * Foundational audit for the caching / merge work in §32/§33 and the
 * planned §13/§15 per-font TTF cache + SQLite strokefill cache: without
 * a byte-determinism baseline, a cache-key bug could silently ship
 * corrupted TTFs to consumers (the wrapper glyphs would still render
 * SOMETHING, just the wrong glyph or with shifted metrics — exactly the
 * class §33 demonstrated is invisible to structural-only audits).
 *
 * CLAUDE.md §5 asserts that `svg2ttf({ ts: 0 })` produces byte-identical
 * TTFs across runs of the same generator + same `@iconify/json` version.
 * §33's `canonicalize_ttf.py` post-process extends the determinism
 * contract to head/hhea/OS/2 metric tables. This audit is the TOOL that
 * verifies those properties empirically.
 *
 * ## Three modes
 *
 *   bun run audit determinism
 *       Snapshot-vs-baseline. SHA256 every generated artefact, compare
 *       against `docs/audit/sha_baseline.json` (committed). Emits
 *       `DETERMINISM_AUDIT.md` listing drifted files. Exits 0 unless
 *       `--strict`; the baseline can legitimately get out of date with
 *       new commits, so the report is informational by default.
 *
 *   bun run audit determinism -- --regen-twice [--smoke a,b,c | --full]
 *       Full empirical check. Snapshot, run `bun run generate` (limited
 *       to a smoke subset by default — full corpus is ~3-5 min and
 *       OPT-IN), snapshot again, diff. Any byte drift exits 1. Catches
 *       non-determinism that an offline snapshot can't see.
 *
 *   bun run audit determinism -- --update-baseline [--force]
 *       Promote the current state to a new committed baseline. Updates
 *       `docs/audit/sha_baseline.json` with the current SHAs +
 *       generator commit hash. Prompts for confirmation unless `--force`.
 *
 * ## Output is itself deterministic
 *
 * Every file list is sorted by repo-relative path; JSON keys are
 * sorted recursively; markdown rows are sorted by category then path;
 * timestamps in the report are derived from inputs (commit hash, not
 * wall-clock). Same generated artefacts → byte-identical
 * `DETERMINISM_AUDIT.md` regardless of how many times this audit runs.
 *
 * ## Files captured in the snapshot
 *
 *   1. `packages/iconifyx_<prefix>/assets/fonts/*.ttf` — the TTFs that
 *      ship to consumers. Every byte must be reproducible.
 *   2. `packages/iconifyx_<prefix>/lib/src/sets/<prefix>.dart` — the
 *      generated icon-data classes. const codepoints feed
 *      `--tree-shake-icons`; any drift here is a downstream API break.
 *   3. `tools/generator/manifests/<prefix>.json` — the committed state
 *      that pins codepoints across regens (CLAUDE.md invariant #3).
 *
 * Other generated artefacts (pubspec.yaml, license.dart, example app
 * code) are downstream-of-these — if {1,2,3} are stable, those will be
 * too. Tracking everything would inflate the baseline by ~50× without
 * adding signal.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';

import { repoRoot, packagesDir } from '../src/paths.ts';
import { log } from '../src/log.ts';

// ---------- Paths -----------------------------------------------------------

const BASELINE_REL = 'docs/audit/sha_baseline.json';
const SNAPSHOT_REL = 'tools/generator/.cache/sha_baseline.json';
const REPORT_REL = 'DETERMINISM_AUDIT.md';

const SCHEMA_VERSION = 1;

// ---------- Snapshot types --------------------------------------------------

interface Snapshot {
  schemaVersion: number;
  /** Pinned `@iconify/json` version when the snapshot was taken. */
  iconifyJsonVersion: string;
  /** Generator commit hash (HEAD) when the snapshot was taken. */
  generatorVersion: string;
  /** Repo-relative path -> `sha256:<hex>`. Sorted, deterministic. */
  fonts: Record<string, string>;
  /** Repo-relative path -> `sha256:<hex>`. Sorted, deterministic. */
  dart: Record<string, string>;
  /** Repo-relative path -> `sha256:<hex>`. Sorted, deterministic. */
  manifests: Record<string, string>;
}

interface DiffEntry {
  path: string;
  baseline: string | null;
  current: string | null;
  category: 'fonts' | 'dart' | 'manifests';
  status: 'changed' | 'added' | 'removed';
}

interface DiffSummary {
  changed: DiffEntry[];
  added: DiffEntry[];
  removed: DiffEntry[];
  total: number;
}

// ---------- Hashing ---------------------------------------------------------

async function sha256File(absPath: string): Promise<string> {
  // Stream via Bun.file to avoid materialising large TTFs in memory. The
  // node:crypto Hash works on Uint8Array chunks; Bun's web-style stream
  // reader yields Uint8Array directly.
  const hasher = createHash('sha256');
  const reader = (Bun.file(absPath).stream() as ReadableStream<Uint8Array>).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return `sha256:${hasher.digest('hex')}`;
}

// ---------- File enumeration ------------------------------------------------

interface PackageArtefacts {
  /** Absolute paths sorted lexicographically. */
  fonts: string[];
  /** Absolute paths sorted lexicographically. */
  dart: string[];
}

/**
 * Walk `packages/iconifyx_<prefix>/` and collect the two artefact
 * classes per pack. Excludes `iconifyx`, `iconifyx_core` (those are
 * the meta + hand-written core; not part of the regen-deterministic
 * surface) and any pack that's missing its `assets/fonts/` or
 * `lib/src/sets/` directory.
 */
async function listPackageArtefacts(): Promise<PackageArtefacts> {
  const fonts: string[] = [];
  const dart: string[] = [];
  const pkgRoot = packagesDir();
  if (!existsSync(pkgRoot)) {
    return { fonts: [], dart: [] };
  }
  const entries = await readdir(pkgRoot);
  for (const name of entries.sort()) {
    if (!name.startsWith('iconifyx_')) continue;
    if (name === 'iconifyx_core') continue; // hand-written
    const fontsDir = path.join(pkgRoot, name, 'assets', 'fonts');
    if (existsSync(fontsDir)) {
      let inner: string[];
      try {
        inner = await readdir(fontsDir);
      } catch {
        inner = [];
      }
      for (const f of inner.sort()) {
        if (f.endsWith('.ttf')) fonts.push(path.join(fontsDir, f));
      }
    }
    const setsDir = path.join(pkgRoot, name, 'lib', 'src', 'sets');
    if (existsSync(setsDir)) {
      let inner: string[];
      try {
        inner = await readdir(setsDir);
      } catch {
        inner = [];
      }
      for (const f of inner.sort()) {
        if (f.endsWith('.dart')) dart.push(path.join(setsDir, f));
      }
    }
  }
  return { fonts, dart };
}

async function listManifestFiles(): Promise<string[]> {
  const dir = path.join(repoRoot(), 'tools', 'generator', 'manifests');
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of (await readdir(dir)).sort()) {
    if (f.endsWith('.json')) out.push(path.join(dir, f));
  }
  return out;
}

// ---------- Snapshot construction -------------------------------------------

async function readGeneratorCommit(): Promise<string> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
      cwd: repoRoot(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    return code === 0 && out ? out : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function readIconifyJsonVersion(): Promise<string> {
  // The pinned spec lives in tools/generator/package.json; the resolved
  // version lives in the installed package.json. Prefer the resolved
  // one because that's what was actually used at generate time. Bun's
  // workspaces install the dep under tools/generator/node_modules/
  // (symlinked into the hoisted .bun cache), so check that first.
  const candidates = [
    path.join(repoRoot(), 'tools', 'generator', 'node_modules', '@iconify', 'json', 'package.json'),
    path.join(repoRoot(), 'node_modules', '@iconify', 'json', 'package.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const obj = JSON.parse(await readFile(p, 'utf8')) as { version?: string };
      if (obj.version) return obj.version;
    } catch {
      /* try next */
    }
  }
  const pkgPath = path.join(repoRoot(), 'tools', 'generator', 'package.json');
  try {
    const obj = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    return obj.dependencies?.['@iconify/json'] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function toRepoRel(abs: string): string {
  const root = repoRoot();
  if (abs.startsWith(root + path.sep)) {
    // Normalise to forward slashes for stable JSON output on any platform.
    return abs.slice(root.length + 1).split(path.sep).join('/');
  }
  return abs.split(path.sep).join('/');
}

async function hashFilesMap(
  paths: string[]
): Promise<Record<string, string>> {
  // Parallelism: hashing is IO-bound here; the system handles ~16 hashers
  // concurrently without IO storm. We don't bother with p-limit — even
  // ~600 files at 16 concurrent come in well under 5 s.
  const CONCURRENCY = 16;
  const out: Record<string, string> = {};
  let i = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= paths.length) return;
      const abs = paths[idx]!;
      out[toRepoRel(abs)] = await sha256File(abs);
    }
  }
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CONCURRENCY, paths.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  // Sort to keep the JSON output deterministic.
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k]!;
  return sorted;
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [{ fonts, dart }, manifests, generatorVersion, iconifyJsonVersion] =
    await Promise.all([
      listPackageArtefacts(),
      listManifestFiles(),
      readGeneratorCommit(),
      readIconifyJsonVersion(),
    ]);

  const [fontsMap, dartMap, manifestsMap] = await Promise.all([
    hashFilesMap(fonts),
    hashFilesMap(dart),
    hashFilesMap(manifests),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    iconifyJsonVersion,
    generatorVersion,
    fonts: fontsMap,
    dart: dartMap,
    manifests: manifestsMap,
  };
}

// ---------- Diff ------------------------------------------------------------

function diffSnapshots(baseline: Snapshot, current: Snapshot): DiffSummary {
  const entries: DiffEntry[] = [];
  const cats: Array<'fonts' | 'dart' | 'manifests'> = [
    'fonts',
    'dart',
    'manifests',
  ];
  for (const cat of cats) {
    const b = baseline[cat] ?? {};
    const c = current[cat] ?? {};
    const allKeys = new Set([...Object.keys(b), ...Object.keys(c)]);
    for (const k of allKeys) {
      const bv = b[k] ?? null;
      const cv = c[k] ?? null;
      if (bv === cv) continue;
      let status: DiffEntry['status'];
      if (bv == null) status = 'added';
      else if (cv == null) status = 'removed';
      else status = 'changed';
      entries.push({ path: k, baseline: bv, current: cv, category: cat, status });
    }
  }
  entries.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.status.localeCompare(b.status) ||
      a.path.localeCompare(b.path)
  );
  return {
    changed: entries.filter((e) => e.status === 'changed'),
    added: entries.filter((e) => e.status === 'added'),
    removed: entries.filter((e) => e.status === 'removed'),
    total: entries.length,
  };
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

// ---------- Markdown report -------------------------------------------------

interface ReportInput {
  current: Snapshot;
  baseline: Snapshot | null;
  diff: DiffSummary | null;
  mode: 'snapshot' | 'regen-twice' | 'update-baseline';
  regenSummary?: {
    smokeSets: string[];
    full: boolean;
    secondSnapshot: Snapshot;
    drift: DiffSummary;
  };
}

function renderReport(input: ReportInput): string {
  const { current, baseline, diff, mode, regenSummary } = input;
  const lines: string[] = [];
  lines.push('# Determinism audit (§16-A10)');
  lines.push('');
  lines.push(
    'Verifies that the generator emits byte-identical TTFs / Dart / ' +
      'manifests across runs (CLAUDE.md §5 + §33 canonical-metric ' +
      'contract). Output of this report is itself deterministic — same ' +
      'inputs always produce the same markdown.'
  );
  lines.push('');
  lines.push('## Run metadata');
  lines.push('');
  lines.push(`- Mode: \`${mode}\``);
  lines.push(`- Snapshot schema version: \`${current.schemaVersion}\``);
  lines.push(`- \`@iconify/json\`: \`${current.iconifyJsonVersion}\``);
  lines.push(`- Generator commit (current HEAD): \`${current.generatorVersion}\``);
  lines.push(
    `- Files snapshotted: **${fileCount(current).toLocaleString('en-US')}** ` +
      `(${Object.keys(current.fonts).length} TTFs, ` +
      `${Object.keys(current.dart).length} Dart, ` +
      `${Object.keys(current.manifests).length} manifests)`
  );
  if (baseline) {
    lines.push(`- Baseline commit: \`${baseline.generatorVersion}\``);
    lines.push(`- Baseline \`@iconify/json\`: \`${baseline.iconifyJsonVersion}\``);
  } else {
    lines.push(
      `- Baseline: **MISSING** — run \`bun run audit determinism -- --update-baseline\` to create.`
    );
  }
  lines.push('');

  // --- Snapshot-vs-baseline diff -------------------------------------------
  if (diff) {
    lines.push('## Baseline drift');
    lines.push('');
    if (diff.total === 0) {
      lines.push(
        '_No drift — every committed artefact matches the baseline SHA._'
      );
    } else {
      lines.push(
        `**${diff.total.toLocaleString('en-US')}** files differ from the ` +
          `committed baseline (${diff.changed.length} changed, ` +
          `${diff.added.length} added, ${diff.removed.length} removed).`
      );
      lines.push('');
      lines.push(
        'A non-zero drift is OK in normal development — it just means ' +
          'the baseline is older than HEAD. Bump it via ' +
          '`bun run audit determinism -- --update-baseline` once HEAD ' +
          'is verified known-good (e.g. after a deliberate regen).'
      );
      lines.push('');
      renderDiffTable(lines, diff, 'fonts', 'TTF fonts');
      renderDiffTable(lines, diff, 'dart', 'Generated Dart');
      renderDiffTable(lines, diff, 'manifests', 'Manifests');
    }
    lines.push('');
  }

  // --- regen-twice empirical -----------------------------------------------
  if (regenSummary) {
    lines.push('## Empirical regen-twice check');
    lines.push('');
    lines.push(
      regenSummary.full
        ? '- Scope: **full corpus** (every pack).'
        : `- Scope: smoke subset **\`${regenSummary.smokeSets.join('`, `') || '—'}\`** ` +
            '(use `--full` for the full corpus regen-twice).'
    );
    lines.push('');
    if (regenSummary.drift.total === 0) {
      lines.push(
        '**PASS** — regenerating produced byte-identical artefacts. ' +
          'svg2ttf(ts:0) + canonicalize_ttf.py + sorted-key JSON outputs ' +
          'are all behaving deterministically across this slice.'
      );
    } else {
      lines.push(
        `**FAIL** — ${regenSummary.drift.total.toLocaleString('en-US')} ` +
          `files drifted between two consecutive regens. This is a real ` +
          `non-determinism bug; investigate ` +
          `\`svg2ttf({ ts: 0 })\`, Python venv ordering, or any newly ` +
          `introduced timestamp/UUID in the codegen path.`
      );
      lines.push('');
      renderDiffTable(lines, regenSummary.drift, 'fonts', 'TTF drift');
      renderDiffTable(lines, regenSummary.drift, 'dart', 'Dart drift');
      renderDiffTable(lines, regenSummary.drift, 'manifests', 'Manifest drift');
    }
    lines.push('');
  }

  lines.push('## How this audit works');
  lines.push('');
  lines.push(
    `- **Snapshot:** SHA256 every committed generated artefact under ` +
      `\`packages/iconifyx_*/assets/fonts/*.ttf\`, ` +
      `\`packages/iconifyx_*/lib/src/sets/*.dart\`, and ` +
      `\`tools/generator/manifests/*.json\`.`
  );
  lines.push(
    `- **Baseline:** \`${BASELINE_REL}\` (committed). Comparing HEAD ` +
      `against it shows what drifted since the baseline was taken.`
  );
  lines.push(
    `- **Empirical (\`--regen-twice\`):** snapshot, run \`bun run generate\`, ` +
      `snapshot again, diff. Catches non-determinism that an offline diff ` +
      `can't see.`
  );
  lines.push(
    `- **Promote (\`--update-baseline\`):** writes the current snapshot ` +
      `into \`${BASELINE_REL}\`. Use after a deliberate regen on a green ` +
      `pipeline.`
  );
  lines.push('');
  return lines.join('\n');
}

function renderDiffTable(
  lines: string[],
  diff: DiffSummary,
  cat: 'fonts' | 'dart' | 'manifests',
  label: string
): void {
  const rows = [...diff.changed, ...diff.added, ...diff.removed].filter(
    (e) => e.category === cat
  );
  if (rows.length === 0) return;
  lines.push(`### ${label} (${rows.length})`);
  lines.push('');
  lines.push('| Path | Status | Baseline | Current |');
  lines.push('|---|---|---|---|');
  const SHOW = 100;
  for (const r of rows.slice(0, SHOW)) {
    const b = r.baseline ? shortSha(r.baseline) : '—';
    const c = r.current ? shortSha(r.current) : '—';
    lines.push(`| \`${r.path}\` | ${r.status} | \`${b}\` | \`${c}\` |`);
  }
  if (rows.length > SHOW) {
    lines.push('');
    lines.push(
      `…${(rows.length - SHOW).toLocaleString('en-US')} more — see ` +
        `\`tools/generator/.cache/sha_baseline.json\` for full hashes.`
    );
  }
  lines.push('');
}

function shortSha(sha: string): string {
  // sha256:<hex> -> first 12 hex chars after the prefix
  const m = /^sha256:([0-9a-f]+)$/i.exec(sha);
  if (!m) return sha;
  return m[1]!.slice(0, 12);
}

function fileCount(s: Snapshot): number {
  return (
    Object.keys(s.fonts).length +
    Object.keys(s.dart).length +
    Object.keys(s.manifests).length
  );
}

// ---------- Baseline read/write --------------------------------------------

async function readBaseline(): Promise<Snapshot | null> {
  const p = path.join(repoRoot(), BASELINE_REL);
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, 'utf8');
    const obj = JSON.parse(raw) as Snapshot;
    if (typeof obj.schemaVersion !== 'number') return null;
    return obj;
  } catch (e) {
    log.warn(
      `determinism: baseline at ${BASELINE_REL} unreadable — ` +
        `${e instanceof Error ? e.message : String(e)}`
    );
    return null;
  }
}

async function writeBaseline(s: Snapshot): Promise<void> {
  const p = path.join(repoRoot(), BASELINE_REL);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, stableStringify(s) + '\n', 'utf8');
}

async function writeSnapshotCache(s: Snapshot): Promise<void> {
  const p = path.join(repoRoot(), SNAPSHOT_REL);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, stableStringify(s) + '\n', 'utf8');
}

// ---------- Regen orchestration --------------------------------------------

interface RegenOptions {
  smokeSets: string[];
  full: boolean;
}

async function runGenerateBlocking(opts: RegenOptions): Promise<void> {
  const args = ['run', 'src/index.ts'];
  if (!opts.full) {
    if (opts.smokeSets.length === 0) {
      throw new Error(
        'regen-twice: --smoke requires at least one prefix, or pass --full'
      );
    }
    args.push('--smoke', opts.smokeSets.join(','));
  }
  log.step(
    opts.full
      ? `Regenerating FULL corpus (this will take ~3-5 min on M-series)…`
      : `Regenerating smoke subset: ${opts.smokeSets.join(', ')}`
  );
  const proc = Bun.spawn(['bun', ...args], {
    cwd: path.join(repoRoot(), 'tools', 'generator'),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`bun run generate exited ${code}`);
  }
}

// ---------- CLI args --------------------------------------------------------

interface ParsedArgs {
  regenTwice: boolean;
  updateBaseline: boolean;
  force: boolean;
  smoke: string[];
  full: boolean;
  strict: boolean;
}

const DEFAULT_SMOKE = ['mdi', 'lucide', 'solar'];

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {
    regenTwice: false,
    updateBaseline: false,
    force: false,
    smoke: [],
    full: false,
    strict: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    // `bun run audit determinism -- --regen-twice` passes a bare `--`
    // separator through to us; bun's `run` script doesn't strip it.
    // Treat it as a no-op rather than an unknown flag.
    if (a === '--') continue;
    switch (a) {
      case '--regen-twice':
        out.regenTwice = true;
        break;
      case '--update-baseline':
        out.updateBaseline = true;
        break;
      case '--force':
        out.force = true;
        break;
      case '--full':
        out.full = true;
        break;
      case '--strict':
        out.strict = true;
        break;
      case '--smoke': {
        const val = args[i + 1];
        if (val) {
          i++;
          out.smoke = val.split(',').map((s) => s.trim()).filter(Boolean);
        }
        break;
      }
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith('--')) {
          log.warn(`determinism: unknown flag '${a}' ignored`);
        }
    }
  }
  if (out.regenTwice && out.smoke.length === 0 && !out.full) {
    out.smoke = [...DEFAULT_SMOKE];
  }
  return out;
}

function printHelp(): void {
  console.log(
    [
      'Usage: bun run audit determinism [-- <flags>]',
      '',
      'Default (no flags): snapshot current state, diff against committed',
      '  baseline at docs/audit/sha_baseline.json, write DETERMINISM_AUDIT.md.',
      '  Exits 0 (informational). Pass --strict to fail on any drift.',
      '',
      'Flags:',
      '  --regen-twice         Empirical check: snapshot, regen, snapshot,',
      '                        diff. Fails on byte drift between runs.',
      '  --smoke <p1,p2,...>   Limit --regen-twice to these prefixes. Default:',
      `                        ${DEFAULT_SMOKE.join(',')}.`,
      '  --full                Run --regen-twice over the entire corpus',
      '                        (~3-5 min on M-series; OPT-IN).',
      '  --update-baseline     Promote current state to new committed',
      '                        baseline. Prompts unless --force.',
      '  --force               Skip the update-baseline confirmation.',
      '  --strict              Snapshot-mode drift exits 1 instead of 0.',
      '  -h, --help            Show this help.',
    ].join('\n')
  );
}

// ---------- Confirmation prompt --------------------------------------------

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    log.warn('determinism: stdin is not a TTY — pass --force to skip confirmation');
    return false;
  }
  process.stdout.write(`${prompt} [y/N] `);
  const reader = (process.stdin as NodeJS.ReadStream & {
    [Symbol.asyncIterator]: () => AsyncIterableIterator<string | Buffer>;
  })[Symbol.asyncIterator]();
  const r = await reader.next();
  if (r.done) return false;
  const v = String(r.value).trim().toLowerCase();
  return v === 'y' || v === 'yes';
}

// ---------- Entry point -----------------------------------------------------

export interface RunOptions {
  /** Already-parsed flag set (programmatic caller). */
  args?: ParsedArgs;
  /**
   * Raw flag list forwarded by the dispatcher. Wins over `args` when
   * both are provided. The dispatcher passes the flags AFTER the
   * `determinism` subcommand name.
   */
  rawArgs?: string[];
}

export async function runDeterminismAudit(opts: RunOptions = {}): Promise<number> {
  const args =
    opts.args ??
    parseArgs(
      opts.rawArgs ?? process.argv.slice(2).filter((a) => a !== 'determinism')
    );
  const startedAt = Date.now();

  // ---- Update-baseline path ----
  if (args.updateBaseline) {
    log.step('determinism: snapshot current state for new baseline');
    const current = await buildSnapshot();
    if (!args.force) {
      const ok = await confirm(
        `Promote current snapshot (${fileCount(current)} files, commit ` +
          `${current.generatorVersion.slice(0, 12)}) to ` +
          `${BASELINE_REL}?`
      );
      if (!ok) {
        log.warn('determinism: baseline update cancelled');
        return 1;
      }
    }
    await writeBaseline(current);
    await writeSnapshotCache(current);
    // Report still useful — shows the all-green state.
    const md = renderReport({
      current,
      baseline: current,
      diff: { changed: [], added: [], removed: [], total: 0 },
      mode: 'update-baseline',
    });
    await writeFile(path.join(repoRoot(), REPORT_REL), md, 'utf8');
    const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
    log.success(
      `determinism: baseline updated (${fileCount(current)} files) in ${dt}s — commit your changes.`
    );
    return 0;
  }

  // ---- Snapshot mode (default + --regen-twice base) ----
  log.step('determinism: hashing committed artefacts');
  const current = await buildSnapshot();
  await writeSnapshotCache(current);
  log.info(
    `${fileCount(current)} files hashed (` +
      `${Object.keys(current.fonts).length} TTF, ` +
      `${Object.keys(current.dart).length} Dart, ` +
      `${Object.keys(current.manifests).length} manifest)`
  );

  const baseline = await readBaseline();
  const diff = baseline ? diffSnapshots(baseline, current) : null;

  if (!args.regenTwice) {
    const md = renderReport({
      current,
      baseline,
      diff,
      mode: 'snapshot',
    });
    await writeFile(path.join(repoRoot(), REPORT_REL), md, 'utf8');
    const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (!baseline) {
      log.warn(
        `determinism: no baseline at ${BASELINE_REL} — wrote DETERMINISM_AUDIT.md only. ` +
          `Run \`bun run audit determinism -- --update-baseline\` to create one.`
      );
    } else if (diff && diff.total > 0) {
      log.warn(
        `determinism: ${diff.total} files differ from baseline ` +
          `(${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed). ` +
          `See DETERMINISM_AUDIT.md.`
      );
      if (args.strict) return 1;
    } else {
      log.success(`determinism: baseline clean in ${dt}s`);
    }
    return 0;
  }

  // ---- Regen-twice empirical ----
  if (args.full) {
    log.warn(
      'determinism: --full regen-twice will take ~3-5 minutes on M-series. ' +
        'Use --smoke to limit scope.'
    );
  }
  await runGenerateBlocking({ smokeSets: args.smoke, full: args.full });
  log.step('determinism: re-hashing after regen');
  const secondSnapshot = await buildSnapshot();
  const drift = diffSnapshots(current, secondSnapshot);
  // The smoke / full subset only re-emits a small number of packs; the
  // diff is against ALL committed files. Filter the drift to the subset
  // we just regenerated to keep the empirical signal focused. The full
  // diff is still inside `tools/generator/.cache/sha_baseline.json` for
  // anyone who wants to look.
  const filteredDrift = args.full
    ? drift
    : filterDriftToSubset(drift, args.smoke);
  const md = renderReport({
    current: secondSnapshot,
    baseline,
    diff: baseline ? diffSnapshots(baseline, secondSnapshot) : null,
    mode: 'regen-twice',
    regenSummary: {
      smokeSets: args.smoke,
      full: args.full,
      secondSnapshot,
      drift: filteredDrift,
    },
  });
  await writeFile(path.join(repoRoot(), REPORT_REL), md, 'utf8');
  await writeSnapshotCache(secondSnapshot);

  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (filteredDrift.total > 0) {
    log.error(
      `determinism: regen-twice DRIFTED ${filteredDrift.total} files in ${dt}s — non-determinism detected!`
    );
    return 1;
  }
  log.success(
    `determinism: regen-twice clean in ${dt}s ` +
      `(scope: ${args.full ? 'full corpus' : args.smoke.join(',')})`
  );
  return 0;
}

/**
 * When `--regen-twice --smoke a,b,c` ran, only those packs were
 * regenerated; pre-existing TTFs for other packs may have been touched
 * by an unrelated process between the two snapshots. Restrict the drift
 * report to the prefixes the caller actually exercised so the pass/fail
 * verdict is meaningful.
 */
function filterDriftToSubset(drift: DiffSummary, smokeSets: string[]): DiffSummary {
  if (smokeSets.length === 0) return drift;
  const prefixes = new Set(smokeSets);
  const inScope = (p: string): boolean => {
    // Paths look like packages/iconifyx_<prefix>/... or
    // tools/generator/manifests/<prefix>.json
    const fontMatch = /^packages\/iconifyx_([a-z0-9_]+)\//.exec(p);
    if (fontMatch) {
      const pref = fontMatch[1]!.replace(/_/g, '-');
      return prefixes.has(pref);
    }
    const manifestMatch = /^tools\/generator\/manifests\/(.+)\.json$/.exec(p);
    if (manifestMatch) return prefixes.has(manifestMatch[1]!);
    return false;
  };
  const changed = drift.changed.filter((e) => inScope(e.path));
  const added = drift.added.filter((e) => inScope(e.path));
  const removed = drift.removed.filter((e) => inScope(e.path));
  return {
    changed,
    added,
    removed,
    total: changed.length + added.length + removed.length,
  };
}

// ---------- Standalone entry (for `bun run audit/determinism.ts`) -----------

if (import.meta.main) {
  // process.argv is [node, /path/to/determinism.ts, ...flags]
  const code = await runDeterminismAudit({
    args: parseArgs(process.argv.slice(2)),
  });
  process.exit(code);
}
