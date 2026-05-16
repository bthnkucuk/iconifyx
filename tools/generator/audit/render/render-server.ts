#!/usr/bin/env bun
/**
 * `render-server` — Approach E: persistent stdin-driven Flutter render server.
 *
 * Companion to `render-icon.ts` (Approach A single-shot). Boots ONE
 * `fvm flutter test render_server_test.dart` process, then feeds it
 * line-delimited JSON render requests on stdin and reads RENDER_OK
 * markers from stdout. Per-icon cost drops from ~5 s (Approach A) to
 * ~150-400 ms (Approach E).
 *
 * Used by:
 *   - `tools/generator/audit/visual-diff/cli.ts --corpus` (Phase 2)
 *   - Future bulk-render tools (golden refresh, etc.)
 *   - This file's own `--bench N` smoke test (random icon sample)
 *
 * Public API:
 *
 *   import { RenderServer } from './render-server.ts';
 *   const server = await RenderServer.start({ verbose: false });
 *   const path = await server.render({
 *     prefix: 'mdi', name: 'home',
 *     size: 256, out: '/tmp/x.png',
 *     color: 0xff000000, bg: 0x00ffffff,
 *   });
 *   await server.close();
 *
 * Direct CLI use (smoke test):
 *
 *   bun run tools/generator/audit/render/render-server.ts --bench 100
 *   bun run tools/generator/audit/render/render-server.ts --bench 100 --verbose
 *
 * Architecture notes:
 *
 *   - Uses `flutter test` (not `flutter run`): no display server / window /
 *     accessibility entitlement; pure Skia + Dart isolate. Bootstrap cost
 *     is paid ONCE (~10 s) instead of per call.
 *   - Server resolves `(prefix, name)` to font metadata; the Dart side
 *     reads TTFs straight off disk via `dart:io File` + `FontLoader`, so
 *     the host pubspec only needs `iconifyx_core` — no per-set deps.
 *     One server process serves every pack.
 *   - Font registrations are cached for the lifetime of the server.
 *     First request per pack does ~30 ms FontLoader work; repeats are
 *     free.
 *   - Protocol is line-delimited JSON in / line-prefixed marker out:
 *       stdin:  `{"primaryCp":..., "out":...}\n`
 *       stdout: `RENDER_OK <out> <bytes> [id=<id>]\n`
 *               `RENDER_ERR <reason> [id=<id>]\n`
 *     We attach an `id` to every request so concurrent / out-of-order
 *     responses correlate cleanly.
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

const HARNESS_DIR = dirname(import.meta.url.replace('file://', ''));
const HOST_DIR = join(HARNESS_DIR, 'host');
const REPO_ROOT = resolvePath(HARNESS_DIR, '../../../..');
const MANIFEST_DIR = join(REPO_ROOT, 'tools/generator/manifests');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const DEPS_CACHE = join(HOST_DIR, '.deps.cache');
const SERVER_TEST_NAME = 'render_server_test.dart';

// --------------------------------------------------------------------------
// Manifest helpers (shared shape with render-icon.ts)
// --------------------------------------------------------------------------

interface ManifestIcon {
  codepoint: number;
  fontFamily: string;
  identifier: string;
  duotone?: boolean;
  duotoneKind?: 'paintOrder' | 'maskInternal' | 'hint';
  deprecated?: boolean;
}

interface Manifest {
  prefix: string;
  subPackage: string;
  fonts: { family: string }[];
  icons: Record<string, ManifestIcon>;
}

interface ResolvedIcon {
  prefix: string;
  iconName: string;
  packageName: string;
  primaryCodepoint: number;
  primaryFamily: string;
  secondaryCodepoint?: number;
  secondaryFamily?: string;
  kindCode: number;
  duotone: boolean;
}

const _manifestCache = new Map<string, Manifest>();
async function loadManifest(prefix: string): Promise<Manifest> {
  const cached = _manifestCache.get(prefix);
  if (cached) return cached;
  const path = join(MANIFEST_DIR, `${prefix}.json`);
  if (!existsSync(path)) {
    throw new Error(`no manifest for prefix "${prefix}" at ${path}`);
  }
  const m = JSON.parse(await readFile(path, 'utf8')) as Manifest;
  _manifestCache.set(prefix, m);
  return m;
}

export async function resolveIcon(prefix: string, name: string): Promise<ResolvedIcon> {
  const manifest = await loadManifest(prefix);
  const icon = manifest.icons[name];
  if (!icon) {
    throw new Error(`icon "${name}" not found in ${prefix} manifest`);
  }
  if (icon.deprecated) {
    throw new Error(`icon "${prefix}:${name}" is marked deprecated in the manifest`);
  }
  let secondaryCodepoint: number | undefined;
  let secondaryFamily: string | undefined;
  let kindCode = 0;
  if (icon.duotone) {
    secondaryCodepoint = icon.codepoint;
    secondaryFamily = `${icon.fontFamily}Secondary`;
    switch (icon.duotoneKind) {
      case 'paintOrder':
        kindCode = 2;
        break;
      case 'maskInternal':
        kindCode = 3;
        break;
      default:
        kindCode = 1;
    }
  }
  return {
    prefix,
    iconName: name,
    packageName: manifest.subPackage,
    primaryCodepoint: icon.codepoint,
    primaryFamily: icon.fontFamily,
    secondaryCodepoint,
    secondaryFamily,
    kindCode,
    duotone: !!icon.duotone,
  };
}

// --------------------------------------------------------------------------
// Host pubspec — server mode needs ONLY `iconifyx_core` because TTFs are
// read off disk via `dart:io File` in the Dart side. Same fence as
// render-icon.ts but with an empty package list.
// --------------------------------------------------------------------------

const DEPS_START = '# RENDER_HOST_DEPS_START';
const DEPS_END = '# RENDER_HOST_DEPS_END';
const SERVER_DEPS_TAG = '__render_server__';

async function syncServerTestFile(): Promise<void> {
  const canonical = join(HARNESS_DIR, SERVER_TEST_NAME);
  if (!existsSync(canonical)) {
    throw new Error(`canonical server test missing: ${canonical}`);
  }
  const hostTest = join(HOST_DIR, 'test', SERVER_TEST_NAME);
  await mkdir(dirname(hostTest), { recursive: true });
  const wanted = await readFile(canonical, 'utf8');
  const have = existsSync(hostTest) ? await readFile(hostTest, 'utf8') : '';
  if (have !== wanted) {
    await writeFile(hostTest, wanted, 'utf8');
  }
}

async function ensureServerPubspec(verbose: boolean): Promise<void> {
  await syncServerTestFile();
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
    '',
  ].join('\n');
  const next =
    current.substring(0, startIdx) + newDeps + current.substring(endIdx);
  const changed = next !== current;
  if (changed) {
    await writeFile(pubspecPath, next, 'utf8');
  }

  const cacheTag = `${SERVER_DEPS_TAG}\n`;
  const cacheHit =
    existsSync(DEPS_CACHE) &&
    (await readFile(DEPS_CACHE, 'utf8')) === cacheTag &&
    !changed &&
    existsSync(join(HOST_DIR, '.dart_tool/package_config.json'));
  if (cacheHit) {
    if (verbose) console.error('[render-server] pub-get cache hit; skipping');
    return;
  }
  if (verbose) console.error('[render-server] running fvm flutter pub get');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('fvm', ['flutter', 'pub', 'get'], {
      cwd: HOST_DIR,
      stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    if (!verbose) {
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
    }
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`flutter pub get exited ${code}\n${stderr}`));
    });
    child.on('error', reject);
  });
  await writeFile(DEPS_CACHE, cacheTag, 'utf8');
}

// --------------------------------------------------------------------------
// RenderServer
// --------------------------------------------------------------------------

export interface RenderRequest {
  /** Iconify prefix, e.g. "mdi". */
  prefix: string;
  /** Iconify icon name, e.g. "home". */
  name: string;
  /** Logical pixel size of the icon's box (default 256). */
  size?: number;
  /** Output PNG path (absolute or relative to cwd). */
  out: string;
  /** ARGB int (e.g. 0xff000000); default 0xff000000. */
  color?: number;
  /** Background ARGB int; default 0x00ffffff (transparent). */
  bg?: number;
  /** Paint-order secondary override (ARGB). */
  secondaryColor?: number;
  /** Pixel ratio multiplier on the output PNG (default 2.0). */
  pixelRatio?: number;
  /** Render mode (default "duotone"). */
  mode?: 'duotone' | 'primary-only' | 'secondary-only';
}

