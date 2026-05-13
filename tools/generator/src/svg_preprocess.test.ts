import { expect, test, describe } from 'bun:test';
import {
  isDuotoneBody,
  splitDuotoneBody,
  isPaintOrderRiskBody,
  paintOrderSignal,
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
