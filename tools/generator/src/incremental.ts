import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import type { IconifyJson } from './load_iconify.ts';
import type { GeneratorConfig } from './group_sets.ts';
import type { Manifest } from './manifest.ts';
import { manifestsDir } from './manifest.ts';

/**
 * §13 Rec 1 — Manifest-diff incremental mode.
 *
 * Per-pack input hashing + on-disk snapshot cache. When a pack's input
 * fingerprint matches the snapshot from a previous successful run we can
 * SKIP every expensive stage (preprocess → stroke-fill → svgicons2svgfont
 * → svg2ttf → font_merger → glyph_rename) and replay the cached outputs
 * verbatim onto disk.
 *
 * Cache layout (gitignored — per-developer):
 *
 *   tools/generator/manifests/.cache/
 *     <prefix>.snapshot.json
 *
 * Each snapshot bundles the inputs hash that produced it AND the
 * outputs (manifest JSON, dart sources, license sources, pubspec source,
 * TTF bytes base64-encoded under their family name). On cache hit the
 * pipeline reads the snapshot, restores the outputs to disk, and walks
 * on to the next pack. On miss it runs the normal pipeline and writes a
 * fresh snapshot.
 *
 * Cache invalidation:
 *   - Any icon body change in the upstream @iconify/json file        → miss
 *   - Iconify version bump (pinned in package.json)                  → miss
 *   - Generator commit SHA change (env GITHUB_SHA or git rev-parse)  → miss
 *   - Pack-relevant config edit (strokeFillSets[prefix],
 *     multiWeightStrokeSets[prefix], colorMappedSets[prefix],
 *     vtracerSets[prefix], excludedSets membership)                  → miss
 *   - Manual bump of PIPELINE_VERSION below                          → miss
 *
 * @see docs/RESEARCH_PLAN.md §13
 */

/**
 * Manual cache buster. Bump when the pipeline's emitted-output shape
 * changes in a way that older snapshots wouldn't recover correctly —
 * e.g. a new field gets added to the manifest schema, codegen template
 * changes, font merger semantics change, etc. Bumping this invalidates
 * every existing snapshot on the next run.
 */
export const PIPELINE_VERSION = 'v1.0';

const SNAPSHOT_SCHEMA_VERSION = 1;

const CACHE_DIR = path.join(manifestsDir(), '.cache');

export interface PackInputHash {
  prefix: string;
  /** @iconify/json version pinned in tools/generator/package.json. */
  iconifyVersion: string;
  /** Order-insensitive sha1 over sorted (name, body) pairs of the upstream pack. */
  iconBodiesSha1: string;
  /** sha1 of the subset of config.yaml entries that affect this pack. */
  configSha1: string;
  /** Generator commit SHA (best-effort: env GITHUB_SHA, else `git rev-parse HEAD`). */
  generatorGitSha: string;
  /** Hand-managed manual cache buster — see PIPELINE_VERSION above. */
  pipelineVersion: string;
}

export interface SnapshotOutputs {
  /** Serialised manifest JSON (the same bytes writeManifest would emit). */
  manifestJson: string;
  /** Generated `src/sets/<prefix>.dart`. */
  dartSrc: string;
  /** Generated `lib/aliases.dart`, or null when the pack has no alias map. */
  aliasesDartSrc: string | null;
  /** Generated `lib/categories.dart`, or null when the pack has no category map. */
  categoriesDartSrc: string | null;
  /** Generated `lib/<pkg>.dart` top-level library file. */
  librarySrc: string;
  /** Generated `pubspec.yaml`. */
  pubspecSrc: string;
  /** Generated `lib/src/license.dart`. */
  licenseDartSrc: string;
  /** Generated `LICENSE-3RD-PARTY.md`. */
  license3rdPartyMd: string;
  /**
   * TTF blobs keyed by font family. Base64-encoded so the snapshot file
   * stays valid JSON; for typical packs the overhead is a few percent.
   * The decoded bytes are written to `assets/fonts/<family>.ttf` verbatim
   * on restore.
   */
  ttfsBase64: Record<string, string>;
}

export interface Snapshot {
  schema: typeof SNAPSHOT_SCHEMA_VERSION;
  inputHash: PackInputHash;
  outputs: SnapshotOutputs;
}

/**
 * Cached generator commit SHA. Resolved once per process — git rev-parse
 * is fast but spawning a subprocess 200+ times per regen is wasteful.
 */
let _generatorGitShaCache: string | null = null;

export function resolveGeneratorGitSha(): string {
  if (_generatorGitShaCache !== null) return _generatorGitShaCache;
  // Prefer the CI-provided SHA so workflows that don't have .git available
  // (rare in our setup, but a documented affordance for any future
  // ephemeral runner) can still produce a stable key.
  const fromEnv = process.env.GITHUB_SHA;
  if (fromEnv && fromEnv.length > 0) {
    _generatorGitShaCache = fromEnv;
    return fromEnv;
  }
  try {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(import.meta.dir, '..', '..', '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0 && typeof r.stdout === 'string') {
      _generatorGitShaCache = r.stdout.trim();
      return _generatorGitShaCache;
    }
  } catch {
    // ignore — fall through to sentinel
  }
  _generatorGitShaCache = 'no-git';
  return _generatorGitShaCache;
}

