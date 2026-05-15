/**
 * Manifest + codegen + identifier lint (§16 — A1+A2+A3).
 *
 * Three cross-file invariant checks bundled into a single audit:
 *
 *  - **A1 — Manifest internal-consistency.** Catches cross-field drift no
 *    audit checks today: live icon referencing a `fontFamily` not in
 *    `manifest.fonts`; font entries with `iconCount > 0` but no live
 *    icons referencing them; `duotone: true` icon but no
 *    `<Family>Secondary` font; the inverse; two non-deprecated icons
 *    sharing `(family, codepoint)`; `info.total != live.count`;
 *    `nextCodepoint <= max(used codepoints + 1)`; deprecated icon's
 *    codepoint reused by a live icon.
 *
 *  - **A2 — Dart codegen ↔ TTF reverse reconciliation.** Today
 *    `FONT_AUDIT.md` walks manifest → TTF. Nothing walks Dart source →
 *    TTF. We regex-walk each `lib/src/sets/<prefix>.dart` for
 *    `IconData(0x…, fontFamily: '…', fontPackage: '…')` and verify the
 *    `(fontPackage, family, codepoint)` triple maps to a non-empty glyph
 *    in the corresponding TTF. Catches orphan consts when empty-font
 *    pruning happens after codegen and consts reference a phantom TTF
 *    (Flutter throws `Unable to load font` at runtime).
 *
 *  - **A3 — Identifier rename detection.** For every non-deprecated
 *    icon in the current manifest, assert
 *    `current.icons[name].identifier === previous.icons[name].identifier`
 *    where "previous" is loaded via `git show HEAD:...`. The manifest is
 *    supposed to preserve identifiers verbatim
 *    (`codepoint_allocator.ts:102-114`); A3 verifies the contract end-
 *    to-end. Skipped cleanly if git is unavailable (PR runners always
 *    have git, but local checkouts without `.git` should not crash).
 *
 *  Outputs:
 *   - `MANIFEST_LINT.md` at repo root — summary + tables.
 *   - `docs/audit/manifest-lint/<prefix>.json` per pack — machine-
 *     readable detail (every flagged row).
 *
 *  Determinism: every row sorted by (severity desc, pack asc, key asc);
 *  JSON output sorts keys. Same manifests + Dart + TTFs in => byte-
 *  identical markdown + JSON out.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// @ts-expect-error see font_verify.ts — bun's resolver doesn't pick up
// @types/fontkit, but the runtime API is stable.
import * as fontkit from 'fontkit';

import {
  listManifestPrefixes,
  readManifest,
  type Manifest,
  type ManifestIconEntry,
  type ManifestFontEntry,
} from '../src/manifest.ts';
import {
  prefixToPackageSuffix,
  repoRoot,
  setPackageDir,
  setPackageFontsDir,
  setPackageName,
} from '../src/paths.ts';
import { log } from '../src/log.ts';

// ---------- Row types -------------------------------------------------------

/** Severity ordering — higher = worse. Sorted desc when rendering. */
const SEVERITY: Record<string, number> = {
  error: 30,
  warn: 20,
  info: 10,
};

type A1Code =
  | 'icon-fontFamily-orphan'
  | 'font-no-live-icons'
  | 'duotone-without-secondary-font'
  | 'secondary-font-without-duotone-icon'
  | 'codepoint-collision'
  | 'info-total-mismatch'
  | 'nextCodepoint-underflow'
  | 'deprecated-codepoint-reused';

interface A1Row {
  prefix: string;
  code: A1Code;
  severity: 'error' | 'warn' | 'info';
  /** Stable key for sorting / dedup (e.g. icon name, font family, codepoint). */
  key: string;
  detail: string;
}

interface A2Row {
  prefix: string;
  severity: 'error' | 'warn';
  /** Dart const identifier (e.g. `home`). */
  constant: string;
  codepoint: number;
  family: string;
  fontPackage: string;
  code:
    | 'fontPackage-mismatch'
    | 'family-not-in-manifest'
    | 'ttf-missing'
    | 'glyph-missing'
    | 'glyph-empty';
  detail: string;
}

