import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';
import { log } from './log.ts';
import { iconToSvg } from './svg_preprocess.ts';
import type { ResolvedIcon } from './load_iconify.ts';

/**
 * Convert stroke-only icons into filled-outline icons so that
 * svgicons2svgfont produces correct visual results (a circle outline stays
 * a ring instead of becoming a solid disc).
 *
 * Strategy: use oslllo-svg-fixer (Inkscape-style "stroke to path" via
 * rasterize + Potrace trace) which is the only Node-native option that
 * handles the full set of SVG path features. It's slow (~50-200ms per icon)
 * so output is cached in a single SQLite database at
 *
 *   tools/generator/.cache/strokefill.sqlite
 *
 * keyed by SHA-1 of the original SVG body. On re-runs only icons whose body
 * changed re-process; the rest read from cache in microseconds.
 *
 * ## Why SQLite vs flat files (RESEARCH_PLAN.md §15 / 13.3)
 *
 * The cache used to live at `.cache/strokefill/<prefix>/<hash>.svg`. At
 * full coverage (~340 k icons across ~225 packs) that grew to **1.4 GB
 * across 72 000+ files**. On macOS APFS this caused:
 *
 *   - `fs.existsSync` over 300 k flat files at 5-15 µs/call = **1.7-5 s
 *     just on stat syscalls** every regen
 *   - `git status` walking 72 k cache files (user-felt slowdown)
 *   - Spotlight (`mdworker`) silently indexing the cache
 *   - `actions/cache` choking on 300 k-file caches in CI
 *
 * The SQLite layout is **one file, mmap-backed, WAL mode**: a prepared
 * `SELECT body FROM strokefill WHERE hash = ?` runs in ~1 µs, atomic
 * writes via transaction-wrapped `INSERT OR REPLACE`, and the entire
 * cache is shippable as a single CI artifact. See
 * `tools/generator/audit/migrate_strokefill_cache.ts` for one-shot
 * import from the legacy flat-file layout.
 *
 * Per RESEARCH_PLAN.md §15 (13.3): "Migrate `.cache/strokefill/` to
 * SQLite (`bun:sqlite`). Fixes the many-small-files APFS pain, makes
 * the cache shippable as a single CI artifact, speeds `existsSync`
 * lookups, eliminates `git status` slowdown."
 *
 * The cache is gitignored and rebuilds idempotently. Deleting the
 * `.sqlite` file forces a fresh trace on the next regen.
 *
 * ## Process isolation (UNCHANGED across the SQLite migration)
 *
 * `oslllo-svg-fixer` transitively depends on `resvg`, a native Rust crate.
 * Some malformed SVG bodies — the foreground halves of certain duotone-
 * split emoji glyphs in particular — make resvg panic in `geom.rs` with
 * `called Option::unwrap() on a None value`, which abort()s the process
 * via SIGABRT. A native panic is unrecoverable from JavaScript: a normal
 * try/catch only catches JS exceptions, so without isolation a single bad
 * icon kills the entire generator run mid-flight.
 *
 * The fix is to run `SVGFixer.fix()` in a SUBPROCESS via [Bun.spawn]. If
 * the worker dies on a bad icon, the parent observes a non-zero exit code
 * and bisects the failing batch to locate the offender, then skips it and
 * continues. Cost: one extra `bun` startup per pack (~500 ms); negligible
 * next to the rasterize-trace itself, and only paid on cache misses.
 *
 * The bisect path NEVER writes to the cache — only successfully traced
 * icons get inserted. Panic-skipped icons are reported in `panicSkipped`
 * and marked deprecated downstream so they never receive a glyph. Per
 * CLAUDE.md §5a-bis, the subprocess panic isolation is load-bearing and
 * was preserved verbatim across this SQLite migration.
 *
 * @see ./stroke_fill_worker.ts
 * @see ../audit/migrate_strokefill_cache.ts
 */

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache');
const DB_PATH = path.resolve(CACHE_ROOT, 'strokefill.sqlite');
/**
 * Path to the LEGACY flat-file cache. Reads against this path act as a
 * one-shot fallback for users who haven't yet run the migration script;
 * on hit, the body is also inserted into SQLite so subsequent regens
 * are direct SQLite hits. Once the legacy `.cache/strokefill/` directory
 * is deleted (or never exists, e.g. fresh clone), every legacy probe
 * short-circuits at the top-level `existsSync(LEGACY_CACHE_ROOT)` check
 * (one stat per regen).
 */
