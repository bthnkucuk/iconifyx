import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
// @ts-expect-error fontkit ships its own types via @types/fontkit but they're
// not picked up under bun's resolver; the runtime API is stable.
import * as fontkit from 'fontkit';

import { log } from './log.ts';
import type { Manifest } from './manifest.ts';
import { secondaryFontFamily } from './manifest.ts';
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

// ---------------------------------------------------------------------------
// Secondary-glyph CMAP-NAME verification (cmap-dedup demote detector).
//
// The empty-outline check in `verifyFontsAgainstManifests` above passes when a
// codepoint maps to ANY glyph — including the wrong glyph that `svg2ttf`'s
// outline-dedup pass aliased the codepoint onto. Solar's
// `add-circle-bold-duotone` (cp 0xE013) is the canonical case: in
// `SolarSecondary.ttf` the cmap resolves cp 0xE013 to glyph
// `accessibility-bold-duotone` (the alphabetically-first duotone whose outline
// `svg2ttf` reused). The widget then paints "the right primary plus a wrong
// secondary that happens to look like a halka" — visually reads as
// misalignment but is actually a wrong-glyph bug.
//
// Detection: walk every duotone icon in the manifest, open its
// `<Family>Secondary.ttf`, look up `cmap[codepoint]`, and compare the
// resolved glyph's NAME against the manifest icon name. A mismatch means the
// secondary cmap is aliased. `font_verify`'s existing `missing/empty` checks
// stay; this is an additional layer.
//
// The fix is then driven from `pipeline.ts`: any aliased secondary causes the
// icon's `duotone` flag to flip to `false` (codegen then emits `.solo` instead
// of `.duo`, so the wrong-glyph never renders). The codepoint stays reserved
// per CLAUDE.md §3.

export interface SecondaryAliasEntry {
  /** Iconify icon name that was declared duotone. */
  iconName: string;
  /** Codepoint that should have resolved to its own secondary glyph. */
  codepoint: number;
  /** Glyph name the cmap actually resolves to in the secondary TTF. */
  resolvedGlyphName: string;
}

export interface SecondaryNameVerifyResult {
  /** Iconify pack prefix (`solar`, `ph`, ...). */
  prefix: string;
  /** Secondary TTF family checked (`SolarSecondary`). */
  family: string;
  /** Number of declared duotone icons checked. */
  declared: number;
  /** Icons whose secondary cmap resolves to a glyph with the WRONG name. */
  aliased: SecondaryAliasEntry[];
  /** Icons whose codepoint is missing from the secondary cmap entirely. */
  missing: string[];
  /** File-level open failure (couldn't read TTF). */
  fontError?: string;
}

/**
 * For a single manifest, walk every `<Family>Secondary.ttf` declared by the
 * pack and check each duotone icon's codepoint against the secondary cmap.
 * Returns one result per Secondary font. Manifests with no duotone icons
 * return an empty array.
 *
 * Pure read — does not mutate the manifest. Callers (pipeline.ts) apply the
 * demote-to-solo policy themselves.
 *
 * @param manifest - pack manifest to walk for duotone icons
 * @param opts.ttfBuffers - optional in-memory `family → TTF buffer` map. When
 *   provided, takes precedence over reading from disk (used by the pipeline
 *   so it can verify TTFs that haven't been written yet). When absent the
 *   audit reads from `<setPackageFontsDir>/<family>.ttf`.
 * @param opts.fontsDir - override the on-disk fonts directory (audit / tests).
 */
export function verifySecondaryGlyphNames(
  manifest: Manifest,
  opts: { ttfBuffers?: Map<string, Buffer>; fontsDir?: string } = {}
): SecondaryNameVerifyResult[] {
  const fontsDir = opts.fontsDir ?? setPackageFontsDir(manifest.prefix);
  const inMem = opts.ttfBuffers;
  const out: SecondaryNameVerifyResult[] = [];

  // Pre-bucket duotone icons by their PRIMARY family so we only open each
  // Secondary TTF once.
  const duotoneByPrimary = new Map<string, { name: string; codepoint: number }[]>();
  for (const [name, ic] of Object.entries(manifest.icons)) {
    if (ic.deprecated || !ic.duotone) continue;
    const arr = duotoneByPrimary.get(ic.fontFamily) ?? [];
    arr.push({ name, codepoint: ic.codepoint });
    duotoneByPrimary.set(ic.fontFamily, arr);
  }

  for (const [primaryFamily, expected] of duotoneByPrimary) {
    const secFamily = secondaryFontFamily(primaryFamily);
    let font: {
      hasGlyphForCodePoint?: (cp: number) => boolean;
      glyphForCodePoint?: (cp: number) => { name?: string };
    } | null = null;
    const inMemBuf = inMem?.get(secFamily);
    if (inMemBuf) {
      try {
        font = fontkit.create(inMemBuf);
      } catch (e) {
        out.push({
          prefix: manifest.prefix,
          family: secFamily,
          declared: expected.length,
          aliased: [],
          missing: [],
          fontError: e instanceof Error ? e.message.slice(0, 200) : String(e),
        });
        continue;
      }
    } else {
      const ttfPath = path.join(fontsDir, `${secFamily}.ttf`);
      if (!existsSync(ttfPath)) {
        out.push({
          prefix: manifest.prefix,
          family: secFamily,
          declared: expected.length,
          aliased: [],
          missing: [],
          fontError: 'TTF file does not exist',
        });
        continue;
      }
      try {
        font = fontkit.openSync(ttfPath);
      } catch (e) {
        out.push({
          prefix: manifest.prefix,
          family: secFamily,
          declared: expected.length,
          aliased: [],
          missing: [],
          fontError: e instanceof Error ? e.message.slice(0, 200) : String(e),
        });
        continue;
      }
    }
    const aliased: SecondaryAliasEntry[] = [];
    const missing: string[] = [];
    for (const { name, codepoint } of expected) {
      if (!font?.hasGlyphForCodePoint?.(codepoint)) {
        missing.push(name);
        continue;
      }
      const glyph = font.glyphForCodePoint?.(codepoint);
      const resolved = glyph?.name ?? '';
      if (resolved !== name) {
        aliased.push({ iconName: name, codepoint, resolvedGlyphName: resolved });
      }
    }
    out.push({
      prefix: manifest.prefix,
      family: secFamily,
      declared: expected.length,
      aliased,
      missing,
    });
  }

  return out;
}

