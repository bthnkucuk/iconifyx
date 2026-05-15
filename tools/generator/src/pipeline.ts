import path from 'node:path';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pLimit from 'p-limit';
import { Buffer } from 'node:buffer';

import { log } from './log.ts';
import {
  loadCollections,
  loadIconifySet,
  resolveIcons,
  getIconifyJsonVersion,
  type IconifyCollection,
  type ResolvedIcon,
} from './load_iconify.ts';
import { loadConfig, displayCategory, fontFamilyFromPrefix, dartFileNameFromPrefix } from './group_sets.ts';
import { validateIconBody } from './glyph_validator.ts';
import { strokeFillBatch } from './stroke_fill.ts';
import {
  isDuotoneBody,
  splitDuotoneBody,
  trySplitTwoColorBody,
  setStrokeWidth,
  rasterFillSignal,
  paintOrderSignal,
  isPaintOrderRiskBody,
  iconNeedsRasterTrace,
} from './svg_preprocess.ts';
import { secondaryFontFamily } from './manifest.ts';
import {
  readManifest,
  writeManifest,
  ensureManifestsDir,
  type Manifest,
} from './manifest.ts';
import { allocateCodepoints } from './codepoint_allocator.ts';
import { buildFonts } from './font_builder.ts';
import { emitSetDart } from './dart_codegen.ts';
import {
  emitSetPubspec,
  emitSetLibraryFile,
  emitMetaPubspec,
  emitMetaLibraryFile,
} from './pubspec_codegen.ts';
import { emitSetThirdPartyLicense, emitSetLicenseDart } from './license_codegen.ts';
import {
  buildPacksJson,
  buildIconsIndexJson,
  emitWebsitePubspec,
} from './website_codegen.ts';
import { writeCoverageReport } from './coverage_report.ts';
import { writeStrokeAudit } from './stroke_audit.ts';
import type { AuditEntry } from './stroke_audit.ts';
import {
  setPackageDir,
  setPackageFontsDir,
  setPackageLibDir,
  setPackageSrcDir,
  setPackageName,
  metaPackageDir,
  websiteDir,
  packagesDir,
  repoRoot,
} from './paths.ts';

export interface PipelineOptions {
  /** Restrict to one set (by prefix). */
  onlySet?: string;
  /** Only run for prefixes without an existing manifest. */
  newOnly?: boolean;
  /** Don't write files; print summary only. */
  dryRun?: boolean;
  /** Concurrency for per-set processing. */
  concurrency?: number;
  /** Skip the meta package + example app emission (useful for partial runs). */
  skipMeta?: boolean;
  /** Run a smoke set: instead of all sets, only this small list. */
  smokeOnly?: string[];
}

/**
 * Per-set raster-fill audit data, populated as the pipeline runs and
 * dumped into STROKE_AUDIT.md at the end.
 */
interface RasterFillAuditEntry {
  sig: ReturnType<typeof rasterFillSignal>;
  applied: boolean;
  source: 'explicit' | 'auto' | 'none';
  /**
   * Per-set paint-order signal (multi-fill ratio) measured AFTER duotone
   * split + stroke-fill rasterize-trace — so packs that were already
   * neutralised via rasterize-trace report 0% here.
   */
  paintOrder: ReturnType<typeof paintOrderSignal>;
  /**
   * Per-set count of icons we proactively dropped at the paint-order
   * detector (multi-fill bodies that would have rendered as featureless
   * monochrome blobs). Surfaced in STROKE_AUDIT.md.
   */
  paintOrderDropped: number;
  /**
   * Per-set count of icons that received an INDIVIDUAL rasterize-trace
   * because the pack-level signal was below threshold but the icon body
   * itself had `fill-rule="evenodd"` or a stroke-only paint. Surfaced in
   * the audit so we can see packs (e.g. `oui`) where specific icons are
   * quietly fixed at icon granularity.
   */
  perIconTraced: number;
}
const rasterFillSignalCache = new Map<string, RasterFillAuditEntry>();