const LEGACY_CACHE_ROOT = path.resolve(CACHE_ROOT, 'strokefill');
const WORKER_PATH = path.resolve(import.meta.dir, 'stroke_fill_worker.ts');

/**
 * Lazy-initialised SQLite handle. Opened once per process; closed on
 * `process.on('exit')`. Reusing the same Database instance across all
 * `strokeFillBatch` calls (which run inside the per-pack worker pool)
 * lets bun:sqlite reuse its prepared-statement cache and keeps mmap
 * warm across packs.
 */
let _db: Database | null = null;

interface PreparedStatements {
  selectByHash: ReturnType<Database['query']>;
  insertOrReplace: ReturnType<Database['query']>;
}
let _prepared: PreparedStatements | null = null;

function getDb(): Database {
  if (_db !== null) return _db;

  // Ensure the .cache directory exists; bun:sqlite won't auto-create it.
  // The pipeline's first call into strokeFillBatch races between worker
  // tasks, so make this synchronous + idempotent.
  if (!existsSync(CACHE_ROOT)) {
    mkdirSync(CACHE_ROOT, { recursive: true });
  }

  const db = new Database(DB_PATH);
  // WAL mode: fast concurrent reads, single-writer semantics. The
  // generator is mostly read-after-write within a single process, but
  // WAL also makes the cache safer if a user runs two regens in
  // parallel (which they shouldn't, but won't corrupt).
  db.exec('PRAGMA journal_mode = WAL');
  // `synchronous = NORMAL` is safe with WAL and ~2× faster than FULL
  // on the write path. Worst-case crash loses the last transaction,
  // which is fine for a content-addressed regenerable cache.
  db.exec('PRAGMA synchronous = NORMAL');
  // mmap_size: let SQLite mmap up to 256 MB of the DB file. The cache
  // is text-heavy (traced SVG bodies, a few KB each), and at full
  // coverage the DB is ~1.5 GB — only the hot pages mmap; cold rows
  // fault on demand. 256 MB covers the typical working set per regen.
  db.exec('PRAGMA mmap_size = 268435456');
  // Temp store in memory: small ad-hoc sorts during INSERT OR REPLACE
  // stay off disk.
  db.exec('PRAGMA temp_store = MEMORY');

  db.exec(`
    CREATE TABLE IF NOT EXISTS strokefill (
      hash TEXT PRIMARY KEY,
      pack TEXT NOT NULL,
      icon_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_strokefill_pack
      ON strokefill(pack);
  `);

  _db = db;
  _prepared = {
    selectByHash: db.query('SELECT body FROM strokefill WHERE hash = ?'),
    insertOrReplace: db.query(
      `INSERT INTO strokefill (hash, pack, icon_name, body, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO UPDATE SET
         pack = excluded.pack,
         icon_name = excluded.icon_name,
         body = excluded.body,
         created_at = excluded.created_at`
    ),
  };

  // Close on exit so WAL checkpoint flushes to the main DB file.
  // Without this, the `-wal` sidecar can grow large across runs.
  process.on('exit', () => {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      // Best-effort: process is already exiting.
    }
  });

  return db;
}

function getPrepared(): PreparedStatements {
  if (_prepared === null) {
    getDb();
  }
  return _prepared!;
}

/**
 * Spawn the stroke-fill worker on a directory of input SVGs. Returns
 * true if the worker exited cleanly, false on any non-zero exit code
 * (including native panic / SIGABRT). The caller is responsible for
 * inspecting `outDir` to determine which icons were successfully
 * traced — partial output is preserved across crashes.
 */
