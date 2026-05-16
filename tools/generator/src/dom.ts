/**
 * Minimal DOM helpers wrapping `htmlparser2` + `domhandler` + `dom-serializer`.
 *
 * The svg_preprocess module historically used hand-rolled regex element walks
 * to parse Iconify SVG bodies. Those regexes shipped well — they cover ~90 %
 * of bodies — but they fail silently on three patterns that real Iconify sets
 * use:
 *
 * 1. **Nested groups**: `<g opacity=".5"><path d="..."/></g>` — the regex
 *    bails at "non-self-closing element found" and the whole body falls
 *    through as primary, losing the duotone split.
 * 2. **`<defs>` + `<use>`**: Solar's `home-bold-duotone` (and ~50 others) put
 *    reusable shapes in `<defs>` and reference them via `<use xlink:href>`.
 *    The opacity regex never matches the `<use>` element so the icon ships
 *    as a single-layer silhouette.
 * 3. **Mixed self-closing + non-self-closing**: an outer `<path>...</path>`
 *    sibling next to `<rect .../>` flips the regex state machine and the
 *    whole body falls through.
 *
 * These helpers give us a structurally correct walker without pulling in
 * cheerio's full jQuery API. Total surface: parse / serialize / walk /
 * remove / set+delete attributes. Anything heavier (selector queries,
 * tree-mutation utilities) stays inline in the callers.
 *
 * Performance: ~25 µs parse + ~15 µs serialize per body on M-series. With
 * ~340 k bodies per regen this is ~14 s sequential — covered by the
 * existing worker pool (concurrency 8) and dwarfed by the rasterize-trace
 * subprocess cost (~100 µs per icon when uncached).
 */

import { parseDocument } from 'htmlparser2';
import {
  type AnyNode,
  type ChildNode,
  Element,
  isTag,
  Text,
} from 'domhandler';
import render from 'dom-serializer';

/**
 * Parse an Iconify body fragment into a root element. We wrap the fragment in
 * a synthetic `<svg>` so the parser has a stable root, then return the root
 * `<svg>` element — its `children` are the body's top-level nodes.
 *
 * Always parsed in XML mode: HTML mode would lower-case `xlink:href` and
 * apply HTML void-element rules (`<path>` would never self-close), neither
 * of which we want for SVG.
 */
export function parseBody(body: string): Element {
  const doc = parseDocument(`<svg>${body}</svg>`, { xmlMode: true });
  const root = doc.children.find((c): c is Element => isTag(c) && c.name === 'svg');
  if (!root) {
    // Shouldn't happen — even an empty fragment leaves the wrapper <svg>.
    return new Element('svg', {});
  }
  return root;
}

/**
 * Render an element's children back to an SVG body string. The element
 * itself (the synthetic `<svg>` wrapper) is NOT emitted — only its
 * descendants. Self-closing elements come out as `<path .../>` (matching
 * the regex pipeline's prior output) and attribute insertion order is
 * preserved.
 *
 * Entities are NOT re-encoded (`encodeEntities: false`); a literal `&` in
 * a path's `d` attribute already would have been a parse error upstream,
 * so the only impact is on rare URL fragments where re-encoding would
 * have introduced spurious `&amp;` sequences.
 */
export function serializeChildren(root: Element): string {
  return root.children
    .map((c) => render(c, { xmlMode: true, encodeEntities: false }))
    .join('');
}

/** Render a single node to its SVG string form. */
export function serializeNode(node: AnyNode): string {
  return render(node, { xmlMode: true, encodeEntities: false });
}

/**
 * Walk every element node in `root` (excluding the synthetic wrapper).
 * Pre-order traversal. Callers must NOT mutate `children` during the walk;
 * collect first, mutate after.
 */
export function* walkElements(root: Element): Generator<Element> {
  const stack: AnyNode[] = [...root.children];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (isTag(node)) {
      yield node;
      stack.unshift(...node.children);
    }
  }
}

/**
 * Direct (depth-1) element children, in source order. Most Iconify bodies
 * are flat: `<path/> <path/> <rect/>`. Some wrap in a single `<g>`. Splitter
 * functions iterate this list.
 */
export function directElementChildren(root: Element): Element[] {
  return root.children.filter((c): c is Element => isTag(c));
}

/**
 * Get a lower-cased attribute value or `undefined` if the attribute is
 * absent. Iconify bodies are case-sensitive but we want
 * `currentColor` == `currentcolor` for comparison purposes.
 */
export function getAttrLower(el: Element, name: string): string | undefined {
  const raw = el.attribs[name];
  if (raw === undefined) return undefined;
  return raw.trim().toLowerCase();
}

/** Get an attribute value preserving its original case + spacing. */
export function getAttr(el: Element, name: string): string | undefined {
  return el.attribs[name];
}

/**
 * Set an attribute, preserving existing insertion order if the key already
 * exists. JS object assignment to an existing key keeps its slot, so this
 * is straightforward; documented because callers may be tempted to delete +
 * re-set which WOULD reorder.
 */
export function setAttr(el: Element, name: string, value: string): void {
  el.attribs[name] = value;
}

/** Remove an attribute if present. */
export function deleteAttr(el: Element, name: string): void {
  delete el.attribs[name];
}

/**
 * Clone an element shallowly — same tag name, same attribute map. Children
 * are NOT copied (caller decides whether to reuse or reparent them).
 */
export function cloneShallow(el: Element): Element {
  return new Element(el.name, { ...el.attribs }, []);
}

/** Construct a `<g>` element with the given attributes and children. */
export function makeGroup(
  attribs: Record<string, string>,
  children: ChildNode[]
): Element {
  return new Element('g', { ...attribs }, children);
}

/** Construct a fresh leaf element with no children. */
export function makeLeaf(
  tag: string,
  attribs: Record<string, string>
): Element {
  return new Element(tag, { ...attribs }, []);
}

/**
 * True if `root` has exactly one element child and that child is a `<g>`.
 * Convenience for the duotone splitters that special-case the outer-group
 * shape.
 */
export function singleOuterGroup(root: Element): Element | null {
  const els = directElementChildren(root);
  if (els.length !== 1) return null;
  if (els[0]!.name !== 'g') return null;
  // Any non-whitespace text siblings disqualify (a malformed body that we
  // don't want to silently reorder).
  for (const sibling of root.children) {
    if (sibling instanceof Text && sibling.data.trim().length > 0) return null;
  }
  return els[0]!;
}

/**
 * Check whether `root`'s direct children are all element nodes (any
 * whitespace text siblings are allowed). Used by splitters that bail when
 * they encounter unexpected text content (e.g. raw `<script>` blobs).
 */
export function onlyElementsOrWhitespace(root: Element): boolean {
  for (const c of root.children) {
    if (c instanceof Text) {
      if (c.data.trim().length > 0) return false;
    } else if (!isTag(c)) {
      return false;
    }
  }
  return true;
}

/**
 * Element tags we treat as paintable leaves for splitter logic. Anything
 * outside this set (defs, mask, clipPath, lineargradient, filter, etc.)
 * either contains its own children or isn't a glyph contributor.
 */
export const PAINTABLE_LEAF_TAGS = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
]);

export function isPaintableLeaf(el: Element): boolean {
  return PAINTABLE_LEAF_TAGS.has(el.name);
}