interface A3Row {
  prefix: string;
  severity: 'error' | 'warn';
  /** Iconify icon name (e.g. `home`). */
  iconName: string;
  previousIdentifier: string;
  currentIdentifier: string;
  code: 'identifier-renamed' | 'identifier-collision';
  detail: string;
}

interface PerPackReport {
  prefix: string;
  a1: A1Row[];
  a2: A2Row[];
  a3: A3Row[];
  /** Set only if A3 was skipped for this pack (git missing or no HEAD). */
  a3Skipped?: string;
}

// ---------- Path / git helpers ----------------------------------------------

function dartSetFilePath(prefix: string): string {
  // packages/iconifyx_<suffix>/lib/src/sets/<prefix>.dart
  return path.join(
    setPackageDir(prefix),
    'lib',
    'src',
    'sets',
    `${prefix}.dart`
  );
}

/**
 * Returns the previous version of `tools/generator/manifests/<prefix>.json`
 * at `HEAD`, or `null` if git is unavailable / the file isn't tracked. We
 * keep this best-effort — A3 is purely advisory and should never fail the
 * audit run.
 */
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

/**
 * Probe `git rev-parse HEAD` once at audit start. If git can't resolve a
 * HEAD (no .git dir, no commits yet), A3 is skipped for every pack —
 * cheaper than per-pack failures.
 */
async function gitAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

// ---------- A1: manifest internal-consistency -------------------------------

