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
  const MAX_RETRIES = Math.min(initialMembers.length, 50);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (members.length === 0) return null;
    try {
      return await buildOneFont(fontEntry, members, resolvedByName);
    } catch (err) {
      const fullMsg = err instanceof Error ? err.message : String(err);
      const firstLine = fullMsg.split('\n')[0]!;
      // svgicons2svgfont's error format includes 'parsing the glyph "X"'.
      const nameMatch = firstLine.match(/parsing the glyph "([^"]+)"/);
      if (!nameMatch) {
        // Unknown error shape — give up on this font.
        throw err;
      }
      const badName = nameMatch[1]!;
      const reason = firstLine.slice(0, 160);
      log.warn(
        `  dropping "${badName}" from font ${fontEntry.family}: ${reason}`
      );
      onGlyphDropped?.(badName, reason);
      members = members.filter((m) => m.name !== badName);
    }
  }

  log.warn(
    `gave up on font ${fontEntry.family} after ${MAX_RETRIES + 1} attempts; emitting empty font`
  );
  return null;
}

async function buildOneFont(
  fontEntry: ManifestFontEntry,
  members: readonly { name: string; codepoint: number }[],
  resolvedByName: Map<string, ResolvedIcon>
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const stream = new SVGIcons2SVGFontStream({
      fontName: fontEntry.family,
      fontHeight: 1000,
      normalize: true,
      centerHorizontally: true,
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