interface PendingRequest {
  id: string;
  out: string;
  resolve: (path: string) => void;
  reject: (err: Error) => void;
}

export interface RenderServerOptions {
  /** Stream the underlying `flutter test` stdout to this process's stderr. */
  verbose?: boolean;
  /** Bootstrap wait timeout in ms (default 90_000). */
  bootstrapTimeoutMs?: number;
  /** Per-request timeout in ms (default 30_000). */
  requestTimeoutMs?: number;
}

export class RenderServer {
  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly opts: Required<RenderServerOptions>,
  ) {}

  private _nextId = 0;
  private readonly _pending = new Map<string, PendingRequest>();
  private _closed = false;
  private _exitPromise: Promise<void> | null = null;
  private _stdoutBuf = '';

  /**
   * Boot a fresh server. Resolves once the Dart side prints `READY`.
   */
  static async start(opts: RenderServerOptions = {}): Promise<RenderServer> {
    const resolved: Required<RenderServerOptions> = {
      verbose: !!opts.verbose,
      bootstrapTimeoutMs: opts.bootstrapTimeoutMs ?? 90_000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 30_000,
    };

    await ensureServerPubspec(resolved.verbose);

    const child = spawn(
      'fvm',
      [
        'flutter',
        'test',
        '--reporter=expanded',
        `test/${SERVER_TEST_NAME}`,
      ],
      {
        cwd: HOST_DIR,
        // We need pipes for both stdin and stdout. stderr piped so we
        // can surface failures.
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ) as ChildProcessWithoutNullStreams;

    const server = new RenderServer(child, resolved);
    server._wire();
    await server._waitForReady();
    return server;
  }

  private _wire(): void {
    this.child.stdout.on('data', (chunk: Buffer) => {
      this._handleStdout(chunk.toString('utf8'));
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      if (this.opts.verbose) process.stderr.write(chunk);
    });
    this._exitPromise = new Promise<void>((resolve) => {
      this.child.on('exit', (code, signal) => {
        this._closed = true;
        // Reject any in-flight requests.
        const reason = `render-server process exited (code=${code}, signal=${signal ?? 'none'})`;
        for (const p of this._pending.values()) {
          p.reject(new Error(reason));
        }
        this._pending.clear();
        if (!this._readyResolved) {
          this._readyReject?.(new Error(`server died before READY: ${reason}`));
        }
        resolve();
      });
      this.child.on('error', (err) => {
        this._closed = true;
        if (!this._readyResolved) {
          this._readyReject?.(err);
        }
      });
    });
  }

  // ---- READY handshake ----
  private _readyResolved = false;
  private _readyResolve?: () => void;
  private _readyReject?: (err: Error) => void;

  private _waitForReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._readyResolve = () => {
        this._readyResolved = true;
        resolve();
      };
      this._readyReject = (err) => {
        this._readyResolved = true;
        reject(err);
      };
      const timer = setTimeout(() => {
        if (!this._readyResolved) {
          this._readyReject?.(
            new Error(
              `server did not emit READY within ${this.opts.bootstrapTimeoutMs}ms — ` +
                `last stdout buffer: ${this._stdoutBuf.slice(-1024)}`,
            ),
          );
        }
      }, this.opts.bootstrapTimeoutMs);
      // Clear timer when ready / failed.
      const origResolve = this._readyResolve;
      const origReject = this._readyReject;
      this._readyResolve = () => {
        clearTimeout(timer);
        origResolve!();
      };
      this._readyReject = (err) => {
        clearTimeout(timer);
        origReject!(err);
      };
    });
  }

  // ---- stdout demultiplexer ----
  private _handleStdout(chunk: string): void {
    if (this.opts.verbose) process.stderr.write(chunk);
    this._stdoutBuf += chunk;
    // Process line by line; keep the unterminated tail in _stdoutBuf.
    let nl: number;
    while ((nl = this._stdoutBuf.indexOf('\n')) !== -1) {
      const line = this._stdoutBuf.substring(0, nl);
      this._stdoutBuf = this._stdoutBuf.substring(nl + 1);
      this._handleLine(line.trim());
    }
  }

  private _handleLine(line: string): void {
    if (line === '') return;
    if (line === 'READY' || line.endsWith(' READY')) {
      this._readyResolve?.();
      return;
    }
    // Markers can be prefixed by flutter test reporter cruft (e.g.
    // `[test] RENDER_OK ...`); search rather than equality.
    const okIdx = line.indexOf('RENDER_OK ');
    if (okIdx !== -1) {
      this._handleOkLine(line.substring(okIdx));
      return;
    }
    const errIdx = line.indexOf('RENDER_ERR ');
    if (errIdx !== -1) {
      this._handleErrLine(line.substring(errIdx));
      return;
    }
    if (line.includes('SHUTDOWN_OK')) {
      // Pending requests will be rejected by the exit handler.
      return;
    }
    // Other lines are diagnostic; ignored unless verbose (printed above).
  }

  private _handleOkLine(line: string): void {
    // `RENDER_OK <out> <bytes>[ id=<id>]`
    const m = line.match(/^RENDER_OK\s+(.+?)\s+(\d+)(?:\s+id=(\S+))?$/);
    if (!m) {
      if (this.opts.verbose) {
        process.stderr.write(`[render-server] unparsable OK line: ${line}\n`);
      }
      return;
    }
    const [, out, , id] = m;
    if (!id) {
      if (this.opts.verbose) {
        process.stderr.write(`[render-server] OK without id; skipping correlation: ${line}\n`);
      }
      return;
    }
    const pending = this._pending.get(id);
    if (!pending) return;
    this._pending.delete(id);
    pending.resolve(out!);
  }

  private _handleErrLine(line: string): void {
    // `RENDER_ERR <reason>[ id=<id>]`. Reason may contain spaces.
    const idMatch = line.match(/\sid=(\S+)\s*$/);
    let id: string | undefined;
    let reason: string;
    if (idMatch) {
      id = idMatch[1];
      reason = line.substring('RENDER_ERR '.length, idMatch.index).trim();
    } else {
      reason = line.substring('RENDER_ERR '.length).trim();
    }
    if (!id) {
      if (this.opts.verbose) {
        process.stderr.write(`[render-server] ERR without id; skipping correlation: ${line}\n`);
      }
      return;
    }
    const pending = this._pending.get(id);
    if (!pending) return;
    this._pending.delete(id);
    pending.reject(new Error(reason));
  }

  /**
   * Render one icon and return the output path. Resolves when the Dart
   * side prints `RENDER_OK` matching our request id; rejects on
   * `RENDER_ERR`, server death, or timeout.
   */
  async render(req: RenderRequest): Promise<string> {
    if (this._closed) {
      throw new Error('render-server is closed');
    }
    const resolved = await resolveIcon(req.prefix, req.name);
    const out = resolvePath(req.out);
    await mkdir(dirname(out), { recursive: true });

    const id = `r${++this._nextId}`;
    const wire: Record<string, unknown> = {
      id,
      primaryCp: resolved.primaryCodepoint,
      primaryFamily: resolved.primaryFamily,
      primaryPackage: resolved.packageName,
      kind: resolved.kindCode,
      size: req.size ?? 256,
      color: req.color ?? 0xff000000,
      bg: req.bg ?? 0x00ffffff,
      pixelRatio: req.pixelRatio ?? 2.0,
      mode: req.mode ?? 'duotone',
      out,
    };
    if (resolved.secondaryCodepoint !== undefined) {
      wire.secondaryCp = resolved.secondaryCodepoint;
      wire.secondaryFamily = resolved.secondaryFamily!;
    }
    if (req.secondaryColor !== undefined) {
      wire.secondaryColor = req.secondaryColor;
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(
            new Error(
              `render ${req.prefix}:${req.name} timed out after ${this.opts.requestTimeoutMs}ms`,
            ),
          );
        }
      }, this.opts.requestTimeoutMs);
      this._pending.set(id, {
        id,
        out,
        resolve: (p) => {
          clearTimeout(timer);
          // Sanity-check the PNG before reporting success.
          try {
            const st = statSync(p);
            if (st.size < 100) {
              reject(new Error(`render ${req.prefix}:${req.name} produced suspiciously small PNG (${st.size} B)`));
              return;
            }
          } catch (e) {
            reject(new Error(`RENDER_OK marker seen but file missing at ${p}: ${(e as Error).message}`));
            return;
          }
          resolve(p);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      const payload = JSON.stringify(wire) + '\n';
      const ok = this.child.stdin.write(payload);
      if (!ok) {
        // Backpressure — let the writable drain before continuing.
        this.child.stdin.once('drain', () => {});
      }
    });
  }

  /**
   * Shut down the server cleanly. Sends a `{"shutdown": true}` line,
   * then waits for the process to exit.
   */
  async close(): Promise<void> {
    if (this._closed) return;
    try {
      this.child.stdin.write(JSON.stringify({ shutdown: true }) + '\n');
      this.child.stdin.end();
    } catch {
      // Best-effort — the child might already be gone.
    }
    // Give the child up to 5 s to exit on its own, then SIGTERM.
    const killTimer = setTimeout(() => {
      try {
        this.child.kill('SIGTERM');
      } catch {}
    }, 5000);
    try {
      await this._exitPromise;
    } finally {
      clearTimeout(killTimer);
    }
  }
}