/**
 * sha1 over sorted (name, body) pairs of an iconify set. Order-insensitive
 * by construction: we sort the icon names alphabetically before hashing.
 * Aliases are included so pure-rename additions / removals invalidate.
 *
 * Pack-level metadata (`info.total`, `lastModified`, etc.) is NOT hashed
 * here — `info.total` drifts on alias-only additions and `lastModified`
 * is a timestamp.  Iconify version is hashed separately via PackInputHash.
 */
export function hashIconBodies(set: IconifyJson): string {
  const h = createHash('sha1');
  // Default pack viewBox + dimensions — affect every icon's emitted SVG.
  h.update(`PACK:${set.prefix}\n`);
  h.update(`W:${set.width ?? ''}\n`);
  h.update(`H:${set.height ?? ''}\n`);

  // Icons sorted alphabetically so insertion order doesn't matter.
  const iconNames = Object.keys(set.icons).sort();
  h.update(`N:${iconNames.length}\n`);
  for (const name of iconNames) {
    const b = set.icons[name]!;
    h.update('I:');
    h.update(name);
    h.update('\n');
    h.update('B:');
    h.update(b.body);
    h.update('\n');
    // Per-icon viewBox/transform overrides are hashable scalars; encode
    // them as a single comma-separated line so they're cheap to mix into
    // the digest without exploding intermediate string size.
    h.update(
      `M:${b.width ?? ''},${b.height ?? ''},${b.left ?? ''},${b.top ?? ''},${b.rotate ?? ''},${b.hFlip ? 1 : 0},${b.vFlip ? 1 : 0}\n`
    );
  }

  if (set.aliases) {
    const aliasNames = Object.keys(set.aliases).sort();
    h.update(`A:${aliasNames.length}\n`);
    for (const name of aliasNames) {
      const a = set.aliases[name]!;
      h.update('AN:');
      h.update(name);
      h.update('\n');
      h.update(
        `AP:${a.parent},${a.width ?? ''},${a.height ?? ''},${a.left ?? ''},${a.top ?? ''},${a.rotate ?? ''},${a.hFlip ? 1 : 0},${a.vFlip ? 1 : 0}\n`
      );
    }
  } else {
    h.update('A:0\n');
  }

  // Pack-level categories are consumer-visible (drives `lib/categories.dart`
  // codegen). Include them so a category remap upstream invalidates.
  if (set.categories) {
    const catNames = Object.keys(set.categories).sort();
    h.update(`C:${catNames.length}\n`);
    for (const c of catNames) {
      h.update('CN:');
      h.update(c);
      h.update('\n');
      const members = [...(set.categories[c] ?? [])].sort();
      h.update(`CM:${members.join(',')}\n`);
    }
  } else {
    h.update('C:0\n');
  }

  return h.digest('hex');
}

/**
 * sha1 over the subset of `config.yaml` that affects ONE pack. Anything
 * that drives this pack's pipeline branching gets folded in: per-pack
 * stroke-fill / colour-map / vtracer opt-in, per-pack weight synthesis,
 * and whether the pack is on the excluded list at all.
 *
 * Config entries that DON'T affect this pack (e.g. another pack's
 * strokeFillSets entry, the displayCategoryAliases map which only feeds
 * the website data emit) are intentionally excluded so unrelated config
 * edits don't bust unrelated packs' caches.
 */
export function hashConfigForPack(
  prefix: string,
  config: GeneratorConfig
): string {
  const h = createHash('sha1');
  h.update(`PREFIX:${prefix}\n`);
  h.update(`EXCLUDED:${config.excludedSets.includes(prefix) ? '1' : '0'}\n`);

  const inStroke = (config.strokeFillSets ?? []).includes(prefix);
  h.update(`STROKE:${inStroke ? '1' : '0'}\n`);

  const weights = config.multiWeightStrokeSets?.[prefix];
  if (weights) {
    const keys = Object.keys(weights).sort();
    h.update(`WEIGHTS:${keys.length}\n`);
    for (const k of keys) {
      h.update(`W:${k}=${weights[k]}\n`);
    }
  } else {
    h.update('WEIGHTS:0\n');
  }

  const inColor = (config.colorMappedSets ?? []).includes(prefix);
  h.update(`COLOR:${inColor ? '1' : '0'}\n`);

  const inVtrace = (config.vtracerSets ?? []).includes(prefix);
  h.update(`VTRACE:${inVtrace ? '1' : '0'}\n`);

  return h.digest('hex');
}

