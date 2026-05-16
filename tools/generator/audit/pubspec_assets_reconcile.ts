/**
 * §16 A7 — Pubspec ↔ assets reconciliation.
 *
 * Audit subcommand: `bun run audit pubspec-assets-reconcile`.
 *
 * Three-way diff per pack between:
 *
 *   1. `readdir(packages/iconifyx_<prefix>/assets/fonts/)` — what's on disk
 *   2. `manifest.fonts[]`                                  — what the pipeline thinks should exist
 *   3. `pubspec.yaml` `flutter.fonts:` family declarations — what `pub get` will register
 *
 * Surfaces:
 *
 *  - **orphan-on-disk** — TTF on disk, not declared in pubspec. Usually
 *    a stale `Mdi_4.ttf` left behind when a sibling-split shrunk and
 *    the new pipeline merger collapsed it but didn't `unlink` the
 *    file. Wastes space in the git tree and confuses tree-shake.
 *  - **pubspec-orphan** — pubspec declares an asset that doesn't exist
 *    on disk. Breaks `flutter pub get` at consumer-side build time.
 *  - **manifest-only** — manifest declares the font, pubspec doesn't.
 *    Means codegen would emit consts referencing a never-loaded family.
 *  - **manifest-zero-on-disk** — `iconCount = 0` in the manifest but
 *    the TTF is still on disk + still declared in pubspec. Empty-font
 *    pruning regressed; the consumer ships a 0-glyph TTF for nothing.
 *
 * `--apply` deletes orphan TTFs from disk + strips orphan pubspec
 * entries after a `git status` warning. Default is read-only (just the
 * report).
 *
 * Outputs:
 *   PUBSPEC_ASSETS_RECONCILE.md                    — repo-root summary.
 *   docs/audit/pubspec-assets-reconcile/<prefix>.json — per-pack detail.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';

import { log } from '../src/log.ts';
import {
  listManifestPrefixes,
  readManifest,
  secondaryFontFamily,
  type Manifest,
  type ManifestFontEntry,
  type ManifestIconEntry,
} from '../src/manifest.ts';
import {
  repoRoot,
  setPackageDir,
  setPackageFontsDir,
} from '../src/paths.ts';

export type IssueCode =
  | 'orphan-on-disk'
  | 'pubspec-orphan'
  | 'manifest-only'
  | 'manifest-zero-on-disk';

export interface PerPackIssue {
  prefix: string;
  family: string;
  code: IssueCode;
  detail: string;
}

export interface PerPackReport {
  prefix: string;
  issues: PerPackIssue[];
}

interface RunOptions {
  prefixes?: Set<string>;
  apply?: boolean;
}

export async function runPubspecAssetsReconcileAudit(
  opts: RunOptions = {}
): Promise<void> {
  const startedAt = Date.now();
  log.step(`pubspec-assets-reconcile audit${opts.apply ? ' (--apply)' : ''}`);

  if (opts.apply) {
    log.warn(
      '--apply: orphan TTFs WILL be deleted and orphan pubspec entries WILL be stripped. Review `git status` before committing.'
    );
  }

  const allPrefixes = (await listManifestPrefixes()).sort();
  const prefixes = opts.prefixes
    ? allPrefixes.filter((p) => opts.prefixes!.has(p))
    : allPrefixes;

  const reports: PerPackReport[] = [];
  let totalIssues = 0;
  let deletedFiles = 0;
  let strippedEntries = 0;

  for (const prefix of prefixes) {
    const manifest = await readManifest(prefix);
    if (!manifest) continue;

    const fontsDir = setPackageFontsDir(prefix);
    const pubspecPath = path.join(setPackageDir(prefix), 'pubspec.yaml');

    const onDisk = await listOnDisk(fontsDir);
    const inPubspec = await readPubspecFontFamilies(pubspecPath);
    const inManifest = manifestFontFamilies(manifest);

    const issues = reconcile({ prefix, onDisk, inPubspec, inManifest, manifest });
    issues.sort(issueCompare);
    reports.push({ prefix, issues });
    totalIssues += issues.length;

    if (opts.apply && issues.length > 0) {
      const { deletedFiles: df, strippedEntries: se } = await applyFixes({
        prefix,
        issues,
        pubspecPath,
        fontsDir,
      });
      deletedFiles += df;
      strippedEntries += se;
    }
  }

  reports.sort((a, b) => a.prefix.localeCompare(b.prefix));

  // ---------- Per-pack JSON ----------
  const auditDir = path.join(
    repoRoot(),
    'docs',
    'audit',
    'pubspec-assets-reconcile'
  );
  await mkdir(auditDir, { recursive: true });
  for (const r of reports) {
    if (r.issues.length === 0) continue;
    const json = stableStringify({ prefix: r.prefix, issues: r.issues });
    await writeFile(
      path.join(auditDir, `${r.prefix}.json`),
      json + '\n',
      'utf8'
    );
  }

  // ---------- Repo-root markdown ----------
  const today = new Date().toISOString().slice(0, 10);
  const md = renderMarkdown({
    today,
    reports,
    totalPacks: prefixes.length,
    applied: !!opts.apply,
    deletedFiles,
    strippedEntries,
  });
  await writeFile(
    path.join(repoRoot(), 'PUBSPEC_ASSETS_RECONCILE.md'),
    md,
    'utf8'
  );

  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  const tail = opts.apply
    ? ` — applied: deleted ${deletedFiles} TTF(s), stripped ${strippedEntries} pubspec entry(ies)`
    : '';
  log.success(
    `pubspec-assets-reconcile done in ${dt}s; ${totalIssues} issue(s) across ${reports.length} pack(s)${tail}`
  );
}

// ---------- Core reconciliation --------------------------------------------

interface ReconcileInput {
  prefix: string;
  onDisk: Set<string>;
  inPubspec: Set<string>;
  inManifest: Map<string, ManifestFontEntry>;
  manifest: Manifest;
}

export function reconcile(input: ReconcileInput): PerPackIssue[] {
  const { prefix, onDisk, inPubspec, inManifest } = input;

  // The union of every family we've seen anywhere — that's the working
  // domain. Ordering is alphabetical for determinism.
  const allFamilies = new Set<string>([
    ...onDisk,
    ...inPubspec,
    ...inManifest.keys(),
  ]);

  const issues: PerPackIssue[] = [];
  for (const family of [...allFamilies].sort()) {
    const isOnDisk = onDisk.has(family);
    const isInPubspec = inPubspec.has(family);
    const manifestEntry = inManifest.get(family);

    // (a) orphan on disk: TTF exists but nothing references it.
    if (isOnDisk && !isInPubspec && !manifestEntry) {
      issues.push({
        prefix,
        family,
        code: 'orphan-on-disk',
        detail: `${family}.ttf is on disk but neither pubspec nor manifest reference it (stale sibling-split residue)`,
      });
      continue;
    }

    // (b) pubspec-orphan: declared in pubspec but missing on disk. The
    // pipeline could only ever generate this state by deleting a TTF
    // without regenerating the pubspec; would break pub get.
    if (isInPubspec && !isOnDisk) {
      issues.push({
        prefix,
        family,
        code: 'pubspec-orphan',
        detail: `pubspec declares family '${family}' but assets/fonts/${family}.ttf is missing`,
      });
      continue;
    }

    // (c) manifest-only: manifest references the family but pubspec
    // doesn't — codegen would emit consts pointing at a phantom font.
    if (manifestEntry && !isInPubspec) {
      // Empty fonts are correctly NOT in pubspec; that's intentional
      // (emitSetPubspec skips `f.iconCount === 0`). Don't flag.
      if (manifestEntry.iconCount === 0) continue;
      issues.push({
        prefix,
        family,
        code: 'manifest-only',
        detail: `manifest declares font '${family}' (iconCount=${manifestEntry.iconCount}) but pubspec doesn't list it — codegen would emit dangling consts`,
      });
      continue;
    }

    // (d) manifest-zero-on-disk: iconCount = 0 manifest entry yet TTF is
    // still on disk + still declared. Empty-font pruning regressed.
    if (manifestEntry && manifestEntry.iconCount === 0 && (isOnDisk || isInPubspec)) {
      issues.push({
        prefix,
        family,
        code: 'manifest-zero-on-disk',
        detail: `manifest font '${family}' has iconCount=0 but ${isOnDisk ? 'TTF is on disk' : ''}${isOnDisk && isInPubspec ? ' and ' : ''}${isInPubspec ? 'pubspec still declares it' : ''}`,
      });
      continue;
    }
  }
  return issues;
}

// ---------- Filesystem / parsing helpers -----------------------------------

async function listOnDisk(fontsDir: string): Promise<Set<string>> {
  if (!existsSync(fontsDir)) return new Set();
  const entries = await readdir(fontsDir);
  const families = new Set<string>();
  for (const e of entries) {
    if (!e.endsWith('.ttf')) continue;
    families.add(e.slice(0, -'.ttf'.length));
  }
  return families;
}

/**
 * Parse `pubspec.yaml` for declared `family: <name>` entries under
 * `flutter.fonts:`. We only care about names; we avoid pulling in a
 * full YAML dependency by doing a line-based parse. The generator
 * emits a very regular shape (see `pubspec_codegen.ts:23`).
 */
