import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { repoRoot } from './paths.ts';
import type { rasterFillSignal } from './svg_preprocess.ts';

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

  lines.push(`- **Sets receiving raster pre-pass:** ${totalApplied} / ${rows.length}`);
  lines.push(`- **Of those, auto-detected:** ${totalAuto}`);
  lines.push(
    `- **Sets with ≥20% raster signal that were NOT processed:** ${totalMissed}`
  );
  lines.push(
    `- **Sets containing duo-tone icons:** ${duotoneSets.length} (${totalDuotoneIcons.toLocaleString('en-US')} icons across them)`
  );
  if (totalMissed > 0) {
    lines.push('');
    lines.push(
      'If any "missed" sets render incorrectly in the example app, add ' +
        'their prefix to `strokeFillSets` in `tools/generator/config.yaml`.'
    );
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
  lines.push('| Set | Prefix | Stroke % | Evenodd % | Duotone | Applied | Source |');
  lines.push('|---|---|---:|---:|---:|:---:|---|');
  for (const r of rows) {
    const pctStroke = (r.sig.strokeRatio * 100).toFixed(0) + '%';
    const pctEven = (r.sig.evenOddRatio * 100).toFixed(0) + '%';
    const duotoneCell = r.duotoneCount > 0 ? r.duotoneCount.toLocaleString('en-US') : '—';
    const appliedBadge = r.applied ? '✓' : '—';
    lines.push(
      `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pctStroke} | ${pctEven} | ${duotoneCell} | ${appliedBadge} | ${r.source} |`
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