export function computePackInputHash(input: {
  prefix: string;
  set: IconifyJson;
  iconifyVersion: string;
  config: GeneratorConfig;
}): PackInputHash {
  return {
    prefix: input.prefix,
    iconifyVersion: input.iconifyVersion,
    iconBodiesSha1: hashIconBodies(input.set),
    configSha1: hashConfigForPack(input.prefix, input.config),
    generatorGitSha: resolveGeneratorGitSha(),
    pipelineVersion: PIPELINE_VERSION,
  };
}

/**
 * Two PackInputHash values are equal iff every field matches. Strict
 * structural compare — we never accept partial matches.
 */
export function inputHashesEqual(a: PackInputHash, b: PackInputHash): boolean {
  return (
    a.prefix === b.prefix &&
    a.iconifyVersion === b.iconifyVersion &&
    a.iconBodiesSha1 === b.iconBodiesSha1 &&
    a.configSha1 === b.configSha1 &&
    a.generatorGitSha === b.generatorGitSha &&
    a.pipelineVersion === b.pipelineVersion
  );
}

export function snapshotPath(prefix: string): string {
  return path.join(CACHE_DIR, `${prefix}.snapshot.json`);
}

export async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

export async function readSnapshot(prefix: string): Promise<Snapshot | null> {
  const p = snapshotPath(prefix);
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, 'utf8');
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.schema !== SNAPSHOT_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    // Treat a malformed snapshot as a miss (force rebuild + overwrite).
    return null;
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await ensureCacheDir();
  const p = snapshotPath(snapshot.inputHash.prefix);
  await writeFile(p, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

export interface RestoredPackResult {
  prefix: string;
  manifest: Manifest;
  ttfs: Map<string, Buffer>;
  dartSource: string;
  aliasesDart: string | null;
  categoriesDart: string | null;
  librarySrc: string;
  pubspecSrc: string;
  licenseDartSrc: string;
  license3rdPartyMd: string;
}

/**
 * Reconstruct the in-memory result the normal `processOneSet` would
 * have returned, from a snapshot. The caller writes these to disk via
 * the usual writeSetPackage / writeManifest path.
 */
export function materializeSnapshot(snapshot: Snapshot): RestoredPackResult {
  const { outputs, inputHash } = snapshot;
  const manifest = JSON.parse(outputs.manifestJson) as Manifest;
  const ttfs = new Map<string, Buffer>();
  for (const [family, b64] of Object.entries(outputs.ttfsBase64)) {
    ttfs.set(family, Buffer.from(b64, 'base64'));
  }
  return {
    prefix: inputHash.prefix,
    manifest,
    ttfs,
    dartSource: outputs.dartSrc,
    aliasesDart: outputs.aliasesDartSrc,
    categoriesDart: outputs.categoriesDartSrc,
    librarySrc: outputs.librarySrc,
    pubspecSrc: outputs.pubspecSrc,
    licenseDartSrc: outputs.licenseDartSrc,
    license3rdPartyMd: outputs.license3rdPartyMd,
  };
}

/**
 * Encode a pack's outputs as a Snapshot ready to persist. The caller
 * supplies fully-built sources + TTF buffers — exactly the same shape
 * the normal pipeline produces — so this function is just a structural
 * shuffle (no rebuild work).
 */
export function buildSnapshot(input: {
  inputHash: PackInputHash;
  manifest: Manifest;
  manifestJson: string;
  dartSrc: string;
  aliasesDartSrc: string | null;
  categoriesDartSrc: string | null;
  librarySrc: string;
  pubspecSrc: string;
  licenseDartSrc: string;
  license3rdPartyMd: string;
  ttfs: Map<string, Buffer>;
}): Snapshot {
  const ttfsBase64: Record<string, string> = {};
  // Sort family names so the snapshot JSON byte-shape is deterministic
  // (writeSnapshot uses JSON.stringify with 2-space indent — key order
  // would otherwise reflect Map insertion order, which is non-stable
  // across pipeline runs).
  const familyNames = [...input.ttfs.keys()].sort();
  for (const family of familyNames) {
    ttfsBase64[family] = input.ttfs.get(family)!.toString('base64');
  }
  return {
    schema: SNAPSHOT_SCHEMA_VERSION,
    inputHash: input.inputHash,
    outputs: {
      manifestJson: input.manifestJson,
      dartSrc: input.dartSrc,
      aliasesDartSrc: input.aliasesDartSrc,
      categoriesDartSrc: input.categoriesDartSrc,
      librarySrc: input.librarySrc,
      pubspecSrc: input.pubspecSrc,
      licenseDartSrc: input.licenseDartSrc,
      license3rdPartyMd: input.license3rdPartyMd,
      ttfsBase64,
    },
  };
}

/**
 * Wipe the entire incremental snapshot cache. Exposed for testing /
 * future `--clean-cache` extension.
 */
export async function cleanSnapshotCache(): Promise<{ removed: boolean }> {
  if (!existsSync(CACHE_DIR)) return { removed: false };
  await rm(CACHE_DIR, { recursive: true, force: true });
  return { removed: true };
}

export function snapshotCacheRoot(): string {
  return CACHE_DIR;
}
