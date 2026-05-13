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
 * Heuristic detection of stroke-based icons. svgicons2svgfont treats
 * strokes as zero-width and the resulting glyphs will be invisible.
 *
 * Iconify icon bodies expose stroke attribution explicitly. If we see
 * `stroke="currentColor"` (or any stroke= attr) AND no fill, we flag it.
 *
 * NOTE: this is a SET-LEVEL heuristic — we sample the first N icons and
 * decide whether to run the stroke→fill pass for the whole set. Per-icon
 * processing of 300k icons would be too slow.
 */
export function isLikelyStrokeSet(
  icons: readonly ResolvedIcon[],
  sampleSize = 20
): boolean {
  const sample = icons.slice(0, sampleSize);
  if (sample.length === 0) return false;

  let strokeCount = 0;
  for (const ic of sample) {
    const b = ic.body;
    const hasStroke = /stroke=/.test(b);
    const hasFillNone = /fill=["']?none["']?/.test(b) || !/fill=/.test(b);
    if (hasStroke && hasFillNone) strokeCount += 1;
  }
  // 70%+ of sampled icons are stroke-only → treat the whole set as stroke.
  return strokeCount / sample.length >= 0.7;
}
