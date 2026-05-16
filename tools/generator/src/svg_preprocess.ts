import { SVGPathData } from 'svg-pathdata';
import type { ResolvedIcon } from './load_iconify.ts';
import {
  cloneShallow,
  deleteAttr,
  directElementChildren,
  getAttrLower,
  isPaintableLeaf,
  makeGroup,
  onlyElementsOrWhitespace,
  parseBody,
  serializeNode,
  setAttr,
  walkElements,
} from './dom.ts';
import { type AnyNode, Element, isTag } from 'domhandler';

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

  // `xmlns:xlink` is declared defensively. A handful of Iconify bodies
  // (e.g. `logos:deploy`, `logos:google-developers-icon`) reference legacy
  // `xlink:href` attributes inline. Without the namespace declaration the
  // oslllo-svg-fixer XML parser aborts the entire stroke-fill batch with
  // "unknown namespace prefix 'xlink'", silently dropping every icon in
  // the set back to its original multi-color body and letting it ship as
  // a featureless monochrome blob. The declaration is harmless when xlink
  // isn't used.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}">${inner}</svg>`;
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
 * Per-icon variant of [rasterFillSignal]. Returns true if THIS individual
 * body would render incorrectly without the rasterize-then-trace pre-pass:
 *
 * - **Stroke-only**: `stroke=…` attribute present and no `fill` (or
 *   `fill="none"`). svgicons2svgfont collapses strokes to zero-width
 *   geometry → an outlined ring renders as a solid disc.
 * - **`fill-rule="evenodd"`**: the icon relies on the even-odd fill rule
 *   to carve out internal cutouts (a ring is "outer disc minus inner
 *   disc"). TTF glyph rendering uses non-zero winding regardless, so
 *   the inner disc fills back in → solid silhouette.
 *
 * The pack-level [rasterFillSignal] samples the first 25 icons; if fewer
 * than 20% trip either flag the pack is skipped. But sets like `oui`
 * (16% of sample) still ship individual broken icons (`analyze-event`,
 * `chat-left`, `check-in-circle-empty`). This per-icon predicate lets
 * the pipeline route just those individual icons through rasterize-trace
 * without touching the rest of the pack.
 */
export function iconNeedsRasterTrace(body: string): boolean {
  // fill-rule="evenodd" is a pure attribute check — no inheritance to
  // worry about (SVG applies it per element). Fast-path before parsing.
  if (/fill-rule\s*=\s*["']?evenodd["']?/.test(body)) return true;
  if (body.indexOf('stroke') === -1) return false;
  // Walk the AST and ask "does any element paint via stroke while
  // contributing no fill ink?" — i.e. it relies on stroke geometry which
  // svgicons2svgfont collapses to zero width. The unified `elementHasNoInk`
  // predicate is fill-AND-stroke aware, so we instead check the two
  // channels independently per element.
  const root = parseBody(body);
  for (const el of walkElements(root)) {
    if (!isPaintableLeaf(el)) continue;
    // Build the effective ancestor-group attrs by walking parents up to
    // (but not including) the synthetic `<svg>` root. Closer ancestors
    // override outer ones, so we set keys only when not already present.
    const groupAttrs: Record<string, string> = {};
    let p = el.parent;
    while (p !== null && isTag(p as AnyNode)) {
      const pe = p as Element;
      if (pe.name === 'svg') break;
      for (const [k, v] of Object.entries(pe.attribs)) {
        if (!(k in groupAttrs)) groupAttrs[k] = v;
      }
      p = pe.parent;
    }
    const ownStyle = parseInlineStyle(el.attribs.style);
    const stroke =
      ownStyle.stroke ?? el.attribs.stroke ?? groupAttrs.stroke;
    if (stroke === undefined || paintValueIsNoInk(stroke)) continue;
    // Stroke is visible-paint. Is the fill no-ink? If yes, stroke is the
    // only paint contributor → rasterize-trace needed.
    const fill =
      ownStyle.fill ?? el.attribs.fill ?? groupAttrs.fill;
    const fillOp =
      ownStyle['fill-opacity'] ??
      el.attribs['fill-opacity'] ??
      groupAttrs['fill-opacity'];
    const fillNoInk =
      (fill !== undefined && paintValueIsNoInk(fill)) ||
      (fillOp !== undefined && parseFloat(fillOp) === 0);
    if (fillNoInk) return true;
  }
  return false;
}

// ============================================================================
// Paint-order risk
// ============================================================================
//
// Some Iconify sets (notably `logos`, `vscode-icons`, `devicon`, `material-icon-theme`)
// ship multicolor SVGs where the visible icon depends on PAINT ORDER and
// COLOR CONTRAST between layered shapes — e.g. a light "Ae" letterform
// painted on top of a dark rounded-square background:
//
//   <rect fill="#1F0742" .../>
//   <path fill="#D49EFB" d="…Ae letterform…"/>
//
// When converted to a monochrome TTF, every fill becomes `currentColor`.
// The letter merges into the rectangle behind it (both same color,
// non-zero winding fill rule) and the glyph renders as a featureless
// filled square. This is a fundamentally different failure mode from
// the stroke / evenodd cases above:
//
//   - Stroke: `stroke="…" fill="none"` — rasterize+trace fixes it.
//   - Evenodd: internal cutouts via `fill-rule="evenodd"` — rasterize+trace fixes.
//   - Paint-order: overlapping fills of different colors — rasterize+trace
//     does NOT fix it (Potrace traces the COMBINED silhouette as one
//     filled blob; the letter is "inside" the bg shape's filled region
//     and gets absorbed regardless).
//
// We detect the risk per-icon by counting the number of distinct concrete
// fill colors used in the body (excluding `none` and `currentColor`).
// Anything > 1 is flagged. The pipeline then marks such icons as
// deprecated so they never appear in the Dart class nor receive a glyph
// in the TTF — better to omit a broken icon than ship a featureless blob.
//
// Codepoint stability is preserved: deprecated entries keep their slot
// in the manifest, so consumers' apps that reference them still compile
// (with a deprecation warning). If a future Iconify release replaces a
// multi-fill body with a single-color equivalent, the next regen will
// un-deprecate the icon automatically.

const FILL_ATTR_RE = /\bfill\s*=\s*["']([^"']*)["']/g;
const FILL_STYLE_RE = /\bfill\s*:\s*([^;"'\s]+)/g;
const STROKE_ATTR_RE = /\bstroke\s*=\s*["']([^"']*)["']/g;
const STROKE_STYLE_RE = /\bstroke\s*:\s*([^;"'\s]+)/g;

// ============================================================================
// Unified no-ink predicate (§5)
// ============================================================================
//
// Before §5, four separate functions each hard-coded their own list of "what
// counts as no visible ink" — `iconNeedsRasterTrace` knew about
// `fill="none"|transparent|fill-opacity="0"`, `isNonConcretePaint` only
// knew about `none|transparent|currentColor|url(...)`, `splitDuotoneBody`
// inlined yet another set, and `isPaintOrderRiskBody` excluded `currentColor`
// but no other zero-alpha encodings. Bodies that used less common encodings
// — `rgba(0,0,0,0)`, `#XXXXXX00`, inherited `fill="none"` from an outer
// `<g>` — got misclassified by ONE predicate but not another, leading to
// silent misroutes (e.g. an icon that paints a concrete `<rect/>` plus a
// "ghost" `rgba(...,0)` shape was flagged as 2-paint and dropped under
// `isPaintOrderRiskBody`).
//
// `elementHasNoInk` + `paintValueIsNoInk` consolidate every encoding into
// one canonical predicate. Callers either ask "does this element paint
// anything visible" (element form, considers attrs + style + ancestor
// group attrs) or "is this raw paint value no-ink" (value form, used when
// only the string is available from an attribute-scan regex).

/**
 * True if a raw paint value (the right-hand side of `fill="..."`,
 * `stroke="..."`, or a `style` clause) represents NO visible ink. Covers:
 *
 * - `none` (keyword)
 * - `transparent` (keyword)
 * - empty string (`fill=""`)
 * - `rgba(...,0)` / `rgb(... / 0)` (zero-alpha in any css-color-4 spelling)
 * - `hsla(...,0)` / `hsl(... / 0)` (zero-alpha)
 * - 8-digit zero-alpha hex (`#XXXXXX00`) and 4-digit zero-alpha hex (`#XXX0`)
 *
 * Does NOT treat `currentColor` or `url(#…)` as no-ink: those represent
 * visible-but-unknown paint (deferred to render time / paint-server) and
 * callers that need to distinguish them check separately.
 */
export function paintValueIsNoInk(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return true;
  if (v === 'none' || v === 'transparent') return true;
  // rgba(...) / rgb(... / a) / hsla(...) / hsl(... / a) — final component
  // is alpha. Accept comma-separated (legacy) and slash-separated
  // css-color-4 forms (`rgb(0 0 0 / 0)` — space-delimited channels, slash
  // before alpha). Tokenise by replacing `/` and `,` with space, then
  // split on whitespace.
  const fnMatch = v.match(/^(?:rgba?|hsla?)\s*\(([^)]+)\)$/);
  if (fnMatch) {
    const tokens = fnMatch[1]!
      .replace(/[,/]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 0);
    if (tokens.length === 4) {
      const a = parseFloat(tokens[3]!);
      if (Number.isFinite(a) && a === 0) return true;
    }
  }
  // 8-digit hex `#RRGGBBAA` — last byte is alpha.
  const m8 = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/);
  if (m8 && m8[2] === '00') return true;
  // 4-digit hex `#RGBA` — last nibble is alpha.
  const m4 = v.match(/^#([0-9a-f]{3})([0-9a-f])$/);
  if (m4 && m4[2] === '0') return true;
  return false;
}

/**
 * Parse an inline-style string (`"fill: none; stroke: #123"`) into a
 * lowercase property → value map. Whitespace + trailing semicolons are
 * tolerated.
 */
function parseInlineStyle(style: string | undefined): Record<string, string> {
  if (style === undefined) return {};
  const out: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (key.length > 0) out[key] = val;
  }
  return out;
}

/**
 * Resolve the effective value of a paint-style property on an element,
 * walking: own `style` declaration → own attribute → inherited from
 * `groupAttrs` (which also accepts a `style` declaration). Returns the
 * raw value (case preserved) or `undefined` when no source defines it.
 */
function resolvePaintProp(
  el: Element,
  groupAttrs: Record<string, string>,
  name: 'fill' | 'stroke' | 'opacity' | 'fill-opacity' | 'stroke-opacity' | 'display' | 'visibility'
): string | undefined {
  const ownStyle = parseInlineStyle(el.attribs.style);
  if (ownStyle[name] !== undefined) return ownStyle[name];
  if (el.attribs[name] !== undefined) return el.attribs[name];
  const groupStyle = parseInlineStyle(groupAttrs.style);
  if (groupStyle[name] !== undefined) return groupStyle[name];
  if (groupAttrs[name] !== undefined) return groupAttrs[name];
  return undefined;
}

/**
 * True if `el` paints no visible ink under the effective attributes
 * inherited from `groupAttrs` (the ancestor `<g>` chain). Considers both
 * fill AND stroke channels — an element with `fill="none"` but a visible
 * `stroke=...` still paints, so this returns false for it.
 *
 * The element is no-ink when ANY of:
 * - `opacity="0"` (effective, including inherited)
 * - `display="none"` or `visibility="hidden"` (effective)
 * - BOTH the effective fill is no-ink (`paintValueIsNoInk`, OR
 *   `fill-opacity="0"`) AND the effective stroke is no-ink (same rule).
 *
 * "No fill attribute anywhere in the chain" defaults to SVG's `fill="black"`
 * (visible), so an unstyled `<path d=…/>` is NOT no-ink.
 */
export function elementHasNoInk(
  el: Element,
  groupAttrs: Record<string, string> = {}
): boolean {
  const opacity = resolvePaintProp(el, groupAttrs, 'opacity');
  if (opacity !== undefined) {
    const o = parseFloat(opacity);
    if (Number.isFinite(o) && o === 0) return true;
  }
  const display = resolvePaintProp(el, groupAttrs, 'display');
  if (display !== undefined && display.trim().toLowerCase() === 'none') {
    return true;
  }
  const visibility = resolvePaintProp(el, groupAttrs, 'visibility');
  if (
    visibility !== undefined &&
    visibility.trim().toLowerCase() === 'hidden'
  ) {
    return true;
  }

  const channelIsNoInk = (
    paintName: 'fill' | 'stroke',
    opacityName: 'fill-opacity' | 'stroke-opacity'
  ): boolean => {
    const paint = resolvePaintProp(el, groupAttrs, paintName);
    if (paint !== undefined && paintValueIsNoInk(paint)) return true;
    const op = resolvePaintProp(el, groupAttrs, opacityName);
    if (op !== undefined) {
      const v = parseFloat(op);
      if (Number.isFinite(v) && v === 0) return true;
    }
    return false;
  };

  // Default SVG `fill` is black (visible). So a fill is "no-ink" only if
  // explicitly declared somewhere as such.
  const fillDeclared =
    resolvePaintProp(el, groupAttrs, 'fill') !== undefined ||
    resolvePaintProp(el, groupAttrs, 'fill-opacity') !== undefined;
  const strokeDeclared =
    resolvePaintProp(el, groupAttrs, 'stroke') !== undefined ||
    resolvePaintProp(el, groupAttrs, 'stroke-opacity') !== undefined;

  const fillNoInk = fillDeclared ? channelIsNoInk('fill', 'fill-opacity') : false;
  const strokeNoInk = strokeDeclared
    ? channelIsNoInk('stroke', 'stroke-opacity')
    : true; // SVG default stroke is `none`

  // If fill was never declared anywhere, default-black fill is visible →
  // element paints → not no-ink.
  if (!fillDeclared) return false;
  return fillNoInk && strokeNoInk;
}

/**
 * Back-compat shim for callers that operate purely on the right-hand-side
 * of a paint attribute (after a regex scan). Returns true when the value
 * is no-ink OR a non-concrete paint (`currentColor`, `url(#…)`) — i.e. it
 * doesn't contribute a concrete colour identity for the purposes of
 * paint-order analysis.
 */
function isNonConcretePaint(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (paintValueIsNoInk(v)) return true;
  return v === 'currentcolor' || v.startsWith('url(');
}

/**
 * Extract every concrete fill color appearing on elements in `body`.
 * Returns a set of lowercased color tokens. `none`, `currentColor`,
 * `transparent`, and `url(#...)` paint-server references are excluded
 * because they don't contribute to the "two fills overlap in the same
 * monochrome color" failure mode.
 *
 * Kept as a back-compat shim. Most paint-order decisions now use
 * `extractConcretePaints` (fill + stroke aware) — see §14 of
 * `docs/RESEARCH_PLAN.md`.
 */
function extractConcreteFills(body: string): Set<string> {
  const colors = new Set<string>();
  const scan = (re: RegExp): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]!.trim().toLowerCase();
      if (isNonConcretePaint(raw)) continue;
      colors.add(raw);
    }
  };
  scan(FILL_ATTR_RE);
  scan(FILL_STYLE_RE);
  return colors;
}

/**
 * Extract every concrete `fill` AND `stroke` color appearing in `body`.
 * §14 fix: bodies that paint via `fill="#bg"` + `stroke="#fg"` (the
 * streamline-color family) used to report 1 distinct fill and silently
 * fall through to a flat single-layer render — losing the outline.
 * Walking both attribute (`fill="…"`, `stroke="…"`) and inline-style
 * (`style="fill:…; stroke:…"`) forms lets `isPaintOrderRiskBody` flag
 * these correctly so downstream split / drop paths can act on them.
 */
export function extractConcretePaints(body: string): Set<string> {
  const colors = new Set<string>();
  const scan = (re: RegExp): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]!.trim().toLowerCase();
      // Uses the unified `isNonConcretePaint` shim which covers every
      // no-ink encoding (none, transparent, rgba(...,0), zero-alpha hex,
      // empty string) plus the non-concrete `currentColor` / `url(#…)`.
      if (isNonConcretePaint(raw)) continue;
      colors.add(raw);
    }
  };
  scan(FILL_ATTR_RE);
  scan(FILL_STYLE_RE);
  scan(STROKE_ATTR_RE);
  scan(STROKE_STYLE_RE);
  return colors;
}

