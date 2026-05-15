#!/usr/bin/env bun
/**
 * Regenerate the committed render samples at `docs/audit/render-samples/`.
 *
 * Run via:
 *   bun run tools/generator/audit/render/refresh-samples.ts
 *
 * Covers the five flavours we want a baseline for:
 *   - solo
 *   - hint duotone
 *   - the Solar alignment-bug case
 *   - paint-order duotone
 *   - mask-internal duotone
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HARNESS_DIR = new URL('.', import.meta.url).pathname;
const REPO_ROOT = resolve(HARNESS_DIR, '../../../..');
const OUT_DIR = join(REPO_ROOT, 'docs/audit/render-samples');
const CLI = join(HARNESS_DIR, 'render-icon.ts');

mkdirSync(OUT_DIR, { recursive: true });

const targets: Array<{
  ref: string;
  file: string;
  bg?: string;
  color?: string;
  mode?: string;
}> = [
  { ref: 'mdi:home', file: 'mdi-home.png', color: '0xff0066ff' },
  { ref: 'ph:acorn-duotone', file: 'ph-acorn-duotone.png' },
  {
    ref: 'solar:add-circle-bold-duotone',
    file: 'solar-add-circle-bold-duotone.png',
  },
  {
    ref: 'logos:adobe-after-effects',
    file: 'logos-adobe-after-effects.png',
    bg: '0xffffffff',
  },
  {
    ref: 'lets-icons:alarmclock-duotone-line',
    file: 'lets-icons-alarmclock-duotone-line.png',
  },
];

for (const t of targets) {
  const outPath = join(OUT_DIR, t.file);
  const args = [
    'run', CLI, t.ref,
    '--size', '256',
    '--mode', t.mode ?? 'duotone',
    '--out', outPath,
  ];
  if (t.color) args.push('--color', t.color);
  if (t.bg) args.push('--bg', t.bg);
  console.log(`→ rendering ${t.ref}`);
  const result = spawnSync('bun', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`failed: ${t.ref} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\ndone — samples in ${OUT_DIR}`);
