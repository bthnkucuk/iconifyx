import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..', '..');

export function repoRoot(): string {
  return REPO_ROOT;
}

export function packagesDir(): string {
  return path.join(REPO_ROOT, 'packages');
}

/**
 * Convert an Iconify prefix into a Dart-package-name-safe suffix.
 * Dart packages must be `[a-z][a-z0-9_]*`.
 *   "mdi"              -> "mdi"
 *   "fa6-solid"        -> "fa6_solid"
 *   "material-symbols" -> "material_symbols"
 */
export function prefixToPackageSuffix(prefix: string): string {
  return prefix.replace(/-/g, '_');
}

/** Full pub package name for a set: `iconifyx_<suffix>`. */
export function setPackageName(prefix: string): string {
  return `iconifyx_${prefixToPackageSuffix(prefix)}`;
}

/** Hand-written core package name (shared wrapper). */
export const CORE_PACKAGE_NAME = 'iconifyx_core';

/** Hand-written meta package name (re-exports every per-set package). */
export const META_PACKAGE_NAME = 'iconifyx';

export function setPackageDir(prefix: string): string {
  return path.join(packagesDir(), setPackageName(prefix));
}

export function setPackageFontsDir(prefix: string): string {
  return path.join(setPackageDir(prefix), 'assets', 'fonts');
}

export function setPackageLibDir(prefix: string): string {
  return path.join(setPackageDir(prefix), 'lib');
}

export function setPackageSrcDir(prefix: string): string {
  return path.join(setPackageLibDir(prefix), 'src');
}

export function corePackageDir(): string {
  return path.join(packagesDir(), CORE_PACKAGE_NAME);
}

export function metaPackageDir(): string {
  return path.join(packagesDir(), META_PACKAGE_NAME);
}

export function exampleDir(): string {
  return path.join(metaPackageDir(), 'example');
}
