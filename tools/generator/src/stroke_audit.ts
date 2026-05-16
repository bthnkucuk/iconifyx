import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { repoRoot } from './paths.ts';
import type { rasterFillSignal, paintOrderSignal } from './svg_preprocess.ts';

export type AuditSource = 'explicit' | 'auto' | 'none';

export interface AuditEntry {
  prefix: string;
  setName: string;
  sig: ReturnType<typeof rasterFillSignal>;
  applied: boolean;
  source: AuditSource;
  iconCount: number;
  /** Number of duotone (two-layer) icons in this set. */
  duotoneCount: number;
  /**
   * Per-set paint-order ratio (multi-fill icons / sample). Measured AFTER
   * stroke-fill rasterize-trace — sets that were neutralised via the
   * raster pre-pass report 0% here. A high value WITHOUT the raster
   * pre-pass applied means icons are at risk of rendering as featureless
   * monochrome blobs in the TTF (e.g. `logos:adobe-after-effects` ships
   * as a square missing its "Ae" letter).
   */
  paintOrder: ReturnType<typeof paintOrderSignal>;
  /**
   * Count of icons proactively dropped at the paint-order detector this
   * run (multi-fill bodies the pipeline declined to emit). These do NOT
   * appear in `iconCount` because they never received a codepoint.
   */
  paintOrderDropped: number;
  /**
   * Count of icons rasterize-traced INDIVIDUALLY because the pack-level
   * stroke/evenodd sample was below threshold but the specific body still
   * carried `fill-rule="evenodd"` or stroke-only paint. Surfaced in the
   * audit so e.g. `oui:check-in-circle-empty` (16% sample, miss → fixed
   * via per-icon path) becomes visible.
   */
  perIconTraced: number;
  /**
   * Up to ~3 sample icon names per pack to seed manual visual check.
   * Computed in pipeline.ts from the manifest after build — we deliberately
   * pick names that are likely to surface bugs (the icons we'd open first
   * to verify a duotone or paint-order behaviour).
   */
  duotoneSamples: string[];
  paintOrderSamples: string[];
  perIconTracedSamples: string[];
  /**
   * Count of icons in this pack whose body uses the inverse-mask pattern
   * (`<defs><mask>` + consumer rect). These were historically miscoded by
   * oslllo-svg-fixer's `checkFillState` — the body path lived inside the
   * mask and got its fill forced to black, making it invisible. Surfaced
   * here so we can see how many icons per pack were silently broken before
   * the worker bypass landed.
   */
  maskPatternCount: number;
  /** Up to 3 sample names of mask-pattern icons in this pack. */
  maskPatternSamples: string[];
  /**
   * vtracer recovery stats — populated only for packs listed in
   * `config.vtracerSets`. `vtraceConsidered` is the number of paint-
   * order-risk bodies fed to vtracer; `vtraceRecovered` is how many
   * came back with ≥2 distinct colour layers and were re-emitted as
   * paint-order duotone; `vtraceFailed` is the rest (monochrome
   * traces, panics, other failures) which still get the paint-order
   * drop. Surfaced in STROKE_AUDIT.md under the dedicated section.
   */
  vtraceConsidered: number;
  vtraceRecovered: number;
  vtraceFailed: number;
  vtraceRecoveredSamples: string[];
  /**
   * §6: count of icons short-circuited by `strokeIsFillLike` because
   * their strokes are already thick enough that rasterize-trace would
   * add no information. BPMN-style packs (220-unit strokes in a
   * 1700-unit viewBox) typically skip 100% of their icons via this
   * predicate. Saves ~50-200 ms per skipped icon at the rasterize-trace
   * step and preserves source-geometry sharpness.
   */
  fillLikeSkipped: number;
  fillLikeSkippedSamples: string[];
}

/**
 * Emit STROKE_AUDIT.md summarising whether each set went through the
 * rasterize-then-trace pre-pass and WHY (explicit allow-list vs. auto-
 * detected stroke / evenodd signal). Helps spot false-positive auto-
 * applies (slow regens) or missed sets that render filled when they
 * should be outlined.
 *
 * Sets are sorted with most-suspicious first:
 *   - "needs but not applied" (auto-detect missed → add to config)
 *   - "applied via auto" (verify visual is correct)
 *   - "applied via explicit" (already manually whitelisted)
 *   - "no signal" (regular filled sets, no action needed)
 */
