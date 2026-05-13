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

/** Emit license.dart with one IconSetLicense const for this set. */
export function emitSetLicenseDart(manifest: Manifest): string {
  const lines: string[] = [];
  const info = manifest.info;
  lines.push(`// GENERATED FILE — do not edit.`);
  lines.push(``);
  lines.push(`import 'package:iconifyx_core/iconifyx_core.dart';`);
  lines.push(``);
  lines.push(`/// License metadata for the "${manifest.prefix}" icon set.`);
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
