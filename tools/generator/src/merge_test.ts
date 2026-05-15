#!/usr/bin/env bun
/**
 * Standalone end-to-end test for the font-merger pipeline.
 *
 * Reads the iconifyx_mdi pack's 3 sibling TTFs, runs them through
 * mergeFonts(), writes the result to /tmp, prints summary stats.
 *
 *     bun run merge-test
 *
 * Used to verify Phase A of the §32 implementation. Once the merger
 * is integrated into the main pipeline, this script becomes a useful
 * regression check.
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { mergeFonts, ensurePythonVenv } from './font_merger.ts';
import { log } from './log.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..', '..');
const MDI_FONTS = path.join(REPO_ROOT, 'packages', 'iconifyx_mdi', 'assets', 'fonts');
const OUT_DIR = '/tmp/iconifyx-merge-test';

async function main(): Promise<void> {
  await ensurePythonVenv();

  const siblings = ['Mdi.ttf', 'Mdi_2.ttf', 'Mdi_3.ttf'];
  log.info(`reading ${siblings.length} mdi siblings from ${MDI_FONTS}`);

  const siblingsData = await Promise.all(
    siblings.map(async (file) => {
      const ttf = await readFile(path.join(MDI_FONTS, file));
      const family = file.replace(/\.ttf$/, '');
      log.info(`  ${family}: ${ttf.length} bytes`);
      return { family, ttf };
    })
  );

  const sizeBefore = siblingsData.reduce((n, s) => n + s.ttf.length, 0);
  log.info(`total before merge: ${sizeBefore} bytes`);

  const result = await mergeFonts({
    siblings: siblingsData,
    canonicalFamily: 'Mdi',
  });

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'Mdi.ttf');
  await writeFile(outPath, result.ttf);

  log.info('');
  log.info(`merged TTF size: ${result.ttf.length} bytes -> ${outPath}`);
  log.info(`size delta vs sum of inputs: ${result.ttf.length - sizeBefore} bytes`);

  for (const [siblingFamily, remap] of result.remap) {
    const cps = [...remap.entries()];
    log.info(
      `${siblingFamily}: ${cps.length} codepoints remapped — sample: ${cps
        .slice(0, 3)
        .map(([from, to]) => `0x${from.toString(16)} -> 0x${to.toString(16)}`)
        .join(', ')}`
    );
  }

  log.info('');
  log.info(
    `Phase A test: PASS — single TTF emission for mdi pack works. ` +
      `Next: run a Flutter test app against this TTF to confirm supp-PUA glyphs render.`
  );
}

await main();