function runA1(manifest: Manifest): A1Row[] {
  const rows: A1Row[] = [];
  const prefix = manifest.prefix;

  const fontByFamily = new Map<string, ManifestFontEntry>();
  for (const f of manifest.fonts) fontByFamily.set(f.family, f);

  // Group icons by (family, isLive). Track codepoint usage per family.
  const liveByFamily = new Map<string, ManifestIconEntry[]>();
  const cpUsage = new Map<string, Map<number, { liveNames: string[]; deprecatedNames: string[] }>>();
  for (const [name, ic] of Object.entries(manifest.icons)) {
    const fam = ic.fontFamily;
    if (!cpUsage.has(fam)) cpUsage.set(fam, new Map());
    const cpMap = cpUsage.get(fam)!;
    if (!cpMap.has(ic.codepoint)) cpMap.set(ic.codepoint, { liveNames: [], deprecatedNames: [] });
    const slot = cpMap.get(ic.codepoint)!;
    if (ic.deprecated) {
      slot.deprecatedNames.push(name);
    } else {
      slot.liveNames.push(name);
      if (!liveByFamily.has(fam)) liveByFamily.set(fam, []);
      liveByFamily.get(fam)!.push({ ...ic, identifier: name } as ManifestIconEntry);
    }
  }

  // (a) live icon's fontFamily not declared in manifest.fonts.
  // Skip if pack has zero fonts (extreme corner case).
  for (const [name, ic] of Object.entries(manifest.icons)) {
    if (ic.deprecated) continue;
    if (!fontByFamily.has(ic.fontFamily)) {
      rows.push({
        prefix,
        code: 'icon-fontFamily-orphan',
        severity: 'error',
        key: name,
        detail: `live icon '${name}' references fontFamily '${ic.fontFamily}' which is not in manifest.fonts`,
      });
    }
  }

  // (b) font entry with iconCount > 0 but no live icon references it.
  // Skip Secondary fonts here — those are validated in (c)/(d) instead
  // because they're keyed off duotone icons, not by being a "primary".
  for (const f of manifest.fonts) {
    const isSecondary = f.family.endsWith('Secondary');
    if (isSecondary) continue;
    const live = liveByFamily.get(f.family) ?? [];
    if (f.iconCount > 0 && live.length === 0) {
      rows.push({
        prefix,
        code: 'font-no-live-icons',
        severity: 'error',
        key: f.family,
        detail: `font '${f.family}' has iconCount=${f.iconCount} but zero live icons reference it`,
      });
    } else if (f.iconCount !== live.length) {
      // Mild drift — iconCount stale vs. computed count. Useful audit
      // signal but not a runtime failure (pubspec / codegen go off the
      // icon dict, not iconCount).
      rows.push({
        prefix,
        code: 'font-no-live-icons',
        severity: 'warn',
        key: f.family,
        detail: `font '${f.family}' iconCount=${f.iconCount} but live icon count is ${live.length}`,
      });
    }
  }

  // (c) duotone: true icon but no <Family>Secondary entry.
  // (d) inverse: <Family>Secondary entry but no duotone icons reference its parent family.
  const familiesWithDuotone = new Set<string>();
  for (const [name, ic] of Object.entries(manifest.icons)) {
    if (ic.deprecated || !ic.duotone) continue;
    familiesWithDuotone.add(ic.fontFamily);
    const secFam = `${ic.fontFamily}Secondary`;
    if (!fontByFamily.has(secFam)) {
      rows.push({
        prefix,
        code: 'duotone-without-secondary-font',
        severity: 'error',
        key: name,
        detail: `duotone icon '${name}' lives in font '${ic.fontFamily}' but '${secFam}' is missing from manifest.fonts`,
      });
    }
  }
  for (const f of manifest.fonts) {
    if (!f.family.endsWith('Secondary')) continue;
    const primary = f.family.slice(0, -'Secondary'.length);
    if (!familiesWithDuotone.has(primary)) {
      rows.push({
        prefix,
        code: 'secondary-font-without-duotone-icon',
        severity: 'warn',
        key: f.family,
        detail: `secondary font '${f.family}' has no live duotone icons referencing primary '${primary}'`,
      });
    }
  }

  // (e) two non-deprecated icons sharing (fontFamily, codepoint).
  for (const [fam, cpMap] of cpUsage) {
    for (const [cp, slot] of cpMap) {
      if (slot.liveNames.length > 1) {
        rows.push({
          prefix,
          code: 'codepoint-collision',
          severity: 'error',
          key: `${fam}:0x${cp.toString(16)}`,
          detail: `${slot.liveNames.length} live icons share (${fam}, 0x${cp.toString(16)}): ${slot.liveNames
            .slice(0, 4)
            .map((n) => `'${n}'`)
            .join(', ')}${slot.liveNames.length > 4 ? ', …' : ''}`,
        });
      }
    }
  }

  // (f) info.total !== live count.
  let liveCount = 0;
  for (const list of liveByFamily.values()) liveCount += list.length;
  if (manifest.info.total !== liveCount) {
    rows.push({
      prefix,
      code: 'info-total-mismatch',
      severity: 'warn',
      key: '(pack)',
      detail: `info.total=${manifest.info.total} but live icon count is ${liveCount}`,
    });
  }

  // (g) nextCodepoint <= max(used codepoints + 1) — would cause a
  //   collision on the very next allocation.
  for (const f of manifest.fonts) {
    const cpMap = cpUsage.get(f.family);
    if (!cpMap || cpMap.size === 0) continue;
    let maxCp = 0;
    for (const cp of cpMap.keys()) if (cp > maxCp) maxCp = cp;
    if (f.nextCodepoint <= maxCp) {
      rows.push({
        prefix,
        code: 'nextCodepoint-underflow',
        severity: 'error',
        key: f.family,
        detail: `font '${f.family}' nextCodepoint=0x${f.nextCodepoint.toString(
          16
        )} is <= max used codepoint 0x${maxCp.toString(16)} — next allocation would collide`,
      });
    }
  }

  // (h) deprecated icon's codepoint reused by a live icon.
  for (const [fam, cpMap] of cpUsage) {
    for (const [cp, slot] of cpMap) {
      if (slot.liveNames.length >= 1 && slot.deprecatedNames.length >= 1) {
        rows.push({
          prefix,
          code: 'deprecated-codepoint-reused',
          severity: 'error',
          key: `${fam}:0x${cp.toString(16)}`,
          detail: `deprecated icon(s) ${slot.deprecatedNames
            .slice(0, 2)
            .map((n) => `'${n}'`)
            .join(', ')} share (${fam}, 0x${cp.toString(16)}) with live icon(s) ${slot.liveNames
            .slice(0, 2)
            .map((n) => `'${n}'`)
            .join(', ')} — codepoints are reserved-for-life per invariant #3`,
        });
      }
    }
  }

  return rows;
}

