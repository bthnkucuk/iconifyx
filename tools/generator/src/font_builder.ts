import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import type { Manifest, ManifestFontEntry } from './manifest.ts';
import type { ResolvedIcon } from './load_iconify.ts';
import { iconToSvg } from './svg_preprocess.ts';
import { log } from './log.ts';

/**
 * Build one TTF per font entry in the manifest. Each entry contains a list of
 * icons assigned to that font. Returns a map of `fontFamily → ttfBuffer`,
 * plus a list of glyph names that had to be dropped because they tripped
 * svgicons2svgfont or svg2ttf despite passing pre-validation.
 *
 * The dropped names are reported via the `onGlyphDropped` callback so the
 * pipeline can flag them deprecated in the manifest (codepoint stays
 * reserved; they just don't ship in this revision).
 */
export interface FontBuildInput {
  manifest: Manifest;
  /** Resolved icons keyed by iconify name. Used to populate primary fonts. */
  resolvedByName: Map<string, ResolvedIcon>;
  /**
   * Optional map of secondary-layer bodies for duotone icons, keyed by
   * iconify name. Used when building a `<X>Secondary` font; non-duotone
   * icons are absent. If omitted, no Secondary fonts are built.
   */
  secondaryByName?: Map<string, ResolvedIcon>;
  /** Called for each glyph dropped during build (post-validation failure). */
  onGlyphDropped?: (iconName: string, reason: string) => void;
}

export async function buildFonts(
  input: FontBuildInput
): Promise<Map<string, Buffer>> {
  const { manifest, resolvedByName, secondaryByName, onGlyphDropped } = input;

  const fontsByName = new Map<string, Buffer>();

  for (const fontEntry of manifest.fonts) {
    if (fontEntry.iconCount === 0) continue;

    // Detect whether this is a duotone Secondary font. Pattern is exactly
    // `<primary>Secondary` (see manifest.ts:secondaryFontFamily).
    const isSecondary = fontEntry.family.endsWith('Secondary');
    const primaryFamily = isSecondary
      ? fontEntry.family.slice(0, -'Secondary'.length)
      : fontEntry.family;

    const members: { name: string; codepoint: number }[] = [];
    for (const [iconName, m] of Object.entries(manifest.icons)) {
      if (m.deprecated) continue;
      if (m.fontFamily !== primaryFamily) continue;
      if (isSecondary && !m.duotone) continue;
      members.push({ name: iconName, codepoint: m.codepoint });
    }
    if (members.length === 0) continue;
    members.sort((a, b) => a.codepoint - b.codepoint);

    const bodySource = isSecondary
      ? (secondaryByName ?? new Map<string, ResolvedIcon>())
      : resolvedByName;

    const ttf = await buildOneFontWithRetry(
      fontEntry,
      members,
      bodySource,
      onGlyphDropped
    );
    if (ttf !== null) fontsByName.set(fontEntry.family, ttf);
  }

  return fontsByName;
}

/**
 * Try to build one font. If svgicons2svgfont errors on a specific glyph, the
 * error message includes that glyph's name — drop it and retry. Loops until
 * success or the member list runs out. Keeps a small retry cap for safety.
 */
async function buildOneFontWithRetry(
  fontEntry: ManifestFontEntry,
  initialMembers: { name: string; codepoint: number }[],
  resolvedByName: Map<string, ResolvedIcon>,
  onGlyphDropped: ((iconName: string, reason: string) => void) | undefined
): Promise<Buffer | null> {
  let members = [...initialMembers];

  // No fixed retry cap: keep dropping bad glyphs until the font either
  // builds or runs out of members. Some sets (flag, certain emoji families)
  // have hundreds of svgicons2svgfont-incompatible glyphs and we'd rather
  // ship a TTF with the working subset than nothing at all.
  while (members.length > 0) {
    try {
      return await buildOneFont(fontEntry, members, resolvedByName);
    } catch (err) {
      const fullMsg = err instanceof Error ? err.message : String(err);
      const firstLine = fullMsg.split('\n')[0]!;
      const nameMatch = firstLine.match(/parsing the glyph "([^"]+)"/);
      if (!nameMatch) {
        // Unknown error shape — flag every remaining glyph as dropped so
        // the manifest stays consistent, then bail.
        for (const m of members) {
          onGlyphDropped?.(m.name, firstLine.slice(0, 160));
        }
        log.warn(
          `font ${fontEntry.family} gave up with unknown error: ${firstLine.slice(0, 160)}`
        );
        return null;
      }
      const badName = nameMatch[1]!;
      const reason = firstLine.slice(0, 160);
      onGlyphDropped?.(badName, reason);
      members = members.filter((m) => m.name !== badName);
    }
  }

  log.warn(`font ${fontEntry.family} exhausted all members; emitting nothing`);
  return null;
}

async function buildOneFont(
  fontEntry: ManifestFontEntry,
  members: readonly { name: string; codepoint: number }[],
  resolvedByName: Map<string, ResolvedIcon>
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    // `centerHorizontally: false` preserves each glyph's x-position within
    // the source viewBox. Iconify SVGs already size their viewBox to the
    // intended content area, so the natural position is the correct one.
    // Centering would mis-align the primary and secondary layers of a
    // duotone icon whose two halves live in different parts of the
    // viewBox (e.g. ic/baseline-signal-wifi-1-bar-lock — lock on the
    // right, wifi-bars on the left; centring shoves both to the middle
    // and the icon stops making sense).
    const stream = new SVGIcons2SVGFontStream({
      fontName: fontEntry.family,
      fontHeight: 1000,
      normalize: true,
      centerHorizontally: false,
    });
    (stream as unknown as { log: (...args: unknown[]) => void }).log = () => {};

    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    stream.on('end', () => {
      const svgFont = Buffer.concat(chunks).toString('utf8');
      try {
        const ttf = svg2ttf(svgFont, { ts: 0 });
        resolve(Buffer.from(ttf.buffer));
      } catch (err) {
        reject(err);
      }
    });
    stream.on('error', reject);

    for (const m of members) {
      const ic = resolvedByName.get(m.name);
      if (!ic) {
        reject(new Error(`Icon body missing for ${m.name}`));
        return;
      }
      const svg = iconToSvg(ic);
      const buf = Buffer.from(svg, 'utf8');
      const glyphStream = Readable.from([buf]) as Readable & {
        metadata?: { unicode: string[]; name: string };
      };
      glyphStream.metadata = {
        unicode: [String.fromCodePoint(m.codepoint)],
        name: m.name,
      };
      stream.write(glyphStream);
    }
    stream.end();
  });
}
