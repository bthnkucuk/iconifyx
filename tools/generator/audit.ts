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
  'orphan-const-fix': {
    description:
      'Deprecate orphan-const empty-glyph icons surfaced by manifest-lint A2 (§16-A2 remediation). Read-only by default; pass --apply to mutate manifests.',
    run: async (args) => {
      const mod = await import('./audit/orphan_const_fix.ts');
      // The orphan-const-fix audit owns its own --apply flag in addition
      // to the shared --prefix sniffer. Forward both — apply must travel
      // through the raw args, --prefix is handled both here (for type-
      // narrowing) and inside the audit module for safety.
      process.argv = [process.argv[0]!, process.argv[1]!, ...args];
      const { prefixes } = parseSharedFlags(args);
      const apply = args.includes('--apply');
      await mod.runOrphanConstFixAudit({ prefixes, apply });
    },
  },
  'upstream-regressions': {
    description:
      'Diff every manifest vs git HEAD; surface NEW deprecations bucketed by `deprecatedReason` (§16-A8). Flags suspicious packs where validator / panic / paint-order drops landed without an `iconifyJsonVersion` bump.',
    run: async (args) => {
      const mod = await import('./audit/upstream_regressions.ts');
      process.argv = [process.argv[0]!, process.argv[1]!, ...args];
      await mod.runUpstreamRegressionsAudit(parseSharedFlags(args));
    },
  },
  'secondary-name-check': {
    description:
      'Verify every duotone icon\'s secondary TTF cmap resolves to its own glyph by name (catches svg2ttf cmap-dedup aliasing — RESEARCH_PLAN §33 demote rule). Read-only — pipeline applies the demote on next regen.',
    run: async (args) => {
      const flags = parseSharedFlags(args);
      const { listManifestPrefixes, readManifest } = await import(
        './src/manifest.ts'
      );
      const { writeSecondaryNameAudit } = await import('./src/font_verify.ts');
      const prefixes = await listManifestPrefixes();
      const targets = flags.prefixes
        ? prefixes.filter((p) => flags.prefixes!.has(p))
        : prefixes;
      const manifests = [];
      for (const p of targets) {
        const m = await readManifest(p);
        if (m) manifests.push(m);
      }
      const { totalDeclared, totalAliased, totalMissing } =
        await writeSecondaryNameAudit(manifests);
      log.info(
        `secondary-name-check: ${totalDeclared.toLocaleString('en-US')} declared duotones; ${totalAliased.toLocaleString('en-US')} aliased; ${totalMissing.toLocaleString('en-US')} missing`
      );
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
    lines.push(`  ${name.padEnd(22)} ${cmd.description}`);
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