/**
 * Returns true if `body` is at risk of rendering as a featureless blob
 * in a monochrome TTF because it relies on >1 distinct paint colour
 * (fill OR stroke) to convey its meaning (i.e. paint-order layering).
 */
export function isPaintOrderRiskBody(body: string): boolean {
  return extractConcretePaints(body).size >= 2;
}

// ============================================================================
// §14 helpers — canonical-white predicate, shoelace area, element area
// ============================================================================
//
// These three helpers feed `trySplitTwoColorBody`'s decision tree:
//
//  1. `isCanonicalWhite` powers the "white-as-foreground" override —
//     empirically across logos / crypto-color / vscode-icons / streamline-
//     color, the white path in a 2-paint body is the SMALLER-area
//     foreground letterform ~86 % of the time.
//
//  2. `shoelaceAreaOfPath` + `elementArea` give us a cheap signed-area
//     approximation per geometry, summed per colour-bucket, so the
//     "background = larger fill area" rule can prefer the right layer.
//
// See §14 of `docs/RESEARCH_PLAN.md` for the analysis.

/**
 * Canonical-white predicate. `#fff`, `#ffffff` (any case), the keyword
 * `white`, and `rgb(255,255,255)` (with optional spaces) are considered
 * pure white. Used by the §14 2-paint splitter's "white-as-foreground"
 * override.
 */
export function isCanonicalWhite(colour: string): boolean {
  const v = colour.trim().toLowerCase();
  return (
    v === '#fff' ||
    v === '#ffffff' ||
    v === 'white' ||
    v === 'rgb(255,255,255)' ||
    v === 'rgb(255, 255, 255)'
  );
}

