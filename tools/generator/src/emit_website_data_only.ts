/**
 * Stand-alone script: re-emit the website's data + CDN tree from the
 * existing committed manifests, without running the per-set TTF
 * rebuild pipeline. Useful for verifying §11/§12 shard emission and
 * for refreshing `lib/data/*.json` + `lib/cdn/` between full regens.
 *
 * Run: `bun run src/emit_website_data_only.ts`
 */
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildPacksJson,
  buildIconsIndexJson,
  buildIconShards,
  buildCdnManifest,
} from './website_codegen.ts';
import { loadCollections, getIconifyJsonVersion } from './load_iconify.ts';
import { loadConfig, displayCategory } from './group_sets.ts';
import { websiteDir } from './paths.ts';
import type { Manifest } from './manifest.ts';
import { readManifest } from './manifest.ts';

async function readAllManifests(): Promise<Manifest[]> {
  const dir = path.resolve(import.meta.dir, '..', 'manifests');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out: Manifest[] = [];
  for (const f of files) {
    const m = await readManifest(f.slice(0, -'.json'.length));
    if (m) out.push(m);
  }
  return out;
}

async function main() {
  const manifests = await readAllManifests();
  const collections = await loadCollections();
  const config = await loadConfig();
  const iconifyJsonVersion = await getIconifyJsonVersion();

  const entries: Array<{
    manifest: Manifest;
    displayCategory: string;
  }> = [];
  for (const m of manifests) {
    const info = collections[m.prefix] ?? null;
    if (info == null && !config.includeIfMissingFromCollections?.includes(m.prefix)) {
      continue;
    }
    entries.push({
      manifest: m,
      displayCategory: displayCategory(m.prefix, info, config) ?? 'Uncategorized',
    });
  }

  const dataDir = path.join(websiteDir(), 'lib', 'data');
  await mkdir(dataDir, { recursive: true });

  const codegenInput = { entries, iconifyJsonVersion };
  const packsJsonBody = buildPacksJson(codegenInput);
  const iconsIndexBody = buildIconsIndexJson(codegenInput);

  await writeFile(path.join(dataDir, 'packs.json'), packsJsonBody, 'utf8');
  await writeFile(path.join(dataDir, 'icons_index.json'), iconsIndexBody, 'utf8');
  await writeFile(
    path.join(dataDir, 'cdn_manifest.json'),
    buildCdnManifest({ iconifyJsonVersion }),
    'utf8'
  );

  const cdnRoot = path.join(websiteDir(), 'lib', 'cdn');
  const cdnPacksDir = path.join(cdnRoot, 'packs', 'v1');
  const cdnIconsIndexDir = path.join(cdnRoot, 'icons-index', 'v1');
  await mkdir(cdnPacksDir, { recursive: true });
  await mkdir(cdnIconsIndexDir, { recursive: true });

  await writeFile(path.join(cdnPacksDir, 'packs.json'), packsJsonBody, 'utf8');

  const { shards, manifest: shardManifestBody } = buildIconShards(codegenInput);
  for (const [relPath, body] of shards) {
    const filename = relPath.split('/').pop()!;
    await writeFile(path.join(cdnIconsIndexDir, filename), body, 'utf8');
  }
  await writeFile(
    path.join(cdnIconsIndexDir, 'index.json'),
    shardManifestBody,
    'utf8'
  );

  // Diagnostics
  let total = 0;
  for (const [, body] of shards) total += Buffer.byteLength(body, 'utf8');
  console.log(
    `[website-data] ${entries.length} packs · ${shards.size} shards (${(total / 1024).toFixed(0)} KB total) · ` +
      `packs.json ${(Buffer.byteLength(packsJsonBody) / 1024).toFixed(0)} KB · ` +
      `icons_index.json ${(Buffer.byteLength(iconsIndexBody) / 1024 / 1024).toFixed(2)} MB`
  );
}

await main();
