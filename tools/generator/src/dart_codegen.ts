import type { Manifest, ManifestIconEntry } from './manifest.ts';
import { formatCodepoint } from './codepoint_allocator.ts';
import { dartClassNameFromPrefix } from './group_sets.ts';
import { secondaryFontFamily } from './manifest.ts';

export interface DartCodegenInput {
  manifest: Manifest;
  /** Package name that owns this set's font (e.g. "iconifyx_mdi"). */
  fontPackage: string;
}

/**
 * Generated Dart files for one set.
 *
 * - `setDart`: the main `<Prefix>Icons` class (canonical icons only).
 * - `aliasesDart`: optional `lib/aliases.dart` exporting a
 *   `Map<String, IconifyIconData>` of pure-rename aliases (§22 Rec 1).
 *   `null` for packs with no aliases.
 * - `categoriesDart`: optional `lib/categories.dart` exporting a
 *   `Map<String, List<IconifyIconData>>` of `info.categories` groupings
 *   (§22 Rec 2). `null` for packs whose upstream JSON has no
 *   `categories` data.
 *
 * The two opt-in files are NOT re-exported from the per-set library
 * (`iconifyx_<prefix>.dart`); callers reach them via explicit imports
 * (`import 'package:iconifyx_mdi/aliases.dart';`). That keeps tree-shake
 * intact for the common case — apps that only call e.g. `MdiIcons.home`
 * never pull the alias or category data.
 */
export interface DartCodegenOutput {
  setDart: string;
  aliasesDart: string | null;
  categoriesDart: string | null;
}

/**
 * Emit Dart sources for one set.
 *
 * Critical design points:
 *  - Main class is annotated `@staticIconProvider` so Flutter's tree shaker
 *    treats it as "icons live here, ignore non-IconData fields" — none exist
 *    anyway.
 *  - Each field is a `const IconifyIconData(const IconData(...))`. Because
 *    IconifyIconData is an `extension type const`, it erases at compile time
 *    and the inner const IconData survives in the kernel, which is what
 *    `--tree-shake-icons` looks for.
 *  - Deprecated icons (removed upstream) are omitted from the Dart class
 *    but kept in the manifest so their codepoint stays reserved.
 *  - §22 Rec 1: alias entries (those with `aliasOf` set) are omitted from
 *    the main class and emitted into `aliases.dart` as map entries pointing
 *    at the canonical const. Halves Dart line count on alias-heavy packs.
 *  - Icons are emitted in alphabetical order by iconify name for stable
 *    diffs.
 */
