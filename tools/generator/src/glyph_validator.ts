import { SVGPathData } from 'svg-pathdata';
import type { ResolvedIcon } from './load_iconify.ts';

/**
 * Pre-validate an Iconify icon body for compatibility with svgicons2svgfont +
 * svg2ttf. Returns `{ ok: true }` if the glyph will build cleanly, otherwise a
 * reason string. The pipeline uses this BEFORE codepoint allocation so bad
 * glyphs never receive a codepoint and never appear in the Dart class.
 *
 * Caught failure modes:
 *  1. Malformed `<path d="…">` data — stray characters like `s`/`r`, unknown
 *     commands like `N` (animated path syntax in `line-md`, `icon-park`).
 *     svg-pathdata throws on these the same way svgicons2svgfont would.
 *  2. Coordinate magnitudes >= 30,000 — TTF glyph format uses 16-bit signed
 *     ints (±32,767). When viewBox is enormous (e.g. wpf set with M-16488)
 *     svg2ttf trips with an "yMin out of bounds" error. We catch it early.
 *  3. Non-standard path commands such as `N`. svg-pathdata's tokenizer
 *     rejects them with cryptic errors; we surface the offending command
 *     explicitly.
 */

/**
 * Multiplier applied to max(viewBox.width, viewBox.height) to get the
 * coordinate bound. svgicons2svgfont scales icons to a 1000-unit em square,
 * so anything > 5× the source viewBox extent would scale past TTF's 16-bit
 * (±32,767) glyph coordinate limit.
 */
const COORD_BOUND_MULT = 5;

const NUM_RE = /-?\d+\.?\d*(?:[eE][+-]?\d+)?/g;

export interface ValidationOk {
  ok: true;
}

export interface ValidationFail {
  ok: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationFail;

/**
 * SVG elements that DEFINITELY break svgicons2svgfont. Things like `<mask>`,
 * `<clipPath>` etc. are tolerated — the resulting glyph may visually drop
 * the mask but the geometry still builds, which is good enough for a
 * monochrome font.
 *
 * What's actually rejected:
 *  - Animation elements (`<animate*>`, `<set>`) — line-md style
 *  - Paint-server elements that reference children svgicons2svgfont
 *    can't read (`<linearGradient><stop/></linearGradient>`).
 *  - Embedded raster `<image>` — fonts cannot embed pixmaps.
 */
const UNSUPPORTED_ELEMENTS = [
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
  'filter',
  'linearGradient',
  'radialGradient',
  'pattern',
  'image',
  'foreignObject',
];

export function validateIconBody(icon: ResolvedIcon): ValidationResult {
  const body = icon.body;

  // 0. Unsupported SVG elements (animation, gradient, filter, etc.). These
  // cannot render as a monochrome TTF glyph; svgicons2svgfont also chokes on
  // them with cryptic SAX errors.
  for (const tag of UNSUPPORTED_ELEMENTS) {
    if (new RegExp(`<${tag}\\b`).test(body)) {
      return { ok: false, reason: `contains <${tag}> element` };
    }
  }

  // 1. Non-standard path-command scan (before SVGPathData since its error
  // messages are cryptic). Standard commands: M m L l H h V v C c S s Q q
  // T t A a Z z.
  const pathRegexA = /<path\b[^>]*\sd=("([^"]+)"|'([^']+)')/g;
  let m: RegExpExecArray | null;
  while ((m = pathRegexA.exec(body)) !== null) {
    const d = (m[2] ?? m[3])!;
    const stripped = d.replace(/[MmLlHhVvCcSsQqTtAaZz0-9.,\s\-+eE]/g, '');
    if (stripped.length > 0) {
      return {
        ok: false,
        reason: `non-standard path command(s) "${truncate(stripped, 12)}" in d="${truncate(d, 40)}"`,
      };
    }
  }

  // 2. Each <path d="…"> through svg-pathdata.
  const pathRegexB = /<path\b[^>]*\sd=("([^"]+)"|'([^']+)')/g;
  while ((m = pathRegexB.exec(body)) !== null) {
    const d = (m[2] ?? m[3])!;
    try {
      const data = new SVGPathData(d);
      void data.commands;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `bad path d="${truncate(d, 40)}": ${truncate(msg, 100)}` };
    }
  }

  // 3. Coordinate-magnitude check across the whole body (catches wpf).
  // Bound is relative to the icon's source viewBox so we don't false-positive
  // sets with legitimately large viewBoxes like icomoon-free (1024×1024).
  const bound = COORD_BOUND_MULT * Math.max(icon.width, icon.height);
  const nums = body.match(NUM_RE);
  if (nums) {
    for (const nStr of nums) {
      const n = Number(nStr);
      if (!Number.isFinite(n)) continue;
      if (Math.abs(n) > bound) {
        return { ok: false, reason: `coord out of bounds: |${n}| > ${bound} (viewBox ${icon.width}×${icon.height})` };
      }
    }
  }

  return { ok: true };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