/**
 * Compute the SHOELACE polygon area of an SVG `d` attribute by parsing
 * its commands, flattening curves to their endpoints, walking each
 * closed subpath, and summing the signed contour area
 * `Σ (x_i · y_{i+1} - x_{i+1} · y_i) / 2`. Subpath contributions are
 * absolute-valued so interior holes contribute their geometric area
 * rather than subtracting (we want a "covered ink" estimate, not net
 * winding area).
 *
 * Curves (`C`, `S`, `Q`, `T`, `A`) are approximated as line segments
 * between their start and end points — exact integration via bezier
 * subdivision is overkill for the 1.3× area-gap comparator.
 *
 * Returns 0 for unparseable / empty paths.
 */
export function shoelaceAreaOfPath(d: string): number {
  let cmds;
  try {
    cmds = new SVGPathData(d).toAbs().commands;
  } catch {
    return 0;
  }
  if (cmds.length === 0) return 0;

  let total = 0;
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let subSum = 0; // signed shoelace running sum for the current subpath
  let inSubpath = false;

  const flushSubpath = (): void => {
    if (inSubpath) {
      total += Math.abs(subSum) / 2;
    }
    subSum = 0;
    inSubpath = false;
  };

  for (const c of cmds) {
    switch (c.type) {
      case SVGPathData.MOVE_TO: {
        flushSubpath();
        curX = c.x;
        curY = c.y;
        startX = curX;
        startY = curY;
        inSubpath = true;
        break;
      }
      case SVGPathData.LINE_TO:
      case SVGPathData.CURVE_TO:
      case SVGPathData.SMOOTH_CURVE_TO:
      case SVGPathData.QUAD_TO:
      case SVGPathData.SMOOTH_QUAD_TO:
      case SVGPathData.ARC: {
        // All of these draw to (c.x, c.y). Approximate the segment as
        // a straight line from (curX, curY) to (c.x, c.y) for shoelace
        // accumulation.
        const cAny = c as { x: number; y: number };
        subSum += curX * cAny.y - cAny.x * curY;
        curX = cAny.x;
        curY = cAny.y;
        break;
      }
      case SVGPathData.HORIZ_LINE_TO: {
        const cAny = c as { x: number };
        subSum += curX * curY - cAny.x * curY;
        curX = cAny.x;
        break;
      }
      case SVGPathData.VERT_LINE_TO: {
        const cAny = c as { y: number };
        subSum += curX * cAny.y - curX * curY;
        curY = cAny.y;
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        subSum += curX * startY - startX * curY;
        flushSubpath();
        curX = startX;
        curY = startY;
        break;
      }
    }
  }
  if (inSubpath) {
    subSum += curX * startY - startX * curY;
    flushSubpath();
  }
  return total;
}

/**
 * Approximate the ink area of a self-closing SVG primitive from its
 * attribute map. `attribs` should be the htmlparser2 `Element.attribs`
 * record (same shape as what `getAttrLower` reads from). Falls back to
 * 0 for elements we can't measure (`<line>` / `<polyline>` open shapes,
 * malformed `d`, missing dimensions). Area is a tie-breaker, not a hard
 * requirement — source-order picks up the slack when geometry is
 * unmeasurable.
 */
