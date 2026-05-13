import { expect, test, describe } from 'bun:test';
import { validateIconBody } from './glyph_validator.ts';
import type { ResolvedIcon } from './load_iconify.ts';

function icon(body: string): ResolvedIcon {
  return { name: 'test', body, width: 24, height: 24 };
}

describe('validateIconBody', () => {
  test('accepts a normal lucide-style icon', () => {
    const body = `<g fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="13" r="8"/>
      <path d="M5 3L2 6m20 0l-3-3"/>
    </g>`;
    expect(validateIconBody(icon(body)).ok).toBe(true);
  });

  test('accepts a filled material-style path', () => {
    const body = `<path d="M10 20v-6h4v6h5v-8h3L12 3L2 12h3v8h5z" fill="currentColor"/>`;
    expect(validateIconBody(icon(body)).ok).toBe(true);
  });

  test('rejects path with stray r character (icon-park deer)', () => {
    const body = `<path d="M10 10 L20 20r 5 5"/>`;
    const r = validateIconBody(icon(body));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('non-standard');
  });

  test('rejects path with unknown command (line-md N)', () => {
    const body = `<path d="M0 0 N10 10 L20 20"/>`;
    const r = validateIconBody(icon(body));
    expect(r.ok).toBe(false);
  });

  test('rejects when any coord exceeds 16-bit range (wpf airplane-takeoff)', () => {
    const body = `<path d="M-16488.5 921.88 L -17155 900"/>`;
    const r = validateIconBody(icon(body));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('out of bounds');
  });

  test('accepts coords within range (viewBox-relative bound)', () => {
    // 24×24 viewBox → bound = 5*24 = 120
    const body = `<path d="M-30 -50 L 100 80"/>`;
    expect(validateIconBody(icon(body)).ok).toBe(true);
  });

  test('accepts large coords when viewBox is also large (icomoon-style 1024×1024)', () => {
    const big: ResolvedIcon = { name: 'big', body: `<path d="M512 100 L 800 1000"/>`, width: 1024, height: 1024 };
    expect(validateIconBody(big).ok).toBe(true);
  });

  test('handles single-quote d-attribute syntax', () => {
    const body = `<path d='M0 0L10 10'/>`;
    expect(validateIconBody(icon(body)).ok).toBe(true);
  });

  test('tolerates <mask> and <clipPath> (circle-flags style)', () => {
    const body = `<mask id="m0"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#m0)"><path d="M0 0h512v512H0z"/></g>`;
    // circle-flags ships at 512×512.
    const ic: ResolvedIcon = { name: 'test', body, width: 512, height: 512 };
    expect(validateIconBody(ic).ok).toBe(true);
  });

  test('rejects animated paths (line-md style)', () => {
    const body = `<path d="M5 3L2 6" stroke-dasharray="48"><animate attributeName="stroke-dashoffset" values="48;0"/></path>`;
    const r = validateIconBody(icon(body));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('<animate>');
  });

  test('rejects filter/gradient (fluent-emoji style)', () => {
    const body = `<g filter="url(#x)"><linearGradient id="x"><stop/></linearGradient><path d="M0 0"/></g>`;
    const r = validateIconBody(icon(body));
    expect(r.ok).toBe(false);
  });

  test('accepts ellipse (icon-park deer uses these)', () => {
    const body = `<ellipse cx="12" cy="12" rx="5" ry="3.5" fill="#2F88FF"/>`;
    expect(validateIconBody(icon(body)).ok).toBe(true);
  });
});
