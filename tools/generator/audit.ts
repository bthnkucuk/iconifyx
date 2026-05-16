/**
 * Audit dispatcher — `bun run audit <name>`.
 *
 * Standalone entry point for read-only audits that walk emitted artefacts
 * (TTFs, manifests, generated Dart). Kept separate from the build pipeline
 * so audit runs can't accidentally mutate generator state.
 *
 * Usage:
 *   bun run audit secondary-name-check
 *   bun run audit secondary-name-check -- --prefix solar,mdi   # subset
 *
 * Add a new audit by exporting a `run<Name>Audit(opts)` from a module
 * under `tools/generator/audit/` (or wire an inline closure here) and
 * adding it to the dispatch map below.
 */

import { log } from './src/log.ts';

interface AuditCommand {
  description: string;
  run: (args: string[]) => Promise<void>;
}

const COMMANDS: Record<string, AuditCommand> = {
  'secondary-name-check': {
    description:
      'Verify every duotone icon\'s secondary TTF cmap resolves to its own glyph by name (catches svg2ttf cmap-dedup aliasing — RESEARCH_PLAN §33 demote rule). Read-only — the pipeline applies the demote on next regen.',
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