export function parsePubspecFontFamilies(yaml: string): Set<string> {
  const families = new Set<string>();
  let inFlutter = false;
  let inFonts = false;
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('flutter:')) {
      inFlutter = true;
      inFonts = false;
      continue;
    }
    // A column-0 line that's a different top-level key resets state.
    if (inFlutter && line.length > 0 && !line.startsWith(' ') && !line.startsWith('#')) {
      inFlutter = false;
      inFonts = false;
    }
    if (!inFlutter) continue;
    // `  fonts:` (any indentation).
    if (/^\s*fonts:\s*$/.test(line)) {
      inFonts = true;
      continue;
    }
    if (!inFonts) continue;
    // `    - family: Mdi`
    const m = /^\s*-\s*family:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(line);
    if (m) families.add(m[1]!);
  }
  return families;
}

async function readPubspecFontFamilies(
  pubspecPath: string
): Promise<Set<string>> {
  if (!existsSync(pubspecPath)) return new Set();
  const yaml = await readFile(pubspecPath, 'utf8');
  return parsePubspecFontFamilies(yaml);
}

/**
 * The manifest's `fonts[]` array lists primary families only. For each
 * primary entry whose live iconCount includes duotone icons, the pack
 * also ships a `<Family>Secondary` TTF — synthesised at emit time. We
 * include that implicit family here so the reconcile loop can see it.
 *
 * We detect duotone presence by walking icons for `duotone: true`
 * (rather than re-reading `manifest.fonts` for a Secondary entry,
 * which IS present per emitter but not always — historic manifests
 * pre-§22 only had primaries). Either signal trips inclusion.
 */
