/**
 * Audit dispatcher — `bun run audit <name>`.
 *
 * Standalone entry point for read-only audits that walk emitted artefacts
 * (TTFs, manifests, generated Dart). Kept separate from the build pipeline
 * so audit runs can't accidentally mutate generator state.
 *
 * Usage:
 *   bun run audit glyph-metrics
 *   bun run audit glyph-metrics -- --prefix solar,mdi   # subset
 *
 * Add a new audit by exporting a `run<Name>Audit(opts)` from a module
 * under `tools/generator/audit/` and wiring it into the dispatch map
 * below.
 */

import { log } from './src/log.ts';

interface AuditCommand {
  description: string;
  run: (args: string[]) => Promise<void>;
}

const COMMANDS: Record<string, AuditCommand> = {
  'glyph-metrics': {
    description:
      'Scan every emitted TTF for font-level metric drift, duotone bbox mismatch, cmap-dedup collisions and outlier glyphs.',
    run: async (args) => {
      const mod = await import('./audit/glyph_metrics.ts');
      // Re-inject args under process.argv so the audit module's own CLI parser
      // continues to work when invoked through the dispatcher.
      process.argv = [process.argv[0]!, process.argv[1]!, ...args];
      await mod.runGlyphMetricsAudit(parseSharedFlags(args));
    },
  },
  'manifest-lint': {
    description:
      'Cross-file manifest + Dart codegen + identifier lint (§16-A1/A2/A3) — catches manifest desync, orphan consts and identifier renames across regens.',
    run: async (args) => {
      const mod = await import('./audit/manifest_lint.ts');
      process.argv = [process.argv[0]!, process.argv[1]!, ...args];
      await mod.runManifestLintAudit(parseSharedFlags(args));
    },
  },
  determinism: {
    description:
      'Regen-twice byte-diff harness — verifies TTFs / Dart / manifests are byte-identical across runs (§16-A10).',
    run: async (args) => {
      const mod = await import('./audit/determinism.ts');
      // The determinism audit owns a richer flag set than the shared
      // --prefix sniffer (--regen-twice, --smoke, --full,
      // --update-baseline, --force, --strict). Forward the raw args
      // and let its own parser run.
      const code = await mod.runDeterminismAudit({ rawArgs: args });
      if (code !== 0) process.exit(code);
    },
  },
};

function parseSharedFlags(args: string[]): { prefixes?: Set<string> } {
  let prefixes: Set<string> | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      if (!prefixes) prefixes = new Set();
      for (const p of args[i + 1]!.split(',')) prefixes.add(p);
      i++;
    }
  }
  return prefixes ? { prefixes } : {};
}

function printHelp(): void {
  const lines: string[] = [];
  lines.push('iconifyx audit dispatcher');
  lines.push('');
  lines.push('Usage: bun run audit <name> [-- <audit args>]');
  lines.push('');
  lines.push('Available audits:');
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(18)} ${cmd.description}`);
  }
  console.log(lines.join('\n'));
}

async function main(): Promise<number> {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name === '--help' || name === '-h') {
    printHelp();
    return name ? 0 : 2;
  }
  const cmd = COMMANDS[name];
  if (!cmd) {
    log.error(`unknown audit: ${name}`);
    printHelp();
    return 2;
  }
  try {
    await cmd.run(rest);
    return 0;
  } catch (e) {
    log.error(e instanceof Error ? e.stack ?? e.message : String(e));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
