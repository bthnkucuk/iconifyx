import { expect, test, describe } from 'bun:test';
import {
  isDuotoneBody,
  splitDuotoneBody,
  isPaintOrderRiskBody,
  paintOrderSignal,
  extractConcretePaints,
  isCanonicalWhite,
  shoelaceAreaOfPath,
  elementArea,
  trySplitTwoColorBody,
} from './svg_preprocess.ts';
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

describe('extractConcretePaints (§14 fill+stroke aware)', () => {
  test('returns single fill colour for a flat fill body', () => {
    expect(
      extractConcretePaints(`<path fill="#abc" d="M0 0"/>`)
    ).toEqual(new Set(['#abc']));
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
    expect(extractConcretePaints(body)).toEqual(
      new Set(['#abc', '#def'])
    );
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
    expect(elementArea('rect', ' width="10" height="5"')).toBe(50);
  });
  test('circle: π r²', () => {
    expect(elementArea('circle', ' r="3"')).toBeCloseTo(Math.PI * 9, 3);
  });
  test('path: shoelace of d', () => {
    expect(elementArea('path', ' d="M0 0H10V10H0Z"')).toBeCloseTo(100, 1);
  });
  test('polygon: shoelace of points', () => {
    expect(elementArea('polygon', ' points="0,0 10,0 10,10 0,10"')).toBeCloseTo(
      100,
      1
    );
  });
  test('line / polyline have zero ink area', () => {
    expect(elementArea('line', ' x1="0" y1="0" x2="10" y2="10"')).toBe(0);
    expect(elementArea('polyline', ' points="0,0 10,0"')).toBe(0);
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
    // white-as-foreground rule (86 % accurate empirically). Note: in
    // cryptocurrency-color:xmr the white path actually appears SECOND in
    // source order, so the override is consistent with source order
    // here; we test the override directly with white appearing FIRST.
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
      `<path fill="#aaa" d="M0 0H10V10H0Z"/>` +
      `<path fill="#bbb" d="M0 0H11V10H0Z"/>`; // 110 vs 100, ratio 1.1× < 1.3×
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    // First-appearing #aaa → primary.
    expect(split!.primary).toContain(`<path`);
    // Both layers should be normalised to currentColor.
    expect(split!.primary).toContain(`currentColor`);
    expect(split!.secondary).toContain(`currentColor`);
  });

  test('area gap above 1.3× flips assignment to area-leader', () => {
    // First colour small area, second colour large area (2× gap).
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