function manifestFontFamilies(manifest: Manifest): Map<string, ManifestFontEntry> {
  const fonts: ManifestFontEntry[] = (manifest as any).fonts ?? [];
  const icons: Record<string, ManifestIconEntry> = (manifest as any).icons ?? {};

  const out = new Map<string, ManifestFontEntry>();
  for (const f of fonts) out.set(f.family, f);

  // Synthesise the Secondary entry for any primary that has at least
  // one live duotone icon — even if the manifest's `fonts` array
  // didn't already include it.
  const secondaryNeeded = new Set<string>();
  const secondaryCounts = new Map<string, number>();
  for (const e of Object.values(icons)) {
    if (e.deprecated) continue;
    if (!e.duotone) continue;
    const sec = secondaryFontFamily(e.fontFamily);
    secondaryNeeded.add(sec);
    secondaryCounts.set(sec, (secondaryCounts.get(sec) ?? 0) + 1);
  }
  for (const sec of secondaryNeeded) {
    if (out.has(sec)) continue;
    out.set(sec, {
      family: sec,
      nextCodepoint: 0,
      iconCount: secondaryCounts.get(sec) ?? 0,
    });
  }
  return out;
}

// ---------- Apply (destructive) --------------------------------------------

async function applyFixes(input: {
  prefix: string;
  issues: PerPackIssue[];
  pubspecPath: string;
  fontsDir: string;
}): Promise<{ deletedFiles: number; strippedEntries: number }> {
  let deletedFiles = 0;
  let strippedEntries = 0;

  // 1. Delete on-disk orphans.
  for (const i of input.issues) {
    if (i.code !== 'orphan-on-disk') continue;
    const ttf = path.join(input.fontsDir, `${i.family}.ttf`);
    if (existsSync(ttf)) {
      await unlink(ttf);
      deletedFiles += 1;
      log.info(`  "${input.prefix}": deleted orphan ${path.relative(repoRoot(), ttf)}`);
    }
  }

  // 2. Strip pubspec-orphan + manifest-zero-on-disk entries.
  const toStrip = new Set(
    input.issues
      .filter(
        (i) =>
          i.code === 'pubspec-orphan' || i.code === 'manifest-zero-on-disk'
      )
      .map((i) => i.family)
  );
  if (toStrip.size > 0 && existsSync(input.pubspecPath)) {
    const yaml = await readFile(input.pubspecPath, 'utf8');
    const { yaml: next, stripped } = stripPubspecFamilies(yaml, toStrip);
    if (stripped > 0) {
      await writeFile(input.pubspecPath, next, 'utf8');
      strippedEntries += stripped;
      log.info(`  "${input.prefix}": stripped ${stripped} pubspec font entry(ies)`);
    }
  }

  return { deletedFiles, strippedEntries };
}

