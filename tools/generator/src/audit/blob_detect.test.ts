/**
 * Unit coverage for §16 A14 — perceptual-hash blob detector.
 *
 * The three signals are computed inside the Python worker so we can't
 * unit-test the rasteriser from Bun directly. Instead we validate the
 * pure TypeScript glue: the cluster grouping, the three-threshold flag
 * combiner, and the JSON output shape — which is what determines
 * whether a real-world signal lands in BLOB_DETECT.md.
 *
 * Each block exercises ONE of fillRatio / edgeEntropy / dHashCluster
 * as the discriminating dimension, holding the other two constant.
 */

import { describe, expect, test } from 'bun:test';
import {
  computeDHashClusters,
  flagBlobs,
  BLOB_FILL_RATIO_THRESHOLD,
  BLOB_EDGE_ENTROPY_THRESHOLD,
  BLOB_DHASH_CLUSTER_THRESHOLD,
  type GlyphMetrics,
} from './blob_detect.ts';

function metric(
  name: string,
  fillRatio: number,
  edgeEntropy: number,
  dHash: string
): GlyphMetrics {
  return {
    codepoint: 0xe000 + name.length,
    name,
    fillRatio,
    edgeEntropy,
    dHash,
  };
}

describe('fillRatio threshold', () => {
  test('flags a high-fill glyph that meets the other two signals', () => {
    const ms = [
      metric('blob_a', 0.9, 0.2, 'aaaaaaaaaaaaaaaa'),
      metric('blob_b', 0.85, 0.2, 'aaaaaaaaaaaaaaaa'),
      metric('blob_c', 0.82, 0.2, 'aaaaaaaaaaaaaaaa'),
      metric('blob_d', 0.95, 0.2, 'aaaaaaaaaaaaaaaa'),
    ];
    const flagged = flagBlobs(ms);
    expect(flagged.map((f) => f.name).sort()).toEqual(['blob_a', 'blob_b', 'blob_c', 'blob_d']);
    for (const f of flagged) expect(f.fillRatio).toBeGreaterThan(BLOB_FILL_RATIO_THRESHOLD);
  });

  test('does NOT flag a low-fill glyph even with a cluster + low entropy', () => {
    const ms = [
      metric('stroke_a', 0.10, 0.2, 'bbbbbbbbbbbbbbbb'),
      metric('stroke_b', 0.12, 0.2, 'bbbbbbbbbbbbbbbb'),
      metric('stroke_c', 0.11, 0.2, 'bbbbbbbbbbbbbbbb'),
      metric('stroke_d', 0.13, 0.2, 'bbbbbbbbbbbbbbbb'),
    ];
    expect(flagBlobs(ms)).toEqual([]);
  });

  test('does NOT flag a glyph right at the fillRatio threshold', () => {
    const ms = Array.from({ length: 5 }, (_, i) =>
      metric(`edge_${i}`, BLOB_FILL_RATIO_THRESHOLD, 0.2, 'cccccccccccccccc')
    );
    expect(flagBlobs(ms)).toEqual([]);
  });
});

describe('edgeEntropy threshold', () => {
  test('does NOT flag a stroke-rich glyph (high entropy) with cluster + fill', () => {
    const ms = Array.from({ length: 5 }, (_, i) =>
      // entropy way above threshold → not a smooth blob
      metric(`busy_${i}`, 0.85, 4.5, 'dddddddddddddddd')
    );
    expect(flagBlobs(ms)).toEqual([]);
  });

  test('flags a smooth-edge glyph (low entropy) when the other two match', () => {
    const ms = Array.from({ length: 6 }, (_, i) =>
      metric(`smooth_${i}`, 0.85, 0.15, 'eeeeeeeeeeeeeeee')
    );
    const flagged = flagBlobs(ms);
    expect(flagged.length).toBe(6);
    for (const f of flagged) expect(f.edgeEntropy).toBeLessThan(BLOB_EDGE_ENTROPY_THRESHOLD);
  });

  test('does NOT flag a glyph at the edgeEntropy threshold', () => {
    const ms = Array.from({ length: 5 }, (_, i) =>
      metric(`mid_${i}`, 0.85, BLOB_EDGE_ENTROPY_THRESHOLD, 'ffffffffffffffff')
    );
    expect(flagBlobs(ms)).toEqual([]);
  });
});

