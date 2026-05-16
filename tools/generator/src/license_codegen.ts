import type { Manifest } from './manifest.ts';

/** Emit LICENSE-3RD-PARTY.md for a single-set package. */
export function emitSetThirdPartyLicense(manifest: Manifest): string {
  const lines: string[] = [];
  const info = manifest.info;
  lines.push(`# Third-party license: ${info.name}`);
  lines.push('');
  lines.push(`This package bundles the Iconify icon set "${manifest.prefix}" (${info.name}).`);
  lines.push('');
  if (info.author?.name) {
    lines.push(`- Author: ${info.author.name}${info.author.url ? ` (${info.author.url})` : ''}`);
  }
  lines.push(`- License: ${info.license.title}${info.license.spdx ? ` (SPDX: ${info.license.spdx})` : ''}`);
  if (info.license.url) lines.push(`- License URL: ${info.license.url}`);
  lines.push(`- Icon count: ${info.total}`);
  return lines.join('\n') + '\n';
}

/**
 * Emit `license.dart` with one [PackInfo] const + a back-compat
 * [IconSetLicense] alias.
 *
 * Two consts per pack:
 *  - `packInfo` (§22 Rec 5) — compile-time pack-capability introspection.
 *    Carries name, category, tags, author, license, icon count, the
 *    `@iconify/json` version this pack was built against, plus the two
 *    capability flags `hasDuotone` / `hasPaintOrder` (computed from
 *    `manifest.icons`).
 *  - `iconSetLicense` — preserved verbatim for back-compat. Now a
 *    pointer to `packInfo.license`. Existing consumer code that reads
 *    `iconSetLicense` keeps compiling unchanged.
 *
 * Both consts are tree-shake-safe — they contain no [IconData]
 * references, only string / int / list metadata. Importing this file
 * does not retain any icons.
 */
export function emitSetLicenseDart(manifest: Manifest): string {
  const lines: string[] = [];
  const info = manifest.info;

  // Compute capability flags from manifest.icons. hasDuotone = any live
  // icon carries `duotone: true`; hasPaintOrder = any of those is the
  // paint-order flavour (logos / crypto-color / fluent-emoji-flat / …).
  let hasDuotone = false;
  let hasPaintOrder = false;
  for (const ic of Object.values(manifest.icons)) {
    if (ic.deprecated) continue;
    if (!ic.duotone) continue;
    hasDuotone = true;
    if (ic.duotoneKind === 'paintOrder') {
      hasPaintOrder = true;
      break;
    }
  }

  const tags = info.tags ?? [];

  lines.push(`// GENERATED FILE — do not edit.`);
  lines.push(``);
  lines.push(`import 'package:iconifyx_core/iconifyx_core.dart';`);
  lines.push(``);

  // ---------- packInfo (§22 Rec 5) ----------
  lines.push(`/// Compile-time pack info for the "${manifest.prefix}" icon set.`);
  lines.push(`///`);
  lines.push(`/// Surfaces name / category / tags / author / license, plus the`);
  lines.push(`/// `+ '`hasDuotone` / `hasPaintOrder` capability flags so picker UIs');
  lines.push(`/// can filter without loading the website's 9.8 MB icons index.`);
  lines.push(`const PackInfo packInfo = PackInfo(`);
  lines.push(`  prefix: '${escape(manifest.prefix)}',`);
  lines.push(`  name: '${escape(info.name)}',`);
  if (manifest.category) {
    lines.push(`  category: '${escape(manifest.category)}',`);
  }
  if (tags.length > 0) {
    const parts = tags.map((t) => `'${escape(t)}'`).join(', ');
    lines.push(`  tags: <String>[${parts}],`);
  }
  lines.push(`  iconCount: ${info.total},`);
  if (hasDuotone) lines.push(`  hasDuotone: true,`);
  if (hasPaintOrder) lines.push(`  hasPaintOrder: true,`);
  lines.push(`  iconifyJsonVersion: '${escape(manifest.iconifyJsonVersion)}',`);
  if (info.author?.name) {
    lines.push(`  author: IconAuthor(`);
    lines.push(`    name: '${escape(info.author.name)}',`);
    if (info.author.url) lines.push(`    url: '${escape(info.author.url)}',`);
    lines.push(`  ),`);
  }
  lines.push(`  license: IconSetLicense(`);
  lines.push(`    prefix: '${escape(manifest.prefix)}',`);
  lines.push(`    name: '${escape(info.name)}',`);
  if (info.author?.name) {
    lines.push(`    author: '${escape(info.author.name)}',`);
  }
  if (info.author?.url) {
    lines.push(`    authorUrl: '${escape(info.author.url)}',`);
  }
  lines.push(`    licenseTitle: '${escape(info.license.title)}',`);
  if (info.license.spdx) {
    lines.push(`    licenseSpdx: '${escape(info.license.spdx)}',`);
  }
  if (info.license.url) {
    lines.push(`    licenseUrl: '${escape(info.license.url)}',`);
  }
  lines.push(`    iconCount: ${info.total},`);
  lines.push(`  ),`);
  lines.push(`);`);
  lines.push(``);

  // ---------- iconSetLicense (back-compat) ----------
  // Emitted as an independent const (Dart doesn't accept `const x =
  // y.field` for instance fields, even of a const variable). Carries the
  // exact same payload as `packInfo.license`.
  lines.push(`/// License metadata for the "${manifest.prefix}" icon set.`);
  lines.push(`///`);
  lines.push(`/// Back-compat — equivalent to `+ '`packInfo.license`. New code');
  lines.push(`/// should prefer `+ '`packInfo` for pack-capability introspection.');
  lines.push(`const IconSetLicense iconSetLicense = IconSetLicense(`);
  lines.push(`  prefix: '${escape(manifest.prefix)}',`);
  lines.push(`  name: '${escape(info.name)}',`);
  if (info.author?.name) {
    lines.push(`  author: '${escape(info.author.name)}',`);
  }
  if (info.author?.url) {
    lines.push(`  authorUrl: '${escape(info.author.url)}',`);
  }
  lines.push(`  licenseTitle: '${escape(info.license.title)}',`);
  if (info.license.spdx) {
    lines.push(`  licenseSpdx: '${escape(info.license.spdx)}',`);
  }
  if (info.license.url) {
    lines.push(`  licenseUrl: '${escape(info.license.url)}',`);
  }
  lines.push(`  iconCount: ${info.total},`);
  lines.push(`);`);

  return lines.join('\n') + '\n';
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$');
}