export function elementArea(
  tag: string,
  attribs: Record<string, string>
): number {
  const num = (name: string): number => {
    const raw = attribs[name];
    if (raw === undefined) return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  switch (tag) {
    case 'rect': {
      return Math.abs(num('width') * num('height'));
    }
    case 'circle': {
      const r = num('r');
      return Math.PI * r * r;
    }
    case 'ellipse': {
      return Math.PI * Math.abs(num('rx') * num('ry'));
    }
    case 'path': {
      const d = attribs.d;
      if (d === undefined) return 0;
      return shoelaceAreaOfPath(d);
    }
    case 'polygon': {
      const ptsRaw = attribs.points;
      if (ptsRaw === undefined) return 0;
      const pts = ptsRaw
        .split(/[\s,]+/)
        .map((s) => parseFloat(s))
        .filter((n) => Number.isFinite(n));
      if (pts.length < 6 || pts.length % 2 !== 0) return 0;
      let sum = 0;
      for (let i = 0; i < pts.length; i += 2) {
        const x1 = pts[i]!;
        const y1 = pts[i + 1]!;
        const x2 = pts[(i + 2) % pts.length]!;
        const y2 = pts[(i + 3) % pts.length]!;
        sum += x1 * y2 - x2 * y1;
      }
      return Math.abs(sum) / 2;
    }
    case 'line':
    case 'polyline': {
      // Open shapes have zero ink area in fill semantics.
      return 0;
    }
    default:
      return 0;
  }
}

/**
 * Try to split a two-color body into a duotone primary + secondary pair.
 *
 * Handles two layering conventions across Iconify:
 *
 * 1. **Two distinct fills** (`logos:adobe-after-effects`, `cryptocurrency-
 *    color`, vscode-icons, `material-icon-theme`):
 *
 *        <rect fill="#00005b" rx="42.5" .../>
 *        <path fill="#99f" d="…Ae letterform…"/>
 *
 * 2. **One fill + one stroke** (streamline-color / streamline-flex-color):
 *
 *        <path fill="#d7e0ff" d="…body…"/>
 *        <path stroke="#4147d5" d="…outline…"/>
 *
 *    Until §14 of `docs/RESEARCH_PLAN.md` was implemented, the detector
 *    only saw `fill=` attrs (`extractConcreteFills`), so the stroke-
 *    coloured outline was ignored — 1 distinct fill → no split → shipped
 *    as a flat light-blue body with NO outline. Walking BOTH `fill=` and
 *    `stroke=` via `extractConcretePaints` lets these icons split
 *    correctly. A single element carrying BOTH a fill and a stroke
 *    contributes geometry to BOTH layers (the fill copy goes to one,
 *    the stroke copy to the other) so the layer-separated geometry is
 *    preserved.
 *
 * **Primary / secondary assignment** (per §14 unified decision tree):
 *
 *   a. **White-as-foreground override** (~86 % accurate across logos /
 *      crypto / vscode-icons / streamline-color): if exactly one of the
 *      two colours is canonical white (`#fff`, `white`), it goes to
 *      SECONDARY (foreground letterform).
 *   b. **Area-leader with 1.3× gap floor**: the colour group with
 *      larger summed-shoelace area is PRIMARY (background); the smaller
 *      is SECONDARY (foreground). The 1.3× floor avoids flipping near-
 *      symmetric two-tone bodies where source-order is the correct
 *      tie-break.
 *   c. **Source-order tie-break**: when areas are within 1.3× of each
 *      other (W3C painters algorithm — first child = bottom =
 *      background), the colour appearing FIRST becomes PRIMARY.
 *
 * Both layers have their paint attributes normalised to `currentColor`.
 *
 * Returns `null` when the body can't be cleanly split (3+ colours,
 * gradients, nested groups, non-leaf siblings). Callers then fall
 * through to the paint-order drop path.
 */
export function trySplitTwoColorBody(
  body: string
): { primary: string; secondary: string } | null {
  // Reject 1-paint / 3+-paint bodies early. The §14 detector walks
  // BOTH fill and stroke, so `fill="#bg"` + `stroke="#fg"` counts as
  // two paints.
  const distinctPaints = extractConcretePaints(body);
  if (distinctPaints.size !== 2) return null;

  const root = parseBody(body);
  if (!onlyElementsOrWhitespace(root)) return null;

  // Optional single outer <g attrs>…</g> wrap. Treat its inner content
  // as the iteration target and re-wrap each output body in the same
  // group attrs (minus the concrete `fill` / `stroke` — those become
  // per-element after colour normalisation).
  let walkRoot: Element = root;
  let hasOuterGroup = false;
  let outerGroupAttrs: Record<string, string> = {};
  const topLevelEls = directElementChildren(root);
  if (topLevelEls.length === 1 && topLevelEls[0]!.name === 'g') {
    walkRoot = topLevelEls[0]!;
    hasOuterGroup = true;
    outerGroupAttrs = { ...walkRoot.attribs };
  }

  // Inherited paint on the wrapper, if any. Non-concrete inherits
  // (`none`, `transparent`, `currentColor`, `url(#…)`) don't contribute
  // to either colour bucket — they're just structural defaults.
  const inheritedFillRaw = getAttrLower(walkRoot, 'fill');
  const inheritedStrokeRaw = getAttrLower(walkRoot, 'stroke');
  const inheritedFill =
    inheritedFillRaw !== undefined && !isNonConcretePaint(inheritedFillRaw)
      ? inheritedFillRaw
      : undefined;
  const inheritedStroke =
    inheritedStrokeRaw !== undefined && !isNonConcretePaint(inheritedStrokeRaw)
      ? inheritedStrokeRaw
      : undefined;

  // Clean wrapper attrs: drop both `fill` and `stroke` (concrete OR
  // non-concrete) — each child carries its own normalised paint after
  // splitting, and the wrapper carries only structural attrs (stroke-
  // width, stroke-linecap, transform, …).
  const groupAttrsClean: Record<string, string> = { ...outerGroupAttrs };
  if (hasOuterGroup) {
    delete groupAttrsClean.fill;
    delete groupAttrsClean.stroke;
  }

  // Each element contributes 0, 1, or 2 entries — separate contributions
  // for its fill geometry and its stroke geometry. A single element with
  // both a concrete fill AND a concrete stroke contributes geometry to
  // BOTH colour buckets (the fill copy with `fill="currentColor"
  // stroke="none"` and the stroke copy with `fill="none" stroke=
  // "currentColor"`).
  interface Contribution {
    colour: string;
    element: Element;
    area: number;
    sourceOrder: number;
  }
  const contributions: Contribution[] = [];
  let nextSourceOrder = 0;
  const firstSeenIndex = new Map<string, number>();

  for (const child of directElementChildren(walkRoot)) {
    if (!isPaintableLeaf(child)) {
      // Non-leaf siblings (nested `<g>`, `<defs>`, `<mask>`, etc.) would
      // require recursive paint resolution. Bail — rasterize-trace
      // fallback handles those.
      return null;
    }

    const ownFillRaw = getAttrLower(child, 'fill');
    const ownStrokeRaw = getAttrLower(child, 'stroke');

    const effectiveFill =
      ownFillRaw === undefined
        ? inheritedFill
        : isNonConcretePaint(ownFillRaw)
          ? undefined
          : ownFillRaw;
    const effectiveStroke =
      ownStrokeRaw === undefined
        ? inheritedStroke
        : isNonConcretePaint(ownStrokeRaw)
          ? undefined
          : ownStrokeRaw;

    if (effectiveFill === undefined && effectiveStroke === undefined) {
      // No concrete paint we can attribute — body is structurally
      // ambiguous for the 2-colour split.
      return null;
    }

    const area = elementArea(child.name, child.attribs);

    // Helper: stripped clone of the element with `fill` + `stroke`
    // removed. Per-layer copies then set their own paint values. We
    // preserve `stroke-width`, `stroke-linecap`, `stroke-linejoin`,
    // `d`, transform, etc. so the layer's geometry retains its
    // rendered weight.
    const makeStripped = (): Element => {
      const copy = cloneShallow(child);
      deleteAttr(copy, 'fill');
      deleteAttr(copy, 'stroke');
      return copy;
    };

    if (effectiveFill !== undefined) {
      if (!firstSeenIndex.has(effectiveFill)) {
        firstSeenIndex.set(effectiveFill, nextSourceOrder++);
      }
      const fillCopy = makeStripped();
      setAttr(fillCopy, 'fill', 'currentColor');
      setAttr(fillCopy, 'stroke', 'none');
      contributions.push({
        colour: effectiveFill,
        element: fillCopy,
        area,
        sourceOrder: firstSeenIndex.get(effectiveFill)!,
      });
    }
    if (effectiveStroke !== undefined) {
      if (!firstSeenIndex.has(effectiveStroke)) {
        firstSeenIndex.set(effectiveStroke, nextSourceOrder++);
      }
      const strokeCopy = makeStripped();
      setAttr(strokeCopy, 'fill', 'none');
      setAttr(strokeCopy, 'stroke', 'currentColor');
      contributions.push({
        colour: effectiveStroke,
        // Stroked layers paint zero ink for area purposes (the open-
        // contour stroke has negligible coverage relative to a fill of
        // the same path). Source-order tie-break handles cases where
        // one bucket is all-stroke.
        element: strokeCopy,
        area: 0,
        sourceOrder: firstSeenIndex.get(effectiveStroke)!,
      });
    }
  }

  if (contributions.length === 0) return null;

  // Group contributions by colour and aggregate area + earliest
  // source-order index per bucket.
  const byColour = new Map<
    string,
    { elements: Element[]; area: number; sourceOrder: number }
  >();
  for (const c of contributions) {
    const g = byColour.get(c.colour);
    if (g) {
      g.elements.push(c.element);
      g.area += c.area;
      if (c.sourceOrder < g.sourceOrder) g.sourceOrder = c.sourceOrder;
    } else {
      byColour.set(c.colour, {
        elements: [c.element],
        area: c.area,
        sourceOrder: c.sourceOrder,
      });
    }
  }
  if (byColour.size !== 2) return null;

  // Order the two colour buckets by source-order ascending so [0] is
  // the colour that first appeared in the body.
  const entries = [...byColour.entries()];
  entries.sort((a, b) => a[1].sourceOrder - b[1].sourceOrder);
  const [firstColour, firstGroup] = entries[0]!;
  const [secondColour, secondGroup] = entries[1]!;

  // §14 unified decision tree.
  let primaryColour: string;
  const firstIsWhite = isCanonicalWhite(firstColour);
  const secondIsWhite = isCanonicalWhite(secondColour);
  if (firstIsWhite !== secondIsWhite) {
    // Rule 1 — White-as-foreground override.
    primaryColour = firstIsWhite ? secondColour : firstColour;
  } else {
    // Rule 2 — Area-leader with 1.3× gap floor.
    const AREA_GAP = 1.3;
    const aArea = firstGroup.area;
    const bArea = secondGroup.area;
    if (aArea > 0 && bArea > 0 && aArea >= AREA_GAP * bArea) {
      primaryColour = firstColour;
    } else if (aArea > 0 && bArea > 0 && bArea >= AREA_GAP * aArea) {
      primaryColour = secondColour;
    } else {
      // Rule 3 — Source-order tie-break (W3C painters algorithm).
      primaryColour = firstColour;
    }
  }
  const secondaryColour =
    primaryColour === firstColour ? secondColour : firstColour;

  const primaryEls = byColour.get(primaryColour)!.elements;
  const secondaryEls = byColour.get(secondaryColour)!.elements;

  if (primaryEls.length === 0 || secondaryEls.length === 0) {
    return null;
  }

  const wrap = (els: Element[]): string => {
    if (els.length === 0) return '';
    if (hasOuterGroup && Object.keys(groupAttrsClean).length > 0) {
      const wrapper = makeGroup(groupAttrsClean, els);
      return serializeNode(wrapper);
    }
    return els.map((e) => serializeNode(e)).join('');
  };

  return { primary: wrap(primaryEls), secondary: wrap(secondaryEls) };
}

export interface PaintOrderReason {
  /** Fraction of sampled icons whose body uses ≥2 distinct concrete fills. */
  paintOrderRatio: number;
}

/**
 * True if the body uses the inverse-mask pattern: a `<defs><mask id="X">`
 * block followed by a consumer `<path ... mask="url(#X)"/>`. Solar bold,
 * icon-park-twotone/solid, line-md, pepicons-pop/pencil, lets-icons
 * duotone-lines, and ~20 other packs ship icons this way. The pattern was
 * historically silent-broken inside the stroke-fill pipeline: oslllo-svg-
 * fixer's `checkFillState` would force the first <path> element's fill to
 * black, and inside the mask that path is the icon's BODY — flipping it
 * to black made it invisible (only the visible-in-mask white paths got
 * traced). Now that the worker bypasses `checkFillState`, these icons
 * trace correctly. Surfaced in the audit so we can see how many icons
 * per pack were silently broken before the fix.
 */
export function bodyUsesMaskPattern(body: string): boolean {
  // Cheap fast-path: both tokens must appear.
  if (body.indexOf('<mask') === -1) return false;
  if (body.indexOf('mask="url(') === -1 && body.indexOf("mask='url(") === -1) {
    return false;
  }
  // Confirm: a <defs>...<mask id="X">...</mask>...</defs> block plus a
  // matching mask="url(#X)" reference somewhere outside the defs.
  return /<defs[^>]*>[\s\S]*?<mask\s+id=["']([^"']+)["'][\s\S]*?<\/mask>[\s\S]*?<\/defs>/.test(body);
}

/**
 * Flatten SMIL animation elements into their END state and strip the
 * animation tags. Line-md (and a handful of icon-park icons) ship reveal-
 * style animations by setting the parent path's `stroke-dashoffset` to
 * the FULL dasharray length and animating it down to 0:
 *
 *   <path stroke-dasharray="28" stroke-dashoffset="28" d="...">
 *     <animate attributeName="stroke-dashoffset" values="28;0" dur="0.4s"/>
 *   </path>
 *
 * Our validator already rejects `<animate>`, but by the time the validator
 * runs the body has been through stroke-fill — Potrace traces whatever
 * resvg renders, and resvg renders SMIL animations at t=0 (the START
 * state), so the parent path with `dashoffset=28` ships as a fully-offset
 * stroke = invisible. line-md `account` shipped with just the body
 * silhouette and no head circle for this reason; same for ~500 sibling
 * line-md icons.
 *
 * This pass walks each `<animate>` / `<animateTransform>` / `<set>` child,
 * extracts the END animated value (`to=...`, or the last entry of
 * `values=A;B;…`), applies it to the parent element as a regular static
 * attribute, then removes the animation tag. The resulting body has no
 * animation elements (so the validator passes) and renders at the
 * animation's final state in resvg.
 *
 * `additive="sum"` semantics (transform-additive animations) aren't
 * supported here — those bodies fall through to validator rejection,
 * which is correct: a non-flattened animation would render wrong.
 */
export function flattenAnimations(body: string): string {
  // Cheap fast-path; most bodies don't animate.
  if (body.indexOf('<animate') === -1 && body.indexOf('<set') === -1) {
    return body;
  }
  // Innermost-first match: a `<tag>` whose inner content contains ONLY
  // animation elements + whitespace (no nested regular elements). That
  // guarantees we apply the animation's end value to the IMMEDIATE
  // parent — the path/circle/rect/etc. carrying the dashoffset — not to
  // an outer `<g>` wrapper. After one pass the inner becomes empty, the
  // tag no longer contains animations, and the next iteration moves up
  // a level (if the OUTER `<g>` also carries animations directly).
  const PARENT_TAG_RE =
    /<(path|circle|ellipse|rect|line|polyline|polygon|g)\b([^>]*?)>((?:\s|<(?:animate(?:Transform|Motion)?|set)\b[^/>]*\/?>(?:[^<]*<\/(?:animate(?:Transform|Motion)?|set)>)?)*?)<\/\1>/g;
  const ANIM_RE =
    /<(animate(?:Transform|Motion)?|set)\b([^/>]*?)\/?>(?:[^<]*<\/\1>)?/g;

  let out = body;
  let safety = 0;
  while (/<(?:animate(?:Transform|Motion)?|set)\b/.test(out) && safety < 64) {
    let changed = false;
    out = out.replace(PARENT_TAG_RE, (full, tag, attrs, inner) => {
      // The regex matches any inner that's whitespace + animate elements,
      // including EMPTY inner. We only want to process tags that actually
      // carry an animation child — otherwise we'd loop forever rewriting
      // already-cleaned tags. Bail out if no animate / set element is
      // present in inner.
      if (!/<(?:animate(?:Transform|Motion)?|set)\b/.test(inner)) {
        return full;
      }
      changed = true;
      let parentAttrs: string = attrs;
      let m: RegExpExecArray | null;
      ANIM_RE.lastIndex = 0;
      while ((m = ANIM_RE.exec(inner)) !== null) {
        const animAttrs = m[2]!;
        const nameMatch = animAttrs.match(
          /\battributeName\s*=\s*["']([^"']+)["']/
        );
        if (!nameMatch) continue;
        const attrName = nameMatch[1]!;
        // Collect all candidate values, then pick the one that makes the
        // icon MORE VISIBLE. line-md uses both reveal (`values="28;0"` —
        // start hidden, end visible) and HIDE (`values="0;14"` — start
        // visible, end hidden) animations under the same `*-transition`
        // shape. Always taking the END value broke transitions like
        // `confirm-square-to-square-transition` (the check vanished
        // because dashoffset ended at 14 = full). The right heuristic
        // is attribute-aware: for stroke-dashoffset (and ANY length
        // counted off from a dasharray), pick the SMALLEST value — that
        // shows more stroke. For opacity-style attributes, pick the
        // LARGEST. For other attrs, default to LAST (start-to-end
        // morph reveals usually want the final shape).
        const candidates: string[] = [];
        const toMatch = animAttrs.match(/\bto\s*=\s*["']([^"']+)["']/);
        const fromMatch = animAttrs.match(/\bfrom\s*=\s*["']([^"']+)["']/);
        const valuesMatch = animAttrs.match(
          /\bvalues\s*=\s*["']([^"']+)["']/
        );
        if (valuesMatch) {
          for (const p of valuesMatch[1]!.split(';')) {
            const t = p.trim();
            if (t.length > 0) candidates.push(t);
          }
        } else {
          if (fromMatch) candidates.push(fromMatch[1]!);
          if (toMatch) candidates.push(toMatch[1]!);
        }
        if (candidates.length === 0) continue;
        let endValue: string;
        const numCandidates = candidates
          .map((c) => ({ raw: c, num: Number(c) }))
          .filter((c) => Number.isFinite(c.num));
        const isLengthAttr =
          attrName === 'stroke-dashoffset' || attrName === 'stroke-dasharray';
        const isOpacityAttr =
          attrName === 'opacity' ||
          attrName === 'fill-opacity' ||
          attrName === 'stroke-opacity';
        if (isLengthAttr && numCandidates.length > 0) {
          // Smallest dashoffset = most stroke visible.
          numCandidates.sort((a, b) => a.num - b.num);
          endValue = numCandidates[0]!.raw;
        } else if (isOpacityAttr && numCandidates.length > 0) {
          // Largest opacity = most visible.
          numCandidates.sort((a, b) => b.num - a.num);
          endValue = numCandidates[0]!.raw;
        } else {
          endValue = candidates[candidates.length - 1]!;
        }
        const escName = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const replaceRe = new RegExp(`\\s${escName}\\s*=\\s*["'][^"']*["']`);
        if (replaceRe.test(parentAttrs)) {
          parentAttrs = parentAttrs.replace(
            replaceRe,
            ` ${attrName}="${endValue}"`
          );
        } else {
          parentAttrs = `${parentAttrs} ${attrName}="${endValue}"`;
        }
      }
      return `<${tag}${parentAttrs}></${tag}>`;
    });
    if (!changed) break;
    safety += 1;
  }
  return out;
}

/**
 * Try to split an inverse-mask body into primary + secondary virtual
 * bodies based on per-element opacity / luminance inside the mask.
 *
 * Detects the lets-icons `*-duotone-line` family pattern:
 *
 *   <defs><mask id="X">
 *     <g fill="none" stroke-width="1.2">
 *       <circle stroke="silver" stroke-opacity=".25"/>  <!-- faint hint -->
 *       <path   stroke="#fff" d="..."/>                  <!-- bold fg   -->
 *     </g>
 *   </mask></defs>
 *   <path fill="currentColor" d="M0 0hWvHH0z" mask="url(#X)"/>
 *
 * The mask carrier rect is a viewBox-sized stamp; the actual icon is
 * painted by the elements INSIDE the mask. We classify each element by
 * effective luminance vs white background — `stroke-opacity<1` OR a
 * light-grey colour keyword/hex (`silver`, `#aaa`–`#eee`) marks the
 * element as faint, otherwise it's opaque. If we end up with at least
 * one element in each bucket, return:
 *   - `primary`   = opaque elements only, normalised to `currentColor`
 *   - `secondary` = faint elements only, normalised to `currentColor`
 *                   with `*-opacity` attributes stripped
 *
 * Both bodies preserve the mask's `<g>` wrapper attrs (stroke-width,
 * fill="none" etc.) so the geometry traces correctly downstream.
 *
 * Returns null if the pattern doesn't match or only one luminance
 * bucket is populated (the body is single-tone — caller should fall
 * back to the normal flattening path).
 */
export function trySplitMaskInternalBody(
  body: string
): { primary: string; secondary: string } | null {
  if (!bodyUsesMaskPattern(body)) return null;
  // Extract the <mask>...</mask> block content.
  const maskMatch = body.match(
    /<defs[^>]*>[\s\S]*?<mask\s+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/mask>[\s\S]*?<\/defs>/
  );
  if (!maskMatch) return null;
  const maskInner = maskMatch[2]!;
  // Confirm the carrier path references this mask. We don't actually use
  // the carrier — it's just a viewBox-sized rect.
  if (!new RegExp(`mask=["']url\\(#${maskMatch[1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)["']`).test(body)) {
    return null;
  }
  // Optional outer <g attrs>...</g> wrapper inside the mask.
  let groupAttrs = '';
  let inner = maskInner;
  const groupMatch = maskInner.match(/^\s*<g\b([^>]*)>([\s\S]*?)<\/g>\s*$/);
  if (groupMatch) {
    groupAttrs = groupMatch[1]!;
    inner = groupMatch[2]!;
  }
  // Self-closing elements inside the mask. Anything with children (nested
  // <g>, <path>...</path>, etc.) falls through to the existing whole-mask
  // rasterize path — too risky to mis-classify.
  const ELEMENT_RE =
    /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^/>]*?)\/>/g;
  const opaqueEls: string[] = [];
  const faintEls: string[] = [];
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let consumedAll = true;
  while ((m = ELEMENT_RE.exec(inner)) !== null) {
    const gap = inner.slice(lastIndex, m.index);
    if (gap.trim().length > 0) {
      consumedAll = false;
      break;
    }
    lastIndex = ELEMENT_RE.lastIndex;
    const [, tag, attrs] = m;
    const a = attrs!;
    const hasFaintOpacity =
      /\s(?:stroke-opacity|fill-opacity|opacity)\s*=\s*["'](?:0?\.\d+|0)["']/.test(a);
    const strokeMatch = a.match(/\sstroke\s*=\s*["']([^"']+)["']/);
    const fillMatch = a.match(/\sfill\s*=\s*["']([^"']+)["']/);
    // "Faint colour" classification — light-grey colours that fade against
    // the canonical white-background trace canvas, but EXCLUDING pure
    // white (#fff / "white") because inside a mask "#fff" semantically
    // means "fully visible" — it's the BOLD foreground signal.
    const isLightColor = (raw: string | undefined): boolean => {
      if (!raw) return false;
      const v = raw.toLowerCase();
      if (v === 'white' || v === '#fff' || v === '#ffffff') return false;
      if (v === 'silver' || v === 'lightgray' || v === 'lightgrey' || v === 'gainsboro') {
        return true;
      }
      // 3-digit hex (#abc, #ddd, …) — light if all channels ≥ 0xa AND
      // the value isn't pure white (already excluded above).
      const m3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
      if (m3) {
        const r = parseInt(m3[1]!, 16);
        const g = parseInt(m3[2]!, 16);
        const b = parseInt(m3[3]!, 16);
        return r >= 0xa && g >= 0xa && b >= 0xa;
      }
      // 6-digit hex — light if all channels ≥ 0xa0, again excluding
      // pure white via the equality guard above.
      const m6 = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
      if (m6) {
        const r = parseInt(m6[1]!, 16);
        const g = parseInt(m6[2]!, 16);
        const b = parseInt(m6[3]!, 16);
        return r >= 0xa0 && g >= 0xa0 && b >= 0xa0;
      }
      return false;
    };
    const lightStroke = isLightColor(strokeMatch?.[1]);
    const lightFill = isLightColor(fillMatch?.[1]);
    const isFaint = hasFaintOpacity || lightStroke || lightFill;
    // Strip per-element colours + opacities — both layers render through
    // `currentColor` at consumer side. Preserve geometry + stroke-width.
    const normalised = a
      .replace(/\s(?:stroke|fill)\s*=\s*["'][^"']*["']/g, '')
      .replace(
        /\s(?:stroke-opacity|fill-opacity|opacity)\s*=\s*["'][^"']*["']/g,
        ''
      );
    const out = `<${tag}${normalised}/>`;
    if (isFaint) faintEls.push(out);
    else opaqueEls.push(out);
  }
  if (inner.slice(lastIndex).trim().length > 0) consumedAll = false;
  if (!consumedAll) return null;
  if (faintEls.length === 0 || opaqueEls.length === 0) return null;

  // Strip any per-mask `fill`/`stroke`/`stroke-opacity` from the group
  // attrs — let `currentColor` (set by the consumer at render time) flow
  // through. Preserve `stroke-width`, `stroke-linecap`, etc.
  const cleanedGroupAttrs = groupAttrs
    .replace(/\s(?:stroke|fill)\s*=\s*["'][^"']*["']/g, '')
    .replace(
      /\s(?:stroke-opacity|fill-opacity|opacity)\s*=\s*["'][^"']*["']/g,
      ''
    );
  const wrap = (els: string[]): string =>
    `<g${cleanedGroupAttrs} stroke="currentColor" fill="none">${els.join('')}</g>`;
  return {
    primary: wrap(opaqueEls),
    secondary: wrap(faintEls),
  };
}

