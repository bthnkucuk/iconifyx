import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import type { Manifest, ManifestFontEntry } from './manifest.ts';
import type { ResolvedIcon } from './load_iconify.ts';
import { iconToSvg } from './svg_preprocess.ts';

/**
 * Build one TTF per font entry in the manifest. Each entry contains
 * a list of icons assigned to that font. Returns a map of
 * `fontFamily → ttfBuffer`.
 */
export interface FontBuildInput {
  manifest: Manifest;
  /** Resolved icons keyed by iconify name. */
  resolvedByName: Map<string, ResolvedIcon>;
}

export async function buildFonts(
  input: FontBuildInput
): Promise<Map<string, Buffer>> {
  const { manifest, resolvedByName } = input;

  const fontsByName = new Map<string, Buffer>();

  for (const fontEntry of manifest.fonts) {
    if (fontEntry.iconCount === 0) continue;

    // Gather the (iconName, codepoint) pairs that belong to this font.
    const members: { name: string; codepoint: number }[] = [];
    for (const [iconName, m] of Object.entries(manifest.icons)) {
      if (m.deprecated) continue;
      if (m.fontFamily !== fontEntry.family) continue;
      members.push({ name: iconName, codepoint: m.codepoint });
    }

    if (members.length === 0) continue;

    // Sort by codepoint for determinism.
    members.sort((a, b) => a.codepoint - b.codepoint);

    const ttf = await buildOneFont(fontEntry, members, resolvedByName);
    fontsByName.set(fontEntry.family, ttf);
  }

  return fontsByName;
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
    // Swallow library logger output — it warns about empty bodies and other
    // benign normalization decisions that we don't want flooding the console.
    (stream as unknown as { log: (...args: unknown[]) => void }).log = () => {};

    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    stream.on('end', () => {
      const svgFont = Buffer.concat(chunks).toString('utf8');
      try {
        // ts: 0 fixes the font creation timestamp to make output deterministic.
        // svg2ttf otherwise stamps Date.now() into the head table.
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
      // svgicons2svgfont reads a Node Readable; pass a one-shot stream from the SVG string.
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