// ---------- A2: Dart codegen ↔ TTF reverse reconciliation -------------------

interface DartConst {
  identifier: string;
  codepoint: number;
  family: string;
  fontPackage: string;
}

/**
 * Single-line regex against the body of the generated Dart set file.
 * The generator emits `IconData(0xNNNN, fontFamily: '…', fontPackage: '…')`
 * always in that field order with single quotes; we extract the triple and
 * the const identifier from the preceding `const IconifyIconData <id> =` /
 * `const IconifyIconData <id>` line.
 */
const ICON_DATA_RE =
  /IconData\(0x([0-9a-fA-F]+),\s*fontFamily:\s*'([^']+)',\s*fontPackage:\s*'([^']+)'\)/g;

/**
 * The const identifier sits on the `static const IconifyIconData <id> =`
 * line. We scan top-down so the closest preceding identifier above an
 * `IconData(...)` line is the owning const. Multiple `IconData(...)`
 * literals per const (duotone) inherit the same id — matches the codegen.
 */
const CONST_ID_RE =
  /static\s+const\s+IconifyIconData\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;

function parseDartConsts(src: string): DartConst[] {
  // First pass: collect identifier positions.
  const ids: { offset: number; identifier: string }[] = [];
  for (const m of src.matchAll(CONST_ID_RE)) {
    ids.push({ offset: m.index ?? 0, identifier: m[1]! });
  }
  ids.sort((a, b) => a.offset - b.offset);

  const consts: DartConst[] = [];
  for (const m of src.matchAll(ICON_DATA_RE)) {
    const off = m.index ?? 0;
    // Binary-search closest preceding identifier.
    let lo = 0;
    let hi = ids.length - 1;
    let bestIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ids[mid]!.offset <= off) {
        bestIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestIdx < 0) continue; // dangling IconData with no preceding const — odd, skip
    consts.push({
      identifier: ids[bestIdx]!.identifier,
      codepoint: parseInt(m[1]!, 16),
      family: m[2]!,
      fontPackage: m[3]!,
    });
  }
  return consts;
}

interface FontIndex {
  // Lazily-opened fontkit handles keyed by absolute TTF path.
  byPath: Map<string, {
    hasGlyphForCodePoint?: (cp: number) => boolean;
    glyphForCodePoint?: (cp: number) => { path?: { commands?: unknown[] } };
  } | null>;
}

function newFontIndex(): FontIndex {
  return { byPath: new Map() };
}

function openFont(idx: FontIndex, ttfPath: string): FontIndex['byPath'] extends Map<string, infer V> ? V : never {
  if (idx.byPath.has(ttfPath)) return idx.byPath.get(ttfPath)!;
  if (!existsSync(ttfPath)) {
    idx.byPath.set(ttfPath, null);
    return null;
  }
  try {
    // @ts-expect-error fontkit untyped under bun
    const font = fontkit.openSync(ttfPath);
    idx.byPath.set(ttfPath, font);
    return font;
  } catch {
    idx.byPath.set(ttfPath, null);
    return null;
  }
}