// --------------------------------------------------------------------------
// CLI: `--bench N` smoke test
// --------------------------------------------------------------------------

interface BenchCliArgs {
  bench?: number;
  verbose: boolean;
  seed: number;
  prefix?: string;
  outDir: string;
  size: number;
}

function parseBenchArgs(argv: string[]): BenchCliArgs {
  let bench: number | undefined;
  let verbose = false;
  let seed = 0xc0ffee;
  let prefix: string | undefined;
  let size = 256;
  let outDir = join(REPO_ROOT, 'tools/generator/audit/render/host/tmp/bench');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        console.error(`flag ${a} requires a value`);
        process.exit(2);
      }
      return v as string;
    };
    switch (a) {
      case '--bench':
        bench = parseInt(next(), 10);
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--seed':
        seed = parseInt(next(), 10);
        break;
      case '--prefix':
        prefix = next();
        break;
      case '--size':
        size = parseInt(next(), 10);
        break;
      case '--out-dir':
        outDir = next();
        break;
      case '--help':
      case '-h':
        console.error('usage: bun run render-server --bench N [--verbose] [--seed N] [--prefix mdi] [--size 256]');
        process.exit(0);
        break;
      default:
        console.error(`unknown flag: ${a}`);
        process.exit(2);
    }
  }
  return { bench, verbose, seed, prefix, outDir, size };
}

