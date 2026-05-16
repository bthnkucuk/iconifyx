import { describe, it, expect } from 'bun:test';

import type { Manifest } from './manifest.ts';
import { computeManifestContentHash, decideVersionBump } from './version_bump.ts';

function fixture(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    prefix: 'mdi',
    iconifyJsonVersion: '2.2.472',
    lastUpdated: '2026-05-15',
    category: 'Material',
    subPackage: 'iconifyx_mdi',
    info: {
      name: 'Material Design Icons',
      author: { name: 'Pictogrammers' },
      license: { title: 'Apache 2.0' },
      total: 1,
    },
    fonts: [{ family: 'Mdi', nextCodepoint: 0xe001, iconCount: 1 }],
    icons: {
      home: {
        codepoint: 0xe000,
        fontFamily: 'Mdi',
        identifier: 'home',
      },
    },
    ...overrides,
  };
}

describe('computeManifestContentHash', () => {
  it('returns the same hash for two identical manifests', () => {
    const a = fixture();
    const b = fixture();
    expect(computeManifestContentHash(a)).toBe(computeManifestContentHash(b));
  });

  it('is INSENSITIVE to lastUpdated', () => {
    const a = fixture({ lastUpdated: '2026-01-01' });
    const b = fixture({ lastUpdated: '2026-12-31' });
    expect(computeManifestContentHash(a)).toBe(computeManifestContentHash(b));
  });

  it('is INSENSITIVE to info.total (derived from icons map)', () => {
    const a = fixture({ info: { ...fixture().info, total: 1 } });
    const b = fixture({ info: { ...fixture().info, total: 9999 } });
    expect(computeManifestContentHash(a)).toBe(computeManifestContentHash(b));
  });

  it('is SENSITIVE to a new icon', () => {
    const a = fixture();
    const b = fixture({
      icons: {
        ...fixture().icons,
        about: {
          codepoint: 0xe001,
          fontFamily: 'Mdi',
          identifier: 'about',
        },
      },
    });
    expect(computeManifestContentHash(a)).not.toBe(computeManifestContentHash(b));
  });

  it('is SENSITIVE to a codepoint change', () => {
    const a = fixture();
    const b = fixture({
      icons: {
        home: {
          codepoint: 0xe999,
          fontFamily: 'Mdi',
          identifier: 'home',
        },
      },
    });
    expect(computeManifestContentHash(a)).not.toBe(computeManifestContentHash(b));
  });

  it('is SENSITIVE to iconifyJsonVersion (upstream bump)', () => {
    const a = fixture();
    const b = fixture({ iconifyJsonVersion: '2.2.999' });
    expect(computeManifestContentHash(a)).not.toBe(computeManifestContentHash(b));
  });

  it('is SENSITIVE to license title', () => {
    const a = fixture();
    const b = fixture({
      info: { ...fixture().info, license: { title: 'MIT' } },
    });
    expect(computeManifestContentHash(a)).not.toBe(computeManifestContentHash(b));
  });

  it('is INSENSITIVE to icons object key ordering', () => {
    // Build the same logical content with keys inserted in different
    // orders. computeManifestContentHash MUST normalise so the result
    // is identical.
    const icons1 = {
      home: { codepoint: 0xe000, fontFamily: 'Mdi', identifier: 'home' },
      about: { codepoint: 0xe001, fontFamily: 'Mdi', identifier: 'about' },
    };
    const icons2 = {
      about: { codepoint: 0xe001, fontFamily: 'Mdi', identifier: 'about' },
      home: { codepoint: 0xe000, fontFamily: 'Mdi', identifier: 'home' },
    };
    const a = fixture({ icons: icons1 });
    const b = fixture({ icons: icons2 });
    expect(computeManifestContentHash(a)).toBe(computeManifestContentHash(b));
  });
});

describe('decideVersionBump', () => {
  it('seeds 0.1.0 when there is no previous manifest', () => {
    const next = fixture();
    const r = decideVersionBump(next, null);
    expect(r.nextVersion).toBe('0.1.0');
    expect(r.reason).toBe('first');
  });

  it('carries forward the version when content is unchanged', () => {
    const next = fixture();
    const prev = fixture({
      version: '1.4.2',
      contentHash: computeManifestContentHash(next),
    });
    const r = decideVersionBump(next, prev);
    expect(r.nextVersion).toBe('1.4.2');
    expect(r.reason).toBe('unchanged');
  });

  it('patch-bumps when content changes', () => {
    const prev = fixture({
      version: '1.4.2',
      contentHash: 'stale-hash',
    });
    const next = fixture();
    const r = decideVersionBump(next, prev);
    expect(r.nextVersion).toBe('1.4.3');
    expect(r.reason).toBe('bumped');
  });

  it('rollout mode: previous manifest lacks contentHash → keep version, record hash', () => {
    const prev = fixture({ version: '0.1.0' }); // no contentHash field
    delete (prev as Manifest).contentHash;
    const next = fixture();
    const r = decideVersionBump(next, prev);
    expect(r.nextVersion).toBe('0.1.0');
    expect(r.reason).toBe('rollout');
    expect(r.nextHash).toBeDefined();
  });

  it('handles prerelease suffix on previous version', () => {
    const prev = fixture({
      version: '1.2.3-pre.1',
      contentHash: 'stale',
    });
    const next = fixture();
    const r = decideVersionBump(next, prev);
    expect(r.nextVersion).toBe('1.2.4');
  });

  it('falls back to 0.1.1 if previous version is unparseable', () => {
    const prev = fixture({
      version: 'wat',
      contentHash: 'stale',
    });
    const next = fixture();
    const r = decideVersionBump(next, prev);
    expect(r.nextVersion).toBe('0.1.1');
  });
});
