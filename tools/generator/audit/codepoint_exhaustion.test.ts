import { describe, expect, test } from 'bun:test';
import {
  BMP_PUA_SLOTS,
  HEADROOM_WARN_THRESHOLD,
  SUPP_PUA_START,
  computeFontRows,
} from './codepoint_exhaustion.ts';
import { ICONS_PER_FONT_SOFT_CAP, PUA_START } from '../src/codepoint_allocator.ts';

function buildManifest(opts: {
  prefix: string;
  fonts: { family: string; nextCodepoint: number; iconCount: number }[];
  icons: {
    name: string;
    fontFamily: string;
    codepoint: number;
    tier?: 'bmp' | 'supp';
    deprecated?: boolean;
  }[];
}) {
  return {
    schemaVersion: 1 as const,
    prefix: opts.prefix,
    iconifyJsonVersion: '0.0.0',
    lastUpdated: '2026-05-16',
    category: null,
    subPackage: `iconifyx_${opts.prefix}`,
    info: { name: opts.prefix, license: { title: 'MIT' }, total: 0 },
    fonts: opts.fonts,
    icons: Object.fromEntries(opts.icons.map((i) => [i.name, i])),
  } as any;
}

describe('computeFontRows', () => {
  test('reports BMP usage + headroom for a single-font manifest', () => {
    const m = buildManifest({
      prefix: 'tiny',
      fonts: [{ family: 'Tiny', nextCodepoint: PUA_START + 3, iconCount: 3 }],
      icons: [
        { name: 'a', fontFamily: 'Tiny', codepoint: PUA_START + 0 },
        { name: 'b', fontFamily: 'Tiny', codepoint: PUA_START + 1 },
        { name: 'c', fontFamily: 'Tiny', codepoint: PUA_START + 2 },
      ],
    });
    const rows = computeFontRows(m);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      prefix: 'tiny',
      family: 'Tiny',
      liveCount: 3,
      reservedCount: 0,
      bmpUsed: 3,
      bmpRemaining: BMP_PUA_SLOTS - 3,
      suppUsed: 0,
      severity: 'info',
    });
    expect(rows[0]!.headroomPct).toBeCloseTo(
      100 - (3 / ICONS_PER_FONT_SOFT_CAP) * 100,
      3
    );
  });

  test('flags warn when headroom falls below threshold', () => {
    const warnAt = Math.ceil(
      ICONS_PER_FONT_SOFT_CAP * (1 - HEADROOM_WARN_THRESHOLD / 100)
    );
    const icons = Array.from({ length: warnAt + 5 }, (_, i) => ({
      name: `i${i}`,
      fontFamily: 'Big',
      codepoint: PUA_START + i,
    }));
    const m = buildManifest({
      prefix: 'big',
      fonts: [{ family: 'Big', nextCodepoint: PUA_START + icons.length, iconCount: icons.length }],
      icons,
    });
    const [row] = computeFontRows(m);
    expect(row!.severity).toBe('warn');
    expect(row!.headroomPct).toBeLessThan(HEADROOM_WARN_THRESHOLD);
  });

  test('separates supp-PUA icons from BMP usage', () => {
    const m = buildManifest({
      prefix: 'big',
      fonts: [{ family: 'Big', nextCodepoint: SUPP_PUA_START + 2, iconCount: 4 }],
      icons: [
        { name: 'a', fontFamily: 'Big', codepoint: PUA_START + 0, tier: 'bmp' },
        { name: 'b', fontFamily: 'Big', codepoint: PUA_START + 1, tier: 'bmp' },
        // explicit supp tier
        { name: 'c', fontFamily: 'Big', codepoint: SUPP_PUA_START + 0, tier: 'supp' },
        // implicit (no tier field; codepoint >= SUPP_PUA_START)
        { name: 'd', fontFamily: 'Big', codepoint: SUPP_PUA_START + 1 },
      ],
    });
    const [row] = computeFontRows(m);
    expect(row!.bmpUsed).toBe(2);
    expect(row!.suppUsed).toBe(2);
    expect(row!.liveCount).toBe(4);
  });

  test('deprecated icons count as reserved, not live', () => {
    const m = buildManifest({
      prefix: 'mix',
      fonts: [{ family: 'Mix', nextCodepoint: PUA_START + 3, iconCount: 2 }],
      icons: [
        { name: 'live1', fontFamily: 'Mix', codepoint: PUA_START + 0 },
        { name: 'live2', fontFamily: 'Mix', codepoint: PUA_START + 1 },
        { name: 'gone', fontFamily: 'Mix', codepoint: PUA_START + 2, deprecated: true },
      ],
    });
    const [row] = computeFontRows(m);
    expect(row!.liveCount).toBe(2);
    expect(row!.reservedCount).toBe(1);
    expect(row!.bmpUsed).toBe(2); // deprecated NOT counted in bmp slot pressure
  });
});
