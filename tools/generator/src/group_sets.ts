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