async function runA2(manifest: Manifest, fontIdx: FontIndex): Promise<A2Row[]> {
  const rows: A2Row[] = [];
  const prefix = manifest.prefix;
  const expectedPackage = setPackageName(prefix);
  const dartPath = dartSetFilePath(prefix);
  if (!existsSync(dartPath)) {
    return rows; // packs without an emitted Dart file (corner case) — silently skip
  }
  const src = await readFile(dartPath, 'utf8');
  const consts = parseDartConsts(src);
  const knownFamilies = new Set(manifest.fonts.map((f) => f.family));

  for (const c of consts) {
    if (c.fontPackage !== expectedPackage) {
      rows.push({
        prefix,
        severity: 'error',
        constant: c.identifier,
        codepoint: c.codepoint,
        family: c.family,
        fontPackage: c.fontPackage,
        code: 'fontPackage-mismatch',
        detail: `Dart const '${c.identifier}' fontPackage='${c.fontPackage}' but expected '${expectedPackage}'`,
      });
      continue;
    }
    if (!knownFamilies.has(c.family)) {
      rows.push({
        prefix,
        severity: 'error',
        constant: c.identifier,
        codepoint: c.codepoint,
        family: c.family,
        fontPackage: c.fontPackage,
        code: 'family-not-in-manifest',
        detail: `Dart const '${c.identifier}' references family '${c.family}' which is not in manifest.fonts`,
      });
      continue;
    }
    const ttfPath = path.join(setPackageFontsDir(prefix), `${c.family}.ttf`);
    const font = openFont(fontIdx, ttfPath);
    if (!font) {
      rows.push({
        prefix,
        severity: 'error',
        constant: c.identifier,
        codepoint: c.codepoint,
        family: c.family,
        fontPackage: c.fontPackage,
        code: 'ttf-missing',
        detail: `TTF '${c.family}.ttf' missing or unreadable at ${path.relative(repoRoot(), ttfPath)}`,
      });
      continue;
    }
    if (!font.hasGlyphForCodePoint?.(c.codepoint)) {
      rows.push({
        prefix,
        severity: 'error',
        constant: c.identifier,
        codepoint: c.codepoint,
        family: c.family,
        fontPackage: c.fontPackage,
        code: 'glyph-missing',
        detail: `Dart const '${c.identifier}' references 0x${c.codepoint.toString(16)} in '${c.family}.ttf' but the codepoint is not in the font's cmap`,
      });
      continue;
    }
    const glyph = font.glyphForCodePoint?.(c.codepoint);
    const cmds = glyph?.path?.commands ?? [];
    if (cmds.length === 0) {
      rows.push({
        prefix,
        severity: 'warn',
        constant: c.identifier,
        codepoint: c.codepoint,
        family: c.family,
        fontPackage: c.fontPackage,
        code: 'glyph-empty',
        detail: `Dart const '${c.identifier}' resolves to an empty glyph at 0x${c.codepoint.toString(16)} in '${c.family}.ttf'`,
      });
    }
  }
  return rows;
}

// ---------- A3: identifier rename detection ---------------------------------

function runA3(
  current: Manifest,
  previous: Manifest | null
): { rows: A3Row[]; skippedReason?: string } {
  const rows: A3Row[] = [];

  // (collision check runs regardless of `previous` — purely intra-current).
  const idToNames = new Map<string, string[]>();
  for (const [name, ic] of Object.entries(current.icons)) {
    if (ic.deprecated) continue;
    if (!idToNames.has(ic.identifier)) idToNames.set(ic.identifier, []);
    idToNames.get(ic.identifier)!.push(name);
  }
  for (const [identifier, names] of idToNames) {
    if (names.length <= 1) continue;
    rows.push({
      prefix: current.prefix,
      severity: 'error',
      iconName: names.sort()[0]!,
      previousIdentifier: identifier,
      currentIdentifier: identifier,
      code: 'identifier-collision',
      detail: `${names.length} live icons sanitise to the same Dart identifier '${identifier}': ${names
        .sort()
        .slice(0, 4)
        .map((n) => `'${n}'`)
        .join(', ')}${names.length > 4 ? ', …' : ''}`,
    });
  }

  if (!previous) {
    return { rows, skippedReason: 'no previous manifest at HEAD' };
  }

  for (const [name, cur] of Object.entries(current.icons)) {
    if (cur.deprecated) continue;
    const prev = previous.icons?.[name];
    if (!prev) continue; // new icon — no rename to check
    if (prev.deprecated) continue; // re-introduced after deprecation; codepoint preserved but id may differ — skip
    if (prev.identifier !== cur.identifier) {
      rows.push({
        prefix: current.prefix,
        severity: 'error',
        iconName: name,
        previousIdentifier: prev.identifier,
        currentIdentifier: cur.identifier,
        code: 'identifier-renamed',
        detail: `'${current.prefix}:${name}' identifier renamed from '${prev.identifier}' to '${cur.identifier}' — breaks consumer apps referencing the old name`,
      });
    }
  }

  return { rows };
}

