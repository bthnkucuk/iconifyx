import type { Manifest } from './manifest.ts';
import { dartFileNameFromPrefix } from './group_sets.ts';
import { setPackageName, prefixToPackageSuffix } from './paths.ts';

export interface SetPubspecInput {
  manifest: Manifest;
}

/**
 * Emit pubspec.yaml for a single-set package. Each set ships independently so
 * apps can depend only on the icons they use.
 */
export function emitSetPubspec(input: SetPubspecInput): string {
  const { manifest } = input;
  const pkgName = setPackageName(manifest.prefix);
  const live = Object.values(manifest.icons).filter((i) => !i.deprecated).length;
  const desc = `${manifest.info.name} icons from Iconify, packaged for Flutter (${live} icons, ${manifest.info.license.title} license).`;

  const fontEntries: string[] = [];
  const fontFamilies = [...manifest.fonts].sort((a, b) => a.family.localeCompare(b.family));
  for (const f of fontFamilies) {
    if (f.iconCount === 0) continue;
    fontEntries.push(`    - family: ${f.family}`);
    fontEntries.push(`      fonts:`);
    fontEntries.push(`        - asset: assets/fonts/${f.family}.ttf`);
  }

  // §22 Rec 3 — per-pack independent semver. The version lives in the
  // manifest (the source of truth) and is computed by
  // `version_bump.ts:decideVersionBump`. Fallback to the initial 0.1.0
  // covers the (vanishingly small) window where a regen reads a manifest
  // written before Rec 3 landed.
  const version = manifest.version ?? '0.1.0';

  return `name: ${pkgName}
description: >-
  ${escapeYaml(desc)}
version: ${version}
publish_to: 'none'

environment:
  sdk: ^3.3.0
  flutter: ">=3.19.0"

dependencies:
  flutter:
    sdk: flutter
  iconifyx_core:
    path: ../iconifyx_core

flutter:
  uses-material-design: false
  fonts:
${fontEntries.join('\n')}
`;
}

/**
 * Emit the top-level library file for a single-set package.
 * Re-exports the wrapper type from _core and the generated set class.
 */
export function emitSetLibraryFile(manifest: Manifest): string {
  const fileBase = dartFileNameFromPrefix(manifest.prefix).replace(/\.dart$/, '');
  return `/// ${manifest.info.name} icons.
///
/// Source: Iconify set "${manifest.prefix}".
/// License: ${manifest.info.license.title}.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'src/sets/${fileBase}.dart';
export 'src/license.dart';
`;
}

export interface MetaPackagePubspecInput {
  /** Full pub package names of every set, sorted. */
  setPackages: string[];
}

export function emitMetaPubspec(input: MetaPackagePubspecInput): string {
  const deps = input.setPackages.map(
    (sp) => `  ${sp}:\n    path: ../${sp}`
  ).join('\n');

  return `name: iconifyx
description: >-
  Meta package re-exporting every iconifyx_<set> package. Convenient but
  pulls in every bundled font. Prefer importing the specific per-set
  packages you actually use to keep bundle size minimal.
version: 0.1.0
publish_to: 'none'

environment:
  sdk: ^3.3.0
  flutter: ">=3.19.0"

dependencies:
  flutter:
    sdk: flutter
  iconifyx_core:
    path: ../iconifyx_core
${deps}
`;
}

export function emitMetaLibraryFile(setPackages: string[]): string {
  const exports = setPackages
    .map((sp) => `export 'package:${sp}/${sp}.dart';`)
    .sort()
    .join('\n');

  return `/// iconifyx — meta export of every per-set package.
///
/// Importing this single library makes every bundled Iconify set available,
/// at the cost of pulling in every font asset.
///
/// For minimum bundle size, depend on just the specific
/// \`iconifyx_<prefix>\` packages your app uses.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

${exports}
`;
}

function escapeYaml(s: string): string {
  // The block-scalar `>-` form handles most cases; only need to escape pipes,
  // ampersands etc. that could break it. Keep simple by avoiding newlines.
  return s.replace(/\s+/g, ' ').trim();
}

/** Unused export retained for backwards compatibility during refactor. */
export const __unusedPrefixSuffix = prefixToPackageSuffix;
