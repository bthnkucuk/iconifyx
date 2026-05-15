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
   * Which Unicode tier the codepoint lives in: `'bmp'` (U+E000-U+F8FF,
   * BMP PUA) or `'supp'` (U+F0000-U+10FFFF, Supplementary PUA).
   *
   * Introduced by the post-build font-merge step (RESEARCH_PLAN §32):
   * when a pack has > 6000 icons (BMP PUA cap), the generator emits
   * multiple sibling TTFs first, then merges them into ONE TTF using
   * cmap format 12. The base sibling's icons stay at their original
   * BMP codepoints (`tier: 'bmp'`); icons from ex-sibling TTFs get
   * remapped to supp PUA (`tier: 'supp'`) at NEW codepoints.
   *
   * Omitted means `'bmp'` (back-compat default for any manifest written
   * before §32). All single-TTF packs and the base sibling of split
   * packs leave this field unset.
   *
   * NOTE: changing an icon's tier from `'bmp'` to `'supp'` (or vice
   * versa) is a BREAKING change for consumers — codepoint changes are
   * baked into compiled Flutter apps. The §32 migration is a one-time
   * major version bump per affected pack.
   */
  tier?: 'bmp' | 'supp';
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
  info: {
    name: string;
    author: SetAuthorInfo | null;
    license: SetLicenseInfo;
    total: number;
  };
  fonts: ManifestFontEntry[];
  icons: Record<string, ManifestIconEntry>;
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