/**
 * Strip `- family: X / fonts: / - asset: ...` blocks for the given
 * families from the pubspec.yaml text. The generator emits a uniform
 * 3-line block per family (see pubspec_codegen.ts:23-25), so we
 * lookahead and drop 3 lines on a match.
 */
export function stripPubspecFamilies(
  yaml: string,
  families: Set<string>
): { yaml: string; stripped: number } {
  const lines = yaml.split('\n');
  const out: string[] = [];
  let stripped = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s*family:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(lines[i]!);
    if (m && families.has(m[2]!)) {
      // Drop this line + the next two ("      fonts:", "        - asset: ...").
      // Be conservative: only skip subsequent indented lines that are
      // deeper than the family bullet's indent.
      const baseIndent = m[1]!.length;
      i += 1;
      while (i < lines.length) {
        const nxt = lines[i]!;
        if (nxt.trim() === '') break;
        const lead = nxt.match(/^(\s*)/)![1]!.length;
        if (lead <= baseIndent) {
          i -= 1; // step back; outer for-loop's i++ will land us correctly
          break;
        }
        i += 1;
      }
      stripped += 1;
      continue;
    }
    out.push(lines[i]!);
  }
  return { yaml: out.join('\n'), stripped };
}

// ---------- Sort / markdown / json -----------------------------------------

const CODE_ORDER: Record<IssueCode, number> = {
  'pubspec-orphan': 0,
  'manifest-only': 1,
  'manifest-zero-on-disk': 2,
  'orphan-on-disk': 3,
};

function issueCompare(a: PerPackIssue, b: PerPackIssue): number {
  return (
    CODE_ORDER[a.code] - CODE_ORDER[b.code] ||
    a.family.localeCompare(b.family)
  );
}

function renderMarkdown(input: {
  today: string;
  reports: PerPackReport[];
  totalPacks: number;
  applied: boolean;
  deletedFiles: number;
  strippedEntries: number;
}): string {
  const lines: string[] = [];
  lines.push('# PUBSPEC_ASSETS_RECONCILE');
  lines.push('');
  lines.push(`_Generated ${input.today} — ${input.totalPacks} pack(s) scanned._`);
  lines.push('');

  if (input.applied) {
    lines.push(
      `## Applied — deleted ${input.deletedFiles} orphan TTF(s), stripped ${input.strippedEntries} pubspec entry(ies). Review \`git status\` before committing.`
    );
    lines.push('');
  }

  const flagged = input.reports.filter((r) => r.issues.length > 0);
  if (flagged.length === 0) {
    lines.push('## No issues found.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    `## ${flagged.length} pack(s) with issues — ${flagged.reduce((s, r) => s + r.issues.length, 0)} issue(s) total`
  );
  lines.push('');
  lines.push('| Pack | Family | Code | Detail |');
  lines.push('|---|---|---|---|');
  for (const r of flagged) {
    for (const i of r.issues) {
      lines.push(
        `| \`${i.prefix}\` | \`${i.family}\` | \`${i.code}\` | ${i.detail} |`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
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