// ---------- Driver ----------------------------------------------------------

interface RunOptions {
  prefixes?: Set<string>;
}

export async function runManifestLintAudit(opts: RunOptions = {}): Promise<void> {
  const startedAt = Date.now();
  log.step('manifest-lint audit');

  const allPrefixes = (await listManifestPrefixes()).sort();
  const prefixes = opts.prefixes
    ? allPrefixes.filter((p) => opts.prefixes!.has(p))
    : allPrefixes;

  const haveGit = await gitAvailable();
  if (!haveGit) {
    log.warn('git not available / no HEAD — A3 will be skipped for every pack');
  }

  const fontIdx = newFontIndex();
  const reports: PerPackReport[] = [];
  for (const prefix of prefixes) {
    const manifest = await readManifest(prefix);
    if (!manifest) {
      log.warn(`no manifest for ${prefix}, skipping`);
      continue;
    }
    const a1 = runA1(manifest);
    const a2 = await runA2(manifest, fontIdx);
    const prev = haveGit ? await readPreviousManifest(prefix) : null;
    const a3Result = runA3(manifest, prev);
    const report: PerPackReport = {
      prefix,
      a1: a1.sort(rowCompareA1),
      a2: a2.sort(rowCompareA2),
      a3: a3Result.rows.sort(rowCompareA3),
    };
    if (!haveGit) {
      report.a3Skipped = 'git not available';
    } else if (a3Result.skippedReason) {
      report.a3Skipped = a3Result.skippedReason;
    }
    reports.push(report);
  }

  // ---------- Per-pack JSON ----------
  const auditDir = path.join(repoRoot(), 'docs', 'audit', 'manifest-lint');
  await mkdir(auditDir, { recursive: true });
  for (const r of reports) {
    const json = stableStringify({
      prefix: r.prefix,
      a1: r.a1,
      a2: r.a2,
      a3: r.a3,
      a3Skipped: r.a3Skipped ?? null,
    });
    await writeFile(path.join(auditDir, `${r.prefix}.json`), json + '\n', 'utf8');
  }

  // ---------- Repo-root markdown ----------
  const iconifyJsonVersion = await readIconifyJsonVersion();
  const today = new Date().toISOString().slice(0, 10);
  const md = renderMarkdown({
    today,
    iconifyJsonVersion,
    reports,
    haveGit,
  });
  await writeFile(path.join(repoRoot(), 'MANIFEST_LINT.md'), md, 'utf8');

  const totals = summarise(reports);
  const dt = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.success(
    `manifest-lint audit done in ${dt}s; A1=${totals.a1Count}/${totals.a1Packs} packs, ` +
      `A2=${totals.a2Count}/${totals.a2Packs} packs, A3=${totals.a3Count}/${totals.a3Packs} packs`
  );
}

// ---------- Sorting + summary -----------------------------------------------

function rowCompareA1(a: A1Row, b: A1Row): number {
  return (
    SEVERITY[b.severity]! - SEVERITY[a.severity]! ||
    a.code.localeCompare(b.code) ||
    a.key.localeCompare(b.key)
  );
}
function rowCompareA2(a: A2Row, b: A2Row): number {
  return (
    SEVERITY[b.severity]! - SEVERITY[a.severity]! ||
    a.code.localeCompare(b.code) ||
    a.constant.localeCompare(b.constant) ||
    a.codepoint - b.codepoint
  );
}
function rowCompareA3(a: A3Row, b: A3Row): number {
  return (
    SEVERITY[b.severity]! - SEVERITY[a.severity]! ||
    a.code.localeCompare(b.code) ||
    a.iconName.localeCompare(b.iconName)
  );
}

