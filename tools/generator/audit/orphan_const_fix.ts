/**
 * Orphan-const empty-glyph fix-up audit (§16-A2 remediation).
 *
 * Background:
 *
 *   `audit/manifest_lint.ts` (A2) walks every emitted `static const
 *   IconifyIconData …` declaration in `lib/src/sets/<prefix>.dart`, opens
 *   the declared TTF with fontkit, looks up the glyph at the declared
 *   codepoint, and inspects the glyph's path outline. When the outline is
 *   empty (`path.commands.length === 0`) we have an **orphan const** — a
 *   Dart constant that compiles green, a TTF cmap slot that exists, but
 *   the glyph itself ships as a `.notdef` box at runtime.
 *
 *   The pipeline has five defences against silent emptiness (validator,
 *   retry-on-error, stroke-fill panic isolation, paint-order drop,
 *   per-icon raster-trace) and yet 319 icons across 11 packs still slip
 *   through (devicon multi-colour brand logos, meteocons `<symbol>` /
 *   `<use>` bodies, half-broken duotones in logos / gcp / glyphs, …).
 *
 *   The §3 iterate-until-empty rebuild loop (when wired into `pipeline.ts`)
 *   will catch new silent-empties going forward — but it doesn't clean
 *   up the existing residue. This audit does.
 *
 * What it does:
 *
 *   - Reads `docs/audit/manifest-lint/<prefix>.json` (produced by
 *     `bun run audit manifest-lint`).
 *   - For every A2 violation with `code: 'glyph-empty'`, maps the Dart
 *     constant + codepoint + primary font family back to its manifest
 *     icon name (unique by construction — the codegen guarantees a 1:1
 *     identifier↔icon-name mapping under `codepoint_allocator.ts`).
 *   - In `--apply` mode, mutates the manifest entry in place:
 *       deprecated: true
 *       deprecatedSince: <today, ISO>
 *       deprecatedReason: 'svg2ttf-silent-empty'
 *     Codepoint stays reserved (CLAUDE.md §3 invariant — every manifest
 *     codepoint ever assigned is held for life).
 *   - Without `--apply`, prints the planned mutations and exits 0.
 *
 *   Affected manifests are written via `writeManifest()` so the icon dict
 *   is re-sorted alphabetically — preserves the deterministic-diff
 *   property of every other manifest write site.
 *
 *   No TTF / Dart / pubspec is touched here. The intended workflow after
 *   `--apply` is:
 *
 *     bun run audit orphan-const-fix --apply
 *     bun --cwd tools/generator run generate --set <each affected pack>
 *     bun run audit manifest-lint   # verify A2 == 0
 *
 *   The regen step re-emits each pack's Dart file (deprecated icons get
 *   excluded), TTF (no codepoint reserved for deprecated), pubspec
 *   (asset list shrinks if a whole font drops to iconCount=0).
 *
 * CLI:
 *   bun run audit orphan-const-fix            # dry-run, prints plan
 *   bun run audit orphan-const-fix --apply    # mutates manifests
 *   bun run audit orphan-const-fix --prefix devicon,meteocons --apply
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';

import {
  readManifest,
  writeManifest,
  type Manifest,
} from '../src/manifest.ts';
import { repoRoot } from '../src/paths.ts';
import { log } from '../src/log.ts';

interface A2Row {
  prefix: string;
  severity: 'error' | 'warn';
  constant: string;
  codepoint: number;
  family: string;
  fontPackage: string;
  code: string;
  detail: string;
}

interface PerPackJson {
  prefix?: string;
  a1?: unknown[];
  a2?: A2Row[];
  a3?: unknown[];
}

interface PlannedDeprecation {
  prefix: string;
  iconName: string;
  identifier: string;
  codepoint: number;
  family: string;
}

export interface OrphanConstFixOptions {
  /** Subset of packs to consider; if omitted, every per-pack JSON is read. */
  prefixes?: Set<string>;
  /** Mutate manifests on disk; without it, the audit is read-only. */
  apply?: boolean;
}

const AUDIT_DIR = path.join(
  repoRoot(),
  'docs',
  'audit',
  'manifest-lint'
);

/**
 * Drive: walk every per-pack JSON, plan which manifest entries need
 * deprecating, optionally mutate them.
 *
 * The audit is a pure no-op when:
 *   - `docs/audit/manifest-lint/` doesn't exist (manifest-lint hasn't run)
 *   - every per-pack file has no A2 `glyph-empty` violations
 *   - every flagged icon is already `deprecated: true` (re-running is idempotent)
 */
