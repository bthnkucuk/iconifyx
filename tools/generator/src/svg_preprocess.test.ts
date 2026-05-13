import { expect, test, describe } from 'bun:test';
import { isDuotoneBody, splitDuotoneBody } from './svg_preprocess.ts';

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
