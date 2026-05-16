import { describe, expect, test } from 'bun:test';
import {
  collectPanicRecords,
  diffPanics,
  type PanicRecord,
  type PersistedState,
} from './strokefill_panics.ts';

function buildManifest(opts: {
  prefix: string;
  icons: {
    name: string;
    fontFamily: string;
    codepoint: number;
    deprecated?: boolean;
    deprecatedReason?: string;
    deprecatedSince?: string;
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
    fonts: [],
    icons: Object.fromEntries(opts.icons.map((i) => [i.name, i])),
  } as any;
}

describe('collectPanicRecords', () => {
  test('picks up panic-skipped icons only', () => {
    const m = buildManifest({
      prefix: 'noto-v1',
      icons: [
        { name: 'fine', fontFamily: 'NotoV1', codepoint: 0xe000 },
        { name: 'gone', fontFamily: 'NotoV1', codepoint: 0xe001, deprecated: true, deprecatedReason: 'upstream-removed', deprecatedSince: '2025-12-01' },
        { name: 'hot-beverage', fontFamily: 'NotoV1', codepoint: 0xe002, deprecated: true, deprecatedReason: 'panic-skipped', deprecatedSince: '2025-12-01' },
        { name: 'lady-beetle', fontFamily: 'NotoV1', codepoint: 0xe003, deprecated: true, deprecatedReason: 'panic-skipped', deprecatedSince: '2025-12-15' },
      ],
    });
    const records = collectPanicRecords(m);
    expect(records.map((r) => r.name)).toEqual(['hot-beverage', 'lady-beetle']);
    expect(records[0]!.firstSeenAt).toBe('2025-12-01');
    expect(records[1]!.firstSeenAt).toBe('2025-12-15');
  });

  test('returns empty array when no panics in manifest', () => {
    const m = buildManifest({
      prefix: 'mdi',
      icons: [{ name: 'home', fontFamily: 'Mdi', codepoint: 0xe000 }],
    });
    expect(collectPanicRecords(m)).toEqual([]);
  });
});

describe('diffPanics', () => {
  const persisted: PersistedState = {
    schemaVersion: 1,
    lastSeenAt: '2025-12-01',
    panics: [
      { prefix: 'noto-v1', name: 'hot-beverage', firstSeenAt: '2025-12-01' },
      { prefix: 'noto-v1', name: 'lady-beetle', firstSeenAt: '2025-12-01' },
    ],
  };

  test('flags NEW panics introduced this regen', () => {
    const current: PanicRecord[] = [
      { prefix: 'noto-v1', name: 'hot-beverage', firstSeenAt: '2025-12-01' },
      { prefix: 'noto-v1', name: 'lady-beetle', firstSeenAt: '2025-12-01' },
      { prefix: 'twemoji', name: 'sparkles', firstSeenAt: '2026-05-16' },
    ];
    const diff = diffPanics(current, persisted, '2026-05-16');
    expect(diff.added.map((r) => r.name)).toEqual(['sparkles']);
    expect(diff.added[0]!.firstSeenAt).toBe('2026-05-16');
    expect(diff.removed).toEqual([]);
    expect(diff.ongoing.map((r) => r.name)).toEqual(['hot-beverage', 'lady-beetle']);
  });

  test('flags RECOVERED panics (upstream fix)', () => {
    const current: PanicRecord[] = [
      { prefix: 'noto-v1', name: 'lady-beetle', firstSeenAt: '2025-12-01' },
    ];
    const diff = diffPanics(current, persisted, '2026-05-16');
    expect(diff.removed.map((r) => r.name)).toEqual(['hot-beverage']);
    expect(diff.removed[0]!.firstSeenAt).toBe('2025-12-01');
    expect(diff.added).toEqual([]);
    expect(diff.ongoing.map((r) => r.name)).toEqual(['lady-beetle']);
  });

  test('preserves firstSeenAt across ongoing entries', () => {
    const current: PanicRecord[] = [
      { prefix: 'noto-v1', name: 'hot-beverage', firstSeenAt: '2026-05-16' },
    ];
    const diff = diffPanics(current, persisted, '2026-05-16');
    expect(diff.ongoing[0]!.firstSeenAt).toBe('2025-12-01');
  });

  test('handles empty persisted state (first run)', () => {
    const empty: PersistedState = { schemaVersion: 1, lastSeenAt: '', panics: [] };
    const current: PanicRecord[] = [
      { prefix: 'noto-v1', name: 'hot-beverage', firstSeenAt: '2026-05-16' },
    ];
    const diff = diffPanics(current, empty, '2026-05-16');
    expect(diff.added).toHaveLength(1);
    expect(diff.ongoing).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  test('returns deterministically sorted outputs', () => {
    const empty: PersistedState = { schemaVersion: 1, lastSeenAt: '', panics: [] };
    const current: PanicRecord[] = [
      { prefix: 'zzz', name: 'a', firstSeenAt: '2026-01-01' },
      { prefix: 'aaa', name: 'z', firstSeenAt: '2026-01-01' },
      { prefix: 'aaa', name: 'a', firstSeenAt: '2026-01-01' },
    ];
    const diff = diffPanics(current, empty, '2026-05-16');
    expect(diff.added.map((r) => `${r.prefix}:${r.name}`)).toEqual([
      'aaa:a',
      'aaa:z',
      'zzz:a',
    ]);
  });
});
