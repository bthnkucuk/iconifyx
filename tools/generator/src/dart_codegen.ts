import type { Manifest } from './manifest.ts';
import { formatCodepoint } from './codepoint_allocator.ts';
import { dartClassNameFromPrefix } from './group_sets.ts';
import { secondaryFontFamily } from './manifest.ts';

export interface DartCodegenInput {
  manifest: Manifest;
  /** Package name that owns this set's font (e.g. "iconifyx_mdi"). */
  fontPackage: string;
}

/**
 * Emit one Dart file per set.
 *
 * Critical design points:
 *  - Class is annotated `@staticIconProvider` so Flutter's tree shaker treats
 *    it as "icons live here, ignore non-IconData fields" — none exist anyway.
 *  - Each field is a `const IconifyIconData(const IconData(...))`. Because
 *    IconifyIconData is an `extension type const`, it erases at compile time
 *    and the inner const IconData survives in the kernel, which is what
 *    `--tree-shake-icons` looks for.
 *  - Deprecated icons (removed upstream) are omitted from the Dart class
 *    but kept in the manifest so their codepoint stays reserved.
 *  - Icons are emitted in alphabetical order by iconify name for stable
 *    diffs.
 */
export function emitSetDart(input: DartCodegenInput): string {
  const { manifest, fontPackage } = input;
  const className = dartClassNameFromPrefix(manifest.prefix);

  const info = manifest.info;
  const liveIconCount = Object.values(manifest.icons).filter((i) => !i.deprecated).length;

  const docLines: string[] = [];
  docLines.push(`${info.name}`);
  docLines.push(``);
  if (info.author?.name) docLines.push(`Author: ${info.author.name}`);
  docLines.push(
    `License: ${info.license.title}${info.license.url ? ` — ${info.license.url}` : ''}`
  );
  docLines.push(`Icons: $liveIconCount${manifest.fonts.length > 1 ? ` (split into ${manifest.fonts.length} fonts: ${manifest.fonts.map((f) => f.family).join(', ')})` : ''}`);
  docLines.push(``);
  docLines.push(`Generated from @iconify/json v${manifest.iconifyJsonVersion}.`);
  docLines.push(`Do not edit by hand — run \`bun run generate\` to update.`);

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
    `/// Icons: ${liveIconCount}${manifest.fonts.length > 1 ? ` (split across ${manifest.fonts.length} fonts)` : ''}`,
    `///`,
    `/// Generated from @iconify/json v${manifest.iconifyJsonVersion}.`,
    `@staticIconProvider`,
    `class ${className} {`,
    `  const ${className}._();`,
    ``,
  ].filter((l): l is string => l !== null);

  const lines: string[] = [...header];

  const names = Object.keys(manifest.icons).sort();
  for (const name of names) {
    const entry = manifest.icons[name]!;
    if (entry.deprecated) continue;

    if (entry.duotone) {
      // Single const per duotone icon: IconifyIconData.duo bundles both
      // layers (primary in the regular font, secondary at the same
      // codepoint in <Family>Secondary). Render with IconifyIcon — it
      // auto-detects isDuotone and paints both layers in a single
      // render layer.
      const secFamily = secondaryFontFamily(entry.fontFamily);
      lines.push(`  /// \`${escapeDoc(name)}\` (duo-tone)`);
      lines.push(`  static const IconifyIconData ${entry.identifier} = IconifyIconData.duo(`);
      lines.push(`    IconData(${formatCodepoint(entry.codepoint)}, fontFamily: '${entry.fontFamily}', fontPackage: '${fontPackage}'),`);
      lines.push(`    IconData(${formatCodepoint(entry.codepoint)}, fontFamily: '${secFamily}', fontPackage: '${fontPackage}'),`);
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

  return lines.join('\n');
}

function escapeDoc(s: string): string {
  return s.replace(/\*\//g, '*​/');
}