/**
 * Sample-based per-set paint-order signal. Mirrors `rasterFillSignal`
 * but for the multi-fill failure mode. Surfaced in the audit report so
 * we can spot packs that ship a lot of multicolor logos.
 */
export function paintOrderSignal(
  icons: readonly ResolvedIcon[],
  sampleSize = 25
): PaintOrderReason {
  const sample = icons.slice(0, sampleSize);
  if (sample.length === 0) return { paintOrderRatio: 0 };
  let n = 0;
  for (const ic of sample) {
    if (isPaintOrderRiskBody(ic.body)) n += 1;
  }
  return { paintOrderRatio: n / sample.length };
}

/**
 * Replace every `stroke-width="…"` occurrence in an icon body with a new
 * value, leaving the rest of the body intact. Used by the multi-weight
 * synthesizer to derive thin/light/bold variants from a regular set.
 *
 * **Legacy behaviour (flat replace).** Kept as a back-compat shim and an
 * escape hatch — callers that want every layer of a multi-weight icon to
 * snap to exactly `newWidth` (e.g. tests, manual probes) still use this.
 * The production multi-weight pipeline now uses [scaleStrokeWidths] with
 * a ratio derived from the source pack's base width: that preserves per-
 * layer ratios (`<path stroke-width="2"/><path stroke-width="0.5"/>` stays
 * "thick body + thin accent" across weight variants instead of collapsing
 * both to the same `newWidth`).
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

/**
 * Scale every `stroke-width` occurrence in `body` by `ratio`, leaving the
 * rest of the body intact. Used by the multi-weight synthesizer to derive
 * proportional thin/light/bold variants from a regular set — feeding e.g.
 * `ratio = 1.0 / 2.0 = 0.5` to a Lucide icon to produce its `-thin`
 * variant. Three forms are recognised, in order of frequency:
 *
 *   1. **Attribute form on any element:** `<path stroke-width="2"/>` —
 *      the common case for Iconify stroke-only packs that carry the
 *      attribute on every leaf.
 *   2. **Attribute form on a group:** `<g stroke-width="2">…</g>` — Lucide
 *      and Tabler ship the width on the outer `<g>` and rely on SVG
 *      inheritance for every descendant. We match the attribute REGARDLESS
 *      of which element it lives on, so inherited widths scale too.
 *   3. **Inline style:** `style="…; stroke-width: 1.5; …"` — fewer packs
 *      use this form but enough that the flat regex fix was leaving them
 *      flat-replaced or unchanged.
 *
 * Per-element widths are scaled INDEPENDENTLY, so an icon with two layers
 * at `stroke-width="2"` + `stroke-width="0.5"` becomes `2*ratio` +
 * `0.5*ratio` — the thick/thin contrast survives the variant synthesis.
 * The legacy [setStrokeWidth] flattened both to the same `newWidth`,
 * destroying the layering.
 *
 * **Floor at 0.25 user-units.** TTF rasterisation collapses anything
 * thinner to an invisible hairline, so a 0.25-floor avoids the disappearing-
 * stroke failure mode where `scaleStrokeWidths(0.1)` would erase entire
 * accent layers from `-thin` variants.
 *
 * **Group inheritance injection.** If the body has any `stroke=` attribute
 * but zero `stroke-width` attributes anywhere (so neither the scaled
 * attribute walk nor the style walk fired), we inject
 * `stroke-width="<ratio>"` onto the outermost `<g>` wrapper — or wrap a
 * brand-new `<g>` around the body if no outer group exists. This ensures
 * the new ratio actually reaches the rasterizer even when the source pack
 * relied on the SVG default of 1. (A handful of packs ship strokes with
 * no explicit width because they accept the default; without injection,
 * `-thin` and `-bold` of those packs would render identically to the
 * regular weight.)
 *
 * If the body has no strokes at all (fill-only icons), the function is a
 * no-op — the multi-weight synthesizer still calls it on those bodies
 * (the variant flows through the rest of the pipeline like a normal
 * icon) but no scaling work happens.
 */
