import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Loader for @iconify/json data, served from the locally installed
 * node_modules copy. We never fetch from the network at generate time —
 * pinning a specific @iconify/json version in package.json is how we
 * guarantee deterministic builds.
 */

// Iconify JSON types (subset; see https://iconify.design/docs/types/iconify-json.html)
export interface IconifyInfo {
  name: string;
  total?: number;
  author?: { name: string; url?: string };
  license?: { title: string; spdx?: string; url?: string };
  samples?: string[];
  height?: number;
  displayHeight?: number;
  category?: string;
  tags?: string[];
  palette?: boolean | string;
  hidden?: boolean;
}

export interface IconifyIconBody {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
}

export interface IconifyAlias {
  parent: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
}

export interface IconifyJson {
  prefix: string;
  info: IconifyInfo;
  icons: Record<string, IconifyIconBody>;
  aliases?: Record<string, IconifyAlias>;
  width?: number;
  height?: number;
  // suffixes / themes / chars / categories left unused
  lastModified?: number;
}

export interface IconifyCollection {
  name: string;
  total: number;
  author?: { name: string; url?: string };
  license?: { title: string; spdx?: string; url?: string };
  samples?: string[];
  height?: number;
  category?: string;
  palette?: boolean | string;
  hidden?: boolean;
}

// Resolve via Node's package resolution from this file, then go up to the
// package root. Works whether @iconify/json is hoisted (root node_modules)
// or installed under this workspace's node_modules.
const ICONIFY_ROOT = (() => {
  const collectionsPath = import.meta.resolveSync('@iconify/json/collections.json');
  // resolveSync returns a file:// URL or a path; normalize to plain path.
  const normalized = collectionsPath.replace(/^file:\/\//, '');
  return path.dirname(normalized);
})();

function collectionsPath(): string {
  return path.join(ICONIFY_ROOT, 'collections.json');
}

function jsonPath(prefix: string): string {
  return path.join(ICONIFY_ROOT, 'json', `${prefix}.json`);
}

let _collectionsCache: Record<string, IconifyCollection> | null = null;

export async function loadCollections(): Promise<Record<string, IconifyCollection>> {
  if (_collectionsCache) return _collectionsCache;
  const raw = await readFile(collectionsPath(), 'utf8');
  _collectionsCache = JSON.parse(raw) as Record<string, IconifyCollection>;
  return _collectionsCache;
}

export async function loadIconifySet(prefix: string): Promise<IconifyJson> {
  const filePath = jsonPath(prefix);
  if (!existsSync(filePath)) {
    throw new Error(`Icon set not found: ${prefix} (${filePath})`);
  }
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as IconifyJson;
  if (parsed.prefix !== prefix) {
    throw new Error(`Prefix mismatch: file says "${parsed.prefix}", expected "${prefix}"`);
  }
  return parsed;
}

export async function getIconifyJsonVersion(): Promise<string> {
  const pkgPath = path.join(ICONIFY_ROOT, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

/**
 * Resolves aliases (icon.parent) so they appear as first-class icons in
 * our manifest. The alias's body is the parent's body; if the alias
 * carries transforms (hFlip, rotate, etc.), those are applied on the SVG
 * pre-processing step rather than here.
 */
export interface ResolvedIcon {
  /** Iconify name (as it appears in the JSON). */
  name: string;
  /** Resolved SVG body (string content of an <svg>). */
  body: string;
  width: number;
  height: number;
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
}

const DEFAULT_VIEW = 16;

export function resolveIcons(set: IconifyJson): ResolvedIcon[] {
  const defaultWidth = set.width ?? DEFAULT_VIEW;
  const defaultHeight = set.height ?? DEFAULT_VIEW;

  const out: ResolvedIcon[] = [];

  for (const [name, body] of Object.entries(set.icons)) {
    out.push({
      name,
      body: body.body,
      width: body.width ?? defaultWidth,
      height: body.height ?? defaultHeight,
      rotate: body.rotate,
      hFlip: body.hFlip,
      vFlip: body.vFlip,
    });
  }

  if (set.aliases) {
    for (const [aliasName, alias] of Object.entries(set.aliases)) {
      const parent = set.icons[alias.parent];
      if (!parent) continue; // orphan alias — skip silently
      out.push({
        name: aliasName,
        body: parent.body,
        width: alias.width ?? parent.width ?? defaultWidth,
        height: alias.height ?? parent.height ?? defaultHeight,
        rotate: (parent.rotate ?? 0) + (alias.rotate ?? 0) || undefined,
        hFlip: parent.hFlip !== alias.hFlip ? true : undefined,
        vFlip: parent.vFlip !== alias.vFlip ? true : undefined,
      });
    }
  }

  return out;
}
