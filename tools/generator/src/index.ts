import { runPipeline, cleanOrphans } from './pipeline.ts';
import { log } from './log.ts';
import { cleanTtfCache, ttfCacheRoot } from './ttf_cache.ts';

interface ParsedArgs {
  set?: string;
  newOnly: boolean;
  dryRun: boolean;
  clean: boolean;
  skipMeta: boolean;
  smoke?: string[];
  concurrency?: number;
  noCache: boolean;
  cleanCache: boolean;
  sets?: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    newOnly: false,
    dryRun: false,
    clean: false,
    skipMeta: false,
    noCache: false,
    cleanCache: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--set':
        // Support repeated --set <prefix> by accumulating into a list and
        // mirroring the FIRST occurrence into the singular `set` slot for
        // backward compatibility with onlySet handling downstream.
        {
          const v = argv[++i];
          if (v) {
            out.sets ??= [];
            out.sets.push(v);
            if (!out.set) out.set = v;
          }
        }
        break;
      case '--new-only':
        out.newOnly = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--clean':
        out.clean = true;
        break;
      case '--skip-meta':
        out.skipMeta = true;
        break;
      case '--concurrency':
        out.concurrency = Number(argv[++i]);
        break;
      case '--smoke': {
        // comma-separated list of prefixes
        out.smoke = (argv[++i] || '').split(',').filter(Boolean);
        break;
      }
      case '--no-cache':
        // Bypass the per-font TTF cache for this run. Used to test
        // determinism after editing the build chain, or to force-rebuild
        // every font from source.
        out.noCache = true;
        break;
      case '--clean-cache':
        // Wipe `.cache/ttf/` then continue. Combine with `--no-cache` to
        // both clear AND skip writing new entries this run.
        out.cleanCache = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith('--')) {
          log.error(`Unknown flag: ${a}`);
          printHelp();
          process.exit(2);
        }
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: bun run generate [options]

Options:
  --set <prefix>          Process only the named Iconify set (repeatable)
  --new-only              Skip sets that already have a manifest
  --smoke <p1,p2,...>     Process only a small explicit list (for smoke tests)
  --concurrency <n>       Worker pool size (default: min(cpus, 8))
  --skip-meta             Don't write meta package + example app data
  --dry-run               Don't write files; print summary
  --clean                 Remove orphan packages/manifests for sets no longer in Iconify
  --no-cache              Bypass the per-font TTF cache (always rebuild)
  --clean-cache           Wipe .cache/ttf/ before running
  -h, --help              Show this help

Each Iconify set lives in its own \`iconifyx_<prefix>\` directory under
packages/. The meta package \`iconifyx\` re-exports them all; the example
app depends on every set package directly so font assets bundle correctly.

Per-font TTF cache (RESEARCH_PLAN.md §15):
  Saves ~30-50 s on a warm regen by skipping the svgicons2svgfont +
  svg2ttf chain when a previously-emitted TTF can be reused verbatim.
  Cache lives at \`tools/generator/.cache/ttf/\` (gitignored, content-
  addressed). Determinism is preserved — same input bytes always produce
  the same cache key. Use --no-cache to force a fresh build.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.clean) {
    log.step('Cleaning orphan packages + manifests');
    await cleanOrphans();
  }

  if (args.cleanCache) {
    log.step('Wiping TTF cache');
    const r = await cleanTtfCache();
    if (r.removed) {
      log.info(`Removed ${ttfCacheRoot()}`);
    } else {
      log.info('TTF cache was already empty');
    }
  }

  // When the user passed multiple `--set` flags, treat the list as a smoke
  // selection (which IS plural-set capable). The single onlySet path is
  // only used when exactly one --set is present, for backward compat.
  let onlySet: string | undefined;
  let smoke = args.smoke;
  if (args.sets && args.sets.length > 1) {
    onlySet = undefined;
    smoke = args.sets;
  } else {
    onlySet = args.set;
  }

  const t0 = performance.now();
  await runPipeline({
    onlySet,
    newOnly: args.newOnly,
    dryRun: args.dryRun,
    skipMeta: args.skipMeta,
    smokeOnly: smoke,
    concurrency: args.concurrency,
    cacheEnabled: !args.noCache,
  });
  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  log.success(`done in ${dt}s`);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