export function scaleStrokeWidths(body: string, ratio: number): string {
  if (ratio === 1) return body;
  const scale = (w: number): number => {
    if (!Number.isFinite(w)) return w;
    const scaled = w * ratio;
    // Floor at 0.25; round to 4 decimals so output is stable and small.
    const clamped = scaled < 0.25 ? 0.25 : scaled;
    return Math.round(clamped * 10000) / 10000;
  };

  let out = body;

  // 1+2. Attribute form. The regex is element-agnostic: it matches the
  // attribute on `<path>`, `<g>`, `<rect>`, or anywhere else. Group
  // inheritance handles itself naturally — descendants inherit from the
  // group, so scaling the group's attribute propagates.
  out = out.replace(
    /stroke-width\s*=\s*["']([^"']+)["']/g,
    (_full, raw: string) => {
      const w = parseFloat(raw);
      if (!Number.isFinite(w)) return _full;
      return `stroke-width="${scale(w)}"`;
    }
  );

  // 3. Inline style. Walk every `style="…"` attribute and replace
  // `stroke-width:<n>` inside it (semicolon-delimited or end-of-string).
  out = out.replace(
    /style\s*=\s*"([^"]*)"/g,
    (full, css: string) => {
      if (!/stroke-width\s*:/i.test(css)) return full;
      const next = css.replace(
        /(\bstroke-width\s*:\s*)(-?\d+(?:\.\d+)?|\.\d+)/gi,
        (_m, head: string, num: string) => {
          const w = parseFloat(num);
          if (!Number.isFinite(w)) return _m;
          return `${head}${scale(w)}`;
        }
      );
      return `style="${next}"`;
    }
  );

  out = out.replace(
    /style\s*=\s*'([^']*)'/g,
    (full, css: string) => {
      if (!/stroke-width\s*:/i.test(css)) return full;
      const next = css.replace(
        /(\bstroke-width\s*:\s*)(-?\d+(?:\.\d+)?|\.\d+)/gi,
        (_m, head: string, num: string) => {
          const w = parseFloat(num);
          if (!Number.isFinite(w)) return _m;
          return `${head}${scale(w)}`;
        }
      );
      return `style='${next}'`;
    }
  );

  // Group inheritance injection. If the body uses strokes (any `stroke=`
  // attribute present, or a stroke colour mentioned via style) but carries
  // no `stroke-width` anywhere, the source pack relied on the SVG default
  // of 1. Without injection, `-thin` / `-bold` variants of those packs
  // would render identically to the regular weight.
  const hasStrokeAttr = /\bstroke\s*=\s*["'][^"']+["']/.test(out);
  const hasStrokeStyle = /\bstroke\s*:\s*[^;"'\s]+/.test(out);
  const hasStrokeWidth = /\bstroke-width\s*[=:]/.test(out);
  if ((hasStrokeAttr || hasStrokeStyle) && !hasStrokeWidth) {
    const injectedWidth = scale(1);
    // If there's already an outer `<g …>`, inject the attribute into its
    // opening tag. Otherwise, wrap the whole body in a `<g
    // stroke-width="…">`.
    const outerGroupMatch = out.match(/^\s*<g\b([^>]*)>([\s\S]*)<\/g>\s*$/);
    if (outerGroupMatch) {
      const attrs = outerGroupMatch[1]!;
      const inner = outerGroupMatch[2]!;
      out = `<g${attrs} stroke-width="${injectedWidth}">${inner}</g>`;
    } else {
      out = `<g stroke-width="${injectedWidth}">${out}</g>`;
    }
  }

  return out;
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

// Matches `opacity`, `fill-opacity`, or `stroke-opacity` with a value < 1.
// Google Material Icons (`ic`) ships the "translucent" half of its bodies
// via `fill-opacity=".3"` (e.g. `baseline-battery-90`) rather than the bare
// `opacity` attribute Phosphor / Solar use. Both spellings are valid SVG
// duotone signals and must trigger the same primary/secondary split. The
// leading word boundary `\b` matches in both cases (the `-` before
// `opacity` in `fill-opacity` is a non-word char, so `\b` still triggers).
const OPACITY_LT_ONE_RE =
  /\b(?:fill-opacity|stroke-opacity|opacity)\s*=\s*["'](?:0?\.\d+|0)["']/;

/**
 * Returns true if `body` contains at least one element with `opacity`,
 * `fill-opacity`, or `stroke-opacity` less than 1 — i.e. it visually
 * layers a darker primary over a translucent secondary. This is the
 * Iconify convention for duotone (Phosphor uses `opacity`, IC uses
 * `fill-opacity`, Solar uses both depending on variant).
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

  // Parse the body into a DOM tree. The synthetic <svg> wrapper from
  // `parseBody` is just a stable root; its children are the body's
  // top-level nodes. We use AST-driven iteration instead of the old regex
  // walk to handle three patterns that the regex silently dropped:
  //   1. Mixed self-closing + non-self-closing siblings (the regex bailed
  //      to "whole-body-primary" on any gap).
  //   2. `<defs>` + `<use>` references (solar `home-bold-duotone` etc.) —
  //      `<defs>` blocks are preserved in BOTH output bodies; `<use>` is
  //      treated like a paintable leaf.
  //   3. Nested `<g opacity=".5">...</g>` sibling groups — the whole group
  //      now correctly routes to secondary.
  const root = parseBody(body);

  // Optional single outer <g> wrap (Phosphor / IC: the whole body is a
  // single `<g fill="currentColor">…</g>`). When that's the case, treat
  // the inner of the group as the iteration target and re-wrap each
  // output body in the same group attrs.
  let walkRoot: Element = root;
  let groupAttrs: Record<string, string> = {};
  let hasOuterGroup = false;
  const topLevelEls = directElementChildren(root);
  if (
    topLevelEls.length === 1 &&
    topLevelEls[0]!.name === 'g' &&
    onlyElementsOrWhitespace(root)
  ) {
    const outer = topLevelEls[0]!;
    // The outer group itself carrying opacity<1 isn't a wrapper — it's a
    // single faded layer. Treat that body as non-splittable so we fall
    // back to the regex-era "whole body as primary" behaviour (existing
    // test: `<g opacity=".5"><path d="M0 0"/></g>` returns no split).
    const outerOpacity =
      outer.attribs.opacity ??
      outer.attribs['fill-opacity'] ??
      outer.attribs['stroke-opacity'];
    if (outerOpacity === undefined || parseFloat(outerOpacity) >= 1) {
      walkRoot = outer;
      groupAttrs = { ...outer.attribs };
      hasOuterGroup = true;
    }
  }

  // Does the outer `<g>` wrapper paint via stroke / fill? Used to decide
  // whether a per-element fill-opacity also strips the element's stroke
  // (no — stroke comes from the parent and is at full strength) vs. its
  // fill (yes — that's the faint half).
  const groupHasStroke = isVisiblePaint(groupAttrs.stroke);
  const groupHasFill = isVisiblePaint(groupAttrs.fill);

  const primaryEls: Element[] = [];
  const secondaryEls: Element[] = [];
  // `<defs>` blocks contain reusable shapes referenced via `<use href=...>`.
  // They paint nothing on their own and must be PRESENT in both output
  // bodies (otherwise `<use>` references break). Solar's `home-bold-duotone`
  // is the canonical example: a single `<defs>` then mixed primary/secondary
  // siblings.
  const defsEls: Element[] = [];

  for (const child of directElementChildren(walkRoot)) {
    if (child.name === 'defs') {
      defsEls.push(child);
      continue;
    }
    // Per-element opacity attribute, in priority `opacity` → `fill-opacity`
    // → `stroke-opacity`. Matches the existing regex's `opacityMatch[0]`
    // semantics (first occurrence in attribute order wins; per-fill /
    // per-stroke variants are detected via `opacityKind`).
    const opacityAttr = pickOpacityAttribute(child);
    if (opacityAttr === null || parseFloat(opacityAttr.value) >= 1) {
      primaryEls.push(child);
      continue;
    }
    if (!isPaintableLeaf(child)) {
      // The element has an opacity<1 but it's not a leaf primitive (e.g.
      // a `<g opacity=".5"><use/></g>` secondary group, as in Solar's
      // bold-duotone variants). Strip the faded opacity attributes from
      // the whole subtree and route it to secondary in one piece — the
      // regex pipeline couldn't see inside this node at all.
      const clone = deepClone(child);
      stripOpacityAttrsDeep(clone);
      secondaryEls.push(clone);
      continue;
    }
    // Leaf-with-per-attribute-fade case. Same logic as the regex
    // implementation; preserved to keep byte-identical output for the
    // lets-icons `*-duotone-line` family and IC battery / signal-bars.
    const ownFillStr = getAttrLower(child, 'fill');
    const ownStrokeStr = getAttrLower(child, 'stroke');
    const ownFillNone =
      ownFillStr !== undefined && paintValueIsNoInk(ownFillStr);
    const ownStrokeNone =
      ownStrokeStr !== undefined && paintValueIsNoInk(ownStrokeStr);
    const ownFillVisible =
      ownFillStr !== undefined && !ownFillNone && !ownFillStr.startsWith('url(');
    const ownStrokeVisible =
      ownStrokeStr !== undefined && !ownStrokeNone && !ownStrokeStr.startsWith('url(');
    const hasFill = !ownFillNone && (ownFillVisible || groupHasFill);
    const hasStroke = !ownStrokeNone && (ownStrokeVisible || groupHasStroke);
    if (opacityAttr.kind === 'fill' && hasStroke && hasFill) {
      // Faint fill on top of a strong stroke → ring goes to primary,
      // faded fill to secondary. lets-icons:alarmclock-duotone-line
      // (silver-ish ring + faint dial) shipped without a visible ring
      // before this split because the whole circle landed in secondary
      // and rasterize-trace collapsed stroke+fill into a solid disc.
      const primaryCopy = cloneShallow(child);
      const secondaryCopy = cloneShallow(child);
      stripOpacityAttrs(primaryCopy);
      stripOpacityAttrs(secondaryCopy);
      setAttr(primaryCopy, 'fill', 'none');
      setAttr(secondaryCopy, 'stroke', 'none');
      primaryEls.push(primaryCopy);
      secondaryEls.push(secondaryCopy);
    } else if (opacityAttr.kind === 'stroke' && hasStroke && hasFill) {
      // Symmetric case — fill stays strong, stroke is the faint hint.
      const primaryCopy = cloneShallow(child);
      const secondaryCopy = cloneShallow(child);
      stripOpacityAttrs(primaryCopy);
      stripOpacityAttrs(secondaryCopy);
      setAttr(primaryCopy, 'stroke', 'none');
      setAttr(secondaryCopy, 'fill', 'none');
      primaryEls.push(primaryCopy);
      secondaryEls.push(secondaryCopy);
    } else {
      // Bare `opacity=...` (fades both halves) OR the element only paints
      // via one attribute — the original whole-element split is correct.
      const secondaryCopy = cloneShallow(child);
      stripOpacityAttrs(secondaryCopy);
      secondaryEls.push(secondaryCopy);
    }
  }

  if (primaryEls.length === 0 && secondaryEls.length === 0) {
    return { primary: body, secondary: '' };
  }
  // If one bucket is empty, there's nothing to split (it's a single-layer
  // icon, possibly with all-faded content). Match the existing fallthrough.
  if (primaryEls.length === 0 || secondaryEls.length === 0) {
    return { primary: body, secondary: '' };
  }

  const wrap = (els: Element[]): string => {
    if (els.length === 0) return '';
    // `<defs>` always comes first in both bodies so `<use>` references
    // are resolvable in document order.
    const ordered = [...defsEls, ...els];
    if (hasOuterGroup) {
      const wrapper = makeGroup(groupAttrs, ordered);
      return serializeNode(wrapper);
    }
    return ordered.map((e) => serializeNode(e)).join('');
  };

  return {
    primary: wrap(primaryEls),
    secondary: wrap(secondaryEls),
  };
}

/**
 * True if a paint attribute string represents an actually-visible colour
 * (i.e. NOT `none`, missing, or a gradient/pattern url). Used to decide
 * whether a parent group contributes visible paint to its children when
 * they declare a per-attribute fade (`fill-opacity` vs `stroke-opacity`).
 */
function isVisiblePaint(value: string | undefined): boolean {
  if (value === undefined) return false;
  if (paintValueIsNoInk(value)) return false;
  if (value.trim().toLowerCase().startsWith('url(')) return false;
  return true;
}

/**
 * Identify the dominant opacity-style attribute on a leaf element. Returns
 * the attribute kind + numeric-string value, or `null` when no fade is
 * present. Bare `opacity` wins over `fill-opacity` / `stroke-opacity` when
 * multiple are set, mirroring the regex's first-match-wins behaviour on
 * source order (since SVG element attribute order is `opacity` first by
 * convention in Iconify bodies).
 */
function pickOpacityAttribute(
  el: Element
): { kind: 'all' | 'fill' | 'stroke'; value: string } | null {
  // Match the regex's preference: it scanned the attribute string in order
  // and took the FIRST hit. In htmlparser2 we get attribs as a Record but
  // its iteration order matches the source. Walk insertion order to honour
  // that.
  for (const key of Object.keys(el.attribs)) {
    if (key === 'opacity') {
      return { kind: 'all', value: el.attribs[key]! };
    }
    if (key === 'fill-opacity') {
      return { kind: 'fill', value: el.attribs[key]! };
    }
    if (key === 'stroke-opacity') {
      return { kind: 'stroke', value: el.attribs[key]! };
    }
  }
  return null;
}

/** Strip every opacity-style attribute from an element (shallow). */
function stripOpacityAttrs(el: Element): void {
  deleteAttr(el, 'opacity');
  deleteAttr(el, 'fill-opacity');
  deleteAttr(el, 'stroke-opacity');
}

/** Strip every opacity-style attribute throughout an element subtree. */
function stripOpacityAttrsDeep(el: Element): void {
  stripOpacityAttrs(el);
  for (const child of el.children) {
    if (isTag(child)) stripOpacityAttrsDeep(child);
  }
}

/**
 * Deep-clone an element subtree. `domhandler`'s built-in helpers are
 * shallow, so we recurse manually. Used to clone secondary-layer subtrees
 * before stripping opacity (we don't want to mutate the document's
 * original tree, in case the caller still holds a reference).
 */
function deepClone(el: Element): Element {
  const copy = new Element(el.name, { ...el.attribs }, []);
  for (const child of el.children) {
    if (isTag(child)) {
      const childCopy = deepClone(child);
      childCopy.parent = copy;
      copy.children.push(childCopy);
    }
    // Text / comment children are dropped — Iconify bodies don't carry
    // meaningful text content in element subtrees (whitespace only).
  }
  return copy;
}

// ============================================================================
// Colour-mapped pack preprocess
// ============================================================================
//
// A few Iconify packs carry meaning through STROKE colour rather than fill:
// the Catppuccin set, for instance, tints each icon with a Catppuccin
// palette accent (`#cad3f5`, `#c6a0f6`, `#f5a97f`, …) instead of relying
// on the consumer's `currentColor`. svgicons2svgfont ignores `stroke` at
// build time (strokes have zero width in TTF), so the pipeline routes
// stroke-only packs through `oslllo-svg-fixer`'s rasterize+Potrace pass.
//
// That works ONLY when the rasterised pixels contrast against the
// (transparent → white) background. Catppuccin's light bluish-purple
// `#cad3f5` is nearly invisible on white, so Potrace traces an EMPTY
// path and the resulting glyph ships as nothing — `iconifyx_catppuccin`
// shipped with empty glyphs for ~659 icons.
//
// Fix: before stroke-fill, normalise every concrete colour to
// `currentColor`. The downstream rasteriser then sees an unambiguous
// black-on-transparent shape, Potrace traces it correctly, and the
// glyph ships filled. For icons that originally used TWO distinct
// colours (Catppuccin's "color-coded" two-tone icons — 282 of them),
// we additionally split into duotone primary/secondary by colour
// before normalising; both halves go through stroke-fill separately
// and ship as `IconifyIconData.duo(...)`. Three-or-more-colour icons
// flatten to a single layer (the meaning was visual hierarchy, not
// distinct paths).

const PAINT_ATTRS = ['fill', 'stroke'] as const;

/**
 * Extract every concrete colour used in `body`'s `fill="..."` and
 * `stroke="..."` attributes (excluding `none`, `transparent`,
 * `currentColor`, and `url(#...)` paint-server references). Both
 * inline-style and attribute forms are recognised.
 */
export function extractConcreteColors(body: string): Set<string> {
  const colors = new Set<string>();
  for (const attr of PAINT_ATTRS) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]!.trim().toLowerCase();
      if (isNonConcretePaint(raw)) continue;
      colors.add(raw);
    }
  }
  return colors;
}