/** Tiny seeded PRNG (xorshift32) so bench runs are reproducible. */
function makeRng(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 0xdeadbeef;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

interface PickedIcon {
  prefix: string;
  name: string;
}

async function pickRandomIcons(
  count: number,
  rng: () => number,
  onlyPrefix?: string,
): Promise<PickedIcon[]> {
  const { readdir } = await import('node:fs/promises');
  const allFiles = await readdir(MANIFEST_DIR);
  const prefixes = allFiles
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((p) => (onlyPrefix ? p === onlyPrefix : true));
  if (prefixes.length === 0) {
    throw new Error(`no manifests found in ${MANIFEST_DIR} matching --prefix=${onlyPrefix ?? '*'}`);
  }
  // Pre-load manifests we'll need. With --prefix this is one; otherwise
  // pick N random prefixes (with replacement) then one icon each.
  const picked: PickedIcon[] = [];
  let attempts = 0;
  const maxAttempts = count * 10;
  while (picked.length < count && attempts++ < maxAttempts) {
    const prefix = prefixes[Math.floor(rng() * prefixes.length)]!;
    const manifest = await loadManifest(prefix);
    const names = Object.entries(manifest.icons)
      .filter(([, icon]) => !icon.deprecated)
      .map(([n]) => n);
    if (names.length === 0) continue;
    const name = names[Math.floor(rng() * names.length)]!;
    picked.push({ prefix, name });
  }
  if (picked.length < count) {
    throw new Error(`could only pick ${picked.length} of ${count} icons after ${attempts} attempts`);
  }
  return picked;
}

async function runBench(args: BenchCliArgs): Promise<void> {
  const count = args.bench!;
  console.error(`[bench] picking ${count} random icons (seed=${args.seed}, prefix=${args.prefix ?? 'any'})...`);
  const rng = makeRng(args.seed);
  const icons = await pickRandomIcons(count, rng, args.prefix);

  await mkdir(args.outDir, { recursive: true });

  console.error(`[bench] booting server...`);
  const bootStart = Date.now();
  const server = await RenderServer.start({ verbose: args.verbose });
  const bootMs = Date.now() - bootStart;
  console.error(`[bench] server ready in ${bootMs} ms`);

  console.error(`[bench] rendering ${count} icons sequentially...`);
  const renderStart = Date.now();
  let ok = 0;
  let firstMs = 0;
  const perIconMs: number[] = [];
  let failures: { icon: PickedIcon; reason: string }[] = [];
  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i]!;
    const out = join(args.outDir, `${String(i).padStart(4, '0')}__${icon.prefix}__${icon.name.replace(/[^a-z0-9_-]/gi, '_')}.png`);
    const t0 = Date.now();
    try {
      await server.render({
        prefix: icon.prefix,
        name: icon.name,
        size: args.size,
        out,
        bg: 0xffffffff,
      });
      const dt = Date.now() - t0;
      perIconMs.push(dt);
      if (i === 0) firstMs = dt;
      ok++;
      if (args.verbose || i % 10 === 0) {
        process.stderr.write(`[bench] ${i + 1}/${count} ${icon.prefix}:${icon.name} -> ${dt}ms\n`);
      }
    } catch (err) {
      failures.push({ icon, reason: (err as Error).message });
      process.stderr.write(`[bench] FAIL ${icon.prefix}:${icon.name}: ${(err as Error).message}\n`);
    }
  }
  const renderMs = Date.now() - renderStart;
  console.error(`[bench] shutting down server...`);
  await server.close();

  // Stats.
  const sorted = [...perIconMs].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const totalRender = perIconMs.reduce((a, b) => a + b, 0);
  const meanMs = perIconMs.length === 0 ? 0 : totalRender / perIconMs.length;
  console.error('');
  console.error('--- BENCH RESULTS ---');
  console.error(`requested:      ${count}`);
  console.error(`succeeded:      ${ok}`);
  console.error(`failed:         ${failures.length}`);
  console.error(`bootstrap:      ${bootMs} ms`);
  console.error(`wall (render):  ${renderMs} ms`);
  console.error(`first request:  ${firstMs} ms (cold font load)`);
  console.error(`mean / icon:    ${meanMs.toFixed(1)} ms`);
  console.error(`p50 / p95 / max:${p(0.5)} / ${p(0.95)} / ${p(1.0)} ms`);
  console.error(`target met:     ${meanMs < 600 ? 'YES (<600 ms/icon)' : 'NO'}`);
  if (failures.length > 0 && failures.length <= 10) {
    console.error('failures:');
    for (const f of failures) {
      console.error(`  - ${f.icon.prefix}:${f.icon.name} : ${f.reason}`);
    }
  }

  // Cleanup temp PNGs (best-effort).
  const { rm } = await import('node:fs/promises');
  try {
    await rm(args.outDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  if (failures.length > 0) process.exitCode = 1;
}

if (import.meta.main) {
  const args = parseBenchArgs(process.argv.slice(2));
  if (args.bench === undefined) {
    console.error('usage: bun run render-server --bench N [--verbose] [--seed N] [--prefix mdi] [--size 256]');
    process.exit(2);
  }
  runBench(args).catch((err) => {
    console.error(`render-server: ${err.message ?? err}`);
    process.exit(1);
  });
}
