/**
 * `dashboard.ts` — emit a self-contained `index.html` summarising a corpus
 * run. No build step, no JS framework, no external assets. Each row is a
 * mismatched icon with the 3-5 PNG panels relative-path-linked.
 *
 * Why static HTML and not Flutter web?
 *
 * 1. Audit dashboards are CI artefacts — they need to be openable in a
 *    browser straight from `docs/audit/visual-3way/`, no devserver, no
 *    build. A single `.html` file with relative `<img src=>` works.
 * 2. The Flutter website target is a runtime icon BROWSER, not an audit
 *    surface. Adding audit views there would couple two unrelated apps.
 *
 * Output layout:
 *   <out>/index.html       — primary dashboard
 *   <out>/index.css        — inlined into index.html so the page works
 *                            without serving the css separately
 *
 * The HTML is generated in plain TS string concatenation. The CSS lives
 * inline so the same single file works locally + opens cleanly in
 * GitHub's blob viewer when committed.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CorpusSummary } from './cli.ts';

const CSS = `
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 0;
  padding: 24px;
  background: #fafafa;
  color: #111;
}
h1 { margin: 0 0 12px; font-size: 22px; }
.meta { font-size: 13px; color: #555; margin-bottom: 24px; }
.tally {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 14px;
  margin-right: 6px;
  font-size: 12px;
  font-weight: 600;
}
.tally.ok { background: #d4edda; color: #155724; }
.tally.review { background: #fff3cd; color: #856404; }
.tally.diff { background: #f8d7da; color: #721c24; }
.controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.controls label { font-size: 13px; display: flex; align-items: center; gap: 6px; }
.controls input[type=text] {
  font-size: 14px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 200px;
}
.row {
  display: grid;
  grid-template-columns: 200px repeat(5, 1fr) 180px;
  gap: 12px;
  background: white;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  border-left: 4px solid #ccc;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.row.same { border-left-color: #28a745; }
.row.needs-review { border-left-color: #ffc107; }
.row.different { border-left-color: #dc3545; }
.row.error { border-left-color: #6c757d; background: #f8f9fa; }
.row .icon-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.row .icon-ref { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; word-break: break-all; }
.row .icon-status { font-size: 11px; }
.row .icon-pack { font-size: 11px; color: #888; }
.row .panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  color: #555;
}
.row .panel img {
  width: 100%;
  max-width: 128px;
  height: auto;
  border: 1px solid #ddd;
  background: white;
  image-rendering: pixelated;
}
.row .panel .label { margin-bottom: 4px; font-weight: 600; }
.row .metrics { font-size: 11px; color: #444; line-height: 1.5; min-width: 0; }
.row .metrics .reason {
  display: inline-block;
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  margin-bottom: 6px;
  word-break: break-word;
}
.row .metrics .pair {
  margin: 4px 0;
  border-top: 1px dashed #eee;
  padding-top: 4px;
}
.row .metrics .pair .label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}
.section-title {
  margin: 28px 0 12px;
  padding: 8px 0;
  border-bottom: 2px solid #ddd;
  font-size: 16px;
}
.by-pack {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
.by-pack .cell {
  background: white;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.by-pack .cell .name { font-weight: 600; font-family: ui-monospace, monospace; }
.by-pack .cell .nums { color: #555; }
.by-pack .cell .bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}
.by-pack .cell .bar > div { height: 100%; }
.by-pack .cell .bar .ok { background: #28a745; }
.by-pack .cell .bar .review { background: #ffc107; }
.by-pack .cell .bar .diff { background: #dc3545; }
`;

const FILTER_JS = `
function applyFilters() {
  var status = document.getElementById('f-status').value;
  var reason = document.getElementById('f-reason').value.toLowerCase();
  var pack = document.getElementById('f-pack').value.toLowerCase();
  var rows = document.querySelectorAll('.row');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var rs = r.getAttribute('data-status');
    var rr = (r.getAttribute('data-reason') || '').toLowerCase();
    var rp = (r.getAttribute('data-pack') || '').toLowerCase();
    var ok = true;
    if (status && rs !== status) ok = false;
    if (reason && rr.indexOf(reason) === -1) ok = false;
    if (pack && rp.indexOf(pack) === -1) ok = false;
    r.style.display = ok ? '' : 'none';
  }
}
function bind() {
  ['f-status', 'f-reason', 'f-pack'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', applyFilters);
      el.addEventListener('change', applyFilters);
    }
  });
}
document.addEventListener('DOMContentLoaded', bind);
`;

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

function pairCell(
  label: string,
  d: { mismatchPct: number; hamming: number; ssim: number } | null
): string {
  if (!d) return `<div class="pair"><span class="label">${label}</span><br><em>n/a</em></div>`;
  return (
    `<div class="pair"><span class="label">${label}</span><br>` +
    `mismatch ${fmtPct(d.mismatchPct)} · ham ${d.hamming} · ssim ${d.ssim.toFixed(3)}` +
    `</div>`
  );
}

function panelCell(slug: string, file: string | null, label: string): string {
  if (!file) {
    return `<div class="panel"><div class="label">${label}</div><div style="font-size:10px;color:#999;padding:12px 0">—</div></div>`;
  }
  // Relative path from the dashboard (index.html) — outDir/index.html →
  // outDir/<slug>/<filename>. The corpus file paths are absolute; map them
  // to slug-relative.
  const fileName = file.split('/').pop()!;
  return `<div class="panel"><div class="label">${label}</div><a href="${slug}/${fileName}" target="_blank"><img src="${slug}/${fileName}" alt="${label}"></a></div>`;
}

export async function writeDashboard(outBase: string, summary: CorpusSummary): Promise<void> {
  // Sort rows: different first, then needs-review, then same (alphabetised within each).
  const order = { different: 0, 'needs-review': 1, same: 2 } as const;
  const sorted = [...summary.rows].sort((a, b) => {
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    return a.iconRef.localeCompare(b.iconRef);
  });

  // We need to read each row's per-icon report.json to know which PNG
  // files actually got written for this run (eg ttf-composed.png only
  // exists in --3way). For speed we just guess names based on the
  // schema — every row that didn't ERROR has at minimum upstream.png +
  // glyph-primary.png.
  const rowHtml = sorted
    .map((row) => {
      const slug = row.slug;
      const meta = summary.threeWay
        ? [
            panelCell(slug, 'upstream.png', 'upstream (SVG)'),
            panelCell(slug, 'glyph-primary.png', 'TTF primary'),
            panelCell(slug, 'ttf-composed.png', 'TTF composed'),
            panelCell(slug, 'flutter-rendered.png', 'Flutter'),
            panelCell(slug, 'diff-svg-vs-flutter.png', 'diff SVG↔Flutter'),
          ]
        : [
            panelCell(slug, 'upstream.png', 'upstream'),
            panelCell(slug, 'glyph-primary.png', 'TTF primary'),
            panelCell(slug, row.duotone ? 'glyph-secondary.png' : null, 'TTF secondary'),
            panelCell(slug, 'flutter-rendered.png', 'Flutter'),
            panelCell(slug, 'diff-pixelmatch.png', 'diff (SVG↔Flutter)'),
          ];
      const metricsCell = `
<div class="metrics">
  <span class="reason">${row.primaryReason}</span><br>
  conf=${row.confidence}
  ${pairCell('SVG↔TTF', row.metrics.svgVsTtf)}
  ${pairCell('TTF↔Flutter', row.metrics.ttfVsFlutter)}
  ${pairCell('SVG↔Flutter', row.metrics.svgVsFlutter)}
  ${row.error ? `<div style="color:#c00;font-size:10px;margin-top:6px"><b>error:</b> ${escapeHtml(row.error)}</div>` : ''}
</div>`;
      return `
<div class="row ${row.status === 'same' ? 'same' : row.status === 'needs-review' ? 'needs-review' : row.primaryReason === 'ERROR' ? 'error' : 'different'}"
     data-status="${row.status}"
     data-reason="${row.primaryReason}"
     data-pack="${row.prefix}">
  <div class="icon-info">
    <div class="icon-ref"><a href="${slug}/REPORT.md">${row.iconRef}</a></div>
    <div class="icon-pack">${row.prefix}${row.duotone ? ` · duo(${row.duotoneKind ?? 'hint'})` : ''}</div>
    <div class="icon-status"><b>${row.status}</b></div>
  </div>
  ${meta.join('\n  ')}
  ${metricsCell}
</div>`;
    })
    .join('\n');

  const packGrid = Object.entries(summary.byPack)
    .sort((a, b) => b[1].different - a[1].different)
    .map(([prefix, b]) => {
      const t = b.total || 1;
      return `
<div class="cell">
  <div class="name">${prefix}</div>
  <div class="nums">${b.ok} ok · ${b.needsReview} review · ${b.different} diff <span style="color:#888">(${b.total})</span></div>
  <div class="bar">
    <div class="ok" style="flex:${b.ok / t}"></div>
    <div class="review" style="flex:${b.needsReview / t}"></div>
    <div class="diff" style="flex:${b.different / t}"></div>
  </div>
</div>`;
    })
    .join('\n');

  const reasonsList = Object.entries(summary.byReason)
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `<li><code>${r}</code> &mdash; ${c}</li>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>iconifyx visual three-way audit</title>
<style>${CSS}</style>
</head>
<body>
<h1>Visual three-way audit (Phase 1.5)</h1>
<div class="meta">
  Generated ${summary.generatedAt} ·
  ${summary.total} icons ·
  ${summary.threeWay ? '3-way comparison' : 'SVG↔Flutter only'} ·
  canvas ${summary.size}px
  <br>
  <span class="tally ok">${summary.ok} OK</span>
  <span class="tally review">${summary.needsReview} needs-review</span>
  <span class="tally diff">${summary.different} different</span>
</div>

<div class="controls">
  <label>Status
    <select id="f-status">
      <option value="">all</option>
      <option value="same">same</option>
      <option value="needs-review">needs-review</option>
      <option value="different">different</option>
    </select>
  </label>
  <label>Reason filter
    <input id="f-reason" type="text" placeholder="e.g. GENERATOR or WIDGET">
  </label>
  <label>Pack filter
    <input id="f-pack" type="text" placeholder="e.g. solar, logos">
  </label>
</div>

<div class="section-title">By pack</div>
<div class="by-pack">${packGrid}</div>

<div class="section-title">By classifier reason</div>
<ul>${reasonsList}</ul>

<div class="section-title">Rows (different → needs-review → same)</div>
${rowHtml}

<script>${FILTER_JS}</script>
</body>
</html>`;
  await writeFile(join(outBase, 'index.html'), html, 'utf8');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