export function emitSetDart(input: DartCodegenInput): DartCodegenOutput {
  const { manifest, fontPackage } = input;
  const className = dartClassNameFromPrefix(manifest.prefix);

  const info = manifest.info;

  // Partition into canonicals + aliases. Both are live (deprecated entries
  // skipped from the start). Sort each pile by iconify name so codegen is
  // deterministic and diffs are stable across regens.
  const liveEntries = Object.entries(manifest.icons)
    .filter(([, e]) => !e.deprecated)
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalEntries = liveEntries.filter(([, e]) => !e.aliasOf);
  const aliasEntries = liveEntries.filter(([, e]) => !!e.aliasOf);

  const liveIconCount = canonicalEntries.length + aliasEntries.length;

  const header = [
    `// GENERATED FILE — do not edit.`,
    `// Source: @iconify/json v${manifest.iconifyJsonVersion}, set "${manifest.prefix}"`,
    `// Regenerate via \`bun run generate --set ${manifest.prefix}\`.`,
    ``,
    `import 'package:flutter/widgets.dart';`,
    `import 'package:iconifyx_core/iconifyx_core.dart';`,
    ``,
    `/// ${info.name}`,
    `///`,
    info.author?.name ? `/// Author: ${escapeDoc(info.author.name)}` : null,
    `/// License: ${escapeDoc(info.license.title)}${info.license.url ? ` — ${escapeDoc(info.license.url)}` : ''}`,
    `/// Icons: ${liveIconCount}${manifest.fonts.length > 1 ? ` (split across ${manifest.fonts.length} fonts)` : ''}${aliasEntries.length > 0 ? ` (${canonicalEntries.length} canonical + ${aliasEntries.length} aliases in lib/aliases.dart)` : ''}`,
    `///`,
    `/// Generated from @iconify/json v${manifest.iconifyJsonVersion}.`,
    `@staticIconProvider`,
    `class ${className} {`,
    `  const ${className}._();`,
    ``,
  ].filter((l): l is string => l !== null);

  const lines: string[] = [...header];

  for (const [name, entry] of canonicalEntries) {
    if (entry.duotone) {
      // Single const per duotone icon: bundles both layers (primary in
      // the regular font, secondary at the same codepoint in
      // <Family>Secondary). Sole constructor `IconifyIconData.duo` takes
      // an optional `kind:` named arg that drives `IconifyIcon`'s render
      // composition (hint-layer / paint-order / mask-internal).
      const secFamily = secondaryFontFamily(entry.fontFamily);
      const kind = entry.duotoneKind ?? 'hint';
      const kindArg =
        kind === 'paintOrder'
          ? ', kind: IconifyIconData.kindPaintOrder'
          : kind === 'maskInternal'
            ? ', kind: IconifyIconData.kindMaskInternal'
            : '';
      const kindNote =
        kind === 'paintOrder'
          ? ' (paint-order duotone)'
          : kind === 'maskInternal'
            ? ' (mask-internal duotone)'
            : ' (duo-tone)';
      lines.push(`  /// \`${escapeDoc(name)}\`${kindNote}`);
      lines.push(`  static const IconifyIconData ${entry.identifier} = IconifyIconData.duo(`);
      lines.push(`    IconData(${formatCodepoint(entry.codepoint)}, fontFamily: '${entry.fontFamily}', fontPackage: '${fontPackage}'),`);
      lines.push(`    IconData(${formatCodepoint(entry.codepoint)}, fontFamily: '${secFamily}', fontPackage: '${fontPackage}')${kindArg},`);
      lines.push(`  );`);
      lines.push('');
      continue;
    }

    lines.push(`  /// \`${escapeDoc(name)}\``);
    lines.push(`  static const IconifyIconData ${entry.identifier} = IconifyIconData.solo(`);
    lines.push(`    IconData(${formatCodepoint(entry.codepoint)}, fontFamily: '${entry.fontFamily}', fontPackage: '${fontPackage}'),`);
    lines.push(`  );`);
    lines.push('');
  }

  lines.push(`}`);
  lines.push('');

  const setDart = lines.join('\n');

  // §22 Rec 1: alias map. Each entry is `'<iconify-name>': <CanonicalConst>,`.
  // We resolve the canonical's identifier via `manifest.icons[entry.aliasOf]`.
  // Aliases pointing at deprecated or missing canonicals are skipped
  // (the allocator should never produce these, but belt-and-braces).
  let aliasesDart: string | null = null;
  if (aliasEntries.length > 0) {
    const aliasMapName = aliasMapIdentifier(manifest.prefix);
    const aliasLines: string[] = [
      `// GENERATED FILE — do not edit.`,
      `// Source: @iconify/json v${manifest.iconifyJsonVersion}, set "${manifest.prefix}"`,
      `// Regenerate via \`bun run generate --set ${manifest.prefix}\`.`,
      ``,
      `import 'package:iconifyx_core/iconifyx_core.dart';`,
      ``,
      `import 'src/sets/${manifest.prefix.replace(/-/g, '_')}.dart';`,
      ``,
      `/// Alias map for the "${manifest.prefix}" pack (${aliasEntries.length} entries).`,
      `///`,
      `/// Pure-rename aliases share their canonical's codepoint, so this map`,
      `/// is purely a Dart-side convenience — every value points at the matching`,
      `/// const on the main \`${className}\` class.`,
      `///`,
      `/// Importing this file is opt-in. Apps that only need a few canonical`,
      `/// icons should import the main library instead; the tree shaker drops`,
      `/// every unused canonical from the bundled TTF. Pulling this map in`,
      `/// retains every referenced canonical — which is the correct behaviour`,
      `/// for browse / search use cases.`,
      `const Map<String, IconifyIconData> ${aliasMapName} = {`,
    ];
    for (const [name, entry] of aliasEntries) {
      const canonical = manifest.icons[entry.aliasOf!];
      if (!canonical || canonical.deprecated) continue;
      aliasLines.push(`  ${dartStringLiteral(name)}: ${className}.${canonical.identifier},`);
    }
    aliasLines.push(`};`);
    aliasLines.push('');
    aliasesDart = aliasLines.join('\n');
  }

  // §22 Rec 2: category map. For each upstream category, emit an ordered
  // list of canonical IconifyIconData references. Aliases are intentionally
  // omitted — the canonical's const already covers the visual; including
  // aliases would just inflate the list without changing the rendered icon
  // set.
  let categoriesDart: string | null = null;
  // Aggregate categories from canonical entries (aliases inherit visually).
  const byCategory = new Map<string, ManifestIconEntry[]>();
  for (const [, entry] of canonicalEntries) {
    if (!entry.categories || entry.categories.length === 0) continue;
    for (const cat of entry.categories) {
      let arr = byCategory.get(cat);
      if (!arr) {
        arr = [];
        byCategory.set(cat, arr);
      }
      arr.push(entry);
    }
  }
  if (byCategory.size > 0) {
    const categoriesMapName = categoriesMapIdentifier(manifest.prefix);
    const categoryNames = [...byCategory.keys()].sort();
    const totalEntries = [...byCategory.values()].reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    const catLines: string[] = [
      `// GENERATED FILE — do not edit.`,
      `// Source: @iconify/json v${manifest.iconifyJsonVersion}, set "${manifest.prefix}"`,
      `// Regenerate via \`bun run generate --set ${manifest.prefix}\`.`,
      ``,
      `import 'package:iconifyx_core/iconifyx_core.dart';`,
      ``,
      `import 'src/sets/${manifest.prefix.replace(/-/g, '_')}.dart';`,
      ``,
      `/// Per-category icon lists for the "${manifest.prefix}" pack`,
      `/// (${byCategory.size} categories, ${totalEntries} membership entries).`,
      `///`,
      `/// Mirrors the upstream Iconify JSON's \`info.categories\` map.`,
      `/// Importing this file pulls in every listed canonical icon (the`,
      `/// tree-shaker can't follow Map<String, List<IconifyIconData>>`,
      `/// lookups), so prefer importing only the categories you actually`,
      `/// browse. For point lookups, prefer the main \`${className}\` class.`,
      `const Map<String, List<IconifyIconData>> ${categoriesMapName} = {`,
    ];
    for (const cat of categoryNames) {
      const entries = byCategory.get(cat)!;
      // Sort within each list by identifier for deterministic codegen.
      const sorted = [...entries].sort((a, b) =>
        a.identifier.localeCompare(b.identifier)
      );
      catLines.push(`  ${dartStringLiteral(cat)}: <IconifyIconData>[`);
      for (const e of sorted) {
        catLines.push(`    ${className}.${e.identifier},`);
      }
      catLines.push(`  ],`);
    }
    catLines.push(`};`);
    catLines.push('');
    categoriesDart = catLines.join('\n');
  }

  return { setDart, aliasesDart, categoriesDart };
}

function escapeDoc(s: string): string {
  return s.replace(/\*\//g, '*​/');
}

/**
 * Variable name for the alias map. e.g. "mdi" → "mdiAliases",
 * "fa6-solid" → "fa6SolidAliases".
 */
function aliasMapIdentifier(prefix: string): string {
  return camelCase(prefix) + 'Aliases';
}

/**
 * Variable name for the category map. e.g. "mdi" → "mdiCategories".
 */
function categoriesMapIdentifier(prefix: string): string {
  return camelCase(prefix) + 'Categories';
}

function camelCase(prefix: string): string {
  return prefix
    .split(/[-_]/g)
    .filter((t) => t.length > 0)
    .map((t, i) =>
      i === 0
        ? t.toLowerCase()
        : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Dart string-literal escaping for icon names. Iconify names are
 * `[a-z0-9-]+` so the only special character we need to handle is the
 * single quote (won't appear) and the dollar sign (won't appear). Use
 * single quotes for consistency with the rest of the generated code.
 */
function dartStringLiteral(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}'`;
}