async function runFixerWorker(inDir: string, outDir: string): Promise<boolean> {
  const proc = Bun.spawn(['bun', 'run', WORKER_PATH, inDir, outDir], {
    // Inherit stderr so panic messages surface; stdout is silenced (the
    // worker itself doesn't log on the happy path).
    stdout: 'ignore',
    stderr: 'pipe',
  });
  // Drain stderr so the pipe doesn't fill up + block the worker. We only
  // surface it on failure to keep the regular log noise low.
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const short = stderrText.trim().slice(0, 200);
    log.warn(
      `  stroke-fill worker died (exit=${exitCode})${short ? `: ${short}` : ''}`
    );
    return false;
  }
  return true;
}

/**
 * Content-addressed cache key for an SVG body. Uses `Bun.hash` (wyhash) —
 * non-cryptographic but ~4× faster than `crypto.sha1` on small inputs, and
 * cache keys don't need cryptographic strength. The 16-char hex truncation
 * preserves the original key length.
 *
 * Function name kept as `sha1` to avoid noisy renames in the bisect path —
 * the identity that matters is "same input → same filename", not the
 * specific algorithm.
 */
function sha1(s: string): string {
  return Bun.hash(s).toString(16).padStart(16, '0').slice(0, 16);
}

/**
 * Legacy SHA-1 cache key. Existing cache files under
 * `.cache/strokefill/<prefix>/<sha1>.svg` were written before the wyhash
 * switch; we still read them on cache hits to keep warm-cache regen times
 * stable across the cutover, then re-link them under the new key on first
 * touch. After ~one regen cycle the cache is fully migrated; users who
 * want a clean cut can `rm -rf tools/generator/.cache/strokefill/`.
 */
