import type { Manifest } from './manifest.ts';

/**
 * Emits the iconifyx_website Flutter app's data files + pubspec.
 *
 * The website is a hand-written Flutter app (zenrouter + flutter_bloc) that
 * reads two JSON metadata files at startup and constructs `IconifyIconData`
 * instances at runtime — it does NOT import any per-set `iconifyx_<prefix>`
 * package directly. Per-set packages are still listed in `pubspec.yaml` so
 * their TTF font assets bundle into the build.
 *
 * Two files are emitted into `lib/data/`:
 *   - packs.json — bootstrap manifest (one row per pack, ~80 KB).
 *   - icons_index.json — flat icon index in compact pack-grouped tuple form
 *     (~10 MB for the full ~165K-icon corpus).
 */

export interface WebsiteCodegenInput {
  /** Every successfully built manifest, paired with its display category. */
  entries: { manifest: Manifest; displayCategory: string }[];
  /** Upstream @iconify/json version used to produce these manifests. */
  iconifyJsonVersion: string;
}

/**
 * Bootstrap manifest. ~225 rows. Drives the home grid, sidebar, and category
 * pages without touching the 10 MB icon index. Each pack carries a 12-icon
 * preview so the card UI doesn't need icons_index.json to render the preview.
 */
export function buildPacksJson(input: WebsiteCodegenInput): string {
  const sorted = [...input.entries].sort((a, b) =>
    a.manifest.prefix.localeCompare(b.manifest.prefix)
  );

  const packs = sorted.map((e) => {
    const m = e.manifest;
    const live = Object.entries(m.icons)
      .filter(([, v]) => !v.deprecated)
      .sort(([a], [b]) => a.localeCompare(b));
    const duotoneCount = live.filter(([, v]) => v.duotone).length;
    const preview = live.slice(0, 12).map(([name, v]) => ({
      n: name,
      c: v.codepoint,
      f: v.fontFamily,
      ...(v.duotone ? { d: 1 } : {}),
    }));
    return {
      prefix: m.prefix,
      package: m.subPackage,
      name: m.info.name,
      category: e.displayCategory,
      license: m.info.license.title,
      licenseSpdx: m.info.license.spdx ?? null,
      licenseUrl: m.info.license.url ?? null,
      author: m.info.author?.name ?? null,
      iconCount: live.length,
      duotoneCount,
      fonts: m.fonts.map((f) => ({ family: f.family, iconCount: f.iconCount })),
      preview,
    };
  });

  const totalIcons = packs.reduce((sum, p) => sum + p.iconCount, 0);

  const byCategory = new Map<string, string[]>();
  for (const p of packs) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p.prefix);
  }
  const categories = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, packPrefixes]) => ({
      slug: categorySlug(name),
      name,
      packPrefixes,
    }));

  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    iconifyJsonVersion: input.iconifyJsonVersion,
    totalIcons,
    packs,
    categories,
  });
}

/**
 * Flat icon index. Pack-grouped, tuple rows to save bytes at 300K scale.
 *
 * Schema:
 *   packs: Map<prefix, { fonts: string[], icons: tuple[] }>
 *   tuple: [name, codepoint, fontIdx, duotoneFlag?]
 *     fontIdx is into the pack's `fonts` array
 *     duotoneFlag === 1 when the icon ships a secondary glyph
 */
export function buildIconsIndexJson(input: WebsiteCodegenInput): string {
  const sorted = [...input.entries].sort((a, b) =>
    a.manifest.prefix.localeCompare(b.manifest.prefix)
  );

  const packs: Record<string, { fonts: string[]; icons: unknown[][] }> = {};
  for (const e of sorted) {
    const m = e.manifest;
    const fonts = m.fonts.map((f) => f.family);
    const fontIdx = new Map(fonts.map((f, i) => [f, i]));

    const live = Object.entries(m.icons)
      .filter(([, v]) => !v.deprecated)
      .sort(([a], [b]) => a.localeCompare(b));
    if (live.length === 0) continue;

    const icons: unknown[][] = live.map(([name, v]) => {
      const row: unknown[] = [name, v.codepoint, fontIdx.get(v.fontFamily) ?? 0];
      if (v.duotone) row.push(1);
      return row;
    });

    packs[m.prefix] = { fonts, icons };
  }

  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    packs,
  });
}

/**
 * Emit pubspec.yaml for the iconifyx_website Flutter app.
 *
 * Per-set packages are listed as direct path deps so their TTF assets ship
 * with the build — even though the website's Dart code never imports them.
 * The two JSON metadata files are declared as assets.
 */
export function emitWebsitePubspec(setPackages: string[]): string {
  const sorted = [...setPackages].sort();
  const deps = sorted.map((sp) => `  ${sp}:\n    path: ../../${sp}`).join('\n');

  return `name: iconifyx_website
description: Browse every icon set bundled in iconifyx — modeled on allsvgicons.com.
publish_to: 'none'
version: 0.1.0

environment:
  sdk: ^3.3.0
  flutter: ">=3.19.0"

dependencies:
  flutter:
    sdk: flutter
  iconifyx_core:
    path: ../../iconifyx_core
${deps}
  flutter_bloc: ^9.0.0
  bloc_concurrency: ^0.3.0
  rxdart: ^0.28.0
  equatable: ^2.0.5
  collection: ^1.18.0
  quiver: ^3.2.2
  zenrouter: ^2.0.3
  zenrouter_core: ^2.0.2
  flutter_staggered_grid_view: ^0.7.0
  shared_preferences: ^2.3.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0

flutter:
  uses-material-design: true
  assets:
    - lib/data/packs.json
    - lib/data/icons_index.json
`;
}

function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
