import { expect, test, describe } from 'bun:test';
import { computeFontCacheKey } from './ttf_cache.ts';
import type { ResolvedIcon } from './load_iconify.ts';
import type { ManifestFontEntry } from './manifest.ts';

function mkIcon(name: string, body: string): ResolvedIcon {
  return { name, body, width: 24, height: 24 };
}

function mkFont(family: string): ManifestFontEntry {
  return { family, nextCodepoint: 0xe000, iconCount: 0 };
}

describe('computeFontCacheKey', () => {
  test('same input → same key', () => {
    const resolved = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
      ['user', mkIcon('user', '<path d="M5 5z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('Mdi'),
      members: [
        { name: 'home', codepoint: 0xe000 },
        { name: 'user', codepoint: 0xe001 },
      ],
      resolvedByName: resolved,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('Mdi'),
      members: [
        { name: 'home', codepoint: 0xe000 },
        { name: 'user', codepoint: 0xe001 },
      ],
      resolvedByName: resolved,
    });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('member order does not matter (sorted by codepoint internally)', () => {
    const resolved = new Map<string, ResolvedIcon>([
      ['a', mkIcon('a', '<path d="M0 0z"/>')],
      ['b', mkIcon('b', '<path d="M1 1z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [
        { name: 'a', codepoint: 0xe000 },
        { name: 'b', codepoint: 0xe001 },
      ],
      resolvedByName: resolved,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [
        // swap
        { name: 'b', codepoint: 0xe001 },
        { name: 'a', codepoint: 0xe000 },
      ],
      resolvedByName: resolved,
    });
    expect(k1).toBe(k2);
  });

  test('changing one body changes the key', () => {
    const resolved1 = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
    ]);
    const resolved2 = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 1z"/>')], // differs by 1 coord
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: resolved1,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: resolved2,
    });
    expect(k1).not.toBe(k2);
  });

  test('changing codepoint changes the key', () => {
    const resolved = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: resolved,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe001 }],
      resolvedByName: resolved,
    });
    expect(k1).not.toBe(k2);
  });

  test('changing font family changes the key', () => {
    const resolved = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('Mdi'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: resolved,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('MdiSecondary'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: resolved,
    });
    expect(k1).not.toBe(k2);
  });

  test('renaming an icon changes the key (name is in the key, not just the body)', () => {
    const r1 = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
    ]);
    const r2 = new Map<string, ResolvedIcon>([
      ['house', mkIcon('house', '<path d="M0 0z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: r1,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'house', codepoint: 0xe000 }],
      resolvedByName: r2,
    });
    expect(k1).not.toBe(k2);
  });

  test('adding an icon changes the key', () => {
    const r1 = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
    ]);
    const r2 = new Map<string, ResolvedIcon>([
      ['home', mkIcon('home', '<path d="M0 0z"/>')],
      ['user', mkIcon('user', '<path d="M5 5z"/>')],
    ]);
    const k1 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [{ name: 'home', codepoint: 0xe000 }],
      resolvedByName: r1,
    });
    const k2 = computeFontCacheKey({
      fontEntry: mkFont('X'),
      members: [
        { name: 'home', codepoint: 0xe000 },
        { name: 'user', codepoint: 0xe001 },
      ],
      resolvedByName: r2,
    });
    expect(k1).not.toBe(k2);
  });
});
