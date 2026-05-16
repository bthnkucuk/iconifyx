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

// ----------------------------------------------------------------------------
// §22 Rec 4 — Category-meta packages
// ----------------------------------------------------------------------------
//
// Each Iconify set has an `info.category` (e.g. "Material", "Emoji",
// "Logos"). We group packs by that field and emit one extra meta-only
// Dart package per category with ≥ 3 members. Consumers who want
// "all logos packs" can `depends_on: iconifyx_logos_meta` instead of
// listing the dozen logo-prefix packs by hand.
//
// Structurally identical to the kitchen-sink `iconifyx` meta — just
// scoped to one category. Tree-shake behaviour is unchanged: when a
// consumer references one icon from one of the meta's transitive
// member packs, only that pack's font ships (Dart codegen retains the
// per-set `@staticIconProvider`). The trade-off is that ASSET deps
// pull every member pack's font in even if the consumer never references
// it — a deliberate convenience cost, documented per-meta in the
// emitted library doc-comment.

/**
 * Canonical Iconify category names mapped to Dart-package-name-safe
 * suffixes. The suffix becomes `iconifyx_<suffix>_meta`. The `_meta`
 * tail is mandatory — without it `Logos` would collide with the
 * existing `iconifyx_logos` set package (Iconify ships a `logos`
 * prefix).
 *
 * Any category not listed here passes through `slugifyCategory` which
 * lower-cases + ASCIIfies + collapses non-alnum to underscore. The
 * explicit table catches the long/punctuated category names (`UI 24px`,
 * `Flags / Maps`, …) so they emit human-readable pack names.
 */
const CATEGORY_SUFFIXES: Record<string, string> = {
  'UI 24px': 'ui_24',
  'UI 16px / 32px': 'ui_compact',
  'UI Other / Mixed Grid': 'ui_mixed',
  'UI Multicolor': 'ui_multicolor',
  Material: 'material',
  Logos: 'logos',
  Emoji: 'emoji',
  Programming: 'programming',
  Thematic: 'thematic',
  'Flags / Maps': 'flags',
  'Archive / Unmaintained': 'archive',
};

/**
 * Slug fallback for categories not in `CATEGORY_SUFFIXES`. ASCII-fold,
 * lower-case, collapse runs of non-alnum to `_`. Pads a leading `c_`
 * if the result starts with a digit (Dart package names must start
 * with `[a-z]`).
 */
function slugifyCategory(name: string): string {
  let s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'misc';
  if (/^[0-9]/.test(s)) s = `c_${s}`;
  return s;
}

/**
 * Pub package name for a category-meta pack. `iconifyx_<suffix>_meta`.
 */
export function categoryMetaPackageName(category: string): string {
  const suffix =
    CATEGORY_SUFFIXES[category] ??
    slugifyCategory(category);
  return `iconifyx_${suffix}_meta`;
}

/**
 * Dart file/library basename inside the meta package
 * (`lib/iconifyx_<suffix>_meta.dart`).
 */
export function categoryMetaLibraryBase(category: string): string {
  return categoryMetaPackageName(category);
}

export interface CategoryMetaPubspecInput {
  category: string;
  /** Full pub package names of every member, sorted. */
  memberPackages: string[];
  /** Pinned version to emit. Computed from member pack hash list. */
  version: string;
}

export function emitCategoryMetaPubspec(
  input: CategoryMetaPubspecInput
): string {
  const { category, memberPackages, version } = input;
  const pkgName = categoryMetaPackageName(category);
  const deps = memberPackages
    .map((sp) => `  ${sp}:\n    path: ../${sp}`)
    .join('\n');

  // Pubspec.yaml description must be a single short line (pub.dev lints
  // anything over ~180 chars). The category name is kept human-readable.
  const desc = `iconifyx category-meta package: re-exports every "${category}" Iconify pack (${memberPackages.length} members). Convenient bundle for apps that want all icons in this category at the cost of shipping every member font.`;

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
${deps}
`;
}

export interface CategoryMetaLibraryInput {
  category: string;
  /** Full pub package names of every member, sorted. */
  memberPackages: string[];
}

export function emitCategoryMetaLibraryFile(
  input: CategoryMetaLibraryInput
): string {
  const { category, memberPackages } = input;
  const exports = memberPackages
    .map((sp) => `export 'package:${sp}/${sp}.dart';`)
    .sort()
    .join('\n');

  return `/// iconifyx — category-meta export for "${category}".
///
/// Re-exports every per-set package whose Iconify \`info.category\` is
/// "${category}". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// \`iconifyx_<prefix>\` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (${memberPackages.length}): ${memberPackages.join(', ')}.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

${exports}
`;
}
