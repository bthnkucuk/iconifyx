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
  lines.push(`- **Sets receiving raster pre-pass:** ${totalApplied} / ${rows.length}`);
  lines.push(`- **Of those, auto-detected:** ${totalAuto}`);
  lines.push(
    `- **Sets with ≥20% raster signal that were NOT processed:** ${totalMissed}`
  );
  if (totalMissed > 0) {
    lines.push('');
    lines.push(
      'If any "missed" sets render incorrectly in the example app, add ' +
        'their prefix to `strokeFillSets` in `tools/generator/config.yaml`.'
    );
  }
  lines.push('');
  lines.push('## All sets');
  lines.push('');
  lines.push('| Set | Prefix | Stroke % | Evenodd % | Applied | Source |');
  lines.push('|---|---|---:|---:|:---:|---|');
  for (const r of rows) {
    const pctStroke = (r.sig.strokeRatio * 100).toFixed(0) + '%';
    const pctEven = (r.sig.evenOddRatio * 100).toFixed(0) + '%';
    const appliedBadge = r.applied ? '✓' : '—';
    lines.push(
      `| ${escapeMd(r.setName)} | \`${r.prefix}\` | ${pctStroke} | ${pctEven} | ${appliedBadge} | ${r.source} |`
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