/**
 * Replace every concrete `fill="..."` / `stroke="..."` with
 * `currentColor`. Preserves `none`, `transparent`, `currentColor`, and
 * `url(#...)` references untouched (those are structural, not paint
 * intent). Used by the colour-mapped pack preprocess so the rasteriser
 * sees high-contrast geometry regardless of the source palette.
 */
export function normalizeColorsToCurrentColor(body: string): string {
  let out = body;
  for (const attr of PAINT_ATTRS) {
    out = out.replace(
      new RegExp(`(\\b${attr}\\s*=\\s*["'])([^"']*)(["'])`, 'g'),
      (_full, lead, value, tail) => {
        const v = (value as string).trim().toLowerCase();
        if (isNonConcretePaint(v)) {
          return `${lead}${value}${tail}`;
        }
        return `${lead}currentColor${tail}`;
      }
    );
  }
  return out;
}

/**
 * Group `body`'s top-level self-closing children by their paint colour
 * (fill OR stroke, whichever has a concrete value on the element or its
 * single `<g>` wrapper). Returns `null` if the body cannot be cleanly
 * parsed into self-closing elements, OR if it does not have **exactly
 * two** distinct concrete colours.
 *
 * Used by the colour-mapped preprocess for two-tone Catppuccin icons
 * like `angular` (red + light-purple). The first colour encountered in
 * source order becomes the primary layer; the second becomes the
 * secondary. Both layers have their paint attributes normalised to
 * `currentColor`.
 */
