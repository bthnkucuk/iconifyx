import { expect, test, describe } from 'bun:test';
import {
  isDuotoneBody,
  splitDuotoneBody,
  isPaintOrderRiskBody,
  paintOrderSignal,
  trySplitTwoColorBody,
  scaleStrokeWidths,
  setStrokeWidth,
  strokeIsFillLike,
  maxStrokeWidth,
  iconNeedsRasterTrace,
} from './svg_preprocess.ts';
import { parseBody, directElementChildren } from './dom.ts';
import type { ResolvedIcon } from './load_iconify.ts';

describe('isDuotoneBody', () => {
  test('detects opacity < 1', () => {
    expect(isDuotoneBody(`<path opacity=".2" d="M0 0"/>`)).toBe(true);
    expect(isDuotoneBody(`<path opacity="0.5" d="M0 0"/>`)).toBe(true);
    expect(isDuotoneBody(`<path opacity="0" d="M0 0"/>`)).toBe(true);
  });

  test('returns false for full opacity bodies', () => {
    expect(isDuotoneBody(`<path d="M0 0"/>`)).toBe(false);
    expect(isDuotoneBody(`<path opacity="1" d="M0 0"/>`)).toBe(false);
  });
});

describe('splitDuotoneBody', () => {
  test('Phosphor-style group wrap', () => {
    const body =
      `<g fill="currentColor">` +
      `<path d="M216 112v16Z" opacity=".2"/>` +
      `<path d="M232 104a56Z"/>` +
      `</g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(`<g fill="currentColor"><path d="M232 104a56Z"/></g>`);
    expect(secondary).toBe(`<g fill="currentColor"><path d="M216 112v16Z"/></g>`);
  });

  test('Solar-style flat paths', () => {
    const body =
      `<path fill="currentColor" d="M12 22Z" opacity=".5"/>` +
      `<path fill="currentColor" d="M19 7Z"/>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(`<path fill="currentColor" d="M19 7Z"/>`);
    expect(secondary).toBe(`<path fill="currentColor" d="M12 22Z"/>`);
  });

  test('non-duotone body returns primary=body, secondary=""', () => {
    const body = `<path d="M0 0"/>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(body);
    expect(secondary).toBe('');
  });

  test('multiple secondary paths', () => {
    const body =
      `<path d="M0 0" opacity=".2"/>` +
      `<path d="M1 1" opacity=".2"/>` +
      `<path d="M2 2"/>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(`<path d="M2 2"/>`);
    expect(secondary).toBe(`<path d="M0 0"/><path d="M1 1"/>`);
  });

  test('falls back to whole body when format is unrecognized', () => {
    // Nested <g> with opacity — we don't try to descend into it.
    const body = `<g opacity=".5"><path d="M0 0"/></g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    // Not in the simple shape we handle; we conservatively return the whole
    // body as primary. Caller will treat it as a non-duotone icon.
    expect(primary).toBe(body);
    expect(secondary).toBe('');
  });
});

describe('isPaintOrderRiskBody', () => {
  test('flags `logos:adobe-after-effects` style (rect + path, distinct colors)', () => {
    const body =
      `<rect width="256" height="249.6" fill="#00005b" rx="42.5"/>` +
      `<path fill="#99f" d="M102 149H63"/>`;
    expect(isPaintOrderRiskBody(body)).toBe(true);
  });

  test('does not flag single-fill currentColor (regular Iconify icon)', () => {
    expect(
      isPaintOrderRiskBody(`<path fill="currentColor" d="M0 0"/>`)
    ).toBe(false);
  });

  test('does not flag a body with only one concrete fill color', () => {
    const body =
      `<path fill="#ff0000" d="M0 0"/>` +
      `<path fill="#FF0000" d="M1 1"/>` +
      `<path fill="none" d="M2 2"/>`;
    expect(isPaintOrderRiskBody(body)).toBe(false);
  });

  test('ignores `url(#...)` paint-server references', () => {
    // Gradient/pattern references aren't comparable monochrome colors so we
    // don't count them. The pre-validator drops <linearGradient>/etc anyway.
    const body =
      `<path fill="url(#a)" d="M0 0"/>` +
      `<path fill="#00f" d="M1 1"/>`;
    expect(isPaintOrderRiskBody(body)).toBe(false);
  });

  test('detects fill colors set via `style="fill:..."` (Solar, IC variants)', () => {
    const body =
      `<path style="fill:#fff" d="M0 0"/>` +
      `<path style="fill:#000" d="M1 1"/>`;
    expect(isPaintOrderRiskBody(body)).toBe(true);
  });

  test('treats `currentColor` and `transparent` as non-concrete', () => {
    const body =
      `<path fill="currentColor" d="M0 0"/>` +
      `<path fill="transparent" d="M1 1"/>` +
      `<path fill="#ff0" d="M2 2"/>`;
    expect(isPaintOrderRiskBody(body)).toBe(false);
  });
});

// ============================================================================
// AST-migration recovered patterns
// ============================================================================
// These tests cover patterns the original regex-driven walk silently dropped
// (the body fell through as "not duotone" / "not two-color" and ended up
// going to single-layer or paint-order-drop). The AST walk recovers them.

describe('splitDuotoneBody — AST-recovered patterns', () => {
  test('nested <g opacity=".5"> sibling group routes to secondary', () => {
    // Solar / icon-park pattern: a strong path + a faded group containing
    // refs. The old regex bailed at the non-self-closing `<g>` and emitted
    // the body as primary with empty secondary.
    const body =
      `<path fill="currentColor" d="M21 11"/>` +
      `<g fill="currentColor" opacity=".5">` +
      `<path d="M10 9"/>` +
      `<path d="M14 9"/>` +
      `</g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(`<path fill="currentColor" d="M21 11"/>`);
    // Opacity is stripped from the secondary group's root; inner paths
    // are preserved as-is.
    expect(secondary).toBe(
      `<g fill="currentColor"><path d="M10 9"/><path d="M14 9"/></g>`
    );
  });

  test('<defs> + <use> pattern — defs preserved in both bodies (solar home-bold-duotone)', () => {
    // Solar `home-bold-duotone` ships a reusable <path id> in <defs>,
    // then a strong path (primary) + a <g opacity=".5"> wrapping <use>
    // refs (secondary). The regex couldn't see past the <defs> block and
    // shipped the whole body as a flat single-layer icon.
    const body =
      `<defs><path id="X" d="M10.75 9.5"/></defs>` +
      `<path fill="currentColor" d="m21.5 11.5"/>` +
      `<g fill="currentColor" opacity=".5"><use href="#X"/></g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    // Defs must appear in both outputs so <use> references resolve.
    expect(primary).toBe(
      `<defs><path id="X" d="M10.75 9.5"/></defs><path fill="currentColor" d="m21.5 11.5"/>`
    );
    expect(secondary).toBe(
      `<defs><path id="X" d="M10.75 9.5"/></defs><g fill="currentColor"><use href="#X"/></g>`
    );
  });

  test('mixed self-closing and non-self-closing siblings now split', () => {
    // A faded outer <g> next to a self-closing primary <path>. The regex
    // walk hit the non-self-closing element and bailed; AST handles both.
    const body =
      `<rect fill="currentColor" width="10" height="10"/>` +
      `<g opacity=".3"><circle r="3"/></g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(`<rect fill="currentColor" width="10" height="10"/>`);
    expect(secondary).toBe(`<g><circle r="3"/></g>`);
  });

  test('preserves existing fallback when only secondary content exists', () => {
    // Single faded element with no primary → still falls back to whole-body
    // primary (preserved regression from the regex era).
    const body = `<path opacity=".5" d="M0 0"/>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(body);
    expect(secondary).toBe('');
  });

  test('whole-body fade with no strong layer still fallthroughs (no single-layer split)', () => {
    // Solar home-bold-duotone-like body where EVERY child is faded —
    // there's no primary layer, so the whole thing is a single faded
    // icon and we should not synthesise an empty primary. Defs alone
    // don't count as primary content.
    const body =
      `<defs><path id="X" d="M0 0"/></defs>` +
      `<path opacity=".5" d="M1 1"/>` +
      `<g opacity=".5"><use href="#X"/></g>`;
    const { primary, secondary } = splitDuotoneBody(body);
    expect(primary).toBe(body);
    expect(secondary).toBe('');
  });
});

describe('trySplitTwoColorBody — AST-recovered patterns', () => {
  test('two fills wrapped in an outer <g> with non-fill attrs', () => {
    // Regression: outer group has stroke-width as well as a fill — the
    // group attrs are cleaned of `fill` / `stroke` but retain
    // stroke-width. Under §14's geometry model, each fill contribution
    // emits BOTH `fill="currentColor"` (the painted layer) AND
    // `stroke="none"` (so the geometry doesn't also pick up an
    // unrelated stroke from a sibling layer at render time).
    const body =
      `<g stroke-width="0.5" fill="#abc">` +
      `<rect width="10" height="10"/>` +
      `<path fill="#def" d="M0 0"/>` +
      `</g>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    expect(split!.primary).toBe(
      `<g stroke-width="0.5"><rect width="10" height="10" fill="currentColor" stroke="none"/></g>`
    );
    expect(split!.secondary).toBe(
      `<g stroke-width="0.5"><path d="M0 0" fill="currentColor" stroke="none"/></g>`
    );
  });

  test('refuses to split when an element is a non-leaf group', () => {
    // The two-colour split refuses when any sibling is a nested group;
    // recursive paint resolution is left to the rasterize-trace fallback.
    const body =
      `<rect fill="#000" width="10" height="10"/>` +
      `<g fill="#fff"><path d="M0 0"/></g>`;
    expect(trySplitTwoColorBody(body)).toBeNull();
  });
});

describe('scaleStrokeWidths', () => {
  test('scales every attribute occurrence proportionally', () => {
    // Lucide body uses outer-group stroke-width plus per-path overrides.
    const body =
      `<g stroke="currentColor" stroke-width="2" fill="none">` +
      `<path d="M0 0"/>` +
      `<path d="M10 10" stroke-width="0.5"/>` +
      `</g>`;
    // Ratio 0.5 → both layers halved.
    const out = scaleStrokeWidths(body, 0.5);
    expect(out).toContain('stroke-width="1"');
    expect(out).toContain('stroke-width="0.25"');
  });

  test('preserves per-layer ratios (the bug §6 fixes)', () => {
    // Source: 2:0.5 = 4:1. After ratio 1.25 (regular→bold): 2.5:0.625 = 4:1.
    // The legacy setStrokeWidth would flatten both to 1.25, destroying the
    // accent contrast.
    const body =
      `<g stroke-width="2"><path d="M0 0"/><path d="M1 1" stroke-width="0.5"/></g>`;
    const out = scaleStrokeWidths(body, 1.25);
    // Both must appear individually; ratio preserved.
    expect(out).toContain('stroke-width="2.5"');
    expect(out).toContain('stroke-width="0.625"');
  });

  test('scales inline-style stroke-width', () => {
    const body =
      `<g style="stroke: currentColor; stroke-width: 1.5; fill: none">` +
      `<path d="M0 0"/>` +
      `</g>`;
    const out = scaleStrokeWidths(body, 2 / 3);
    // 1.5 * 2/3 = 1.0
    expect(out).toMatch(/stroke-width:\s*1/);
  });

  test('handles fractional leading-dot widths', () => {
    // Some Iconify bodies write `.75` rather than `0.75`. Same regex
    // alternation pitfall as the validator's coord scanner; we make sure
    // the scaler picks these up.
    const body = `<path stroke-width=".75" d="M0 0"/>`;
    const out = scaleStrokeWidths(body, 2);
    expect(out).toContain('stroke-width="1.5"');
  });

  test('floors at 0.25 to avoid disappearing strokes', () => {
    // 0.5 * 0.1 = 0.05 → clamped to 0.25.
    const body = `<path stroke-width="0.5" d="M0 0"/>`;
    const out = scaleStrokeWidths(body, 0.1);
    expect(out).toContain('stroke-width="0.25"');
  });

  test('injects stroke-width onto outer <g> when missing but stroke is set', () => {
    // Some packs ship `<g stroke="currentColor">…</g>` with no explicit
    // stroke-width (accepting the SVG default of 1). Without injection,
    // weight variants would all render identically.
    const body =
      `<g stroke="currentColor" fill="none">` +
      `<path d="M0 0"/>` +
      `</g>`;
    const out = scaleStrokeWidths(body, 0.5);
    expect(out).toMatch(/<g[^>]*\sstroke-width="0\.5"/);
  });

  test('wraps a fresh <g> when no outer group and no stroke-width', () => {
    // Iconify bodies that ship as a flat list of leaves with stroke but
    // no group + no stroke-width still need injection.
    const body = `<path stroke="currentColor" fill="none" d="M0 0"/>`;
    const out = scaleStrokeWidths(body, 0.5);
    expect(out).toMatch(/^<g\s+stroke-width="0\.5">/);
    expect(out).toMatch(/<\/g>$/);
  });

  test('no-op when ratio is 1', () => {
    const body = `<path stroke-width="2" d="M0 0"/>`;
    expect(scaleStrokeWidths(body, 1)).toBe(body);
  });

  test('no-op when body has no strokes at all', () => {
    const body = `<path fill="currentColor" d="M0 0"/>`;
    expect(scaleStrokeWidths(body, 0.5)).toBe(body);
  });
});

describe('setStrokeWidth — legacy flat-replace behaviour preserved', () => {
  test('still does a flat replace (back-compat shim)', () => {
    // Used by tests / manual probes that want "every layer to this exact
    // value". Don't change this; the proportional path is the new code.
    const body = `<path stroke-width="2" d="M0 0"/><path stroke-width="0.5" d="M1 1"/>`;
    const out = setStrokeWidth(body, 1.5);
    expect(out).toBe(
      `<path stroke-width="1.5" d="M0 0"/><path stroke-width="1.5" d="M1 1"/>`
    );
  });
});

describe('maxStrokeWidth', () => {
  test('finds the largest attribute width', () => {
    const body = `<path stroke-width="2" d="M0 0"/><path stroke-width="5" d="M1 1"/>`;
    expect(maxStrokeWidth(body)).toBe(5);
  });

  test('considers inline-style declarations', () => {
    const body = `<path style="stroke-width: 3" d="M0 0"/>`;
    expect(maxStrokeWidth(body)).toBe(3);
  });

  test('returns 0 when no stroke-width is present', () => {
    expect(maxStrokeWidth(`<path d="M0 0"/>`)).toBe(0);
  });
});

describe('strokeIsFillLike', () => {
  test('thick stroke + concrete fill flagged as fill-like', () => {
    // 220*2 = 440 >= 1700*0.15 = 255 ✓; fill region present.
    const body =
      `<path fill="currentColor" stroke="currentColor" stroke-width="220" d="M0 0"/>`;
    expect(strokeIsFillLike(body, 1700)).toBe(true);
  });

  test('BPMN pure-outline (transparent fill) NOT flagged (safety guard)', () => {
    // BPMN's `call-activity` is `<rect fill="transparent" stroke=… stroke-width=220 …/>`.
    // The stroke is thick enough to trip the 0.15 threshold, but the fill
    // is transparent — svgicons2svgfont would ship a solid disc if we
    // skipped rasterize-trace. Safety guard kicks in and forces tracing.
    const body =
      `<rect fill="transparent" stroke="currentColor" stroke-width="220" d="M0 0"/>`;
    expect(strokeIsFillLike(body, 1700)).toBe(false);
  });

  test('Lucide-style thin strokes NOT flagged', () => {
    // Lucide ships fill=none + stroke=currentColor + stroke-width=2 inside
    // a 24-unit viewBox. The safety guard catches this — no fill region.
    const body =
      `<path fill="none" stroke="currentColor" stroke-width="2" d="M0 0"/>`;
    expect(strokeIsFillLike(body, 24)).toBe(false);
  });

  test('zero stroke-width returns false', () => {
    expect(strokeIsFillLike(`<path d="M0 0"/>`, 24)).toBe(false);
  });

  test('missing viewBox returns false', () => {
    const body = `<path fill="currentColor" stroke-width="100" d="M0 0"/>`;
    expect(strokeIsFillLike(body, undefined)).toBe(false);
  });

  test('inline-style fill also satisfies safety guard', () => {
    const body =
      `<path style="fill: currentColor; stroke: currentColor; stroke-width: 5" d="M0 0"/>`;
    expect(strokeIsFillLike(body, 24)).toBe(true);
  });
});

describe('iconNeedsRasterTrace (DOM-based)', () => {
  test('detects inherited stroke from outer group + fill=none', () => {
    // The original regex predicate missed this: leaf had no own stroke,
    // so `/stroke=/.test(body)` matched only the <g>'s attribute and
    // `!/fill=/.test(body)` flipped FALSE because of the wrapper's
    // own fill=none. AST walk resolves inheritance correctly.
    const body =
      `<g stroke="currentColor" fill="none">` +
      `<path d="M0 0Z"/>` +
      `</g>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });

  test('detects inline-style stroke (no `stroke=` attribute)', () => {
    const body = `<path style="stroke: currentColor; fill: none" d="M0 0Z"/>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });

  test('detects open paths (stroke without Z)', () => {
    // An open path with a visible stroke fills as a wrong region under
    // svgicons2svgfont's non-zero winding.
    const body = `<path stroke="currentColor" fill="none" d="M0 0L10 10"/>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });

  test('returns false for flat filled icons (no stroke anywhere)', () => {
    // Cheap fast-path bail.
    const body = `<path fill="currentColor" d="M0 0Z"/>`;
    expect(iconNeedsRasterTrace(body)).toBe(false);
  });

  test('still picks up fill-rule="evenodd"', () => {
    const body = `<path fill="currentColor" fill-rule="evenodd" d="M0 0Z"/>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });

  test('does NOT flag closed stroke + inherited fill=currentColor (true filled)', () => {
    // A leaf with a closed `Z` path inheriting a concrete fill from its
    // group AND a stroke is a filled icon with an outline. svgicons2svgfont
    // can render the filled body; we don't need to trace.
    const body =
      `<g stroke="currentColor" fill="currentColor">` +
      `<path d="M0 0L10 10L0 10Z"/>` +
      `</g>`;
    expect(iconNeedsRasterTrace(body)).toBe(false);
  });

  test('handles missing fill on leaf with fill=none on parent', () => {
    // Inherited fill=none + leaf with own stroke: classic stroke-only.
    const body =
      `<g fill="none">` +
      `<path stroke="currentColor" d="M0 0Z"/>` +
      `</g>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });

  test('handles nested groups (deep inheritance)', () => {
    // 2-level nesting; the leaf's effective paint comes from the
    // outer <g>'s fill=none + the middle <g>'s stroke=currentColor.
    const body =
      `<g fill="none">` +
        `<g stroke="currentColor">` +
          `<path d="M0 0Z"/>` +
        `</g>` +
      `</g>`;
    expect(iconNeedsRasterTrace(body)).toBe(true);
  });
});

describe('paintOrderSignal', () => {
  const mk = (body: string): ResolvedIcon => ({
    name: 't',
    body,
    width: 24,
    height: 24,
  });

  test('returns ratio of multi-fill icons in sample', () => {
    const icons: ResolvedIcon[] = [
      mk(`<path fill="currentColor" d="M0 0"/>`),
      mk(`<rect fill="#000"/><path fill="#fff"/>`),
      mk(`<path fill="#abc" d="M0 0"/>`),
      mk(`<rect fill="#f00"/><path fill="#0f0"/>`),
    ];
    expect(paintOrderSignal(icons).paintOrderRatio).toBeCloseTo(0.5);
  });

  test('zero for empty input', () => {
    expect(paintOrderSignal([]).paintOrderRatio).toBe(0);
  });
});

// ============================================================================
// §14 unified 2-paint decision tree
// ============================================================================
// These tests cover the §14 fill+stroke aware splitter and its decision
// rules: white-as-foreground override → area-leader with 1.3× gap floor →
// source-order tie-break. They also pin down the helper utilities
// (`isCanonicalWhite`, `shoelaceAreaOfPath`, `elementArea`) that feed the
// decision tree.

describe('isPaintOrderRiskBody — §14 fill+stroke aware', () => {
  test('§14: flags fill + stroke 2-paint bodies (streamline-color)', () => {
    // Before §14, this body shipped as a flat single-fill blob because
    // the old fill-only detector saw 1 fill and ignored the stroke
    // colour. The paint-aware detector now flags it for splitting.
    const body =
      `<g fill="none">` +
      `<path fill="#d7e0ff" d="M10 6a4 4 0 0 0-8 0"/>` +
      `<path stroke="#4147d5" d="M5 13.5h2"/>` +
      `</g>`;
    expect(isPaintOrderRiskBody(body)).toBe(true);
  });
});

describe('extractConcretePaints (§14 fill+stroke aware)', () => {
  test('returns single fill colour for a flat fill body', () => {
    expect(extractConcretePaints(`<path fill="#abc" d="M0 0"/>`)).toEqual(
      new Set(['#abc'])
    );
  });

  test('combines fill AND stroke into one paint set', () => {
    // streamline-color:add-bell-notification pattern — one fill colour
    // on a path, one stroke colour on another path. Old
    // extractConcreteFills only saw 1 fill; the new extractor sees 2
    // distinct paints, which is what unlocks the duotone split.
    const body =
      `<g fill="none">` +
      `<path fill="#d7e0ff" d="M10 6a4 4 0 0 0-8 0"/>` +
      `<path stroke="#4147d5" d="M5 13.5h2"/>` +
      `</g>`;
    expect(extractConcretePaints(body)).toEqual(
      new Set(['#d7e0ff', '#4147d5'])
    );
  });

  test('walks inline style="fill:…;stroke:…" forms', () => {
    const body = `<path style="fill:#abc;stroke:#def" d="M0 0"/>`;
    expect(extractConcretePaints(body)).toEqual(new Set(['#abc', '#def']));
  });

  test('excludes none / transparent / currentColor / url(#…)', () => {
    const body =
      `<path fill="none" stroke="transparent" d="M0 0"/>` +
      `<path fill="currentColor" stroke="url(#g)" d="M1 1"/>`;
    expect(extractConcretePaints(body).size).toBe(0);
  });
});

describe('isCanonicalWhite', () => {
  test('matches #fff / #ffffff / white / rgb(255,255,255)', () => {
    expect(isCanonicalWhite('#fff')).toBe(true);
    expect(isCanonicalWhite('#FFF')).toBe(true);
    expect(isCanonicalWhite('#ffffff')).toBe(true);
    expect(isCanonicalWhite('#FFFFFF')).toBe(true);
    expect(isCanonicalWhite('white')).toBe(true);
    expect(isCanonicalWhite('WHITE')).toBe(true);
    expect(isCanonicalWhite('rgb(255,255,255)')).toBe(true);
    expect(isCanonicalWhite('rgb(255, 255, 255)')).toBe(true);
  });

  test('rejects non-white colours', () => {
    expect(isCanonicalWhite('#fef')).toBe(false);
    expect(isCanonicalWhite('#000')).toBe(false);
    expect(isCanonicalWhite('whitesmoke')).toBe(false);
    expect(isCanonicalWhite('')).toBe(false);
  });
});

describe('shoelaceAreaOfPath', () => {
  test('triangle has expected area', () => {
    // Triangle (0,0)-(10,0)-(0,10) → area = 50.
    const a = shoelaceAreaOfPath('M0 0L10 0L0 10Z');
    expect(a).toBeCloseTo(50, 1);
  });

  test('unit-square via H/V commands', () => {
    const a = shoelaceAreaOfPath('M0 0H10V10H0Z');
    expect(a).toBeCloseTo(100, 1);
  });

  test('two disjoint subpaths sum their areas', () => {
    // 10×10 square + 4×4 square = 100 + 16 = 116.
    const a = shoelaceAreaOfPath('M0 0H10V10H0ZM20 20H24V24H20Z');
    expect(a).toBeCloseTo(116, 1);
  });

  test('returns 0 for unparseable / empty input', () => {
    expect(shoelaceAreaOfPath('')).toBe(0);
    expect(shoelaceAreaOfPath('not a path')).toBe(0);
  });
});

describe('elementArea', () => {
  test('rect: width × height', () => {
    expect(elementArea('rect', { width: '10', height: '5' })).toBe(50);
  });

  test('circle: π r²', () => {
    expect(elementArea('circle', { r: '3' })).toBeCloseTo(Math.PI * 9, 3);
  });

  test('ellipse: π × rx × ry', () => {
    expect(elementArea('ellipse', { rx: '4', ry: '2' })).toBeCloseTo(
      Math.PI * 8,
      3
    );
  });

  test('path: shoelace of d', () => {
    expect(elementArea('path', { d: 'M0 0H10V10H0Z' })).toBeCloseTo(100, 1);
  });

  test('polygon: shoelace of points', () => {
    expect(
      elementArea('polygon', { points: '0,0 10,0 10,10 0,10' })
    ).toBeCloseTo(100, 1);
  });

  test('line / polyline have zero ink area', () => {
    expect(
      elementArea('line', { x1: '0', y1: '0', x2: '10', y2: '10' })
    ).toBe(0);
    expect(elementArea('polyline', { points: '0,0 10,0' })).toBe(0);
  });
});

describe('trySplitTwoColorBody (§14 paint-aware split)', () => {
  test('streamline-color:add-bell-notification — fill + stroke split', () => {
    // The §14 hidden-killer case: fill colour A on one path + stroke
    // colour B on another path. Old detector saw 1 fill → no split →
    // shipped as a flat light-blue body with NO outline. New detector
    // splits along the 2 paints. Primary = fill (background, larger
    // area), secondary = stroke (outline, zero area but assigned by
    // source order tie-break since stroke comes second).
    const body =
      `<g fill="none">` +
      `<path fill="#d7e0ff" d="M0 0H10V10H0Z"/>` +
      `<path stroke="#4147d5" d="M5 13.5h2"/>` +
      `</g>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    // The fill-painted background path lives in primary; the stroke-
    // painted outline path lives in secondary.
    expect(split!.primary).toContain(`fill="currentColor"`);
    expect(split!.primary).toContain(`stroke="none"`);
    expect(split!.secondary).toContain(`stroke="currentColor"`);
    expect(split!.secondary).toContain(`fill="none"`);
  });

  test('logos:adobe-after-effects — area-leader rect → primary', () => {
    // Large dark-blue background rect (area >> path), small light-purple
    // letterform path. Area-leader wins → primary = #00005b (rect).
    const body =
      `<rect width="256" height="249.6" fill="#00005b" rx="42.5"/>` +
      `<path fill="#99f" d="M102 149H63V100H102Z"/>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    expect(split!.primary).toContain(`<rect`);
    expect(split!.secondary).toContain(`<path`);
  });

  test('cryptocurrency-color:xmr — white-as-FG override → secondary', () => {
    // Dark accent + white foreground letterform. The white path is the
    // SECONDARY regardless of source order / area; this is the §14
    // white-as-foreground rule (86 % accurate empirically). We test
    // the override directly with white appearing FIRST in source order
    // (the harder case — naive source-order would put it in primary).
    const body =
      `<path fill="#fff" d="M0 0H4V4H0Z"/>` +
      `<circle fill="#f60" cx="16" cy="16" r="16"/>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    // White must end up in secondary even though it came first.
    expect(split!.secondary).toContain(`<path`);
    expect(split!.primary).toContain(`<circle`);
  });

  test('white as second colour also lands in secondary', () => {
    const body =
      `<circle fill="#f60" cx="16" cy="16" r="16"/>` +
      `<path fill="#fff" d="M0 0H4V4H0Z"/>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    expect(split!.primary).toContain(`<circle`);
    expect(split!.secondary).toContain(`<path`);
  });

  test('source-order tie-break when no white and areas within 1.3×', () => {
    // Two paths with nearly identical area → no area-leader wins.
    // Falls through to source-order: first colour → primary.
    const body =
      `<path fill="#aaa" d="M0 0H10V10H0Z"/>` + // area 100
      `<path fill="#bbb" d="M0 0H11V10H0Z"/>`; // area 110, ratio 1.1× < 1.3×
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    // First-appearing #aaa → primary.
    expect(split!.primary).toContain(`M0 0H10V10H0Z`);
    expect(split!.secondary).toContain(`M0 0H11V10H0Z`);
    // Both layers should be normalised to currentColor.
    expect(split!.primary).toContain(`currentColor`);
    expect(split!.secondary).toContain(`currentColor`);
  });

  test('area gap above 1.3× flips assignment to area-leader', () => {
    // First colour small area, second colour large area (4× gap).
    // Without the area rule, source-order would give #f00 → primary.
    // With it, #0f0 (larger) wins primary.
    const body =
      `<path fill="#f00" d="M0 0H10V10H0Z"/>` + // area 100
      `<path fill="#0f0" d="M0 0H20V20H0Z"/>`; // area 400 (>1.3× larger)
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    // The area-leader is the second-appearing path → it should be primary.
    expect(split!.primary).toContain(`M0 0H20V20H0Z`);
    expect(split!.secondary).toContain(`M0 0H10V10H0Z`);
  });

  test('returns null for 3+ distinct colours', () => {
    const body =
      `<path fill="#f00" d="M0 0"/>` +
      `<path fill="#0f0" d="M0 0"/>` +
      `<path fill="#00f" d="M0 0"/>`;
    expect(trySplitTwoColorBody(body)).toBeNull();
  });

  test('returns null for single concrete paint', () => {
    expect(
      trySplitTwoColorBody(`<path fill="#f00" d="M0 0H10V10H0Z"/>`)
    ).toBeNull();
  });

  test('white-as-FG edge case: fill + stroke where stroke is white', () => {
    // Element with fill (non-white) and stroke (white). Both paints
    // appear; stroke-white → secondary, fill-colour → primary.
    const body =
      `<path fill="#123" stroke="#fff" d="M0 0H10V10H0Z"/>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    expect(split!.primary).toContain(`fill="currentColor"`);
    expect(split!.primary).toContain(`stroke="none"`);
    expect(split!.secondary).toContain(`stroke="currentColor"`);
    expect(split!.secondary).toContain(`fill="none"`);
  });
});
