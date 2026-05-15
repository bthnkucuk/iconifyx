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
  const hasStroke = /stroke=/.test(body);
  const hasFillNone = /fill=["']?none["']?/.test(body) || !/fill=/.test(body);
  if (hasStroke && hasFillNone) return true;
  if (/fill-rule\s*=\s*["']?evenodd["']?/.test(body)) return true;
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

const FILL_ATTR_RE = /\bfill\s*=\s*["']([^"']+)["']/g;
const FILL_STYLE_RE = /\bfill\s*:\s*([^;"'\s]+)/g;

/**
 * Extract every concrete fill color appearing on elements in `body`.
 * Returns a set of lowercased color tokens. `none`, `currentColor`,
 * `transparent`, and `url(#...)` paint-server references are excluded
 * because they don't contribute to the "two fills overlap in the same
 * monochrome color" failure mode.
 */
function extractConcreteFills(body: string): Set<string> {
  const colors = new Set<string>();
  const scan = (re: RegExp): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]!.trim().toLowerCase();
      if (raw === 'none' || raw === 'transparent') continue;
      if (raw === 'currentcolor') continue;
      if (raw.startsWith('url(')) continue;
      colors.add(raw);
    }
  };
  scan(FILL_ATTR_RE);
  scan(FILL_STYLE_RE);
  return colors;
}

/**
 * Returns true if `body` is at risk of rendering as a featureless blob
 * in a monochrome TTF because it relies on >1 distinct fill color to
 * convey its meaning (i.e. paint-order layering).
 */
export function isPaintOrderRiskBody(body: string): boolean {
  return extractConcreteFills(body).size >= 2;
}

/**
 * Try to split a two-color body into a duotone primary + secondary pair.
 *
 * Many Iconify `logos` entries are exactly two colors — a background
 * shape (rounded square / circle) and a foreground letterform on top.
 * Example, `logos:adobe-after-effects`:
 *
 *   <rect fill="#00005b" rx="42.5" .../>
 *   <path fill="#99f" d="…Ae letterform…"/>
 *
 * In monochrome the foreground letter is absorbed into the background
 * fill region (same `currentColor`, non-zero winding) → the glyph
 * ships as a featureless filled square. But the source SVG ALREADY
 * draws the two layers separately, so we can route them through the
 * same Primary / Secondary font pair we already use for opacity-based
 * duotone (Phosphor `*-duotone`, Solar `*-bold-duotone`, etc.).
 *
 * **Decision rule:** the body must have exactly 2 distinct concrete
 * fills (`extractConcreteFills` excludes `none` / `currentColor` /
 * `url(#...)`). The element painting FIRST in source order is assigned
 * to the primary layer (background); the second color → secondary
 * (foreground). Both layers have their `fill` attribute normalised to
 * `currentColor` so the runtime widget's color params drive rendering.
 *
 * Returns `null` when the body can't be cleanly split (3+ colors,
 * gradients, nested groups, non-self-closing elements). Callers then
 * fall through to the paint-order drop path.
 */
export function trySplitTwoColorBody(
  body: string
): { primary: string; secondary: string } | null {
  const fills = extractConcreteFills(body);
  if (fills.size !== 2) return null;

  // Optional single outer <g attrs>…</g> wrap; preserve its non-fill attrs.
  const groupMatch = body.match(/^\s*<g\b([^>]*)>([\s\S]*?)<\/g>\s*$/);
  let groupAttrs = '';
  let inner = body;
  if (groupMatch) {
    groupAttrs = groupMatch[1]!;
    inner = groupMatch[2]!;
  }
  const inheritedFill = groupAttrs
    .match(/\bfill\s*=\s*["']([^"']+)["']/)?.[1]
    ?.toLowerCase();
  const groupAttrsClean = groupAttrs.replace(
    /\s+fill\s*=\s*["'][^"']+["']/,
    ''
  );

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
    const fillMatch = attrs!.match(/\bfill\s*=\s*["']([^"']+)["']/);
    const rawFill = (fillMatch?.[1] ?? inheritedFill ?? 'currentcolor')
      .toLowerCase()
      .trim();
    // Anything that's not one of the two concrete colors — `none`,
    // `transparent`, `currentColor`, `url(...)` — is structurally
    // ambiguous for splitting; bail.
    if (
      rawFill === 'none' ||
      rawFill === 'transparent' ||
      rawFill === 'currentcolor' ||
      rawFill.startsWith('url(')
    ) {
      consumedAll = false;
      break;
    }
    if (firstColor === null) firstColor = rawFill;
    const normalizedAttrs = fillMatch
      ? attrs!.replace(
          /\s+fill\s*=\s*["'][^"']+["']/,
          ' fill="currentColor"'
        )
      : `${attrs} fill="currentColor"`;
    const el = `<${tag}${normalizedAttrs}/>`;
    if (rawFill === firstColor) primaryEls.push(el);
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

export interface PaintOrderReason {
  /** Fraction of sampled icons whose body uses ≥2 distinct concrete fills. */
  paintOrderRatio: number;
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
    // Match `opacity`, `fill-opacity`, or `stroke-opacity` (with leading
    // whitespace). The Iconify `ic` set ships its battery / signal-bars
    // shadow halves as `fill-opacity=".3"`; without this alternation those
    // glyphs shipped as single-layer monochrome blobs.
    const opacityMatch = attrs!.match(
      /\s(?:fill-opacity|stroke-opacity|opacity)\s*=\s*["']([^"']+)["']/
    );
    if (opacityMatch && parseFloat(opacityMatch[1]!) < 1) {
      // Strip ALL opacity-style attributes from the secondary element so
      // the resulting glyph renders solid in the Secondary TTF; the
      // runtime widget controls translucency at display time via
      // `IconifyIcon.duotone(secondaryOpacity:)`.
      const stripped = attrs!.replace(
        /\s(?:fill-opacity|stroke-opacity|opacity)\s*=\s*["'][^"']+["']/g,
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
    const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]!.trim().toLowerCase();
      if (
        raw === 'none' ||
        raw === 'transparent' ||
        raw === 'currentcolor' ||
        raw.startsWith('url(')
      ) {
        continue;
      }
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
      new RegExp(`(\\b${attr}\\s*=\\s*["'])([^"']+)(["'])`, 'g'),
      (_full, lead, value, tail) => {
        const v = (value as string).trim().toLowerCase();
        if (
          v === 'none' ||
          v === 'transparent' ||
          v === 'currentcolor' ||
          v.startsWith('url(')
        ) {
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
  if (
    v === 'none' ||
    v === 'transparent' ||
    v === 'currentcolor' ||
    v.startsWith('url(')
  ) {
    return undefined;
  }
  return v;
}
