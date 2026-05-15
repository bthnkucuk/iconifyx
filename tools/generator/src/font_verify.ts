import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
// @ts-expect-error fontkit ships its own types via @types/fontkit but they're
// not picked up under bun's resolver; the runtime API is stable.
import * as fontkit from 'fontkit';

import { log } from './log.ts';
import type { Manifest } from './manifest.ts';
import { setPackageFontsDir } from './paths.ts';
import { repoRoot } from './paths.ts';

/**
 * Per-set drift between the manifest's declared (codepoint, fontFamily) pairs
 * and what each emitted TTF actually contains. We open every font with
 * fontkit, query each manifest codepoint, and check three things:
 *
 *   1. Font opens at all (file isn't corrupt).
 *   2. `font.hasGlyphForCodePoint(cp)` returns true.
 *   3. The matched glyph has at least one path command (otherwise it's an
 *      empty glyph slot that consumers will render as a blank box).
 *
 * Anything that fails one of those three is surfaced in `FONT_AUDIT.md`
 * (regenerated on every build) so silent svg2ttf data loss can't reach
 * consumers without showing up first in the audit.
 */
export interface FontVerifyEntry {
  prefix: string;
  family: string;
  codepointsExpected: number;
  /** Codepoints present in the manifest but missing from the TTF. */
  missing: { codepoint: number; name: string }[];
  /** Codepoints present in the TTF but with an empty glyph outline. */
  empty: { codepoint: number; name: string }[];
  /** File-level failures (couldn't open, wrong magic, etc.). */
  fontError?: string;
}

function inspectFont(
  ttfPath: string,
  expected: { codepoint: number; iconName: string }[]
): { missing: { codepoint: number; name: string }[]; empty: { codepoint: number; name: string }[]; fontError?: string } {
  if (!existsSync(ttfPath)) {
    return { missing: [], empty: [], fontError: 'TTF file does not exist' };
  }
  let font: { hasGlyphForCodePoint?: (cp: number) => boolean; glyphForCodePoint?: (cp: number) => { path?: { commands?: unknown[] } } } | null = null;
  try {
    // @ts-expect-error openSync is untyped under bun
    font = fontkit.openSync(ttfPath);
  } catch (e) {
    return {
      missing: [],
      empty: [],
      fontError: e instanceof Error ? e.message.slice(0, 200) : String(e),
    };
  }
  const missing: { codepoint: number; name: string }[] = [];
  const empty: { codepoint: number; name: string }[] = [];
  for (const { codepoint, iconName } of expected) {
    if (!font?.hasGlyphForCodePoint?.(codepoint)) {
      missing.push({ codepoint, name: iconName });
      continue;
    }
    const glyph = font.glyphForCodePoint?.(codepoint);
    const commands = glyph?.path?.commands ?? [];
    if (commands.length === 0) {
      empty.push({ codepoint, name: iconName });
    }
  }
  return { missing, empty };
}

/**
 * Walk every set's manifest + on-disk TTFs and produce a FONT_AUDIT.md
 * report of any codepoint that exists in the manifest but not in the
 * shipped font (or that exists but has no outline). The audit is purely
 * advisory — it does NOT mutate any manifest or fail the build — but the
 * counts surface silent data loss before consumers feel it (e.g. the
 * "Mdi_2.ttf is 664 bytes — perfect tree-shake" assertion would silently
 * pass even if half of Mdi_2's glyphs were emit-failures inside svg2ttf).
 */
