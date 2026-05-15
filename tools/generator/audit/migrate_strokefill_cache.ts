/**
 * One-shot migration: flat-file strokefill cache → SQLite.
 *
 * The strokefill cache used to live at
 *
 *   tools/generator/.cache/strokefill/<prefix>/<hash>.svg
 *
 * which grew to ~1.4 GB across 72 000+ files. On macOS APFS this triggers
 * - `existsSync` over 300 k flat files at 5-15 µs/call ≈ 1.7-5 s/regen
 *   spent on stat syscalls alone (see RESEARCH_PLAN.md §15 / 13.3)
 * - `git status` walking the entire cache (user-felt complaint)
 * - Spotlight (`mdworker`) silently indexing the cache
 * - `actions/cache` choking on 300 k-file caches in CI
 *
 * The cache now lives in a single SQLite database
 *
 *   tools/generator/.cache/strokefill.sqlite
 *
 * keyed by the same SHA-1 content key. This script does a one-shot bulk
 * import: walk every `<prefix>/<hash>.svg`, INSERT it into the SQLite
 * cache under the existing hash, batched in a single transaction for
 * speed.
 *
 * IDEMPOTENT: re-runs are safe. Existing rows are not overwritten unless
 * `--force` is passed (default = `INSERT OR IGNORE`). The script
 * preserves the legacy directory by default; pass `--delete-legacy` to
 * remove `.cache/strokefill/` after a verified import.
 *
 * USAGE
 *
 *   bun run tools/generator/audit/migrate_strokefill_cache.ts
 *     [--force]             Overwrite existing SQLite rows on conflict
 *     [--delete-legacy]     rm -rf the flat-file cache after import
 *     [--dry-run]           Walk + report counts, don't write
 *
 * Determinism: the import uses each file's existing hex hash verbatim as
 * the SQLite row key. `bun run generate` after migration produces
 * byte-identical TTFs vs pre-migration — verified on `mdi` (no
 * strokefill icons) and `lucide` (strokefill at the pack level).
 */

import path from 'node:path';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { Database } from 'bun:sqlite';

const CACHE_ROOT = path.resolve(import.meta.dir, '..', '.cache');
const LEGACY_ROOT = path.resolve(CACHE_ROOT, 'strokefill');
const DB_PATH = path.resolve(CACHE_ROOT, 'strokefill.sqlite');