export async function runPipeline(options: PipelineOptions = {}): Promise<void> {
  const concurrency =
    options.concurrency ?? Math.min(8, navigator.hardwareConcurrency || 4);

  log.step('Loading @iconify/json');
  const [collections, iconifyVersion, config] = await Promise.all([
    loadCollections(),
    getIconifyJsonVersion(),
    loadConfig(),
  ]);
  log.info(`@iconify/json v${iconifyVersion}, ${Object.keys(collections).length} sets indexed`);

  // Decide which sets to process.
  const allPrefixes = Object.keys(collections).filter(
    (p) => !config.excludedSets.includes(p)
  );

  let workPrefixes: string[];
  if (options.onlySet) {
    if (!allPrefixes.includes(options.onlySet)) {
      throw new Error(`Unknown or excluded set: ${options.onlySet}`);
    }
    workPrefixes = [options.onlySet];
  } else if (options.smokeOnly) {
    workPrefixes = options.smokeOnly.filter((p) => allPrefixes.includes(p));
  } else {
    workPrefixes = [...allPrefixes];
  }

  if (options.newOnly) {
    const filtered: string[] = [];
    for (const p of workPrefixes) {
      const existing = await readManifest(p);
      if (!existing) filtered.push(p);
    }
    workPrefixes = filtered;
  }

  log.info(
    `${allPrefixes.length} sets eligible (after exclusions); processing ${workPrefixes.length} now with concurrency=${concurrency}`
  );

  // Per-set processing.
  await ensureManifestsDir();
  const limit = pLimit(concurrency);

  type SetResult = {
    prefix: string;
    manifest: Manifest;
    ttfs: Map<string, Buffer>;
    dartSource: string;
  };

  const results: SetResult[] = [];
  const failures: { prefix: string; reason: string }[] = [];
  let done = 0;

  await Promise.all(
    workPrefixes.map((prefix) =>
      limit(async () => {
        try {
          const result = await processOneSet(
            prefix,
            collections[prefix]!,
            iconifyVersion,
            config
          );
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const short = msg.split('\n')[0]!.slice(0, 200);
          failures.push({ prefix, reason: short });
          log.warn(`Skipped "${prefix}": ${short}`);
        } finally {
          done += 1;
          if (done % 10 === 0 || done === workPrefixes.length) {
            log.info(
              `processed ${done}/${workPrefixes.length} (failures so far: ${failures.length})`
            );
          }
        }
      })
    )
  );

  if (failures.length > 0) {
    log.warn(`${failures.length} sets failed to build and were skipped:`);
    for (const f of failures) log.warn(`  ${f.prefix}: ${f.reason}`);
  }

  if (options.dryRun) {
    log.info('--dry-run: skipping file writes. Summary:');
    for (const r of results) {
      const live = Object.values(r.manifest.icons).filter((i) => !i.deprecated).length;
      log.info(`  ${r.prefix}: ${live} icons, ${r.manifest.fonts.length} font(s)`);
    }
    return;
  }

  log.step('Writing per-set packages');
  for (const r of results) {
    await writeSetPackage(r);
  }

  if (options.skipMeta) {
    log.success('Skipping meta + example (--skip-meta).');
    return;
  }

  // For meta + example we need the FULL set of bundled packages, not just
  // the ones we (re)built this run. Read every manifest off disk to get the
  // complete picture.
  log.step('Indexing all existing manifests');
  const allManifests = await readAllManifests();
  log.info(`${allManifests.length} manifests on disk`);

  log.step('Writing meta package');
  await writeMetaPackage(allManifests);

  log.step('Writing website app data');
  await writeWebsiteData(allManifests, collections, config, iconifyVersion);

  log.step('Writing coverage report');
  await writeCoverageReport({
    collections,
    manifests: allManifests,
    config,
    iconifyJsonVersion: iconifyVersion,
  });

  log.step('Writing stroke / evenodd audit');
  const auditEntries: AuditEntry[] = [];
  for (const [prefix, info] of Object.entries(collections)) {
    const cached = rasterFillSignalCache.get(prefix);
    const m = allManifests.find((x) => x.prefix === prefix);
    const live = m
      ? Object.values(m.icons).filter((i) => !i.deprecated)
      : [];
    auditEntries.push({
      prefix,
      setName: info.name,
      sig: cached?.sig ?? { strokeRatio: 0, evenOddRatio: 0, combinedRatio: 0 },
      applied: cached?.applied ?? false,
      source: cached?.source ?? 'none',
      iconCount: live.length,
      duotoneCount: live.filter((i) => i.duotone).length,
      paintOrder: cached?.paintOrder ?? { paintOrderRatio: 0 },
      paintOrderDropped: cached?.paintOrderDropped ?? 0,
      perIconTraced: cached?.perIconTraced ?? 0,
    });
  }
  await writeStrokeAudit(auditEntries);

  log.success('All artifacts written.');
}