export async function runOrphanConstFixAudit(
  opts: OrphanConstFixOptions = {}
): Promise<void> {
  const apply = !!opts.apply;
  log.step(
    `orphan-const-fix audit${apply ? ' (--apply)' : ' (dry-run; pass --apply to mutate manifests)'}`
  );

  if (!existsSync(AUDIT_DIR)) {
    log.warn(
      `${path.relative(repoRoot(), AUDIT_DIR)} not found — run \`bun run audit manifest-lint\` first.`
    );
    return;
  }

  // ---------- Read every per-pack JSON. ----------
  const auditFiles = (await readdir(AUDIT_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (auditFiles.length === 0) {
    log.warn(`No per-pack JSON files in ${path.relative(repoRoot(), AUDIT_DIR)}.`);
    return;
  }

  const allRows: A2Row[] = [];
  for (const fname of auditFiles) {
    const prefix = fname.slice(0, -'.json'.length);
    if (opts.prefixes && !opts.prefixes.has(prefix)) continue;
    const raw = await readFile(path.join(AUDIT_DIR, fname), 'utf8');
    let parsed: PerPackJson;
    try {
      parsed = JSON.parse(raw) as PerPackJson;
    } catch (e) {
      log.warn(`Could not parse ${fname}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const a2 = parsed.a2 ?? [];
    for (const row of a2) {
      if (row.code !== 'glyph-empty') continue;
      allRows.push(row);
    }
  }

  if (allRows.length === 0) {
    log.success('No A2 glyph-empty violations to remediate. Nothing to do.');
    return;
  }

  // ---------- Group by pack so we mutate each manifest at most once. ----------
  const rowsByPack = new Map<string, A2Row[]>();
  for (const r of allRows) {
    if (!rowsByPack.has(r.prefix)) rowsByPack.set(r.prefix, []);
    rowsByPack.get(r.prefix)!.push(r);
  }

  // ---------- Plan per pack. ----------
  const planByPack = new Map<string, PlannedDeprecation[]>();
  let totalPlanned = 0;
  let alreadyDeprecated = 0;
  let unmappable = 0;

  for (const [prefix, rows] of rowsByPack) {
    const manifest = await readManifest(prefix);
    if (!manifest) {
      log.warn(`  ${prefix}: manifest not found on disk; skipping ${rows.length} rows`);
      unmappable += rows.length;
      continue;
    }

    // identifier → icon name(s) reverse lookup. The codegen guarantees
    // a 1:1 mapping, but a row's `family` field disambiguates between a
    // primary slot and its Secondary partner — both report identical
    // (identifier, codepoint) pairs for duotone icons. Resolving by the
    // primary family side is correct because the manifest only records
    // the primary `fontFamily`; the secondary lives at the same
    // (codepoint, primary-family) tuple via `secondaryFontFamily()`.
    const identToNames = new Map<string, string[]>();
    for (const [name, ic] of Object.entries(manifest.icons)) {
      const arr = identToNames.get(ic.identifier);
      if (arr) arr.push(name);
      else identToNames.set(ic.identifier, [name]);
    }

    const seenNames = new Set<string>();
    const planned: PlannedDeprecation[] = [];

    for (const row of rows) {
      const primaryFamily = row.family.endsWith('Secondary')
        ? row.family.slice(0, -'Secondary'.length)
        : row.family;
      const candidates = identToNames.get(row.constant) ?? [];
      const matches = candidates.filter((name) => {
        const ic = manifest.icons[name];
        if (!ic) return false;
        return ic.codepoint === row.codepoint && ic.fontFamily === primaryFamily;
      });
      if (matches.length !== 1) {
        unmappable += 1;
        log.warn(
          `  ${prefix}: could not map (${row.constant}, 0x${row.codepoint.toString(16)}, ${row.family}) → exactly one manifest icon (${matches.length} candidate(s)). Skipping.`
        );
        continue;
      }
      const iconName = matches[0]!;
      if (seenNames.has(iconName)) {
        // Duotone icon appears twice in A2 (Primary + Secondary fonts);
        // we deprecate the single underlying manifest entry once.
        continue;
      }
      seenNames.add(iconName);
      const ic = manifest.icons[iconName]!;
      if (ic.deprecated) {
        alreadyDeprecated += 1;
        continue;
      }
      planned.push({
        prefix,
        iconName,
        identifier: ic.identifier,
        codepoint: ic.codepoint,
        family: ic.fontFamily,
      });
    }
    if (planned.length > 0) {
      planByPack.set(prefix, planned);
      totalPlanned += planned.length;
    }
  }

  // ---------- Print summary table. ----------
  const sortedPacks = [...planByPack.keys()].sort();
  log.info(`Plan: deprecate ${totalPlanned} icon(s) across ${sortedPacks.length} pack(s).`);
  if (alreadyDeprecated > 0) {
    log.info(`  ${alreadyDeprecated} row(s) skipped — manifest already marks them deprecated.`);
  }
  if (unmappable > 0) {
    log.warn(`  ${unmappable} row(s) could not be mapped to a unique manifest icon.`);
  }
  for (const prefix of sortedPacks) {
    const planned = planByPack.get(prefix)!;
    const sample = planned
      .slice(0, 4)
      .map((p) => p.iconName)
      .join(', ');
    log.info(
      `  ${prefix}: ${planned.length} icon${planned.length === 1 ? '' : 's'}${planned.length > 0 ? ` (${sample}${planned.length > 4 ? ', …' : ''})` : ''}`
    );
  }

  if (totalPlanned === 0) {
    log.success('Nothing to mutate — every flagged icon is already deprecated.');
    return;
  }

  if (!apply) {
    log.info('Dry-run only — pass --apply to write the mutations back to disk.');
    return;
  }

  // ---------- Apply. ----------
  const today = new Date().toISOString().slice(0, 10);
  let wrote = 0;
  for (const prefix of sortedPacks) {
    const planned = planByPack.get(prefix)!;
    const manifest = await readManifest(prefix);
    if (!manifest) continue; // raced — would have failed in plan; just guard

    for (const p of planned) {
      const ic = manifest.icons[p.iconName];
      if (!ic) continue;
      ic.deprecated = true;
      ic.deprecatedSince = today;
      ic.deprecatedReason = 'svg2ttf-silent-empty';
    }
    // Recompute per-font iconCount so the manifest stays consistent (A1
    // would flag the drift otherwise — `font.iconCount !== live.length`).
    // Includes Secondary fonts: every duotone icon that just got
    // deprecated should also decrement the matching <Family>Secondary
    // counter.
    recomputeFontCounts(manifest);
    await writeManifest(manifest);
    wrote += planned.length;
    log.info(`  ${prefix}: wrote ${planned.length} deprecation(s).`);
  }

  log.success(
    `Applied: ${wrote} icon(s) deprecated across ${sortedPacks.length} pack(s).`
  );
  log.info(
    'Next: regen each affected pack to re-emit Dart / TTF / pubspec without the deprecated consts, then re-run `bun run audit manifest-lint` to verify A2 = 0.'
  );
}

/**
 * Walk every manifest icon and recompute `manifest.fonts[*].iconCount` so
 * the entry matches the post-deprecation live-icon count. Mirrors the
 * recompute step in `pipeline.ts` (`droppedDuringBuild` handler) — including
 * the Secondary-font bump for duotone icons whose codepoint counts in BOTH
 * the primary and the `<Family>Secondary` font.
 */
function recomputeFontCounts(manifest: Manifest): void {
  for (const f of manifest.fonts) f.iconCount = 0;
  for (const ic of Object.values(manifest.icons)) {
    if (ic.deprecated) continue;
    const primary = manifest.fonts.find((f) => f.family === ic.fontFamily);
    if (primary) primary.iconCount += 1;
    if (ic.duotone) {
      const secName = `${ic.fontFamily}Secondary`;
      const secF = manifest.fonts.find((f) => f.family === secName);
      if (secF) secF.iconCount += 1;
    }
  }
  // Also refresh `info.total` so it agrees with the live count (A1's
  // `info-total-mismatch` check would otherwise warn).
  manifest.info.total = Object.values(manifest.icons).filter(
    (i) => !i.deprecated
  ).length;
}

// ---------- CLI -------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let prefixes: Set<string> | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      if (!prefixes) prefixes = new Set();
      for (const p of args[i + 1]!.split(',')) prefixes.add(p);
      i++;
    } else if (args[i] === '--apply') {
      apply = true;
    }
  }
  await runOrphanConstFixAudit({ prefixes, apply });
}

if (import.meta.main) {
  await main();
}