export function trySplitTwoStrokeColorBody(
  body: string
): { primary: string; secondary: string } | null {
  const colors = extractConcreteColors(body);
  if (colors.size !== 2) return null;

  // Optional single outer <g attrs>…</g> wrap.
  const groupMatch = body.match(/^\s*<g\b([^>]*)>([\s\S]*?)<\/g>\s*$/);
  let groupAttrs = '';
  let inner = body;
  if (groupMatch) {
    groupAttrs = groupMatch[1]!;
    inner = groupMatch[2]!;
  }
  // Inherited paint on the wrapper, if any.
  const inheritedFill = groupAttrs
    .match(/\bfill\s*=\s*["']([^"']+)["']/)?.[1]
    ?.toLowerCase();
  const inheritedStroke = groupAttrs
    .match(/\bstroke\s*=\s*["']([^"']+)["']/)?.[1]
    ?.toLowerCase();
  // Strip concrete paint values from the wrapper — children carry their
  // own normalised paint after this transform.
  const groupAttrsClean = normalizeColorsToCurrentColor(groupAttrs);

  const ELEMENT_RE =
    /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*?)\/>/g;
  const primaryEls: string[] = [];
  const secondaryEls: string[] = [];
  let firstColor: string | null = null;

  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let consumedAll = true;
  while ((m = ELEMENT_RE.exec(inner)) !== null) {
    const gap = inner.slice(lastIndex, m.index);
    if (gap.trim().length > 0) {
      consumedAll = false;
      break;
    }
    lastIndex = ELEMENT_RE.lastIndex;
    const [, tag, attrs] = m;
    const elFill = attrs!.match(/\bfill\s*=\s*["']([^"']+)["']/)?.[1];
    const elStroke = attrs!.match(/\bstroke\s*=\s*["']([^"']+)["']/)?.[1];
    const paint = (
      pickConcrete(elStroke) ??
      pickConcrete(elFill) ??
      (inheritedStroke ? pickConcrete(inheritedStroke) : undefined) ??
      (inheritedFill ? pickConcrete(inheritedFill) : undefined)
    );
    if (paint === undefined) {
      // Element has no resolvable concrete colour — can't bucket.
      consumedAll = false;
      break;
    }
    if (firstColor === null) firstColor = paint;
    const normalisedAttrs = normalizeColorsToCurrentColor(attrs!);
    const el = `<${tag}${normalisedAttrs}/>`;
    if (paint === firstColor) primaryEls.push(el);
    else secondaryEls.push(el);
  }
  if (inner.slice(lastIndex).trim().length > 0) consumedAll = false;
  if (
    !consumedAll ||
    primaryEls.length === 0 ||
    secondaryEls.length === 0
  ) {
    return null;
  }

  const wrap = (els: string[]): string => {
    if (els.length === 0) return '';
    if (groupAttrsClean.trim().length > 0) {
      return `<g${groupAttrsClean}>${els.join('')}</g>`;
    }
    return els.join('');
  };
  return { primary: wrap(primaryEls), secondary: wrap(secondaryEls) };
}

function pickConcrete(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (isNonConcretePaint(v)) return undefined;
  return v;
}
