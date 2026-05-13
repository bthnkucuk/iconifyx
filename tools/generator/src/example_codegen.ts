import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Manifest } from './manifest.ts';
import { dartClassNameFromPrefix } from './group_sets.ts';
import { setPackageName } from './paths.ts';

const TEMPLATE_DIR = path.resolve(import.meta.dir, '..', 'templates');

/**
 * Load the example app's UI source from the template at
 * `tools/generator/templates/example_app.dart` and return it verbatim.
 *
 * The template is just a Dart file — IDE will flag Flutter imports as
 * unresolved (the templates directory isn't a Flutter package), but the
 * file is copied unchanged to `packages/iconifyx/example/lib/app.dart` on
 * every regen, where the imports resolve normally.
 *
 * Keeping the template as plain Dart (instead of inline template literals
 * in TypeScript) lets us syntax-highlight, format, and edit the UI like
 * any other Dart file. The hand-written `main.dart` in the example
 * imports `app.dart` and just calls `runApp` — that file is small enough
 * to stay static.
 */
export async function emitExampleApp(): Promise<string> {
  return await readFile(path.join(TEMPLATE_DIR, 'example_app.dart'), 'utf8');
}

export interface ExampleCodegenInput {
  /** Every successfully built manifest, paired with its display category. */
  entries: { manifest: Manifest; displayCategory: string }[];
}

/**
 * Emit a Dart data file the example app uses to render a browseable index
 * of every bundled icon set. Sets are grouped by display category (which is
 * the Iconify `info.category` with optional rename via config.yaml).
 *
 * Each ExampleIconEntry references a real `IconifyIconData` constant so that
 * the example exercises the full set-class API. The example is also the
 * tree-shake stress-test target: building it bundles every font at full
 * size precisely because every codepoint is referenced.
 */
export function emitExampleIndex(input: ExampleCodegenInput): string {
  const sorted = [...input.entries].sort((a, b) =>
    a.manifest.prefix.localeCompare(b.manifest.prefix)
  );

  const lines: string[] = [];
  lines.push(`// GENERATED FILE — do not edit.`);
  lines.push(``);
  lines.push(`import 'package:iconifyx_core/iconifyx_core.dart';`);

  // One import per set package, sorted.
  for (const e of sorted) {
    const pkg = setPackageName(e.manifest.prefix);
    lines.push(`import 'package:${pkg}/${pkg}.dart';`);
  }
  lines.push(``);

  lines.push(`class ExampleIconEntry {`);
  lines.push(`  final String name;`);
  lines.push(`  final IconifyIconData data;`);
  lines.push(`  /// For duotone icons, the secondary (translucent) layer.`);
  lines.push(`  /// Render with IconifyDuotoneIcon when present.`);
  lines.push(`  final IconifyIconData? secondary;`);
  lines.push(`  const ExampleIconEntry(this.name, this.data, [this.secondary]);`);
  lines.push(`  bool get isDuotone => secondary != null;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`class ExampleSetEntry {`);
  lines.push(`  final String prefix;`);
  lines.push(`  final String name;`);
  lines.push(`  final String license;`);
  lines.push(`  final String packageName;`);
  lines.push(`  final List<ExampleIconEntry> icons;`);
  lines.push(`  const ExampleSetEntry({`);
  lines.push(`    required this.prefix,`);
  lines.push(`    required this.name,`);
  lines.push(`    required this.license,`);
  lines.push(`    required this.packageName,`);
  lines.push(`    required this.icons,`);
  lines.push(`  });`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`class ExampleCategory {`);
  lines.push(`  final String name;`);
  lines.push(`  final List<ExampleSetEntry> sets;`);
  lines.push(`  const ExampleCategory({required this.name, required this.sets});`);
  lines.push(`}`);
  lines.push(``);

  // Group entries by display category, alphabetical within each.
  const byCategory = new Map<string, typeof sorted>();
  for (const e of sorted) {
    if (!byCategory.has(e.displayCategory)) byCategory.set(e.displayCategory, []);
    byCategory.get(e.displayCategory)!.push(e);
  }
  const categoryNames = [...byCategory.keys()].sort();

  lines.push(`const List<ExampleCategory> exampleCategories = <ExampleCategory>[`);
  for (const cat of categoryNames) {
    lines.push(`  ExampleCategory(`);
    lines.push(`    name: '${escape(cat)}',`);
    lines.push(`    sets: <ExampleSetEntry>[`);
    for (const e of byCategory.get(cat)!) {
      const m = e.manifest;
      const className = dartClassNameFromPrefix(m.prefix);
      const pkg = setPackageName(m.prefix);
      const liveEntries = Object.entries(m.icons)
        .filter(([, v]) => !v.deprecated)
        .sort(([a], [b]) => a.localeCompare(b));
      if (liveEntries.length === 0) continue;
      lines.push(`      ExampleSetEntry(`);
      lines.push(`        prefix: '${escape(m.prefix)}',`);
      lines.push(`        name: '${escape(m.info.name)}',`);
      lines.push(`        license: '${escape(m.info.license.title)}',`);
      lines.push(`        packageName: '${escape(pkg)}',`);
      lines.push(`        icons: <ExampleIconEntry>[`);
      for (const [name, entry] of liveEntries) {
        if (entry.duotone) {
          lines.push(
            `          ExampleIconEntry('${escape(name)}', ${className}.${entry.identifier}Primary, ${className}.${entry.identifier}Secondary),`
          );
        } else {
          lines.push(
            `          ExampleIconEntry('${escape(name)}', ${className}.${entry.identifier}),`
          );
        }
      }
      lines.push(`        ],`);
      lines.push(`      ),`);
    }
    lines.push(`    ],`);
    lines.push(`  ),`);
  }
  lines.push(`];`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Emit a pubspec.yaml for the example app that depends on every set package
 * directly. Direct deps are needed (rather than transitive via meta) because
 * Flutter only bundles font assets from direct declared deps reliably.
 */
export function emitExamplePubspec(setPackages: string[]): string {
  const sorted = [...setPackages].sort();
  const deps = sorted.map((sp) => `  ${sp}:\n    path: ../../${sp}`).join('\n');

  return `name: iconifyx_example
description: Browse every icon set bundled in iconifyx.
publish_to: 'none'
version: 0.1.0

environment:
  sdk: ^3.3.0
  flutter: ">=3.19.0"

dependencies:
  flutter:
    sdk: flutter
  iconifyx:
    path: ../
  iconifyx_core:
    path: ../../iconifyx_core
${deps}

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0

flutter:
  uses-material-design: true
`;
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$');
}
