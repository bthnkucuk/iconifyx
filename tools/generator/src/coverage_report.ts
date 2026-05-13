import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { repoRoot } from './paths.ts';
import type { IconifyCollection } from './load_iconify.ts';
import type { Manifest } from './manifest.ts';
import type { GeneratorConfig } from './group_sets.ts';

/**
 * Emit `COVERAGE.md` at the repo root summarising, per Iconify set, the
 * `info.total` from upstream vs. our built (live + non-deprecated) count.
 * Useful for spotting:
 *   - sets that fail to build entirely (Δ = source, built = 0)
 *   - sets where the validator over-rejects (Δ > 0, built > 0)
 *   - sets that built cleanly (Δ ≈ 0 or Δ < 0 if we synthesised variants)
 *
 * The file is committed so consumers can see coverage without running
 * the generator themselves.
 */
export interface CoverageInput {
  collections: Record<string, IconifyCollection>;
  manifests: Manifest[];
  config: GeneratorConfig;
  iconifyJsonVersion: string;
}

export async function writeCoverageReport(input: CoverageInput): Promise<void> {
  const { collections, manifests, config, iconifyJsonVersion } = input;

  const manifestByPrefix = new Map<string, Manifest>();
  for (const m of manifests) manifestByPrefix.set(m.prefix, m);

  type Row = {
    prefix: string;
    name: string;
    source: number;
    built: number;
    delta: number;
    pctMissing: number;
    status: 'ok' | 'partial' | 'missing' | 'excluded';
  };

  const rows: Row[] = [];
  const excluded = new Set(config.excludedSets ?? []);

  for (const [prefix, info] of Object.entries(collections)) {
    const isExcluded = excluded.has(prefix);
    const m = manifestByPrefix.get(prefix);

    // Synthesized weight variants (Lucide `-thin`, `-light`, `-bold` etc.)
    // don't exist upstream — they're our local clones. Excluding them
    // gives a fair source-vs-built comparison; otherwise sets like Lucide
    // would always report built > source and the report would never
    // surface a real missing icon there.
    const weightSuffixes = Object.keys(
      config.multiWeightStrokeSets?.[prefix] ?? {}
    );
    const isSynthetic = weightSuffixes.length === 0
      ? (_: string) => false
      : (name: string) =>
          weightSuffixes.some((w) => name.endsWith(`-${w}`));

    const built = m
      ? Object.entries(m.icons).filter(
          ([n, v]) => !v.deprecated && !isSynthetic(n)
        ).length
      : 0;
    const source = info.total ?? 0;
    const delta = source - built;
    const pctMissing = source > 0 ? (delta / source) * 100 : 0;

    let status: Row['status'];
    if (isExcluded) status = 'excluded';
    else if (built === 0) status = 'missing';
    else if (pctMissing < 5) status = 'ok';
    else status = 'partial';

    rows.push({
      prefix,
      name: info.name,
      source,
      built,
      delta,
      pctMissing,
      status,
    });
  }

  // Sort by missing %, then by absolute delta — surface the worst first.
  rows.sort((a, b) => {
    if (a.status === 'excluded' && b.status !== 'excluded') return 1;
    if (b.status === 'excluded' && a.status !== 'excluded') return -1;
    if (a.pctMissing !== b.pctMissing) return b.pctMissing - a.pctMissing;
    return b.delta - a.delta;
  });

  // Totals.
  const totalSource = rows.reduce(
    (s, r) => s + (r.status === 'excluded' ? 0 : r.source),
    0
  );
  const totalBuilt = rows.reduce((s, r) => s + r.built, 0);
  const builtSetCount = rows.filter((r) => r.built > 0).length;
  const missingSetCount = rows.filter((r) => r.status === 'missing').length;
  const partialCount = rows.filter((r) => r.status === 'partial').length;

  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push('# Iconify coverage report');
  lines.push('');
  lines.push(
    `Generated ${today} from \`@iconify/json\` v${iconifyJsonVersion}. ` +
      `Source counts are Iconify's \`info.total\`; Built counts are live ` +
      `(non-deprecated) icons in our manifests.`
  );
  lines.push('');
  lines.push(`- **Sets built:** ${builtSetCount} / ${rows.length}`);
  lines.push(`- **Sets fully missing:** ${missingSetCount}`);
  lines.push(`- **Sets partially missing (≥5% gap):** ${partialCount}`);
  lines.push(
    `- **Source icons:** ${totalSource.toLocaleString('en-US')}`
  );
  lines.push(`- **Built icons:** ${totalBuilt.toLocaleString('en-US')}`);
  lines.push('');
  lines.push(
    'Synthesised weight variants (Lucide / Tabler / Iconoir etc. with ' +
      '`-thin`/`-light`/`-bold` suffixes) are excluded from the built count ' +
      'so source-vs-built comparisons stay meaningful — those are local ' +
      'clones, not upstream icons.'
  );
  lines.push('');

  // Section: missing sets
  lines.push('## Missing sets (0 icons built)');
  lines.push('');
  const missing = rows.filter((r) => r.status === 'missing');
  if (missing.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Set | Prefix | Source icons |');
    lines.push('|---|---|---:|');
    for (const r of missing) {
      lines.push(`| ${escape(r.name)} | \`${r.prefix}\` | ${r.source.toLocaleString('en-US')} |`);
    }
  }
  lines.push('');

  // Section: partial
  lines.push('## Partially built (≥5% gap)');
  lines.push('');
  const partial = rows.filter((r) => r.status === 'partial');
  if (partial.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Set | Prefix | Source | Built | Missing | % |');
    lines.push('|---|---|---:|---:|---:|---:|');
    for (const r of partial) {
      lines.push(
        `| ${escape(r.name)} | \`${r.prefix}\` | ${r.source.toLocaleString('en-US')} | ${r.built.toLocaleString('en-US')} | ${r.delta.toLocaleString('en-US')} | ${r.pctMissing.toFixed(1)}% |`
      );
    }
  }
  lines.push('');

  // Section: full table
  lines.push('## All sets');
  lines.push('');
  lines.push('| Set | Prefix | Source | Built | Δ | Status |');
  lines.push('|---|---|---:|---:|---:|---|');
  for (const r of rows) {
    const statusBadge: Record<Row['status'], string> = {
      ok: '✓',
      partial: '⚠ partial',
      missing: '✗ missing',
      excluded: '— excluded',
    };
    lines.push(
      `| ${escape(r.name)} | \`${r.prefix}\` | ${r.source.toLocaleString('en-US')} | ${r.built.toLocaleString('en-US')} | ${(r.delta > 0 ? '+' : '') + r.delta} | ${statusBadge[r.status]} |`
    );
  }
  lines.push('');

  await writeFile(
    path.join(repoRoot(), 'COVERAGE.md'),
    lines.join('\n'),
    'utf8'
  );
}

function escape(s: string): string {
  return s.replace(/\|/g, '\\|');
}