interface Totals {
  a1Count: number;
  a1Packs: number;
  a2Count: number;
  a2Packs: number;
  a3Count: number;
  a3Packs: number;
  a3Skipped: number;
}
function summarise(reports: PerPackReport[]): Totals {
  let a1Count = 0;
  let a2Count = 0;
  let a3Count = 0;
  let a3Skipped = 0;
  const a1Packs = new Set<string>();
  const a2Packs = new Set<string>();
  const a3Packs = new Set<string>();
  for (const r of reports) {
    if (r.a1.length) {
      a1Packs.add(r.prefix);
      a1Count += r.a1.length;
    }
    if (r.a2.length) {
      a2Packs.add(r.prefix);
      a2Count += r.a2.length;
    }
    if (r.a3.length) {
      a3Packs.add(r.prefix);
      a3Count += r.a3.length;
    }
    if (r.a3Skipped) a3Skipped++;
  }
  return {
    a1Count,
    a1Packs: a1Packs.size,
    a2Count,
    a2Packs: a2Packs.size,
    a3Count,
    a3Packs: a3Packs.size,
    a3Skipped,
  };
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

// ---------- Markdown renderer -----------------------------------------------

interface RenderInput {
  today: string;
  iconifyJsonVersion: string;
  reports: PerPackReport[];
  haveGit: boolean;
}

const TOP_N = 100;

function renderMarkdown(input: RenderInput): string {
  const { today, iconifyJsonVersion, reports, haveGit } = input;
  const totals = summarise(reports);
  const allA1 = reports.flatMap((r) => r.a1).sort(rowCompareA1);
  const allA2 = reports.flatMap((r) => r.a2).sort(rowCompareA2);
  const allA3 = reports.flatMap((r) => r.a3).sort(rowCompareA3);

  const lines: string[] = [];
  lines.push('# Manifest + codegen lint');
  lines.push('');
  lines.push(
    `Generated ${today}; \`@iconify/json\` ${iconifyJsonVersion}. ` +
      `Three checks: A1 (manifest internal consistency), A2 (Dart codegen ↔ ` +
      `TTF reverse reconciliation), A3 (identifier rename detection across regens). ` +
      `Output is deterministic — same manifests + Dart + TTFs → byte-identical report.`
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Packs scanned: **${reports.length.toLocaleString('en-US')}**`);
  lines.push(
    `- A1 violations: **${totals.a1Count.toLocaleString('en-US')} icon/font-level issues across ${totals.a1Packs} packs**`
  );
  lines.push(
    `- A2 violations: **${totals.a2Count.toLocaleString('en-US')} orphan consts across ${totals.a2Packs} packs**`
  );
  if (haveGit) {
    lines.push(
      `- A3 renames detected: **${totals.a3Count.toLocaleString('en-US')} icons across ${totals.a3Packs} packs** (vs previous git HEAD)`
    );
    if (totals.a3Skipped > 0) {
      lines.push(`- A3 skipped: **${totals.a3Skipped}** packs (no previous manifest at HEAD)`);
    }
  } else {
    lines.push(
      `- A3 renames: **skipped** — git not available or no HEAD commit. Re-run inside a git checkout to enable.`
    );
  }
  lines.push('');
  lines.push(
    `Detail per pack: [\`docs/audit/manifest-lint/<prefix>.json\`](docs/audit/manifest-lint/). ` +
      `Markdown caps each section at the top ${TOP_N} rows for readability.`
  );
  lines.push('');

  // ---------- A1 ----------
  lines.push('## A1 violations — manifest internal consistency');
  lines.push('');
  if (allA1.length === 0) {
    lines.push('_No A1 violations — every manifest is internally consistent._');
  } else {
    lines.push('| Pack | Severity | Issue | Detail |');
    lines.push('|---|---|---|---|');
    for (const r of allA1.slice(0, TOP_N)) {
      lines.push(
        `| \`${r.prefix}\` | ${r.severity} | \`${r.code}\` | ${escapeMd(r.detail)} |`
      );
    }
    if (allA1.length > TOP_N) {
      lines.push('');
      lines.push(`…${(allA1.length - TOP_N).toLocaleString('en-US')} more — see per-pack JSON.`);
    }
  }
  lines.push('');

  // ---------- A2 ----------
  lines.push('## A2 violations — Dart codegen ↔ TTF reverse reconciliation');
  lines.push('');
  if (allA2.length === 0) {
    lines.push(
      '_No A2 violations — every emitted `IconData(0xNNNN, …)` in generated Dart resolves to a non-empty glyph in the declared TTF._'
    );
  } else {
    lines.push('| Pack | Constant | Codepoint | Family | Issue | Detail |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of allA2.slice(0, TOP_N)) {
      lines.push(
        `| \`${r.prefix}\` | \`${r.constant}\` | \`0x${r.codepoint.toString(16)}\` | \`${r.family}\` | \`${r.code}\` | ${escapeMd(r.detail)} |`
      );
    }
    if (allA2.length > TOP_N) {
      lines.push('');
      lines.push(`…${(allA2.length - TOP_N).toLocaleString('en-US')} more — see per-pack JSON.`);
    }
  }
  lines.push('');

  // ---------- A3 ----------
  lines.push('## A3 renames (across last regen)');
  lines.push('');
  if (!haveGit) {
    lines.push('_Skipped — git not available._');
  } else if (allA3.length === 0) {
    lines.push(
      '_No identifier renames detected — every non-deprecated icon preserved its Dart identifier vs. HEAD._'
    );
  } else {
    lines.push('| Pack | Issue | Icon name | Previous identifier | Current identifier |');
    lines.push('|---|---|---|---|---|');
    for (const r of allA3.slice(0, TOP_N)) {
      lines.push(
        `| \`${r.prefix}\` | \`${r.code}\` | \`${r.iconName}\` | \`${r.previousIdentifier}\` | \`${r.currentIdentifier}\` |`
      );
    }
    if (allA3.length > TOP_N) {
      lines.push('');
      lines.push(`…${(allA3.length - TOP_N).toLocaleString('en-US')} more — see per-pack JSON.`);
    }
  }
  lines.push('');

  // ---------- Per-pack index ----------
  lines.push('## Per-pack detail');
  lines.push('');
  lines.push('Click through for the full per-pack breakdown (every flagged row).');
  lines.push('');
  lines.push('| Pack | A1 | A2 | A3 | Detail |');
  lines.push('|---|---:|---:|---:|---|');
  const sortedReports = [...reports].sort((a, b) => a.prefix.localeCompare(b.prefix));
  for (const r of sortedReports) {
    const total = r.a1.length + r.a2.length + r.a3.length;
    if (total === 0) continue;
    lines.push(
      `| \`${r.prefix}\` | ${r.a1.length.toLocaleString('en-US')} | ${r.a2.length.toLocaleString('en-US')} | ${r.a3.length.toLocaleString('en-US')} | [\`${r.prefix}.json\`](docs/audit/manifest-lint/${r.prefix}.json) |`
    );
  }
  lines.push('');

  return lines.join('\n');
}

function escapeMd(s: string): string {
  // Single-character escapes for markdown table cell breakers. The detail
  // strings are author-controlled (no user content) so this is just to
  // keep table cells well-formed.
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

// Touch unused-import lint for prefixToPackageSuffix — we keep it imported
// because `setPackageName` uses it indirectly and external callers may
// want to import from this file.
void prefixToPackageSuffix;

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
  await runManifestLintAudit({ prefixes });
}

if (import.meta.main) {
  await main();
}
