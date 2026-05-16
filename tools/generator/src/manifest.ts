import path from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Per-icon-set manifest persisted at `tools/generator/manifests/<prefix>.json`.
 *
 * The manifest is the source of truth for:
 *  - Which codepoint each icon is assigned to (stable forever).
 *  - Which TTF font family each icon belongs to (for auto-split sets).
 *  - Which Dart identifier each icon resolves to (stable forever).
 *
 * On every run, existing manifest entries are preserved verbatim. New icons
 * are appended with the next free codepoint in the current font. Removed
 * upstream icons are flagged `deprecated: true` and excluded from the
 * generated font and Dart class — but their codepoint is reserved so a
 * later re-appearance with the same name picks up where it left off.
 */

export interface ManifestIconEntry {
  /** Codepoint as a hex int, e.g. 0xe000. */
  codepoint: number;
  /** Which sub-font this icon lives in (e.g. "Mdi" vs "Mdi_2"). */
  fontFamily: string;
  /** Resolved Dart identifier (camelCased, reserved-word safe, unique). */
  identifier: string;
  /** Set to true if the icon was removed upstream. Codepoint is still reserved. */
  deprecated?: boolean;
  /** ISO date when deprecation was detected. */
  deprecatedSince?: string;
  /**
   * Why the icon was deprecated. Populated by the pipeline at every drop
   * site (or `'upstream-removed'` when an icon present in a previous
   * manifest is no longer in the live upstream set). Drives the
   * `bun run audit upstream-regressions` audit, which buckets new
   * deprecations and surfaces them in `UPSTREAM_REGRESSIONS.md`.
   *
   * - `'upstream-removed'` — Iconify upstream removed the icon. Legitimate.
   * - `'validator-rejected'` — our `glyph_validator.ts` rejected it
   *   (unsupported SVG element / coord overflow / malformed `d`).
   * - `'panic-skipped'` — `oslllo-svg-fixer`'s native resvg crashed on
   *   this body; bisected isolation skipped it.
   * - `'paint-order-dropped'` — `isPaintOrderRiskBody` flagged it as a
   *   multi-fill body that would render as a monochrome blob.
   * - `'svg2ttf-silent-empty'` — every pipeline defence passed but the
   *   resulting TTF glyph slot has an empty outline (§16-A2 orphan-const
   *   drift). Auto-flagged by `audit/orphan_const_fix.ts --apply`.
   * - `'unknown'` — legacy entries pre-dating this field, or drops that
   *   couldn't be attributed to a specific path. Backwards-compatible
   *   default for any manifest written before §16-A8 landed.
   *
   * Omitted means `'unknown'` (back-compat default).
   */
  deprecatedReason?:
    | 'upstream-removed'
    | 'validator-rejected'
    | 'panic-skipped'
    | 'paint-order-dropped'
    | 'svg2ttf-silent-empty'
    | 'unknown';
  /**
   * Set to true for icons that ship a secondary (translucent) layer in
   * addition to the primary one. The secondary glyph lives at the same
   * codepoint in the matching `<fontFamily>Secondary` font; Dart codegen
   * emits the appropriate constructor on `IconifyIconData` based on
   * [duotoneKind].
   */
  duotone?: boolean;
  /**
   * Which kind of duotone this is (only set when `duotone === true`).
   * Drives Dart codegen's constructor choice (`IconifyIconData.duo` vs
   * `.duoPaintOrder` vs `.duoMaskInternal`) which in turn flips the
   * runtime rendering composition in `IconifyIcon`:
   *
   * - `'hint'` — Phosphor / Solar / ic / Iconamoon family. Secondary is a
   *   translucent backdrop; renders behind primary at 40% opacity.
   * - `'paintOrder'` — logos / crypto-color / fluent-emoji-flat / twemoji
   *   / noto / vscode-icons / gcp / token-branded. Secondary IS the
   *   foreground letterform; renders ON TOP of primary at full opacity
   *   in the ambient surface colour (knockout against the bg tile).
   * - `'maskInternal'` — lets-icons `*-duotone-line` family. Visually
   *   identical to `'hint'` but the field is preserved separately for
   *   audit purposes (origin: inside a `<defs><mask>` block, not a flat
   *   opacity attribute).
   *
   * Omitted means `'hint'` (back-compat default). Solo icons should not
   * carry this field at all.
   */
  duotoneKind?: 'hint' | 'paintOrder' | 'maskInternal';
  /**
   * Informational marker: this icon WAS classified as duotone by the
   * pipeline (opacity / two-colour / mask-internal / colour-mapped split),
   * but the post-build cmap-name verification
   * (`verifySecondaryGlyphNames`, RESEARCH_PLAN §33 demote rule) found
   * that the `<Family>Secondary.ttf` cmap entry for this codepoint
   * resolves to a DIFFERENT glyph than this icon's own name. That
   * happens when `svg2ttf`'s outline-dedup pass collapses multiple
   * identical secondary outlines onto the alphabetically-first name,
   * leaving every other codepoint silently aliased to the wrong glyph.
   *
   * Set in conjunction with `duotone = false`: the icon gets demoted to
   * solo for codegen so it ships single-layer instead of duotone-with-
   * wrong-secondary. The flag is purely informational — it lets future
   * runs know "this WAS duotone, the secondary was aliased, that's why
   * it's solo now" without recomputing the check. Codepoint stays
   * reserved per CLAUDE.md §3 invariant.
   *
   * Solo / canonical icons that were never duotone must NOT carry this
   * field.
   */
  secondaryAliased?: boolean;
}