interface Args {
  force: boolean;
  deleteLegacy: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { force: false, deleteLegacy: false, dryRun: false };
  for (const a of argv) {
    switch (a) {
      case '--force':
        out.force = true;
        break;
      case '--delete-legacy':
        out.deleteLegacy = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith('--')) {
          console.error(`unknown flag: ${a}`);
          printHelp();
          process.exit(2);
        }
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: bun run tools/generator/audit/migrate_strokefill_cache.ts [options]

Bulk-import the flat-file strokefill cache into SQLite.

Options:
  --force            Overwrite existing SQLite rows on hash conflict
                     (default: INSERT OR IGNORE — keep existing rows)
  --delete-legacy    rm -rf .cache/strokefill/ after a verified import
  --dry-run          Walk + report counts, do not write
  -h, --help         Show this help

Idempotent: safe to re-run. The legacy directory is preserved by default
so the migration is reversible — pass --delete-legacy only after you've
verified bun run generate works against the new SQLite cache.`);
}

function openOrCreateDb(): Database {
  if (!existsSync(CACHE_ROOT)) {
    mkdirSync(CACHE_ROOT, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
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
  return db;
}

interface ImportStats {
  scannedPacks: number;
  scannedFiles: number;
  imported: number;
  skipped: number; // already existed in DB and --force NOT passed
  errored: number;
  bytes: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(LEGACY_ROOT)) {
    console.log(
      `No legacy cache at ${LEGACY_ROOT} — nothing to migrate. (This is the expected state after a successful migration.)`
    );
    return;
  }

  const db = openOrCreateDb();
  const stats: ImportStats = {
    scannedPacks: 0,
    scannedFiles: 0,
    imported: 0,
    skipped: 0,
    errored: 0,
    bytes: 0,
  };

  // Use INSERT OR IGNORE (default) or INSERT OR REPLACE (--force) so the
  // migration is naturally idempotent.
  const insertSql = args.force
    ? `INSERT INTO strokefill (hash, pack, icon_name, body, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO UPDATE SET
         pack = excluded.pack,
         icon_name = excluded.icon_name,
         body = excluded.body,
         created_at = excluded.created_at`
    : `INSERT OR IGNORE INTO strokefill (hash, pack, icon_name, body, created_at)
       VALUES (?, ?, ?, ?, ?)`;
  const insertStmt = db.query(insertSql);
  const existsStmt = db.query(
    'SELECT 1 AS x FROM strokefill WHERE hash = ? LIMIT 1'
  );

  const t0 = performance.now();
  const packs = (await readdir(LEGACY_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(
    `Migrating ${packs.length} pack${packs.length === 1 ? '' : 's'} from ${LEGACY_ROOT}${args.dryRun ? ' (DRY RUN)' : ''}${args.force ? ' (FORCE OVERWRITE)' : ''}`
  );

  for (const pack of packs) {
    const packDir = path.join(LEGACY_ROOT, pack);
    let entries: string[];
    try {
      entries = (await readdir(packDir)).filter((e) => e.endsWith('.svg'));
    } catch (err) {
      console.warn(`  skip pack ${pack}: ${(err as Error).message}`);
      continue;
    }
    if (entries.length === 0) continue;
    stats.scannedPacks += 1;

    // Pre-build a list of (hash, body) pairs for this pack so the INSERT
    // transaction is a single tight loop. Body reads are sequential per
    // pack to keep RSS bounded — at ~3-5 KB per traced SVG, even
    // arcticons (~29 k files) fits comfortably in RAM, but we still
    // page through one pack at a time to be safe.
    const batch: {
      hash: string;
      iconName: string;
      body: string;
    }[] = [];

    for (const entry of entries) {
      stats.scannedFiles += 1;
      const filePath = path.join(packDir, entry);
      const hash = entry.replace(/\.svg$/, '');

      // Cheap pre-check: if the row already exists in SQLite and we're
      // not forcing, skip the file read entirely.
      if (!args.force) {
        const hit = existsStmt.get(hash) as { x: number } | null;
        if (hit) {
          stats.skipped += 1;
          continue;
        }
      }

      try {
        const body = await readFile(filePath, 'utf8');
        // Icon name isn't recoverable from the legacy layout — the
        // filename is a content hash, not an icon name. Use a synthetic
        // placeholder. The pipeline overwrites this on the next regen
        // when the icon actually runs through `strokeFillBatch`.
        batch.push({ hash, iconName: `<imported:${hash}>`, body });
        stats.bytes += Buffer.byteLength(body, 'utf8');
      } catch (err) {
        stats.errored += 1;
        console.warn(`  read error ${pack}/${entry}: ${(err as Error).message}`);
      }
    }

    if (batch.length === 0) continue;

    if (!args.dryRun) {
      const now = Math.floor(Date.now() / 1000);
      db.transaction(() => {
        for (const row of batch) {
          const changes = insertStmt.run(
            row.hash,
            pack,
            row.iconName,
            row.body,
            now
          ) as { changes: number };
          if (changes.changes > 0) {
            stats.imported += 1;
          } else {
            // INSERT OR IGNORE matched an existing row — count as skip.
            stats.skipped += 1;
          }
        }
      })();
    } else {
      // In dry-run mode, count each batch entry as a would-be import.
      stats.imported += batch.length;
    }

    console.log(
      `  ${pack}: scanned=${entries.length}, batched=${batch.length}, running_total=${stats.imported}`
    );
  }

  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`Migration complete in ${dt}s`);
  console.log(`  scanned packs:  ${stats.scannedPacks}`);
  console.log(`  scanned files:  ${stats.scannedFiles}`);
  console.log(
    `  imported:       ${stats.imported}${args.dryRun ? ' (dry-run)' : ''}`
  );
  console.log(`  skipped:        ${stats.skipped}`);
  console.log(`  errored:        ${stats.errored}`);
  console.log(`  total bytes:    ${(stats.bytes / 1e6).toFixed(1)} MB`);

  if (!args.dryRun) {
    // Force a WAL checkpoint so the data lands in the main DB file.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const dbSize = (await stat(DB_PATH)).size;
    console.log(`  sqlite size:    ${(dbSize / 1e6).toFixed(1)} MB`);
    db.close();
  }

  if (args.deleteLegacy && !args.dryRun) {
    console.log('');
    console.log(`Removing legacy directory ${LEGACY_ROOT} ...`);
    await rm(LEGACY_ROOT, { recursive: true, force: true });
    console.log(`Done. git status should now be visibly faster.`);
  } else if (!args.dryRun) {
    console.log('');
    console.log(
      'Legacy directory preserved. After verifying bun run generate works,'
    );
    console.log(
      'either re-run with --delete-legacy or rm -rf the dir manually:'
    );
    console.log(`  rm -rf ${LEGACY_ROOT}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
