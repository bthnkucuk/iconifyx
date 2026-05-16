import { createHash } from 'node:crypto';

import type { Manifest, ManifestIconEntry, ManifestFontEntry } from './manifest.ts';

/**
 * §22 Rec 3 — Per-pack independent versioning.
 *
 * Today every emitted `iconifyx_<prefix>` pubspec pins `version: 0.1.0`,
 * so a regen that touched ONE icon set bumps nothing while still rewriting
 * 225 pubspecs identically. That forecloses any meaningful pub.dev publish
 * strategy.
 *
 * This module hashes the content-bearing fields of a manifest into a
 * `contentHash` and bumps the manifest's `version` field by patch level
 * whenever the hash differs from the previous build.
 *
 * Compare semantics:
 *  - No previous manifest          → first build; seed `version: '0.1.0'`,
 *                                    record the new hash.
 *  - Previous manifest, no hash    → §22-Rec-3 rollout; record the hash
 *                                    but DON'T bump (avoids one-time
 *                                    blanket bump on first deploy).
 *  - Previous manifest + same hash → carry version + hash forward verbatim.
 *  - Previous manifest + diff hash → bump patch (`0.1.0` → `0.1.1`),
 *                                    record the new hash.
 *
 * The hash is deliberately conservative — `lastUpdated` and `info.total`
 * are derived/stamp fields and ARE excluded so they don't trigger
 * spurious bumps when nothing semantic changed.
 */

interface IconHashable {
  codepoint: number;
  fontFamily: string;
  identifier: string;
  deprecated: boolean;
  duotone: boolean;
  duotoneKind?: string;
}

interface FontHashable {
  family: string;
  iconCount: number;
}

/**
 * Build a stable, sorted, JSON-able view of the manifest's content-bearing
 * fields and SHA-1-hash the resulting string. Sorting is by icon name and
 * font family — both are unique within a pack — so equivalent manifests
 * always hash the same regardless of authored field order.
 */
export function computeManifestContentHash(m: Manifest): string {
  const iconsSorted: Record<string, IconHashable> = {};
  for (const name of Object.keys(m.icons).sort()) {
    const e = m.icons[name]!;
    const row: IconHashable = {
      codepoint: e.codepoint,
      fontFamily: e.fontFamily,
      identifier: e.identifier,
      deprecated: e.deprecated === true,
      duotone: e.duotone === true,
    };
    if (e.duotoneKind) row.duotoneKind = e.duotoneKind;
    iconsSorted[name] = row;
  }

  const fontsSorted: FontHashable[] = [...m.fonts]
    .sort((a, b) => a.family.localeCompare(b.family))
    .map((f) => ({ family: f.family, iconCount: f.iconCount }));

  // Pin the iconify source version + the license title — both are
  // consumer-visible. Author/url isn't part of the hash; it can drift
  // without affecting the emitted package.
  const payload = {
    prefix: m.prefix,
    iconifyJsonVersion: m.iconifyJsonVersion,
    license: m.info.license.title,
    fonts: fontsSorted,
    icons: iconsSorted,
  };

  const json = JSON.stringify(payload);
  return createHash('sha1').update(json).digest('hex');
}

export interface VersionBumpResult {
  /** The version to write into the manifest + pubspec. */
  nextVersion: string;
  /** The freshly-computed content hash. Always populated. */
  nextHash: string;
  /** Why this bump (`first`/`unchanged`/`rollout`/`bumped`). For logging. */
  reason: 'first' | 'unchanged' | 'rollout' | 'bumped';
}

/**
 * Patch-level semver bump. Inputs like `1.2.3` → `1.2.4`. Tolerates a
 * trailing prerelease/build identifier by stripping it (`1.2.3-pre` → `1.2.4`).
 * Falls back to `0.1.1` if the existing version is unparseable.
 */
function bumpPatch(prev: string): string {
  const stripped = prev.replace(/[-+].*$/, '');
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(stripped);
  if (!m) return '0.1.1';
  const [, major, minor, patch] = m;
  return `${major}.${minor}.${parseInt(patch!, 10) + 1}`;
}

const INITIAL_VERSION = '0.1.0';

/**
 * Decide the new (version, hash) pair for a manifest by comparing its
 * freshly-computed content hash against the previous on-disk manifest.
 * The caller is expected to write `nextVersion` + `nextHash` onto the
 * manifest before persisting (and to feed `nextVersion` into the pubspec
 * emitter).
 */
export function decideVersionBump(
  next: Manifest,
  previous: Manifest | null
): VersionBumpResult {
  const nextHash = computeManifestContentHash(next);

  if (!previous) {
    return { nextVersion: INITIAL_VERSION, nextHash, reason: 'first' };
  }

  const prevVersion = previous.version ?? INITIAL_VERSION;
  const prevHash = previous.contentHash;

  if (prevHash === undefined) {
    // First regen after Rec 3 landed — seed the hash without bumping.
    return { nextVersion: prevVersion, nextHash, reason: 'rollout' };
  }

  if (prevHash === nextHash) {
    return { nextVersion: prevVersion, nextHash, reason: 'unchanged' };
  }

  return {
    nextVersion: bumpPatch(prevVersion),
    nextHash,
    reason: 'bumped',
  };
}