export async function writeStrokeAudit(entries: AuditEntry[]): Promise<void> {
  const rows = [...entries].sort((a, b) => {
    // Priority: sets with high stroke/evenodd ratio that did NOT get applied
    // come first (these are the ones the heuristic might have missed).
    const aMissed = a.sig.combinedRatio > 0 && !a.applied ? 1 : 0;
    const bMissed = b.sig.combinedRatio > 0 && !b.applied ? 1 : 0;
    if (aMissed !== bMissed) return bMissed - aMissed;
    return b.sig.combinedRatio - a.sig.combinedRatio;
  });

  const today = new Date().toISOString().slice(0, 10);
  const totalApplied = rows.filter((r) => r.applied).length;
  const totalAuto = rows.filter((r) => r.source === 'auto').length;
  const totalMissed = rows.filter(
    (r) => r.sig.combinedRatio > 0.2 && !r.applied
  ).length;

  const lines: string[] = [];
  lines.push('# Stroke / evenodd raster-fill audit');
  lines.push('');
  lines.push(
    `Generated ${today}. For each set we sample the first 25 icons and ` +
      `measure two ratios: **stroke** (icons with \`stroke=\` and no fill) ` +
      `and **evenodd** (icons that rely on \`fill-rule="evenodd"\` for ` +
      `internal cutouts). Both cases need the rasterize+Potrace pre-pass ` +
      `(\`oslllo-svg-fixer\`) — otherwise stroke icons render as solid ` +
      `discs and evenodd icons lose their holes (the \`car\` / \`bug\` ` +
      `gravity-ui glyphs we initially shipped as blobs).`
  );
  lines.push('');
  const duotoneSets = rows.filter((r) => r.duotoneCount > 0);
  const totalDuotoneIcons = duotoneSets.reduce(
    (s, r) => s + r.duotoneCount,
    0
  );

  const paintRows = [...rows].sort(
    (a, b) => b.paintOrder.paintOrderRatio - a.paintOrder.paintOrderRatio
  );
  const paintRiskHigh = paintRows.filter(
    (r) => r.paintOrder.paintOrderRatio >= 0.2
  );
  const totalPaintOrderDropped = rows.reduce(
    (s, r) => s + r.paintOrderDropped,
    0
  );

  lines.push(`- **Sets receiving raster pre-pass:** ${totalApplied} / ${rows.length}`);
  lines.push(`- **Of those, auto-detected:** ${totalAuto}`);
  lines.push(
    `- **Sets with ≥20% raster signal that were NOT processed:** ${totalMissed}`
  );
  lines.push(
    `- **Sets containing duo-tone icons:** ${duotoneSets.length} (${totalDuotoneIcons.toLocaleString('en-US')} icons across them)`
  );
  lines.push(
    `- **Sets with ≥20% paint-order risk (multi-fill bodies that would render as monochrome blobs):** ${paintRiskHigh.length}`
  );
  lines.push(
    `- **Icons proactively dropped this run for paint-order risk:** ${totalPaintOrderDropped.toLocaleString('en-US')}`
  );
  const totalVtraceRecoveredTop = rows.reduce(
    (s, r) => s + r.vtraceRecovered,
    0
  );
  if (totalVtraceRecoveredTop > 0) {
    lines.push(
      `- **Icons recovered this run via vtracer (paint-order → duotone):** ${totalVtraceRecoveredTop.toLocaleString('en-US')}`
    );
  }
  if (totalMissed > 0) {
    lines.push('');
    lines.push(
      'If any "missed" sets render incorrectly in the example app, add ' +
        'their prefix to `strokeFillSets` in `tools/generator/config.yaml`.'
    );
  }
  lines.push('');

  // Paint-order section. Multi-fill icons cannot be safely converted to
  // a monochrome TTF: overlapping fills of different colors collapse into
  // a single featureless blob. The pipeline auto-drops these (they never
  // get a codepoint or Dart const) but the per-pack signal is informative
  // — sets with high paint-order ratio lose a large share of icons.
  lines.push('## Paint-order risk (multi-fill bodies)');
  lines.push('');
  lines.push(
    'Iconify bodies that paint two or more concrete colors (e.g. a light ' +
      'letterform on a dark background rect, like `logos:adobe-after-effects`) ' +
      'cannot be losslessly translated to a monochrome TTF — the foreground ' +
      'shape collapses into the background fill region (same `currentColor`, ' +
      'non-zero winding) and the glyph renders as a featureless filled blob. ' +
      'Rasterize-trace does NOT fix this (Potrace traces the combined ' +
      'silhouette as one filled region). The pipeline now drops such icons ' +
      'at validation so they never appear in the Dart class. Counts below ' +
      'are after duotone-split + stroke-fill, so packs neutralised by the ' +
      'raster pre-pass report 0%.'
  );
  lines.push('');
  const paintRiskRows = paintRows.filter(
    (r) => r.paintOrder.paintOrderRatio > 0 || r.paintOrderDropped > 0
  );
  if (paintRiskRows.length === 0) {
    lines.push('_No paint-order risk detected._');
  } else {
    lines.push('| Set | Prefix | Paint-order % | Dropped | Raster applied | Spot-check |');
    lines.push('|---|---|---:|---:|:---:|---|');
    for (const r of paintRiskRows) {
      const pct = (r.paintOrder.paintOrderRatio * 100).toFixed(0) + '%';
      const dropped = r.paintOrderDropped > 0
        ? r.paintOrderDropped.toLocaleString('en-US')
        : '—';
      const samples = r.paintOrderSamples.length > 0
        ? r.paintOrderSamples.map((n) => `\`${n}\``).join(', ')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pct} | ${dropped} | ${r.applied ? '✓' : '—'} | ${samples} |`
      );
    }
  }
  lines.push('');
  // Duotone visual-check checklist — sets with the most duotone icons
  // surface first; these are the ones to spot-check in the example app
  // for layer alignment (primary on right + secondary on left etc.,
  // which used to render mis-centred before the centerHorizontally=false
  // fix in font_builder).
  lines.push('## Duotone sets (manual visual check recommended)');
  lines.push('');
  if (duotoneSets.length === 0) {
    lines.push('_None._');
  } else {
    lines.push(
      'Open these sets in the example app and verify the primary / ' +
        'secondary layers of a few icons sit in their expected positions ' +
        '(e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, ' +
        'wifi bars on the left). The "Spot-check" column lists 2–3 names ' +
        'per pack — start there, since these are the icons most likely ' +
        'to surface duotone layering bugs.'
    );
    lines.push('');
    lines.push('| Set | Prefix | Duotone icons | Spot-check |');
    lines.push('|---|---|---:|---|');
    const sortedDuo = [...duotoneSets].sort(
      (a, b) => b.duotoneCount - a.duotoneCount
    );
    for (const r of sortedDuo) {
      const samples = r.duotoneSamples.length > 0
        ? r.duotoneSamples.map((n) => `\`${n}\``).join(', ')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.duotoneCount.toLocaleString('en-US')} | ${samples} |`
      );
    }
  }
  lines.push('');

  // Per-icon raster-trace section. Sets here did NOT trip the pack-level
  // stroke/evenodd auto-detector (sample under threshold), but specific
  // icons inside them used `fill-rule="evenodd"` or stroke-only paint and
  // would have shipped as broken filled blobs. The pipeline now traces
  // those individual icons; this section surfaces them so a future bump
  // in the pack-level threshold can be calibrated against real numbers.
  const perIconRows = [...rows]
    .filter((r) => r.perIconTraced > 0 && !r.applied)
    .sort((a, b) => b.perIconTraced - a.perIconTraced);
  const totalPerIcon = rows.reduce((s, r) => s + r.perIconTraced, 0);
  lines.push('## Per-icon raster-trace fixes');
  lines.push('');
  lines.push(
    'Sets where the pack-level sample was below the stroke/evenodd threshold ' +
      'but individual icons still needed rasterize-trace. Without per-icon ' +
      'detection, `oui:check-in-circle-empty` shipped as a solid disc and ' +
      '`oui:chat-left` as a filled speech bubble (the `oui` pack sample showed ' +
      'only 16% evenodd, below the 20% pack threshold).'
  );
  lines.push('');
  lines.push(`- **Icons rasterize-traced via per-icon path this run:** ${totalPerIcon.toLocaleString('en-US')}`);
  lines.push('');
  if (perIconRows.length === 0) {
    lines.push('_No per-icon traces this run._');
  } else {
    lines.push('| Set | Prefix | Icons traced | Stroke % | Evenodd % | Spot-check |');
    lines.push('|---|---|---:|---:|---:|---|');
    for (const r of perIconRows) {
      const pctStroke = (r.sig.strokeRatio * 100).toFixed(0) + '%';
      const pctEven = (r.sig.evenOddRatio * 100).toFixed(0) + '%';
      const samples = r.perIconTracedSamples.length > 0
        ? r.perIconTracedSamples.map((n) => `\`${n}\``).join(', ')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.perIconTraced.toLocaleString('en-US')} | ${pctStroke} | ${pctEven} | ${samples} |`
      );
    }
  }
  lines.push('');

  // Inverse-mask pattern section. Packs here ship icons using
  // `<defs><mask id="X">...</mask></defs><path mask="url(#X)"/>`. The
  // mask-internal path that holds the icon's main body used to be
  // silently corrupted by `oslllo-svg-fixer`'s `checkFillState` — it
  // force-set the first <path>'s fill to `#000`, which inside a mask
  // makes that region invisible. The custom stroke-fill worker bypasses
  // `checkFillState`, so the body now traces correctly. This section
  // surfaces how many icons per pack were silently broken before the fix.
  const maskRows = [...rows]
    .filter((r) => r.maskPatternCount > 0)
    .sort((a, b) => b.maskPatternCount - a.maskPatternCount);
  const totalMask = rows.reduce((s, r) => s + r.maskPatternCount, 0);
  lines.push('## Inverse-mask pattern (resvg-aware trace)');
  lines.push('');
  lines.push(
    'Icons whose body uses `<defs><mask id="X">...</mask></defs>` plus a ' +
      'consumer `<path mask="url(#X)"/>` (Solar bold, icon-park-twotone, ' +
      'icon-park-solid, line-md, pepicons-pop/pencil, lets-icons duotone-line, …). ' +
      'Before the custom stroke-fill worker landed, these icons shipped with ' +
      'their main body invisible because `oslllo-svg-fixer` force-set the ' +
      "first <path>'s fill to black inside the mask. The worker bypasses " +
      'that step now and the bodies trace correctly via resvg.'
  );
  lines.push('');
  lines.push(`- **Icons using the inverse-mask pattern across all packs:** ${totalMask.toLocaleString('en-US')}`);
  lines.push('');
  if (maskRows.length === 0) {
    lines.push('_No mask-pattern icons detected._');
  } else {
    lines.push('| Set | Prefix | Mask icons | % of pack | Spot-check |');
    lines.push('|---|---|---:|---:|---|');
    for (const r of maskRows) {
      // Cap at 100%: maskPatternCount is captured pre-drop while iconCount
      // is post-drop, so packs like circle-flags (where most icons get
      // paint-order-dropped) can otherwise show 460%.
      const pct = r.iconCount > 0
        ? Math.min(100, (r.maskPatternCount / r.iconCount) * 100).toFixed(0) + '%'
        : '—';
      const samples = r.maskPatternSamples.length > 0
        ? r.maskPatternSamples.map((n) => `\`${n}\``).join(', ')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.maskPatternCount.toLocaleString('en-US')} | ${pct} | ${samples} |`
      );
    }
  }
  lines.push('');

  // vtracer recovery section. Packs listed in `config.vtracerSets`
  // route their paint-order-dropped candidates through vtracer
  // (`@neplex/vectorizer`); successful traces are re-emitted as
  // paint-order duotone via the existing Secondary font path.
  const vtraceRows = [...rows]
    .filter((r) => r.vtraceConsidered > 0)
    .sort((a, b) => b.vtraceRecovered - a.vtraceRecovered);
  const totalVtraceConsidered = rows.reduce(
    (s, r) => s + r.vtraceConsidered,
    0
  );
  const totalVtraceRecovered = rows.reduce(
    (s, r) => s + r.vtraceRecovered,
    0
  );
  const totalVtraceFailed = rows.reduce((s, r) => s + r.vtraceFailed, 0);
  lines.push('## vtracer recovery (multi-colour → duotone)');
  lines.push('');
  lines.push(
    'Packs opted into `config.vtracerSets` (e.g. `twemoji`, `noto`, ' +
      '`fluent-emoji-flat`, `circle-flags`) route their paint-order-risk ' +
      'candidates through `@neplex/vectorizer` (visioncortex vtracer): ' +
      'rasterise the source via `@resvg/resvg-js`, trace into stacked colour ' +
      'layers, reduce to the top-2 by polygon area, and re-emit as a paint-' +
      'order duotone primary+secondary pair (`kind: paintOrder`). The recovered ' +
      'icons render through the same widget composition logos use. Bodies ' +
      'vtracer can\'t reduce to ≥2 distinct layers, plus any worker panics, ' +
      'still fall through to the paint-order drop.'
  );
  lines.push('');
  lines.push(
    `- **Total vtracer candidates this run:** ${totalVtraceConsidered.toLocaleString('en-US')}`
  );
  lines.push(
    `- **Recovered as paint-order duotone:** ${totalVtraceRecovered.toLocaleString('en-US')}` +
      (totalVtraceConsidered > 0
        ? ` (${((totalVtraceRecovered / totalVtraceConsidered) * 100).toFixed(0)}%)`
        : '')
  );
  lines.push(
    `- **Still dropped (monochrome trace / panic / other-fail):** ${totalVtraceFailed.toLocaleString('en-US')}`
  );
  lines.push('');
  if (vtraceRows.length === 0) {
    lines.push(
      '_No packs opted in this run. Add a prefix to `vtracerSets` in `tools/generator/config.yaml`._'
    );
  } else {
    lines.push('| Set | Prefix | Considered | Recovered | Failed | Recovery % | Spot-check |');
    lines.push('|---|---|---:|---:|---:|---:|---|');
    for (const r of vtraceRows) {
      const pct =
        r.vtraceConsidered > 0
          ? ((r.vtraceRecovered / r.vtraceConsidered) * 100).toFixed(0) + '%'
          : '—';
      const samples =
        r.vtraceRecoveredSamples.length > 0
          ? r.vtraceRecoveredSamples.map((n) => `\`${n}\``).join(', ')
          : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.vtraceConsidered.toLocaleString('en-US')} | ${r.vtraceRecovered.toLocaleString('en-US')} | ${r.vtraceFailed.toLocaleString('en-US')} | ${pct} | ${samples} |`
      );
    }
  }
  lines.push('');

  // Stroke-as-fill skip section (§6). Packs here had their rasterize-
  // trace step short-circuited for at least one icon because the body's
  // strokes are already thick enough relative to the viewBox to render
  // as a filled region without trace conversion. BPMN is the canonical
  // case — 220-unit strokes inside a 1700-unit viewBox.
  const fillLikeRows = [...rows]
    .filter((r) => r.fillLikeSkipped > 0)
    .sort((a, b) => b.fillLikeSkipped - a.fillLikeSkipped);
  const totalFillLike = rows.reduce((s, r) => s + r.fillLikeSkipped, 0);
  lines.push('## Stroke-as-fill skip (already-thick strokes, no trace needed)');
  lines.push('');
  lines.push(
    'Icons whose strokes are thick enough (relative to the viewBox) that ' +
      'they already act as a filled region — rasterize+Potrace adds no ' +
      'information here, only ~50-200 ms / icon of CPU and a small loss of ' +
      'geometry sharpness from Potrace smoothing. The pipeline now skips ' +
      'these icons at the stroke-fill step; their original body flows ' +
      'through the rest of the pipeline (codepoint allocation, font build, ' +
      'etc.) unchanged. Threshold: `max(strokeWidth) * 2 >= viewBoxMaxSide * 0.15`.'
  );
  lines.push('');
  lines.push(
    `- **Icons short-circuited via stroke-as-fill skip this run:** ${totalFillLike.toLocaleString('en-US')}`
  );
  lines.push('');
  if (fillLikeRows.length === 0) {
    lines.push('_No stroke-as-fill skips this run._');
  } else {
    lines.push('| Set | Prefix | Skipped | Spot-check |');
    lines.push('|---|---|---:|---|');
    for (const r of fillLikeRows) {
      const samples = r.fillLikeSkippedSamples.length > 0
        ? r.fillLikeSkippedSamples.map((n) => `\`${n}\``).join(', ')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.fillLikeSkipped.toLocaleString('en-US')} | ${samples} |`
      );
    }
  }
  lines.push('');

  lines.push('## All sets');
  lines.push('');
  lines.push('| Set | Prefix | Stroke % | Evenodd % | Paint-order % | Per-icon | Duotone | Applied | Source |');
  lines.push('|---|---|---:|---:|---:|---:|---:|:---:|---|');
  for (const r of rows) {
    const pctStroke = (r.sig.strokeRatio * 100).toFixed(0) + '%';
    const pctEven = (r.sig.evenOddRatio * 100).toFixed(0) + '%';
    const pctPaint = (r.paintOrder.paintOrderRatio * 100).toFixed(0) + '%';
    const perIconCell = r.perIconTraced > 0
      ? r.perIconTraced.toLocaleString('en-US')
      : '—';
    const duotoneCell = r.duotoneCount > 0 ? r.duotoneCount.toLocaleString('en-US') : '—';
    const appliedBadge = r.applied ? '✓' : '—';
    lines.push(
      `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pctStroke} | ${pctEven} | ${pctPaint} | ${perIconCell} | ${duotoneCell} | ${appliedBadge} | ${r.source} |`
    );
  }
  lines.push('');

  await writeFile(
    path.join(repoRoot(), 'STROKE_AUDIT.md'),
    lines.join('\n'),
    'utf8'
  );
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}
