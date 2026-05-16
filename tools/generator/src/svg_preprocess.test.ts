import { expect, test, describe } from 'bun:test';
import {
  isDuotoneBody,
  splitDuotoneBody,
  isPaintOrderRiskBody,
  paintOrderSignal,
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
    // group attrs are cleaned of fill but retain stroke-width.
    const body =
      `<g stroke-width="0.5" fill="#abc">` +
      `<rect width="10" height="10"/>` +
      `<path fill="#def" d="M0 0"/>` +
      `</g>`;
    const split = trySplitTwoColorBody(body);
    expect(split).not.toBeNull();
    expect(split!.primary).toBe(
      `<g stroke-width="0.5"><rect width="10" height="10" fill="currentColor"/></g>`
    );
    expect(split!.secondary).toBe(
      `<g stroke-width="0.5"><path fill="currentColor" d="M0 0"/></g>`
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