async function processOneSet(
  prefix: string,
  collectionInfo: IconifyCollection,
  iconifyVersion: string,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<{
  prefix: string;
  manifest: Manifest;
  ttfs: Map<string, Buffer>;
  dartSource: string;
}> {
  const set = await loadIconifySet(prefix);
  const allResolved = resolveIcons(set);

  // Multi-weight synthesis. For stroke-only sets that don't ship native
  // weight variants upstream (Lucide, Tabler, Iconoir, …), clone every
  // icon N times with the configured stroke-widths and append a name
  // suffix. The default (`stroke-width="2"`) keeps the original name; the
  // synthetic variants get `<name>-thin`, `<name>-light`, `<name>-bold`,
  // etc. Must happen BEFORE duotone/stroke-fill so the variants flow
  // through the rest of the pipeline like normal icons.
  const weights = config.multiWeightStrokeSets?.[prefix];
  if (weights && Object.keys(weights).length > 0) {
    const synth: ResolvedIcon[] = [];
    for (const orig of allResolved) {
      for (const [weightName, sw] of Object.entries(weights)) {
        synth.push({
          ...orig,
          name: `${orig.name}-${weightName}`,
          body: setStrokeWidth(orig.body, sw),
        });
      }
    }
    allResolved.push(...synth);
    log.info(
      `  "${prefix}": synthesized ${synth.length} weight variant${synth.length === 1 ? '' : 's'} (${Object.keys(weights).join(', ')})`
    );
  }

  // Duotone detection / split. Must happen BEFORE stroke-fill, otherwise
  // oslllo-svg-fixer's rasterize+trace collapses the two layers into a
  // single silhouette and the duotone signal is lost (Solar's bold-duotone
  // variants used to fall through to single-layer rendering for this reason).
  // For icons whose body has any element with opacity<1 (Phosphor's
  // <path opacity=".2"/>, Solar's opacity=".5", etc.) we split the body
  // into primary + secondary right away; the secondary is stashed in
  // secondaryByName for the Secondary font build.
  const secondaryByName = new Map<string, ResolvedIcon>();
  const duotoneNames = new Set<string>();
  for (const r of allResolved) {
    if (!isDuotoneBody(r.body)) continue;
    const { primary, secondary } = splitDuotoneBody(r.body);
    if (primary.length === 0 || secondary.length === 0) continue;
    r.body = primary;
    secondaryByName.set(r.name, { ...r, body: secondary });
    duotoneNames.add(r.name);
  }

  // Second duotone path: bodies that don't use opacity but DO use two
  // distinct fill colors (e.g. `logos:adobe-after-effects` — dark square +
  // light "Ae" letter). Without this they'd hit the paint-order drop and
  // never ship; with the split they render as a proper two-layer glyph.
  // Only icons not already handled by the opacity-based split above are
  // considered. The first color in source order is treated as background
  // (primary layer); the second as foreground (secondary layer). Both
  // sides have their `fill` attribute normalised to `currentColor`.
  let twoColorSplitCount = 0;
  for (const r of allResolved) {
    if (duotoneNames.has(r.name)) continue;
    const split = trySplitTwoColorBody(r.body);
    if (split === null) continue;
    r.body = split.primary;
    secondaryByName.set(r.name, { ...r, body: split.secondary });
    duotoneNames.add(r.name);
    twoColorSplitCount += 1;
  }
  if (twoColorSplitCount > 0) {
    log.info(
      `  "${prefix}": split ${twoColorSplitCount} two-color icon${twoColorSplitCount === 1 ? '' : 's'} into duotone primary/secondary`
    );
  }

  // Stroke / evenodd icon sets need rasterize-then-trace pre-processing
  // before font conversion (svgicons2svgfont collapses strokes to zero
  // width and TTF rendering uses non-zero winding regardless of an
  // `fill-rule="evenodd"` in the source). Two signals trigger the pass:
  //   1. Explicit allow-list in config.strokeFillSets (overrides detection)
  //   2. Auto-detection on the icon sample: stroke ratio ≥ 50% OR
  //      evenodd ratio ≥ 20% (50% combined catches gravity-ui-style sets
  //      whose icons use evenodd cutouts but no explicit stroke).
  // Per-icon: ~5-20 ms first time, then disk-cached.
  const sig = rasterFillSignal(allResolved);
  const explicitlyConfigured = config.strokeFillSets?.includes(prefix) ?? false;
  const autoDetected =
    sig.combinedRatio >= 0.5 || sig.evenOddRatio >= 0.2;
  const isStrokeFillSet = explicitlyConfigured || autoDetected;
  if (autoDetected && !explicitlyConfigured) {
    log.info(
      `  "${prefix}": auto-detected stroke/evenodd (stroke=${(sig.strokeRatio * 100).toFixed(0)}%, evenodd=${(sig.evenOddRatio * 100).toFixed(0)}%) — applying rasterize-trace`
    );
  }
  // Track how many icons get a per-icon trace because the pack-level
  // detector missed them — surfaced in the audit so we can see which sets
  // are quietly fixed at icon granularity.
  let perIconTraced = 0;
  // Icons whose stroke-fill worker panicked the native rasterizer — bisect
  // isolated them and the pipeline drops them from the manifest just like
  // a glyph-validator failure.
  const strokeFillPanicNames = new Set<string>();
  if (isStrokeFillSet) {
    const r1 = await strokeFillBatch(prefix, allResolved);
    for (const n of r1.panicSkipped) strokeFillPanicNames.add(n);
    if (secondaryByName.size > 0) {
      const r2 = await strokeFillBatch(
        `${prefix}-secondary`,
        [...secondaryByName.values()]
      );
      for (const n of r2.panicSkipped) strokeFillPanicNames.add(n);
    }
  } else {
    // Per-icon fallback: even when the pack-level sample is below threshold,
    // individual icons may still use `fill-rule="evenodd"` or stroke-only
    // strokes and would render as broken solid blobs. `oui:check-in-circle-
    // empty` shipped as a solid disc this way (the pack's evenodd ratio
    // was 16% — below the 20% pack threshold). Trace just these icons.
    const perIconNeeded = allResolved.filter((r) => iconNeedsRasterTrace(r.body));
    if (perIconNeeded.length > 0) {
      perIconTraced = perIconNeeded.length;
      log.info(
        `  "${prefix}": per-icon raster-trace on ${perIconNeeded.length} icon${perIconNeeded.length === 1 ? '' : 's'} (pack sample under threshold)`
      );
      const r1 = await strokeFillBatch(prefix, perIconNeeded);
      for (const n of r1.panicSkipped) strokeFillPanicNames.add(n);
      // Secondary layers of duotone-split icons that also fall in the
      // per-icon set need tracing too — their primary half went through
      // `strokeFillBatch` above, but the secondary lives in
      // `secondaryByName` and is built into a separate font.
      const perIconSecondary = [...secondaryByName.values()].filter((r) =>
        iconNeedsRasterTrace(r.body)
      );
      if (perIconSecondary.length > 0) {
        const r2 = await strokeFillBatch(
          `${prefix}-secondary`,
          perIconSecondary
        );
        for (const n of r2.panicSkipped) strokeFillPanicNames.add(n);
      }
    }
  }

  // Paint-order detection. Sample AFTER stroke-fill — rasterize-trace
  // collapses every body to a single `fill="..."` path, so packs that went
  // through it correctly report a 0% paint-order ratio here even though
  // they were multi-fill at source. This makes the audit signal a true
  // measure of "icons still at risk of monochrome-blob rendering".
  const paintSig = paintOrderSignal(allResolved);

  // Per-icon paint-order risk. Even AFTER rasterize-trace, sets that
  // weren't sent through stroke-fill (or whose rasterize-trace failed
  // for that specific icon) still carry multi-fill bodies. Those bodies
  // render as a featureless monochrome blob in the final TTF — `logos`'s
  // `adobe-after-effects` shipped as a purple square with no "Ae" letter.
  // Rasterize-trace does NOT fix this class of bug because Potrace traces
  // the COMBINED silhouette as one filled region (the inner letter is
  // "inside" the outer rect's filled region and gets absorbed). Better
  // to omit a broken icon than ship a featureless square — drop it here
  // so it never gets a codepoint nor appears in the Dart class.
  let paintOrderDropped = 0;
  const paintOrderDroppedNames = new Set<string>();
  for (const r of allResolved) {
    // Icons split into duotone above (either via opacity or via 2-color
    // split) already have their primary half normalised to a single fill —
    // no need to drop them. Their secondary half is shipped separately.
    if (duotoneNames.has(r.name)) continue;
    if (isPaintOrderRiskBody(r.body)) {
      paintOrderDroppedNames.add(r.name);
      paintOrderDropped += 1;
    }
  }

  // Stash the signal on the manifest later so audit reports show why a
  // set was processed.
  rasterFillSignalCache.set(prefix, {
    sig,
    applied: isStrokeFillSet,
    source: explicitlyConfigured ? 'explicit' : autoDetected ? 'auto' : 'none',
    paintOrder: paintSig,
    paintOrderDropped,
    perIconTraced,
  });

  if (paintOrderDropped > 0) {
    const sample = [...paintOrderDroppedNames].slice(0, 3).join(', ');
    log.info(
      `  "${prefix}": dropping ${paintOrderDropped} multi-fill icon${paintOrderDropped === 1 ? '' : 's'} (paint-order risk, would render as monochrome blob) (${sample}${paintOrderDropped > 3 ? '…' : ''})`
    );
  }

  // Pre-validate each glyph; drop anything svgicons2svgfont/svg2ttf would
  // choke on. This recovers ~99% of sets that previously failed because of
  // ONE malformed glyph (line-md, icon-park, devicon, …). We validate the
  // post-split primary body for duotone icons.
  const resolved: ResolvedIcon[] = [];
  const droppedGlyphs: { name: string; reason: string }[] = [];
  for (const ic of allResolved) {
    if (paintOrderDroppedNames.has(ic.name)) {
      droppedGlyphs.push({ name: ic.name, reason: 'paint-order risk (multi-fill body)' });
      secondaryByName.delete(ic.name);
      duotoneNames.delete(ic.name);
      continue;
    }
    if (strokeFillPanicNames.has(ic.name)) {
      droppedGlyphs.push({
        name: ic.name,
        reason: 'stroke-fill worker panicked on this body (native resvg crash)',
      });
      secondaryByName.delete(ic.name);
      duotoneNames.delete(ic.name);
      continue;
    }
    const v = validateIconBody(ic);
    if (v.ok) {
      resolved.push(ic);
    } else {
      droppedGlyphs.push({ name: ic.name, reason: v.reason });
      // If this icon was registered as duotone, drop the secondary too so
      // the codepoint isn't reserved for a non-existent secondary glyph.
      secondaryByName.delete(ic.name);
      duotoneNames.delete(ic.name);
    }
  }
  if (droppedGlyphs.length > 0) {
    log.warn(
      `"${prefix}": skipped ${droppedGlyphs.length} bad glyph${droppedGlyphs.length === 1 ? '' : 's'} (${droppedGlyphs.slice(0, 3).map((g) => g.name).join(', ')}${droppedGlyphs.length > 3 ? '…' : ''})`
    );
  }

  if (resolved.length === 0) {
    throw new Error(`every glyph in "${prefix}" failed validation`);
  }

  const resolvedByName = new Map<string, ResolvedIcon>();
  for (const r of resolved) resolvedByName.set(r.name, r);

  const previous = await readManifest(prefix);
  const fontFamilyBase = fontFamilyFromPrefix(prefix);

  const { fonts, icons } = allocateCodepoints({
    prefix,
    fontFamilyBase,
    iconNames: resolved.map((r) => r.name),
    previous,
  });

  // Mark duotone entries + add Secondary fonts to manifest. Secondary fonts
  // mirror Primary fonts that contain at least one duotone icon. They share
  // the same codepoint cursor (each duotone icon's secondary glyph sits at
  // the same codepoint in the Secondary font as its primary).
  for (const name of duotoneNames) {
    const e = icons[name];
    if (e && !e.deprecated) e.duotone = true;
  }
  const primaryFamiliesWithDuotone = new Set<string>();
  for (const e of Object.values(icons)) {
    if (e.duotone && !e.deprecated) primaryFamiliesWithDuotone.add(e.fontFamily);
  }
  for (const primaryFamily of primaryFamiliesWithDuotone) {
    const secName = secondaryFontFamily(primaryFamily);
    const primaryFont = fonts.find((f) => f.family === primaryFamily);
    if (!primaryFont) continue;
    let dtCount = 0;
    for (const e of Object.values(icons)) {
      if (e.duotone && !e.deprecated && e.fontFamily === primaryFamily) dtCount += 1;
    }
    const existing = fonts.find((f) => f.family === secName);
    if (existing) {
      // Refresh the count + cursor; the allocator may have preserved a stale
      // 0 from before duotone support, or recompute logic from a previous
      // run that didn't track Secondary fonts.
      existing.iconCount = dtCount;
      existing.nextCodepoint = primaryFont.nextCodepoint;
    } else {
      fonts.push({
        family: secName,
        nextCodepoint: primaryFont.nextCodepoint,
        iconCount: dtCount,
      });
    }
  }

  const liveCount = Object.values(icons).filter((i) => !i.deprecated).length;

  const manifest: Manifest = {
    schemaVersion: 1,
    prefix,
    iconifyJsonVersion: iconifyVersion,
    lastUpdated: new Date().toISOString().slice(0, 10),
    category: collectionInfo.category ?? null,
    subPackage: setPackageName(prefix),
    info: {
      name: collectionInfo.name,
      author: collectionInfo.author ?? null,
      license: collectionInfo.license ?? { title: 'Unknown' },
      total: liveCount,
    },
    fonts,
    icons,
  };

  // Build fonts. If individual glyphs trip svgicons2svgfont mid-stream, the
  // builder catches it, drops them, and retries — we collect the names here
  // so we can flag them deprecated in the manifest (codepoint stays reserved
  // in case they get fixed upstream).
  const droppedDuringBuild = new Set<string>();
  const ttfs = await buildFonts({
    manifest,
    resolvedByName,
    secondaryByName,
    onGlyphDropped: (name) => droppedDuringBuild.add(name),
  });
  if (droppedDuringBuild.size > 0) {
    const today = new Date().toISOString().slice(0, 10);
    for (const name of droppedDuringBuild) {
      const entry = icons[name];
      if (entry) {
        entry.deprecated = true;
        entry.deprecatedSince = today;
      }
    }
    // Recompute live count + per-font live counts. For duotone icons we
    // also bump the matching Secondary font (the icon's `fontFamily` field
    // refers to the primary family only).
    const liveCountUpdated = Object.values(icons).filter((i) => !i.deprecated).length;
    manifest.info.total = liveCountUpdated;
    for (const f of fonts) f.iconCount = 0;
    for (const e of Object.values(icons)) {
      if (e.deprecated) continue;
      const primaryF = fonts.find((x) => x.family === e.fontFamily);
      if (primaryF) primaryF.iconCount += 1;
      if (e.duotone) {
        const secName = secondaryFontFamily(e.fontFamily);
        const secF = fonts.find((x) => x.family === secName);
        if (secF) secF.iconCount += 1;
      }
    }
  }

  // Drop fonts whose iconCount went to 0 — buildFonts didn't emit a TTF
  // for them, and leaving them in manifest.fonts makes pubspec_codegen
  // reference missing assets.
  for (let i = manifest.fonts.length - 1; i >= 0; i--) {
    if (manifest.fonts[i]!.iconCount === 0) manifest.fonts.splice(i, 1);
  }

  const dartSource = emitSetDart({
    manifest,
    fontPackage: setPackageName(prefix),
  });

  return { prefix, manifest, ttfs, dartSource };
}

async function writeSetPackage(r: {
  prefix: string;
  manifest: Manifest;
  ttfs: Map<string, Buffer>;
  dartSource: string;
}): Promise<void> {
  const { prefix, manifest, ttfs, dartSource } = r;

  await writeManifest(manifest);

  // Layout: packages/iconifyx_<prefix>/{lib/, assets/fonts/}
  await mkdir(setPackageFontsDir(prefix), { recursive: true });
  await mkdir(path.join(setPackageSrcDir(prefix), 'sets'), { recursive: true });

  // Fonts
  for (const [family, ttf] of ttfs) {
    await writeFile(path.join(setPackageFontsDir(prefix), `${family}.ttf`), ttf);
  }

  // Set Dart class file
  const setFile = path.join(
    setPackageSrcDir(prefix),
    'sets',
    dartFileNameFromPrefix(prefix)
  );
  await writeFile(setFile, dartSource, 'utf8');

  // Package library file (top-level)
  const pkgName = setPackageName(prefix);
  await writeFile(
    path.join(setPackageLibDir(prefix), `${pkgName}.dart`),
    emitSetLibraryFile(manifest),
    'utf8'
  );

  // License helpers
  await writeFile(
    path.join(setPackageDir(prefix), 'LICENSE-3RD-PARTY.md'),
    emitSetThirdPartyLicense(manifest),
    'utf8'
  );
  await writeFile(
    path.join(setPackageSrcDir(prefix), 'license.dart'),
    emitSetLicenseDart(manifest),
    'utf8'
  );

  // Pubspec
  await writeFile(
    path.join(setPackageDir(prefix), 'pubspec.yaml'),
    emitSetPubspec({ manifest }),
    'utf8'
  );
}

async function readAllManifests(): Promise<Manifest[]> {
  const dir = path.resolve(import.meta.dir, '..', 'manifests');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const manifests: Manifest[] = [];
  for (const f of files) {
    const prefix = f.slice(0, -'.json'.length);
    const m = await readManifest(prefix);
    if (m) manifests.push(m);
  }
  return manifests;
}

async function writeMetaPackage(manifests: Manifest[]): Promise<void> {
  const setPackages = manifests
    .map((m) => setPackageName(m.prefix))
    .sort();

  await mkdir(path.join(metaPackageDir(), 'lib'), { recursive: true });

  await writeFile(
    path.join(metaPackageDir(), 'pubspec.yaml'),
    emitMetaPubspec({ setPackages }),
    'utf8'
  );
  await writeFile(
    path.join(metaPackageDir(), 'lib', 'iconifyx.dart'),
    emitMetaLibraryFile(setPackages),
    'utf8'
  );
}

async function writeWebsiteData(
  manifests: Manifest[],
  collections: Record<string, IconifyCollection>,
  config: Awaited<ReturnType<typeof loadConfig>>,
  iconifyJsonVersion: string
): Promise<void> {
  const entries: { manifest: Manifest; displayCategory: string }[] = [];
  for (const m of manifests) {
    const info = collections[m.prefix];
    if (!info) continue; // upstream removed; will be cleaned by --clean
    const cat = displayCategory(m.prefix, info, config) ?? 'Uncategorized';
    entries.push({ manifest: m, displayCategory: cat });
  }

  const dataDir = path.join(websiteDir(), 'lib', 'data');
  await mkdir(dataDir, { recursive: true });

  // The hand-written Flutter app reads these two JSON files at startup and
  // constructs `IconifyIconData` instances at runtime — no per-set imports.
  const codegenInput = { entries, iconifyJsonVersion };
  await writeFile(
    path.join(dataDir, 'packs.json'),
    buildPacksJson(codegenInput),
    'utf8'
  );
  await writeFile(
    path.join(dataDir, 'icons_index.json'),
    buildIconsIndexJson(codegenInput),
    'utf8'
  );

  // Pubspec lists every per-set package as a direct path dep so their TTF
  // assets ship with the build — even though the Dart code never imports
  // them. The two JSON files are declared as assets.
  const setPackages = entries.map((e) => setPackageName(e.manifest.prefix));
  await writeFile(
    path.join(websiteDir(), 'pubspec.yaml'),
    emitWebsitePubspec(setPackages),
    'utf8'
  );
}

/**
 * Remove generated files / directories for sets that no longer exist in
 * @iconify/json (or moved into excludedSets). Manifests are also deleted in
 * this case so a future re-add restarts cleanly.
 *
 * Idempotent and safe to call after a normal run.
 */
export async function cleanOrphans(): Promise<void> {
  const collections = await loadCollections();
  const config = await loadConfig();

  const knownPrefixes = new Set(
    Object.keys(collections).filter((p) => !config.excludedSets.includes(p))
  );

  // Drop manifest files for unknown prefixes.
  const manifestsDir = path.resolve(import.meta.dir, '..', 'manifests');
  if (existsSync(manifestsDir)) {
    for (const f of await readdir(manifestsDir)) {
      if (!f.endsWith('.json')) continue;
      const prefix = f.slice(0, -'.json'.length);
      if (!knownPrefixes.has(prefix)) {
        log.warn(`Removing orphan manifest manifests/${f}`);
        await rm(path.join(manifestsDir, f));
      }
    }
  }

  // Drop per-set package directories for unknown prefixes. The core + meta
  // package directories are protected.
  const pkgRoot = packagesDir();
  if (existsSync(pkgRoot)) {
    for (const entry of await readdir(pkgRoot)) {
      if (!entry.startsWith('iconifyx_')) continue;
      if (entry === 'iconifyx_core') continue;
      const suffix = entry.slice('iconifyx_'.length);
      // Reverse-derive: '_' could have been a '-' originally. We need to
      // check if ANY known prefix maps to this suffix.
      const matched = [...knownPrefixes].some(
        (p) => p.replace(/-/g, '_') === suffix
      );
      if (!matched) {
        log.warn(
          `Removing orphan package package/${entry} (no matching Iconify set)`
        );
        await rm(path.join(pkgRoot, entry), { recursive: true, force: true });
      }
    }
  }
}

// Silence unused-import warning when the variable is only used to log a path.
void repoRoot;
