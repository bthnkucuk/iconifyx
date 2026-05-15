#!/usr/bin/env bun
/**
 * `render-icon` — programmatic Flutter icon → PNG harness.
 *
 * Usage:
 *
 *   bun run render-icon solar:add-circle-bold-duotone --size 256 \
 *     --mode duotone --out /tmp/out.png
 *   bun run render-icon mdi:home --size 256 --color 0xff0066ff \
 *     --out /tmp/mdi-home.png
 *
 * Flags:
 *   --size N            logical px (default 256)
 *   --mode M            duotone | primary-only | secondary-only (default duotone)
 *   --color 0xAARRGGBB  primary colour (default 0xff000000)
 *   --bg    0xAARRGGBB  background fill (default 0x00ffffff)
 *   --secondary-color 0xAARRGGBB  override secondary colour (paint-order only)
 *   --pixel-ratio N     output PNG pixel ratio (default 2)
 *   --out PATH          required — where to write the PNG
 *   --verbose           stream flutter test output
 *
 * Architecture (Approach A — flutter_test in a headless isolate; see
 * README.md for the comparison and why we picked it):
 *
 *   1. Look up `(prefix, name)` in `tools/generator/manifests/<prefix>.json`
 *      → primary codepoint + fontFamily + duotone flag + duotoneKind +
 *      identifier. The icon is referenced by ICONIFY name (`mdi:home`,
 *      `solar:add-circle-bold-duotone`), not by Dart identifier.
 *   2. Rewrite the render host's pubspec.yaml to depend on
 *      `iconifyx_core` + ONLY the requested `iconifyx_<prefix>` package
 *      (§32 per-set tree-shake invariant). Skip pub-get if the deps
 *      haven't changed since last run (cached in .deps.cache).
 *   3. `fvm flutter test test/render_icon_test.dart` with env vars
 *      describing the icon + render params. The test reconstructs
 *      `IconifyIconData` at runtime (mirroring website's
 *      IconRecord.toIconifyData), paints it into a RepaintBoundary,
 *      writes the PNG to RENDER_OUT, exits cleanly.
 *   4. Verify the PNG exists + has non-trivial size. Move/copy to --out.
 *
 * Speed: cold ~10-15s (pub-get + flutter test bootstrap); warm
 * ~5-8s (same pack as last invocation). Persistent-process variant
 * (Approach E) is a follow-up if we need sub-2s repeated calls.
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

const HARNESS_DIR = dirname(import.meta.url.replace('file://', ''));
const HOST_DIR = join(HARNESS_DIR, 'host');
const REPO_ROOT = resolvePath(HARNESS_DIR, '../../../..');
const MANIFEST_DIR = join(REPO_ROOT, 'tools/generator/manifests');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const DEPS_CACHE = join(HOST_DIR, '.deps.cache');

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------

interface CliArgs {
  iconRef: string;            // "prefix:name"
  size: number;
  mode: 'duotone' | 'primary-only' | 'secondary-only';
  color: number;
  bg: number;
  secondaryColor: number | undefined;
  pixelRatio: number;
  out: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0) usage('missing icon reference');
  let iconRef: string | undefined;
  let size = 256;
  let mode: CliArgs['mode'] = 'duotone';
  let color = 0xff000000;
  let bg = 0x00ffffff;
  let secondaryColor: number | undefined;
  let pixelRatio = 2;
  let out: string | undefined;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      if (iconRef) usage(`unexpected positional arg: ${a}`);
      iconRef = a;
      continue;
    }
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`flag ${a} requires a value`);
      return v as string;
    };
    switch (a) {
      case '--size': size = parseInt(next(), 10); break;
      case '--mode':
        const m = next();
        if (m !== 'duotone' && m !== 'primary-only' && m !== 'secondary-only') {
          usage(`unknown --mode: ${m}`);
        }
        mode = m;
        break;
      case '--color': color = parseHexOrInt(next()); break;
      case '--bg': bg = parseHexOrInt(next()); break;
      case '--secondary-color': secondaryColor = parseHexOrInt(next()); break;
      case '--pixel-ratio': pixelRatio = parseFloat(next()); break;
      case '--out': out = next(); break;
      case '--verbose': verbose = true; break;
      case '--help': case '-h': usage(); break;
      default: usage(`unknown flag: ${a}`);
    }
  }
  if (!iconRef) usage('missing icon reference (e.g. solar:add-circle-bold-duotone)');
  if (!out) usage('--out is required');
  if (!iconRef.includes(':')) usage(`icon reference must be "prefix:name" — got "${iconRef}"`);
  return {
    iconRef: iconRef!,
    size,
    mode,
    color,
    bg,
    secondaryColor,
    pixelRatio,
    out: out!,
    verbose,
  };
}

function parseHexOrInt(raw: string): number {
  if (raw.startsWith('0x') || raw.startsWith('0X')) {
    return parseInt(raw.substring(2), 16);
  }
  return parseInt(raw, 10);
}

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage: bun run render-icon <prefix:name> --out PATH [flags]');
  console.error('  flags: --size N --mode duotone|primary-only|secondary-only');
  console.error('         --color 0xAARRGGBB --bg 0xAARRGGBB --secondary-color 0xAARRGGBB');
  console.error('         --pixel-ratio N --verbose');
  process.exit(msg ? 2 : 0);
}

// --------------------------------------------------------------------------
// Manifest lookup
// --------------------------------------------------------------------------

interface ManifestIcon {
  codepoint: number;
  fontFamily: string;
  identifier: string;
  duotone?: boolean;
  duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
  deprecated?: boolean;
}

interface ManifestFont {
  family: string;
}

interface Manifest {
  prefix: string;
  subPackage: string;
  fonts: ManifestFont[];
  icons: Record<string, ManifestIcon>;
}

interface ResolvedIcon {
  prefix: string;
  iconName: string;
  packageName: string;
  packageDir: string;
  primaryCodepoint: number;
  primaryFamily: string;
  secondaryCodepoint?: number;
  secondaryFamily?: string;
  kindCode: number;     // 0 solo, 1 hint, 2 paintOrder, 3 maskInternal
}

async function resolveIcon(iconRef: string): Promise<ResolvedIcon> {
  const [prefix, ...rest] = iconRef.split(':');
  const iconName = rest.join(':');
  const manifestPath = join(MANIFEST_DIR, `${prefix}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest for prefix "${prefix}" at ${manifestPath}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const icon = manifest.icons[iconName!];
  if (!icon) {
    throw new Error(`icon "${iconName}" not found in ${prefix} manifest`);
  }
  if (icon.deprecated) {
    throw new Error(`icon "${iconRef}" is marked deprecated in the manifest`);
  }

  let secondaryCodepoint: number | undefined;
  let secondaryFamily: string | undefined;
  let kindCode = 0;
  if (icon.duotone) {
    secondaryCodepoint = icon.codepoint;     // same cp, paired Secondary font
    secondaryFamily = `${icon.fontFamily}Secondary`;
    switch (icon.duotoneKind) {
      case 'paintOrder': kindCode = 2; break;
      case 'maskInternal': kindCode = 3; break;
      default: kindCode = 1; // 'hint' or absent
    }
  }

  const packageName = manifest.subPackage;
  const packageDir = join(PACKAGES_DIR, packageName);
  if (!existsSync(packageDir)) {
    throw new Error(`package dir not found: ${packageDir}`);
  }

  return {
    prefix: prefix!,
    iconName: iconName!,
    packageName,
    packageDir,
    primaryCodepoint: icon.codepoint,
    primaryFamily: icon.fontFamily,
    secondaryCodepoint,
    secondaryFamily,
    kindCode,
  };
}

// --------------------------------------------------------------------------
// Pubspec rewrite + pub-get caching
// --------------------------------------------------------------------------

const DEPS_START = '# RENDER_HOST_DEPS_START';
const DEPS_END = '# RENDER_HOST_DEPS_END';

async function ensurePubspecForPack(packageName: string, verbose: boolean): Promise<void> {
  const pubspecPath = join(HOST_DIR, 'pubspec.yaml');
  const current = await readFile(pubspecPath, 'utf8');
  const startIdx = current.indexOf(DEPS_START);
  const endIdx = current.indexOf(DEPS_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`pubspec.yaml is missing the ${DEPS_START}/${DEPS_END} fence`);
  }
  const newDeps = [
    DEPS_START,
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    '  iconifyx_core:',
    '    path: ../../../../../packages/iconifyx_core',
    `  ${packageName}:`,
    `    path: ../../../../../packages/${packageName}`,
    '',
  ].join('\n');
  const next =
    current.substring(0, startIdx) + newDeps + current.substring(endIdx);
  const changed = next !== current;
  if (changed) {
    await writeFile(pubspecPath, next, 'utf8');
  }

  // Pub-get caching: skip if (packageName, host pubspec hash) matches the
  // last successful run. `flutter pub get` is ~3s on warm cache but still
  // dominates per-call latency when we don't need it.
  const cacheTag = `${packageName}\n`;
  const cacheHit = existsSync(DEPS_CACHE) &&
    (await readFile(DEPS_CACHE, 'utf8')) === cacheTag &&
    !changed &&
    existsSync(join(HOST_DIR, '.dart_tool/package_config.json'));
  if (cacheHit) {
    if (verbose) console.error('[render-icon] pub-get cache hit; skipping');
    return;
  }

  if (verbose) console.error('[render-icon] running fvm flutter pub get');
  await runCommand('fvm', ['flutter', 'pub', 'get'], {
    cwd: HOST_DIR,
    verbose,
  });
  await writeFile(DEPS_CACHE, cacheTag, 'utf8');
}

// --------------------------------------------------------------------------
// Subprocess helper
// --------------------------------------------------------------------------

interface RunOpts {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  verbose: boolean;
  onStdout?: (chunk: string) => void;
}

function runCommand(cmd: string, args: string[], opts: RunOpts): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stdout += s;
      if (opts.verbose) process.stdout.write(s);
      opts.onStdout?.(s);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderr += s;
      if (opts.verbose) process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const msg = `${cmd} ${args.join(' ')} exited ${code}\n` +
          `--- stderr ---\n${stderr}\n` +
          `--- stdout ---\n${stdout}`;
        reject(new Error(msg));
      }
    });
  });
}

// --------------------------------------------------------------------------
// Main flow
// --------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolved = await resolveIcon(args.iconRef);

  if (args.mode === 'secondary-only' && resolved.kindCode === 0) {
    throw new Error(
      `--mode secondary-only requested but ${args.iconRef} is a solo icon`,
    );
  }

  await mkdir(dirname(resolvePath(args.out)), { recursive: true });
  await ensurePubspecForPack(resolved.packageName, args.verbose);

  // Render into a staging path inside the host (`tmp/render.png`) and copy
  // to `--out` after the test exits cleanly. Decouples test failures from
  // partial-output stuck at the user-requested path.
  const stagingDir = join(HOST_DIR, 'tmp');
  await mkdir(stagingDir, { recursive: true });
  const stagingPath = join(stagingDir, 'render.png');

  const env: NodeJS.ProcessEnv = {
    ICON_PRIMARY_CP: String(resolved.primaryCodepoint),
    ICON_PRIMARY_FAMILY: resolved.primaryFamily,
    ICON_PRIMARY_PACKAGE: resolved.packageName,
    ICON_KIND: String(resolved.kindCode),
    RENDER_MODE: args.mode,
    RENDER_SIZE: String(args.size),
    RENDER_COLOR: `0x${args.color.toString(16).padStart(8, '0')}`,
    RENDER_BG: `0x${args.bg.toString(16).padStart(8, '0')}`,
    RENDER_PIXEL_RATIO: String(args.pixelRatio),
    RENDER_OUT: stagingPath,
  };
  if (resolved.secondaryCodepoint !== undefined) {
    env.ICON_SECONDARY_CP = String(resolved.secondaryCodepoint);
    env.ICON_SECONDARY_FAMILY = resolved.secondaryFamily!;
  }
  if (args.secondaryColor !== undefined) {
    env.RENDER_SECONDARY_COLOR =
      `0x${args.secondaryColor.toString(16).padStart(8, '0')}`;
  }

  if (args.verbose) {
    console.error('[render-icon] resolved', resolved);
    console.error('[render-icon] env', env);
  }

  // Delete any stale staging file so a silent test pass + missing
  // `writeAsBytes` can't masquerade as success.
  if (existsSync(stagingPath)) {
    await Bun.file(stagingPath).delete();
  }

  let renderOkLine: string | undefined;
  await runCommand(
    'fvm',
    [
      'flutter',
      'test',
      '--reporter=expanded',
      'test/render_icon_test.dart',
    ],
    {
      cwd: HOST_DIR,
      env,
      verbose: args.verbose,
      onStdout: (chunk) => {
        // Look for the success marker the test prints.
        const idx = chunk.indexOf('RENDER_OK ');
        if (idx !== -1) {
          renderOkLine = chunk.substring(idx).split('\n')[0];
        }
      },
    },
  );

  if (!renderOkLine) {
    throw new Error(
      'flutter test exited 0 but did not emit RENDER_OK marker — ' +
      'check that fonts loaded and the test reached File.writeAsBytes',
    );
  }
  if (!existsSync(stagingPath)) {
    throw new Error(
      `RENDER_OK marker seen but staging file missing at ${stagingPath}`,
    );
  }
  const st = statSync(stagingPath);
  if (st.size < 100) {
    throw new Error(
      `staging PNG suspiciously small (${st.size} B) at ${stagingPath}`,
    );
  }

  await copyFile(stagingPath, resolvePath(args.out));
  console.log(
    `wrote ${args.out} (${st.size} B, ${args.size}px, ${args.mode}, ` +
    `${args.iconRef})`,
  );
}

main().catch((err) => {
  console.error(`render-icon: ${err.message ?? err}`);
  process.exit(1);
});
