import type { Manifest, ManifestFontEntry, ManifestIconEntry } from './manifest.ts';
import { sanitizeIdentifier } from './identifier.ts';

/**
 * Codepoint allocator for stable icon assignments.
 *
 * Constraints:
 *  - We use BMP Private Use Area: 0xE000 .. 0xF8FF (6,400 slots).
 *  - 0xFFFE / 0xFFFF are Unicode non-characters; not in PUA so not an issue,
 *    but we guard anyway.
 *  - svgicons2svgfont's underlying cmap format 4 is BMP-only. No supplementary
 *    PUA → sets >6,000 icons get auto-split into multiple fonts.
 *
 * Re-run guarantee:
 *  - Existing icons keep their codepoint, identifier, and fontFamily.
 *  - Removed-upstream icons are flagged deprecated but their codepoint is
 *    reserved (never reused).
 *  - New icons append into the current font's nextCodepoint.
 *  - When a font fills up (>= 6,000 live entries), a new font is spawned.
 */

export const PUA_START = 0xe000;
export const PUA_END = 0xf8ff;
export const ICONS_PER_FONT_SOFT_CAP = 6000;
export const ICONS_PER_FONT_HARD_CAP = PUA_END - PUA_START + 1;

export interface AllocationInput {
  prefix: string;
  fontFamilyBase: string;
  /** Live icon names (no aliases resolved here — caller passes the final set). */
  iconNames: string[];
  /** Existing manifest, or null for a fresh set. */
  previous: Manifest | null;
}

export interface AllocationResult {
  fonts: ManifestFontEntry[];
  icons: Record<string, ManifestIconEntry>;
}

/**
 * Compute the (fonts, icons) maps for a set.
 *
 * The function is pure: it does not read or write disk. Caller is responsible
 * for merging with metadata (license, info, etc.) and persisting via
 * `writeManifest`.
 */
export function allocateCodepoints(input: AllocationInput): AllocationResult {
  const { fontFamilyBase, iconNames, previous } = input;

  const liveSet = new Set(iconNames);

  // Initialize fonts: existing fonts kept (preserving nextCodepoint cursors),
  // new ones added as needed.
  const fonts: ManifestFontEntry[] = previous
    ? previous.fonts.map((f) => ({ ...f }))
    : [{ family: fontFamilyBase, nextCodepoint: PUA_START, iconCount: 0 }];

  // Helper: claim a fontFamily name for index N.
  const fontFamilyForIndex = (idx: number): string => {
    return idx === 0 ? fontFamilyBase : `${fontFamilyBase}_${idx + 1}`;
  };

  // Helper: get or create a font slot that has room.
  const ensureFontWithRoom = (): { font: ManifestFontEntry; index: number } => {
    for (let i = 0; i < fonts.length; i++) {
      const f = fonts[i]!;
      // Use soft cap on live count and ensure nextCodepoint is still in range.
      if (f.iconCount < ICONS_PER_FONT_SOFT_CAP && f.nextCodepoint <= PUA_END) {
        return { font: f, index: i };
      }
    }
    // Spawn a new font.
    const idx = fonts.length;
    const f: ManifestFontEntry = {
      family: fontFamilyForIndex(idx),
      nextCodepoint: PUA_START,
      iconCount: 0,
    };
    fonts.push(f);
    return { font: f, index: idx };
  };

  const claimedIdentifiers = new Set<string>();
  const icons: Record<string, ManifestIconEntry> = {};

  // Reset font iconCount; we re-tally as we walk the icon set, so that
  // ensureFontWithRoom sees the live count and not a stale value.
  for (const f of fonts) f.iconCount = 0;

  const incrementLiveCount = (fontFamily: string): void => {
    const f = fonts.find((x) => x.family === fontFamily);
    if (f) f.iconCount += 1;
  };

  // Pass 1: preserve existing assignments (sorted for stability).
  const prevIcons = previous?.icons ?? {};
  const prevNames = Object.keys(prevIcons).sort();
  for (const name of prevNames) {
    const prev = prevIcons[name]!;
    const isLive = liveSet.has(name);
    icons[name] = {
      codepoint: prev.codepoint,
      fontFamily: prev.fontFamily,
      identifier: prev.identifier,
      ...(isLive
        ? {}
        : {
            deprecated: true,
            deprecatedSince: prev.deprecatedSince ?? new Date().toISOString().slice(0, 10),
          }),
    };
    claimedIdentifiers.add(prev.identifier);
    if (isLive) incrementLiveCount(prev.fontFamily);
  }

  // Pass 2: assign codepoints to new icons (sorted alphabetically for determinism).
  const newIcons = iconNames
    .filter((n) => !prevIcons[n])
    .sort();
  for (const name of newIcons) {
    const { font } = ensureFontWithRoom();
    const codepoint = font.nextCodepoint;
    if (codepoint > PUA_END) {
      throw new Error(`codepoint overflow for ${name}`);
    }
    font.nextCodepoint = codepoint + 1;
    font.iconCount += 1;
    const identifier = sanitizeIdentifier(name, claimedIdentifiers);
    claimedIdentifiers.add(identifier);
    icons[name] = {
      codepoint,
      fontFamily: font.family,
      identifier,
    };
  }

  return { fonts, icons };
}

/** Format a codepoint as a 4-digit lowercase hex string with leading 0x. */
export function formatCodepoint(cp: number): string {
  return '0x' + cp.toString(16).padStart(4, '0');
}