export interface ManifestFontEntry {
  /** Font family name (e.g. "Mdi"). */
  family: string;
  /** Next free codepoint in this font. */
  nextCodepoint: number;
  /** Number of LIVE (non-deprecated) icons in this font. */
  iconCount: number;
}

export interface SetLicenseInfo {
  title: string;
  spdx?: string;
  url?: string;
}

export interface SetAuthorInfo {
  name: string;
  url?: string;
}

export interface Manifest {
  schemaVersion: 1;
  prefix: string;
  iconifyJsonVersion: string;
  lastUpdated: string;
  category: string | null;
  subPackage: string;
  /**
   * Semantic version of the emitted Dart package. Bumped (patch level) by
   * `tools/generator/src/version_bump.ts` whenever `contentHash` differs
   * from the previous manifest on disk; otherwise carried forward verbatim.
   *
   * Stored in the manifest (not just the pubspec) so the version survives
   * a `bun run generate` that touches a different pack — the pubspec is
   * a generated artefact, the manifest is the source of truth.
   *
   * Omitted on first-ever build for a pack; the version bumper seeds it
   * to `'0.1.0'`. Empty packs (`iconCount === 0` after every drop)
   * inherit the previous value if any, else `'0.0.0'`.
   *
   * Introduced by RESEARCH_PLAN §22 Rec 3.
   */
  version?: string;
  /**
   * SHA-1 of the pack's CONTENT-bearing fields — icon-by-icon
   * `(codepoint, fontFamily, identifier, deprecated, duotone, duotoneKind)`
   * plus font family list, license string, and pinned `iconifyJsonVersion`.
   * Hashed deterministically by `version_bump.ts:computeManifestContentHash`.
   *
   * Compared against the previous-on-disk manifest's `contentHash` to
   * decide whether to bump `version` for this regen. A mismatch means
   * SOMETHING relevant to consumers changed (new icon, codepoint shift,
   * font-family rename, license change, Iconify source version bump);
   * a match means the pack is byte-identical to the prior emit and the
   * version stays where it was.
   *
   * Excludes `lastUpdated` (always shifts) and `info.total` (derived).
   * Omitted on manifests written before §22 Rec 3 landed; treated as a
   * sentinel "first hash" — the bumper records the hash and KEEPS the
   * existing version unchanged for that one regen so we don't blanket-
   * bump every pack on rollout.
   */
  contentHash?: string;
}

const MANIFESTS_DIR = path.resolve(import.meta.dir, '..', 'manifests');

export function manifestsDir(): string {
  return MANIFESTS_DIR;
}

export function manifestPath(prefix: string): string {
  return path.join(MANIFESTS_DIR, `${prefix}.json`);
}

export async function ensureManifestsDir(): Promise<void> {
  if (!existsSync(MANIFESTS_DIR)) {
    await mkdir(MANIFESTS_DIR, { recursive: true });
  }
}

export async function readManifest(prefix: string): Promise<Manifest | null> {
  const filePath = manifestPath(prefix);
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as Manifest;
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await ensureManifestsDir();
  const filePath = manifestPath(manifest.prefix);

  // Sort icons by name for deterministic diffs.
  const sortedIcons: Record<string, ManifestIconEntry> = {};
  for (const name of Object.keys(manifest.icons).sort()) {
    sortedIcons[name] = manifest.icons[name]!;
  }
  const sorted: Manifest = { ...manifest, icons: sortedIcons };

  // Pretty-print 2-space, preserve hex-readable codepoints by storing as int
  // (JSON has no native hex literal, so consumers format on read/write).
  await writeFile(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

/**
 * For a primary font family like "Ph" or "Ph_2", return the corresponding
 * secondary font family name. The secondary font holds the translucent
 * layer of any duotone icon stored in this primary font.
 */
export function secondaryFontFamily(primary: string): string {
  return `${primary}Secondary`;
}

export async function listManifestPrefixes(): Promise<string[]> {
  if (!existsSync(MANIFESTS_DIR)) return [];
  const entries = await readdir(MANIFESTS_DIR);
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}
