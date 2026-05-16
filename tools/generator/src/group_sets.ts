import path from 'node:path';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { IconifyCollection } from './load_iconify.ts';

/**
 * config.yaml controls which sets are excluded entirely and provides display
 * grouping for the example app's drawer. It no longer routes sets into
 * different sub-packages — every set now ships its own package.
 */
export interface GeneratorConfig {
  excludedSets: string[];
  /** Optional friendlier names for Iconify's raw `info.category` strings. */
  displayCategoryAliases?: Record<string, string>;
  /**
   * Iconify prefixes whose icons need stroke-outline pre-processing before
   * font conversion (otherwise stroke-based icons like Lucide render as
   * solid filled shapes inside the font).
   */
  strokeFillSets?: string[];
  /**
   * Iconify prefixes that ship synthetic weight variants. For each entry,
   * the generator clones every icon body, swapping `stroke-width="2"` for
   * the configured value, and appends the weight name as a suffix to the
   * icon name (e.g. `activity` → `activity-thin`). The "regular" weight
   * (2.0) is implicit and keeps the original icon name (no suffix).
   */
  multiWeightStrokeSets?: Record<string, Record<string, number>>;
  /**
   * Optional source-pack base stroke widths, keyed by Iconify prefix.
   *
   * When the generator synthesizes weight variants for a pack listed in
   * `multiWeightStrokeSets`, it now PROPORTIONALLY scales every existing
   * `stroke-width` in the source body by `ratio = newWidth / base`
   * (§6 fix). This preserves per-layer width ratios: an icon shipping
   * with a thick body (`stroke-width="2"`) plus a thin accent
   * (`stroke-width="0.5"`) keeps the 4:1 contrast in every weight variant
   * instead of collapsing both to a single flat value.
   *
   * If a prefix is absent from this map, the generator defaults to
   * `base = 2` — the dominant value across Lucide / Tabler / Phosphor-
   * regular / Feather / Heroicons. Iconoir is the outlier at `base = 1.5`
   * and so SHOULD be listed here; otherwise its thin variant computes
   * ratio = 1.0/2.0 = 0.5 instead of the intended 1.0/1.5 ≈ 0.67 and
   * the variant is slightly thinner than expected.
   */
  multiWeightStrokeSourceBase?: Record<string, number>;
  /**
   * Iconify prefixes that encode meaning through concrete colours
   * (Catppuccin uses one stroke colour per icon from its palette;
   * some entries are two-tone). Before stroke-fill, the pipeline
   * normalises every concrete `fill="…"` / `stroke="…"` to
   * `currentColor` so the rasterizer + Potrace pre-pass sees a
   * high-contrast silhouette regardless of the source palette.
   * Bodies with exactly two distinct concrete colours additionally
   * get split into duotone primary/secondary; three-or-more-colour
   * bodies flatten to a single layer.
   */
  colorMappedSets?: string[];
  /**
   * Iconify prefixes whose paint-order-dropped icons (multi-fill bodies
   * that would otherwise render as featureless monochrome blobs in the
   * TTF) should be recovered through the vtracer pipeline. For each
   * listed prefix the pipeline rasterises every paint-order-drop
   * candidate via `@resvg/resvg-js`, runs `@neplex/vectorizer`
   * (visioncortex vtracer) in stacked-colour mode, and reduces the
   * resulting 4-8 layer SVG to a 2-layer (background + foreground)
   * duotone with `kind: paintOrder`. Recovered icons feed the same
   * Primary/Secondary font pair as the existing two-colour duotone
   * split (§5b path 2).
   *
   * Opt-in because vtracer first-run is slow (~80-200 ms / icon) and
   * the output is approximate — best for multi-colour emoji families
   * (twemoji, noto, fluent-emoji-flat) and country-flag silhouettes
   * (`circle-flags`). Bodies that fail the trace (panic, or produce
   * fewer than 2 distinct colour layers) still get the existing
   * paint-order drop treatment.
   *
   * Cache lives at `tools/generator/.cache/vtrace/<prefix>/<sha>.json`
   * (gitignored, content-addressed).
   *
   * @see tools/generator/src/vtracer.ts
   */
  vtracerSets?: string[];
}

const CONFIG_PATH = path.resolve(import.meta.dir, '..', 'config.yaml');

let _configCache: GeneratorConfig | null = null;

export async function loadConfig(): Promise<GeneratorConfig> {
  if (_configCache) return _configCache;
  const raw = await readFile(CONFIG_PATH, 'utf8');
  _configCache = YAML.parse(raw) as GeneratorConfig;
  return _configCache;
}

/** Returns null if excluded; otherwise returns the display category. */
export function displayCategory(
  prefix: string,
  info: IconifyCollection,
  config: GeneratorConfig
): string | null {
  if (config.excludedSets.includes(prefix)) return null;
  const raw = info.category ?? 'Uncategorized';
  return config.displayCategoryAliases?.[raw] ?? raw;
}

/** Convert a prefix like "fa6-solid" to a CamelCase font family like "Fa6Solid". */
export function fontFamilyFromPrefix(prefix: string): string {
  return prefix
    .split(/[-_]/g)
    .filter((t) => t.length > 0)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('');
}

/** Convert a prefix like "fa6-solid" to a Dart class name like "Fa6SolidIcons". */
export function dartClassNameFromPrefix(prefix: string): string {
  return fontFamilyFromPrefix(prefix) + 'Icons';
}

/** Convert a prefix like "fa6-solid" to the Dart file name "fa6_solid.dart". */
export function dartFileNameFromPrefix(prefix: string): string {
  return prefix.replace(/-/g, '_') + '.dart';
}