describe('dHashCluster threshold', () => {
  test('computeDHashClusters groups by hash and returns cluster sizes', () => {
    const ms = [
      metric('a', 0.9, 0.2, '1111111111111111'),
      metric('b', 0.9, 0.2, '1111111111111111'),
      metric('c', 0.9, 0.2, '2222222222222222'),
      metric('d', 0.9, 0.2, '1111111111111111'),
    ];
    const clusters = computeDHashClusters(ms);
    expect(clusters.get('1111111111111111')?.length).toBe(3);
    expect(clusters.get('2222222222222222')?.length).toBe(1);
    expect(clusters.size).toBe(2);
  });

  test('does NOT flag a singleton even if fill + entropy match', () => {
    // Only one glyph with this hash → cluster size 1, threshold is >3.
    const ms = [
      metric('unique', 0.95, 0.1, '9999999999999999'),
      ...Array.from({ length: 5 }, (_, i) =>
        // The crowd has a different hash, so `unique` has cluster size 1.
        metric(`crowd_${i}`, 0.05, 4.0, 'aaaaaaaaaaaaaaab')
      ),
    ];
    const flagged = flagBlobs(ms);
    expect(flagged.find((f) => f.name === 'unique')).toBeUndefined();
  });

  test('does NOT flag a small cluster (size === threshold)', () => {
    // Threshold is "> 3" → cluster size 3 should NOT trigger.
    const ms = Array.from({ length: BLOB_DHASH_CLUSTER_THRESHOLD }, (_, i) =>
      metric(`trio_${i}`, 0.85, 0.2, 'cccccccccccccccc')
    );
    expect(flagBlobs(ms)).toEqual([]);
  });

  test('flags every member of a big cluster (size > threshold)', () => {
    const clusterSize = BLOB_DHASH_CLUSTER_THRESHOLD + 2;
    const ms = Array.from({ length: clusterSize }, (_, i) =>
      metric(`big_${i}`, 0.85, 0.2, 'dddddddddddddddd')
    );
    const flagged = flagBlobs(ms);
    expect(flagged.length).toBe(clusterSize);
    for (const f of flagged) {
      expect(f.dHashCluster).toBe(clusterSize);
      // siblings excludes self
      expect(f.cluster).not.toContain(f.name);
      expect(f.cluster.length).toBe(clusterSize - 1);
    }
  });

  test('sorts flagged output by cluster size desc, then name asc', () => {
    const ms = [
      // Small qualifying cluster (size 4)
      ...Array.from({ length: 4 }, (_, i) =>
        metric(`zz_${i}`, 0.85, 0.2, 'aaaaaaaaaaaaaaaa')
      ),
      // Bigger cluster (size 6)
      ...Array.from({ length: 6 }, (_, i) =>
        metric(`mm_${i}`, 0.85, 0.2, 'bbbbbbbbbbbbbbbb')
      ),
    ];
    const flagged = flagBlobs(ms);
    expect(flagged[0]!.dHashCluster).toBe(6);
    expect(flagged[flagged.length - 1]!.dHashCluster).toBe(4);
    // Within a size, names are alphabetical.
    const big = flagged.filter((f) => f.dHashCluster === 6).map((f) => f.name);
    expect(big).toEqual([...big].sort());
  });
});

describe('threshold combination semantics', () => {
  test('requires ALL THREE signals; missing any one keeps glyph unflagged', () => {
    const ms = [
      // miss fillRatio
      ...Array.from({ length: 5 }, (_, i) => metric(`f_${i}`, 0.50, 0.2, 'h1h1h1h1h1h1h1h1')),
      // miss entropy
      ...Array.from({ length: 5 }, (_, i) => metric(`e_${i}`, 0.85, 1.5, 'h2h2h2h2h2h2h2h2')),
      // miss cluster
      metric('c_solo', 0.85, 0.2, 'h3h3h3h3h3h3h3h3'),
    ];
    expect(flagBlobs(ms)).toEqual([]);
  });
});
