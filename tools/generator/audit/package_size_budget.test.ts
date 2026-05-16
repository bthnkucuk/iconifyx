import { describe, expect, test } from 'bun:test';
import {
  SIZE_GROWTH_WARN_RATIO,
  computeDiff,
  countDartConsts,
  type LedgerEntry,
} from './package_size_budget.ts';

function buildManifest(opts: {
  prefix: string;
  iconifyJsonVersion?: string;
  icons: {
    name: string;
    fontFamily: string;
    codepoint: number;
    deprecated?: boolean;
    aliasOf?: string;
    duotone?: boolean;
  }[];
}) {
  return {
    schemaVersion: 1 as const,
    prefix: opts.prefix,
    iconifyJsonVersion: opts.iconifyJsonVersion ?? '2.2.472',
    lastUpdated: '2026-05-16',
    category: null,
    subPackage: `iconifyx_${opts.prefix}`,
    info: { name: opts.prefix, license: { title: 'MIT' }, total: 0 },
    fonts: [],
    icons: Object.fromEntries(opts.icons.map((i) => [i.name, i])),
  } as any;
}

describe('countDartConsts', () => {
  test('counts canonical live icons only', () => {
    const m = buildManifest({
      prefix: 'sample',
      icons: [
        { name: 'home', fontFamily: 'S', codepoint: 0xe000 },
        { name: 'house', fontFamily: 'S', codepoint: 0xe000, aliasOf: 'home' },
        { name: 'gone', fontFamily: 'S', codepoint: 0xe001, deprecated: true },
        { name: 'tree-duo', fontFamily: 'S', codepoint: 0xe002, duotone: true },
      ],
    });
    expect(countDartConsts(m)).toEqual({ dartConsts: 2, duotoneCount: 1 });
  });

  test('empty manifest -> zero counts', () => {
    expect(countDartConsts(buildManifest({ prefix: 'empty', icons: [] }))).toEqual({
      dartConsts: 0,
      duotoneCount: 0,
    });
  });
});

describe('computeDiff', () => {
  const baseSnap = { ttfBytes: 100_000, dartConsts: 1000, duotoneCount: 0 };
  const baseManifest = buildManifest({
    prefix: 'foo',
    iconifyJsonVersion: '2.2.472',
    icons: [],
  });

  test('first snapshot — no prev, no warn', () => {
    const diff = computeDiff('foo', baseSnap, undefined, baseManifest);
    expect(diff.severity).toBe('info');
    expect(diff.prevTtfBytes).toBe(0);
    expect(diff.growthRatio).toBe(0);
    expect(diff.reason).toContain('first snapshot');
  });

  test('flat regen — no growth, no warn', () => {
    const prev: LedgerEntry = {
      lastIconifyVersion: '2.2.472',
      ttfBytes: 100_000,
      dartConsts: 1000,
      duotoneCount: 0,
      history: [],
    };
    const diff = computeDiff('foo', baseSnap, prev, baseManifest);
    expect(diff.severity).toBe('info');
    expect(diff.bytesDelta).toBe(0);
    expect(diff.growthRatio).toBe(0);
  });

  test('grew > threshold without version bump -> warn', () => {
    const prev: LedgerEntry = {
      lastIconifyVersion: '2.2.472',
      ttfBytes: 100_000,
      dartConsts: 1000,
      duotoneCount: 0,
      history: [],
    };
    const growSnap = {
      ttfBytes: Math.floor(100_000 * (1 + SIZE_GROWTH_WARN_RATIO + 0.05)),
      dartConsts: 1000,
      duotoneCount: 0,
    };
    const diff = computeDiff('foo', growSnap, prev, baseManifest);
    expect(diff.severity).toBe('warn');
    expect(diff.reason).toMatch(/without @iconify\/json bump/);
  });

  test('grew > threshold WITH version bump -> info (explained)', () => {
    const prev: LedgerEntry = {
      lastIconifyVersion: '2.2.400',
      ttfBytes: 100_000,
      dartConsts: 1000,
      duotoneCount: 0,
      history: [],
    };
    const growSnap = {
      ttfBytes: Math.floor(100_000 * (1 + SIZE_GROWTH_WARN_RATIO + 0.05)),
      dartConsts: 1000,
      duotoneCount: 0,
    };
    const diff = computeDiff('foo', growSnap, prev, baseManifest);
    expect(diff.severity).toBe('info');
    expect(diff.reason).toMatch(/iconify 2\.2\.400 → 2\.2\.472 bump/);
  });

  test('shrunk -> info even if delta is large', () => {
    const prev: LedgerEntry = {
      lastIconifyVersion: '2.2.472',
      ttfBytes: 100_000,
      dartConsts: 1000,
      duotoneCount: 0,
      history: [],
    };
    const shrinkSnap = { ttfBytes: 50_000, dartConsts: 800, duotoneCount: 0 };
    const diff = computeDiff('foo', shrinkSnap, prev, baseManifest);
    expect(diff.severity).toBe('info');
    expect(diff.bytesDelta).toBe(-50_000);
    expect(diff.growthRatio).toBeLessThan(0);
  });
});
