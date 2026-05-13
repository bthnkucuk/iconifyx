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
    lines.push('| Set | Prefix | Paint-order % | Dropped | Raster applied |');
    lines.push('|---|---|---:|---:|:---:|');
    for (const r of paintRiskRows) {
      const pct = (r.paintOrder.paintOrderRatio * 100).toFixed(0) + '%';
      const dropped = r.paintOrderDropped > 0
        ? r.paintOrderDropped.toLocaleString('en-US')
        : '—';
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pct} | ${dropped} | ${r.applied ? '✓' : '—'} |`
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
        'wifi bars on the left). Sorted by duotone-icon count.'
    );
    lines.push('');
    lines.push('| Set | Prefix | Duotone icons |');
    lines.push('|---|---|---:|');
    const sortedDuo = [...duotoneSets].sort(
      (a, b) => b.duotoneCount - a.duotoneCount
    );
    for (const r of sortedDuo) {
      lines.push(
        `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${r.duotoneCount.toLocaleString('en-US')} |`
      );
    }
  }
  lines.push('');

  lines.push('## All sets');
  lines.push('');
  lines.push('| Set | Prefix | Stroke % | Evenodd % | Paint-order % | Duotone | Applied | Source |');
  lines.push('|---|---|---:|---:|---:|---:|:---:|---|');
  for (const r of rows) {
    const pctStroke = (r.sig.strokeRatio * 100).toFixed(0) + '%';
    const pctEven = (r.sig.evenOddRatio * 100).toFixed(0) + '%';
    const pctPaint = (r.paintOrder.paintOrderRatio * 100).toFixed(0) + '%';
    const duotoneCell = r.duotoneCount > 0 ? r.duotoneCount.toLocaleString('en-US') : '—';
    const appliedBadge = r.applied ? '✓' : '—';
    lines.push(
      `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pctStroke} | ${pctEven} | ${pctPaint} | ${duotoneCell} | ${appliedBadge} | ${r.source} |`
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
