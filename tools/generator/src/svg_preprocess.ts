import type { ResolvedIcon } from './load_iconify.ts';

/**
 * Wrap an Iconify icon body in a full SVG document suitable for feeding to
 * svgicons2svgfont. Applies any per-icon transforms (rotate, hFlip, vFlip).
 *
 * Iconify icon bodies omit the outer <svg> element; we add it with the
 * correct viewBox. Most sets are uniform (24x24, 16x16, 32x32) but some
 * mix; the resolved width/height are used per-icon.
 */
export function iconToSvg(icon: ResolvedIcon): string {
  const { body, width, height, rotate, hFlip, vFlip } = icon;

  let inner = body;

  // Apply transforms if present. svgicons2svgfont's path flattener will
  // bake these in, so a single <g transform=…> wrapper is enough.
  const transforms: string[] = [];
  if (rotate) {
    // Iconify rotate is 1=90°, 2=180°, 3=270° (or numeric degrees).
    const deg = rotate <= 4 ? rotate * 90 : rotate;
    transforms.push(`rotate(${deg} ${width / 2} ${height / 2})`);
  }
  if (hFlip || vFlip) {
    const sx = hFlip ? -1 : 1;
    const sy = vFlip ? -1 : 1;
    const tx = hFlip ? -width : 0;
    const ty = vFlip ? -height : 0;
    transforms.push(`translate(${tx}, ${ty}) scale(${sx}, ${sy})`);
  }
  if (transforms.length > 0) {
    inner = `<g transform="${transforms.join(' ')}">${body}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${inner}</svg>`;
}

/**
 * Heuristic detection of icon sets whose bodies need rasterize-then-trace
 * pre-processing before font conversion. Two failure modes both call for
 * the same fix (oslllo-svg-fixer's rasterize + Potrace trace pipeline):
 *
 * 1. **Stroke-only icons.** svgicons2svgfont treats strokes as zero-width
 *    geometry; an outlined circle renders as a solid filled disc. Bodies
 *    with `stroke=...` and no fill (Lucide, Tabler, etc.).
 *
 * 2. **`fill-rule="evenodd"` paths.** TTF glyph rendering uses non-zero
 *    winding by default; an SVG path designed for even-odd evaluation
 *    loses its internal cutouts and renders as a solid silhouette
 *    (gravity-ui's `car`, `bug`, anything with internal holes).
 *
 * Auto-detection inspects a sample of the set and returns a numeric
 * "needs-rasterize" ratio. Callers compare against a threshold and apply
 * stroke-fill when warranted.
 */
export interface RasterFillReason {
  /** Fraction of sampled icons that look stroke-only. */
  strokeRatio: number;
  /** Fraction of sampled icons that use `fill-rule="evenodd"`. */
  evenOddRatio: number;
  /** Combined ratio (stroke or evenodd). */
  combinedRatio: number;
}

export function rasterFillSignal(
  icons: readonly ResolvedIcon[],
  sampleSize = 25
): RasterFillReason {
  const sample = icons.slice(0, sampleSize);
  if (sample.length === 0) {
    return { strokeRatio: 0, evenOddRatio: 0, combinedRatio: 0 };
  }

  let strokeCount = 0;
  let evenOddCount = 0;
  let combinedCount = 0;
  const fillRuleRe = /fill-rule\s*=\s*["']?evenodd["']?/;
  for (const ic of sample) {
    const b = ic.body;
    const hasStroke = /stroke=/.test(b);
    const hasFillNone = /fill=["']?none["']?/.test(b) || !/fill=/.test(b);
    const strokeOnly = hasStroke && hasFillNone;
    const evenOdd = fillRuleRe.test(b);
    if (strokeOnly) strokeCount += 1;
    if (evenOdd) evenOddCount += 1;
    if (strokeOnly || evenOdd) combinedCount += 1;
  }
  return {
    strokeRatio: strokeCount / sample.length,
    evenOddRatio: evenOddCount / sample.length,
    combinedRatio: combinedCount / sample.length,
  };
}

/** Back-compat shim — prefer rasterFillSignal for diagnostics. */
export function isLikelyStrokeSet(icons: readonly ResolvedIcon[]): boolean {
  return rasterFillSignal(icons).strokeRatio >= 0.7;
}

/**
 * Replace every `stroke-width="…"` occurrence in an icon body with a new
 * value, leaving the rest of the body intact. Used by the multi-weight
 * synthesizer to derive thin/light/bold variants from a regular set.
 *
 * If the body has no `stroke-width` attribute at all (stroke-width defaults
 * to 1, set elsewhere, or already on a CSS class), this is a no-op. That's
 * acceptable: the variant is then identical to the original and the
 * codepoint allocator still gives it a distinct slot, but visual output
 * matches the regular weight. Iconify stroke-only sets all carry the
 * attribute on their `<g>` wrapper, so the common case works.
 */
export function setStrokeWidth(body: string, newWidth: number): string {
  return body.replace(
    /stroke-width\s*=\s*["'][^"']+["']/g,
    `stroke-width="${newWidth}"`
  );
}

// ============================================================================
// Duo-tone support
// ============================================================================
//
// Duotone icons are SVGs with one path drawn at full opacity (primary layer)
// and one or more paths at partial opacity, typically 0.2 or 0.5 (secondary
// layer). Iconify ships these inline:
//
//   <g fill="currentColor"><path d="…" opacity=".2"/><path d="…"/></g>     (Phosphor)
//   <path fill="currentColor" d="…" opacity=".5"/><path fill="…" d="…"/>    (Solar)
//
// To render them as duotone in a monochrome TTF we split the body into two
// separate SVG bodies. A regular Icon over each font gives the layered look,
// composed by IconifyDuotoneIcon (`packages/iconifyx_core/lib/src/duotone_icon.dart`).
//
// The detection is per-icon (not per-set) because sets like `ph` mix regular
// and duotone variants under different names (e.g. `user` + `user-duotone`).

const OPACITY_LT_ONE_RE = /\bopacity\s*=\s*["'](?:0?\.\d+|0)["']/;

/**
 * Returns true if `body` contains at least one element with `opacity` less
 * than 1, i.e. the icon visually layers a darker primary over a translucent
 * secondary. This is the Iconify convention for duotone.
 */
export function isDuotoneBody(body: string): boolean {
  return OPACITY_LT_ONE_RE.test(body);
}

/**
 * Split a duotone Iconify body into two SVG bodies:
 *   `primary`   = elements without opacity (the strong layer)
 *   `secondary` = elements that had opacity < 1 (the translucent layer)
 *
 * The opacity attribute is stripped from secondary elements; the resulting
 * glyph renders solid in the secondary TTF, and the runtime widget controls
 * opacity at display time.
 *
 * If the body is wrapped in a single `<g attrs>...</g>`, both output bodies
 * preserve the same wrapper (e.g. retains `fill="currentColor"`).
 *
 * If the body is NOT detected as duotone, `secondary` is an empty string and
 * `primary` is the original body — callers should treat this as a regular
 * single-layer icon.
 */
export function splitDuotoneBody(
  body: string
): { primary: string; secondary: string } {
  if (!isDuotoneBody(body)) return { primary: body, secondary: '' };

  // Optional single outer <g> wrap (common in Phosphor).
  const groupMatch = body.match(/^\s*<g\b([^>]*)>([\s\S]*?)<\/g>\s*$/);
  let groupAttrs = '';
  let inner = body;
  if (groupMatch) {
    groupAttrs = groupMatch[1]!;
    inner = groupMatch[2]!;
  }

  // Iterate over the immediate child elements. We support the SVG shape
  // primitives that appear in real Iconify bodies.
  const ELEMENT_RE =
    /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*?)\/>/g;
  const primaryEls: string[] = [];
  const secondaryEls: string[] = [];

  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let consumedAll = true;
  while ((m = ELEMENT_RE.exec(inner)) !== null) {
    // Anything between matches that's not whitespace indicates a non-self-
    // closing element (e.g. `<path>…</path>` with children, nested groups).
    // We don't try to handle that here; the caller falls back to a single-
    // layer build by treating the whole thing as primary.
    const gap = inner.slice(lastIndex, m.index);
    if (gap.trim().length > 0) {
      consumedAll = false;
      break;
    }
    lastIndex = ELEMENT_RE.lastIndex;
    const [, tag, attrs] = m;
    const opacityMatch = attrs!.match(/\s+opacity\s*=\s*["']([^"']+)["']/);
    if (opacityMatch && parseFloat(opacityMatch[1]!) < 1) {
      const stripped = attrs!.replace(
        /\s+opacity\s*=\s*["'][^"']+["']/,
        ''
      );
      secondaryEls.push(`<${tag}${stripped}/>`);
    } else {
      primaryEls.push(`<${tag}${attrs}/>`);
    }
  }
  // Trailing non-whitespace also disqualifies.
  if (inner.slice(lastIndex).trim().length > 0) consumedAll = false;

  if (!consumedAll || primaryEls.length + secondaryEls.length === 0) {
    return { primary: body, secondary: '' };
  }

  const wrap = (els: string[]): string => {
    if (els.length === 0) return '';
    if (groupAttrs) return `<g${groupAttrs}>${els.join('')}</g>`;
    return els.join('');
  };

  return {
    primary: wrap(primaryEls),
    secondary: wrap(secondaryEls),
  };
}