function legacySha1(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

/** A cache miss that will be sent to the stroke-fill worker. */
type Pending = { icon: ResolvedIcon; sourceSvg: string; hash: string };

/**
 * Try the legacy flat-file cache for `hash` under `prefix`. Returns the
 * cached body on hit (and the caller queues an INSERT into SQLite so
 * subsequent regens skip the disk read) or `null` if no flat-file entry
 * exists.
 *
 * This is a transitional fallback for users who haven't run the
 * migration script. Once the legacy `.cache/strokefill/` directory is
 * deleted (or never exists, e.g. fresh clone), every call returns
 * `null` after a single cheap `existsSync` against the root dir.
 */
async function tryLegacyCacheHit(
  prefix: string,
  hash: string
): Promise<string | null> {
  if (!existsSync(LEGACY_CACHE_ROOT)) return null;
  const legacyPath = path.join(LEGACY_CACHE_ROOT, prefix, `${hash}.svg`);
  if (!existsSync(legacyPath)) return null;
  return await readFile(legacyPath, 'utf8');
}

/**
 * Pre-process every icon body in `icons` through stroke→fill conversion.
 * Mutates each `ResolvedIcon` in place to point its `body` at the new
 * filled-outline form. Returns the same array for chaining.
 *
 * Icons whose stroke-fill conversion errors out keep their original body
 * (they'll render filled instead of outlined, which is wrong but better
 * than missing). Icons that crash the rasterizer (native resvg panic)
 * are isolated via bisect, skipped, and reported back in `panicSkipped`
 * — the pipeline marks those as deprecated so they don't ship.
 */
export async function strokeFillBatch(
  prefix: string,
  icons: ResolvedIcon[]
): Promise<{
  converted: number;
  cacheHits: number;
  failures: number;
  /** Names of icons whose stroke-fill worker died (native panic). */
  panicSkipped: string[];
}> {
  if (icons.length === 0) {
    return { converted: 0, cacheHits: 0, failures: 0, panicSkipped: [] };
  }

  await mkdir(CACHE_ROOT, { recursive: true });
  const db = getDb();
  const stmts = getPrepared();

  // First pass: figure out which icons we already have cached vs. need.
  // Bulk-read from SQLite; bun:sqlite prepared `.get()` is ~1 µs mmap-
  // backed, so this loop is dominated by `iconToSvg` rendering rather
  // than DB I/O.
  const pending: Pending[] = [];
  let cacheHits = 0;
  /** Legacy-file hits buffered for a single bulk INSERT at end of pass. */
  const legacyImports: { hash: string; iconName: string; body: string }[] = [];

  for (const ic of icons) {
    const sourceSvg = iconToSvg(ic);
    const hash = sha1(sourceSvg);

    const row = stmts.selectByHash.get(hash) as { body: string } | null;
    if (row) {
      ic.body = row.body;
      cacheHits += 1;
      continue;
    }

    // Migration fallback: hit the legacy flat-file cache. On hit,
    // queue an INSERT so subsequent regens skip the disk.
    const legacyBody = await tryLegacyCacheHit(prefix, hash);
    if (legacyBody !== null) {
      ic.body = legacyBody;
      cacheHits += 1;
      legacyImports.push({ hash, iconName: ic.name, body: legacyBody });
      continue;
    }

    pending.push({ icon: ic, sourceSvg, hash });
  }

  // Drain buffered legacy imports inside a single transaction so the
  // O(N) inserts amortize to one WAL flush. Slightly faster than per-
  // row commits and keeps the WAL sidecar small.
  if (legacyImports.length > 0) {
    const now = Math.floor(Date.now() / 1000);
    db.transaction(() => {
      for (const row of legacyImports) {
        stmts.insertOrReplace.run(
          row.hash,
          prefix,
          row.iconName,
          row.body,
          now
        );
      }
    })();
  }

  if (pending.length === 0) {
    return { converted: 0, cacheHits, failures: 0, panicSkipped: [] };
  }

  log.info(
    `  "${prefix}": stroke-fill ${pending.length} icon${pending.length === 1 ? '' : 's'} (${cacheHits} cached)`
  );

  const panicSkipped: string[] = [];
  let failures = 0;
  let converted = 0;
  /**
   * Successfully-traced icons accumulate here so all writes for the
   * batch commit in a single transaction at the end. Each
   * `acceptTracedOutput` call only updates the in-memory icon body;
   * the DB write is buffered to amortize WAL fsyncs.
   */
  const writes: { hash: string; iconName: string; body: string }[] = [];

  await processChunk(pending, prefix, {
    onConverted: (hash, icon, body) => {
      writes.push({ hash, iconName: icon.name, body });
      converted += 1;
    },
    onFailure: () => {
      failures += 1;
    },
    onPanicSkipped: (name) => {
      panicSkipped.push(name);
    },
  });

  if (writes.length > 0) {
    const now = Math.floor(Date.now() / 1000);
    db.transaction(() => {
      for (const w of writes) {
        stmts.insertOrReplace.run(w.hash, prefix, w.iconName, w.body, now);
      }
    })();
  }

  return { converted, cacheHits, failures, panicSkipped };
}

/**
 * Process the strokefill cache + trace pipeline for multiple `(prefix,
 * icons)` jobs in a single coordinated pass. The point is to merge the N
 * subprocess invocations (one per `strokeFillBatch` call) into a single
 * subprocess spawn that processes ALL cache misses across ALL jobs at
 * once.
 *
 * Successfully-traced icons are reported via `onConverted(hash, icon,
 * body)`; the caller buffers them into a single transaction. A bad icon
 * ends in `onPanicSkipped(name)`; the pipeline treats those as
 * deprecated downstream so they never receive a glyph.
 *
 * Subprocess panic isolation (CLAUDE.md §5a-bis) is preserved across
 * the SQLite migration: on worker crash, salvaged outputs are accepted;
 * remaining icons are bisected recursively across fresh subprocesses;
 * the lone panic survivor is reported via `onPanicSkipped` without
 * ever reaching the cache.
 */
export async function strokeFillBatchMulti(
  jobs: StrokeFillJob[]
): Promise<StrokeFillJobResult[]> {
  // Per-job result aggregators. We track per-pack counts so each caller
  // sees stats indistinguishable from the legacy single-pack API.
  const results: Map<string, StrokeFillJobResult> = new Map();
  for (const job of jobs) {
    results.set(job.prefix, {
      prefix: job.prefix,
      converted: 0,
      cacheHits: 0,
      failures: 0,
      panicSkipped: [],
    });
  }

  // First pass per job: resolve cache hits, collect cache misses. Hits
  // mutate the icon body directly + bump the per-job cacheHits counter;
  // misses get queued for the single shared subprocess.
  const allPending: Tagged[] = [];
  let totalCacheHits = 0;

  for (const job of jobs) {
    if (job.icons.length === 0) continue;
    const cacheDir = path.join(CACHE_ROOT, job.prefix);
    await mkdir(cacheDir, { recursive: true });
    const jobResult = results.get(job.prefix)!;

    for (const ic of job.icons) {
      const sourceSvg = iconToSvg(ic);
      const hash = sha1(sourceSvg);
      const cachePath = path.join(cacheDir, `${hash}.svg`);
      if (existsSync(cachePath)) {
        const cached = await readFile(cachePath, 'utf8');
        ic.body = cached;
        jobResult.cacheHits += 1;
        totalCacheHits += 1;
        continue;
      }
      // Legacy SHA-1 cache compatibility (see `legacySha1`). On hit, re-
      // link under the new wyhash key so subsequent regens see a direct
      // hit. One extra `existsSync` per cache miss during the migration
      // window; once every cached body has been re-keyed, the legacy
      // branch turns into a no-op stat.
      const legacyCachePath = path.join(cacheDir, `${legacySha1(sourceSvg)}.svg`);
      if (existsSync(legacyCachePath)) {
        const cached = await readFile(legacyCachePath, 'utf8');
        ic.body = cached;
        jobResult.cacheHits += 1;
        totalCacheHits += 1;
        await writeFile(cachePath, cached, 'utf8');
        continue;
      }
      allPending.push({
        prefix: job.prefix,
        pending: { icon: ic, cachePath, sourceSvg },
      });
    }
  }

  if (allPending.length === 0) {
    if (totalCacheHits > 0) {
      log.info(
        `  stroke-fill: ${totalCacheHits} cached across ${jobs.length} job${jobs.length === 1 ? '' : 's'}, no misses`
      );
    }
    return [...results.values()];
  }

  if (jobs.length === 1) {
    log.info(
      `  "${jobs[0]!.prefix}": stroke-fill ${allPending.length} icon${allPending.length === 1 ? '' : 's'} (${totalCacheHits} cached)`
    );
  } else {
    log.info(
      `  stroke-fill: ${allPending.length} icon${allPending.length === 1 ? '' : 's'} across ${jobs.length} job${jobs.length === 1 ? '' : 's'} (${totalCacheHits} cached) — batched single subprocess`
    );
  }

  await processMultiChunk(allPending, {
    onConverted: (prefix) => {
      results.get(prefix)!.converted += 1;
    },
    onFailure: (prefix) => {
      results.get(prefix)!.failures += 1;
    },
    onPanicSkipped: (prefix, name) => {
      results.get(prefix)!.panicSkipped.push(name);
    },
  });

  return [...results.values()];
}

/**
 * Multi-prefix variant of the original per-pack `processChunk`. Drives a
 * single subprocess invocation that handles cache-misses tagged with
 * their original pack prefix; on worker crash, bisects the WHOLE pool
 * (across prefixes) — survivors land in cache, the dead glyph gets
 * accounted to its source pack's `onPanicSkipped`.
 *
 * Hash collisions across prefixes (two packs whose `iconToSvg` output is
 * byte-identical) would normally collide in the shared `tempIn` dir. We
 * resolve via a suffix on the temp filename — the cache path is still
 * prefix-scoped, but the on-disk temp filename is `<hash>_<idx>.svg`
 * where `idx` is the tagged-pending's position in the input array. The
 * worker is filename-agnostic; it traces whatever lands in `tempIn`.
 */
async function processMultiChunk(
  pool: Tagged[],
  cb: {
    onConverted: (hash: string, icon: ResolvedIcon, body: string) => void;
    onFailure: () => void;
    onPanicSkipped: (name: string) => void;
  }
): Promise<void> {
  if (pool.length === 0) return;

  // Use a single shared temp namespace so we only pay one mkdtemp pair
  // per subprocess invocation. Suffixing input filenames with the index
  // guards against (rare) hash collisions of identical iconToSvg output
  // across two different prefixes.
  const label = pool.length === 1 ? pool[0]!.prefix : `multi-${pool.length}`;
  const tempIn = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-in-${label}-`));
  const tempOut = await mkdtemp(path.join(tmpdir(), `iconifyx-sf-out-${label}-`));

  try {
    const written: Pending[] = [];
    for (const p of pending) {
      await writeFile(path.join(tempIn, `${p.hash}.svg`), p.sourceSvg);
      written.push(p);
    }

    const ok = await runFixerWorker(tempIn, tempOut);

    if (!ok) {
      // Worker crashed. Salvage cleanly-traced files (the bad glyph may
      // have crashed mid-batch, so earlier outputs survive), then bisect
      // the rest across two fresh subprocesses.
      const salvagedNames = new Set<string>();
      for (const w of written) {
        const outPath = path.join(tempOut, w.tempName);
        if (!existsSync(outPath)) continue;
        const body = await acceptTracedOutput(outPath, w);
        if (body !== null) {
          salvaged.add(w.hash);
          cb.onConverted(w.hash, w.icon, body);
        }
      }
      const remaining = pending.filter((p) => !salvaged.has(p.hash));

      if (remaining.length === 1) {
        const tag = remaining[0]!;
        log.warn(
          `  "${tag.prefix}": skipping bad glyph "${tag.pending.icon.name}" (stroke-fill panic)`
        );
        cb.onPanicSkipped(tag.prefix, tag.pending.icon.name);
        return;
      }
      if (remaining.length === 0) {
        // Crash AFTER the final icon — everything salvaged.
        return;
      }

      const mid = Math.floor(remaining.length / 2);
      await processMultiChunk(remaining.slice(0, mid), cb);
      await processMultiChunk(remaining.slice(mid), cb);
      return;
    }

    // Happy path: worker succeeded. Walk the output dir and update each
    // icon's body / queue a cache write.
    for (const w of written) {
      const outPath = path.join(tempOut, w.tempName);
      if (!existsSync(outPath)) {
        cb.onFailure(w.tag.prefix);
        continue;
      }
      const body = await acceptTracedOutput(outPath, w);
      if (body !== null) {
        cb.onConverted(w.hash, w.icon, body);
      } else {
        cb.onFailure(w.tag.prefix);
      }
    }
  } finally {
    await rm(tempIn, { recursive: true, force: true });
    await rm(tempOut, { recursive: true, force: true });
  }
}

/**
 * Read a traced SVG from `outPath`, strip the outer `<svg>` tag, and
 * commit the result to `pending.icon.body` (in-memory). Returns the
 * extracted body on a clean accept, `null` if the output is missing /
 * empty / invalid (the caller treats this as a per-icon trace failure).
 *
 * The DB write is NOT performed here — `strokeFillBatch` batches all
 * writes for the chunk into a single transaction at the end so we
 * amortize WAL fsyncs across the batch.
 */
async function acceptTracedOutput(
  outPath: string,
  pending: Pending
): Promise<string | null> {
  const fixed = await readFile(outPath, 'utf8');
  if (!/<path\b/.test(fixed)) return null;
  const bodyMatch = fixed.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const newBody = (bodyMatch ? bodyMatch[1]! : fixed).trim();
  pending.icon.body = newBody;
  return newBody;
}