/**
 * Walk every manifest's Secondary TTFs and write a `SECONDARY_NAME_AUDIT.md`
 * report under repo root. Used by the `bun run audit secondary-name-check`
 * dispatcher entry — purely advisory, does NOT mutate any manifest.
 */
export async function writeSecondaryNameAudit(
  manifests: Manifest[]
): Promise<{ totalDeclared: number; totalAliased: number; totalMissing: number }> {
  const allResults: SecondaryNameVerifyResult[] = [];
  for (const m of manifests) {
    const results = verifySecondaryGlyphNames(m);
    for (const r of results) allResults.push(r);
  }

  const totalDeclared = allResults.reduce((s, r) => s + r.declared, 0);
  const totalAliased = allResults.reduce((s, r) => s + r.aliased.length, 0);
  const totalMissing = allResults.reduce((s, r) => s + r.missing.length, 0);
  const totalErrors = allResults.filter((r) => r.fontError).length;

  // Sort: errors first, then by aliased count desc.
  allResults.sort((a, b) => {
    if (a.fontError && !b.fontError) return -1;
    if (!a.fontError && b.fontError) return 1;
    return b.aliased.length - a.aliased.length;
  });

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('# Secondary-glyph cmap-name audit');
  lines.push('');
  lines.push(
    `Generated ${today}. For every duotone icon in every pack, open the ` +
      `matching \`<Family>Secondary.ttf\` and check that \`cmap[codepoint]\` ` +
      `resolves to a glyph whose name equals the icon name. A mismatch ` +
      `means \`svg2ttf\`'s outline-dedup aliased the codepoint to a ` +
      `different glyph's name, so the icon ships with the wrong secondary ` +
      `letterform (visible as duotone misalignment / wrong shape). The ` +
      `pipeline demotes any aliased duotone to \`.solo\` at codegen time; ` +
      `this report verifies how many would be flagged on the next regen.`
  );
  lines.push('');
  lines.push(`- **Duotone icons checked across all packs:** ${totalDeclared.toLocaleString('en-US')}`);
  lines.push(`- **Aliased (cmap → wrong glyph name):** ${totalAliased.toLocaleString('en-US')}`);
  lines.push(`- **Missing (codepoint not in cmap at all):** ${totalMissing.toLocaleString('en-US')}`);
  lines.push(`- **Secondary TTFs that failed to open:** ${totalErrors}`);
  lines.push('');

  const driftRows = allResults.filter(
    (r) => r.fontError || r.aliased.length > 0 || r.missing.length > 0
  );
  if (driftRows.length === 0) {
    lines.push('_No aliased secondaries — every duotone icon paints its own secondary glyph._');
  } else {
    lines.push('## Secondary fonts with aliased duotone codepoints');
    lines.push('');
    lines.push('| Prefix | Secondary font | Declared | Aliased | Missing | Sample aliasing | Error |');
    lines.push('|---|---|---:|---:|---:|---|---|');
    for (const r of driftRows) {
      const sample = r.aliased
        .slice(0, 2)
        .map((a) => `\`${a.iconName}\`→\`${a.resolvedGlyphName}\``)
        .join(', ') || '—';
      lines.push(
        `| \`${r.prefix}\` | \`${r.family}\` | ${r.declared.toLocaleString('en-US')} | ${r.aliased.length.toLocaleString('en-US')} | ${r.missing.length.toLocaleString('en-US')} | ${sample} | ${r.fontError ? '`' + r.fontError + '`' : '—'} |`
      );
    }
  }
  lines.push('');

  await writeFile(
    path.join(repoRoot(), 'SECONDARY_NAME_AUDIT.md'),
    lines.join('\n'),
    'utf8'
  );

  return { totalDeclared, totalAliased, totalMissing };
}