export async function verifyFontsAgainstManifests(
  manifests: Manifest[]
): Promise<void> {
  const entries: FontVerifyEntry[] = [];

  for (const m of manifests) {
    for (const fontEntry of m.fonts) {
      const ttfPath = path.join(
        setPackageFontsDir(m.prefix),
        `${fontEntry.family}.ttf`
      );
      const isSecondary = fontEntry.family.endsWith('Secondary');
      const primaryFamily = isSecondary
        ? fontEntry.family.slice(0, -'Secondary'.length)
        : fontEntry.family;

      const expected: { codepoint: number; iconName: string }[] = [];
      for (const [iconName, ic] of Object.entries(m.icons)) {
        if (ic.deprecated) continue;
        if (ic.fontFamily !== primaryFamily) continue;
        if (isSecondary && !ic.duotone) continue;
        expected.push({ codepoint: ic.codepoint, iconName });
      }
      if (expected.length === 0) continue;

      const { missing, empty, fontError } = inspectFont(ttfPath, expected);
      entries.push({
        prefix: m.prefix,
        family: fontEntry.family,
        codepointsExpected: expected.length,
        missing,
        empty,
        fontError,
      });
    }
  }

  // Sort: errors first, then by drift count (missing + empty).
  entries.sort((a, b) => {
    if (a.fontError && !b.fontError) return -1;
    if (!a.fontError && b.fontError) return 1;
    const aDrift = a.missing.length + a.empty.length;
    const bDrift = b.missing.length + b.empty.length;
    return bDrift - aDrift;
  });

  const totalExpected = entries.reduce((s, e) => s + e.codepointsExpected, 0);
  const totalMissing = entries.reduce((s, e) => s + e.missing.length, 0);
  const totalEmpty = entries.reduce((s, e) => s + e.empty.length, 0);
  const totalErrors = entries.filter((e) => e.fontError).length;

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('# Font / manifest reconciliation audit');
  lines.push('');
  lines.push(
    `Generated ${today}. For every \`(font, codepoint)\` pair declared in a ` +
      `pack's manifest, we open the emitted TTF with \`fontkit\` and verify ` +
      `the codepoint maps to a glyph with a non-empty outline. Anything that ` +
      `fails one of those checks ships as a blank box in the consumer app.`
  );
  lines.push('');
  lines.push(`- **Codepoints expected across all fonts:** ${totalExpected.toLocaleString('en-US')}`);
  lines.push(`- **Codepoints missing from emitted TTF:** ${totalMissing.toLocaleString('en-US')}`);
  lines.push(`- **Codepoints present but with empty outline:** ${totalEmpty.toLocaleString('en-US')}`);
  lines.push(`- **TTFs that failed to open:** ${totalErrors}`);
  lines.push('');

  const driftRows = entries.filter(
    (e) => e.fontError || e.missing.length > 0 || e.empty.length > 0
  );
  if (driftRows.length === 0) {
    lines.push('_No drift detected — every manifest codepoint resolves to a non-empty glyph._');
  } else {
    lines.push('## Fonts with drift');
    lines.push('');
    lines.push('| Prefix | Font | Expected | Missing | Empty | Sample missing/empty | Error |');
    lines.push('|---|---|---:|---:|---:|---|---|');
    for (const e of driftRows) {
      const sample = [
        ...e.missing.slice(0, 2).map((x) => `\`${x.name}\``),
        ...e.empty.slice(0, 2).map((x) => `\`${x.name}\``),
      ]
        .slice(0, 3)
        .join(', ') || '—';
      lines.push(
        `| \`${e.prefix}\` | \`${e.family}\` | ${e.codepointsExpected.toLocaleString('en-US')} | ${e.missing.length.toLocaleString('en-US')} | ${e.empty.length.toLocaleString('en-US')} | ${sample} | ${e.fontError ? '`' + e.fontError + '`' : '—'} |`
      );
    }
  }
  lines.push('');

  await writeFile(
    path.join(repoRoot(), 'FONT_AUDIT.md'),
    lines.join('\n'),
    'utf8'
  );
  log.info(
    `font verification: ${totalExpected.toLocaleString('en-US')} codepoints checked, ` +
      `${totalMissing.toLocaleString('en-US')} missing + ${totalEmpty.toLocaleString('en-US')} empty across ${driftRows.length} font(s)`
  );
}
