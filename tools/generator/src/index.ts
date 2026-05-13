import { runPipeline, cleanOrphans } from './pipeline.ts';
import { log } from './log.ts';

interface ParsedArgs {
  set?: string;
  newOnly: boolean;
  dryRun: boolean;
  clean: boolean;
  skipMeta: boolean;
  smoke?: string[];
  concurrency?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    newOnly: false,
    dryRun: false,
    clean: false,
    skipMeta: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--set':
        out.set = argv[++i];
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
  --set <prefix>          Process only the named Iconify set
  --new-only              Skip sets that already have a manifest
  --smoke <p1,p2,...>     Process only a small explicit list (for smoke tests)
  --concurrency <n>       Worker pool size (default: min(cpus, 8))
  --skip-meta             Don't write meta package + example app data
  --dry-run               Don't write files; print summary
  --clean                 Remove orphan packages/manifests for sets no longer in Iconify
  -h, --help              Show this help

Each Iconify set lives in its own \`iconifyx_<prefix>\` directory under
packages/. The meta package \`iconifyx\` re-exports them all; the example
app depends on every set package directly so font assets bundle correctly.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.clean) {
    log.step('Cleaning orphan packages + manifests');
    await cleanOrphans();
  }

  const t0 = performance.now();
  await runPipeline({
    onlySet: args.set,
    newOnly: args.newOnly,
    dryRun: args.dryRun,
    skipMeta: args.skipMeta,
    smokeOnly: args.smoke,
    concurrency: args.concurrency,
  });
  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  log.success(`done in ${dt}s`);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
