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
import { strokeFillBatchMulti, type StrokeFillJob } from './stroke_fill.ts';
import {
  isDuotoneBody,
  splitDuotoneBody,
  trySplitTwoColorBody,
  trySplitTwoStrokeColorBody,
  normalizeColorsToCurrentColor,
  extractConcreteColors,
  scaleStrokeWidths,
  rasterFillSignal,
  paintOrderSignal,
  isPaintOrderRiskBody,
  iconNeedsRasterTrace,
  bodyUsesMaskPattern,
  flattenAnimations,
  trySplitMaskInternalBody,
} from './svg_preprocess.ts';
import { secondaryFontFamily } from './manifest.ts';
import {
  readManifest,
  writeManifest,
  ensureManifestsDir,
  type Manifest,
  type ManifestIconEntry,
} from './manifest.ts';
import { decideVersionBump } from './version_bump.ts';
import { allocateCodepoints } from './codepoint_allocator.ts';
import { buildFonts, verifyGlyphsNonEmpty } from './font_builder.ts';
import {
  mergeSiblingsInManifest,
  canonicalizeTtfs,
  ensurePythonVenv,
} from './font_merger.ts';
import { emitSetDart } from './dart_codegen.ts';
import {
  emitSetPubspec,
  emitSetLibraryFile,
  emitMetaPubspec,
  emitMetaLibraryFile,
  emitCategoryMetaPubspec,
  emitCategoryMetaLibraryFile,
  categoryMetaPackageName,
} from './pubspec_codegen.ts';
import { emitSetThirdPartyLicense, emitSetLicenseDart } from './license_codegen.ts';
import {
  buildPacksJson,
  buildIconsIndexJson,
  buildIconShards,
  buildCdnManifest,
  emitWebsitePubspec,
} from './website_codegen.ts';
import { writeCoverageReport } from './coverage_report.ts';
import { writeStrokeAudit } from './stroke_audit.ts';
import type { AuditEntry } from './stroke_audit.ts';
import { verifyFontsAgainstManifests } from './font_verify.ts';
import { renameGlyphsInTtfs, type GlyphRenameStats } from './glyph_rename.ts';
import { resetCacheStats, getCacheStats } from './ttf_cache.ts';
import {
  computePackInputHash,
  inputHashesEqual,
  readSnapshot,
  writeSnapshot,
  buildSnapshot,
  materializeSnapshot,
  type PackInputHash,
  type RestoredPackResult,
} from './incremental.ts';
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
  /**
   * When false, bypass the per-font TTF cache (always rebuild every TTF).
   * Wired via the CLI `--no-cache` flag. Defaults to true.
   */
  cacheEnabled?: boolean;
  /**
   * §13 Rec 1 — when true, consult the per-pack snapshot cache in
   * `manifests/.cache/<prefix>.snapshot.json` before running the
   * preprocess / svgicons2svgfont / svg2ttf chain for a pack. On
   * matching input hash the cached outputs (manifest + dart + license +
   * pubspec + TTFs) are replayed onto disk and the pack is skipped
   * entirely.
   *
   * Defaults to false. Opt in via `--incremental`. CI on `main` push
   * runs without it so we always exercise the full deterministic
   * pipeline; developer inner-loop regens turn it on for ~minute-scale
   * speed-ups.
   *
   * @see src/incremental.ts
   */
  incremental?: boolean;
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
  /**
   * Up to 3 icon names per pack to seed manual visual checks in the audit
   * report. Captured during processing so we can list concrete spot-check
   * targets next to each per-pack stat.
   */
  paintOrderDroppedSamples: string[];
  perIconTracedSamples: string[];
  /**
   * Per-set count of icons whose body uses the inverse-mask pattern
   * (`<defs><mask>` + consumer rect). Pre-fix these icons shipped with
   * their main body invisible because oslllo-svg-fixer force-set the
   * mask-internal first-path fill to black. Surfaced in the audit so we
   * can see which packs benefit from the custom worker bypass.
   */
  maskPatternCount: number;
  maskPatternSamples: string[];
  /**
   * vtracer recovery stats — populated only for packs listed in
   * `config.vtracerSets`. `vtraceConsidered` is the number of paint-
   * order-risk candidates fed to vtracer; `vtraceRecovered` is the
   * subset that vtracer split into ≥2 distinct colour layers and were
   * re-emitted as paint-order duotone (`kind: paintOrder`).
   * `vtraceFailed` covers the rest — monochrome traces, panics, or
   * unparseable output — which still fall through to the existing
   * paint-order drop. Surfaced in STROKE_AUDIT.md.
   */
  vtraceConsidered: number;
  vtraceRecovered: number;
  vtraceFailed: number;
  vtraceRecoveredSamples: string[];
  /**
   * Per-set count of icons that were ROUTED into stroke-fill but
   * short-circuited by `strokeIsFillLike` because their strokes are
   * already thick enough to act as a filled region (BPMN, kentico-icons,
   * etc.). Surfaced in STROKE_AUDIT.md so we can see how much wall-clock
   * was saved per pack.
   */
  fillLikeSkipped: number;
  fillLikeSkippedSamples: string[];
}
const rasterFillSignalCache = new Map<string, RasterFillAuditEntry>();

export async function runPipeline(options: PipelineOptions = {}): Promise<void> {
  const concurrency =
    options.concurrency ?? Math.min(8, navigator.hardwareConcurrency || 4);
  const cacheEnabled = options.cacheEnabled ?? true;

  resetCacheStats();
  if (!cacheEnabled) {
    log.info('TTF cache: DISABLED (--no-cache)');
  }

  log.step('Loading @iconify/json');
  const [collections, iconifyVersion, config] = await Promise.all([
    loadCollections(),
    getIconifyJsonVersion(),
    loadConfig(),
  ]);
  log.info(`@iconify/json v${iconifyVersion}, ${Object.keys(collections).length} sets indexed`);

  // Ensure the Python venv for §32's font-merger is available. First
  // run creates it (~3 s); subsequent runs no-op.
  await ensurePythonVenv();

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
    aliasesDart: string | null;
    categoriesDart: string | null;
    /**
     * §13 Rec 1 — when set, the result came from a snapshot replay (not
     * a fresh build) AND/OR snapshot-side sources were threaded through.
     * `writeSetPackage` honours these to skip codegen emits.
     */
    librarySrc?: string;
    pubspecSrc?: string;
    licenseDartSrc?: string;
    license3rdPartyMd?: string;
    /** Cached input hash, snapshot the result under this key post-build. */
    inputHash?: PackInputHash;
    /** Marks a cache-hit replay (vs a fresh build that will write a fresh snapshot). */
    fromSnapshot?: boolean;
  };

  const results: SetResult[] = [];
  const failures: { prefix: string; reason: string }[] = [];
  let done = 0;
  let snapshotHits = 0;
  let snapshotMisses = 0;
  const incremental = options.incremental ?? false;

  await Promise.all(
    workPrefixes.map((prefix) =>
      limit(async () => {
        try {
          // §13 Rec 1 — consult the per-pack snapshot cache. Compute the
          // input hash up front so we can compare against the prior run's
          // snapshot; on match we replay the cached outputs and skip the
          // full preprocess + svgicons2svgfont + svg2ttf chain entirely.
          let inputHash: PackInputHash | undefined;
          if (incremental) {
            const set = await loadIconifySet(prefix);
            inputHash = computePackInputHash({
              prefix,
              set,
              iconifyVersion,
              config,
            });
            const snap = await readSnapshot(prefix);
            if (snap && inputHashesEqual(snap.inputHash, inputHash)) {
              const restored = materializeSnapshot(snap);
              snapshotHits += 1;
              results.push({
                ...restored,
                inputHash,
                fromSnapshot: true,
              });
              return; // skip processOneSet entirely
            }
            // Miss — fall through to a normal rebuild. Count the miss
            // up front so it appears even if processOneSet later throws.
            snapshotMisses += 1;
          }
          const result = await processOneSet(
            prefix,
            collections[prefix]!,
            iconifyVersion,
            config,
            cacheEnabled
          );
          results.push({ ...result, inputHash });
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

  if (incremental) {
    log.info(
      `incremental: ${snapshotHits} cache hit / ${snapshotMisses} miss across ${workPrefixes.length} pack${workPrefixes.length === 1 ? '' : 's'}`
    );
  }

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
    const written = await writeSetPackage(r);
    // §13 Rec 1 — refresh the snapshot for any pack we actually
    // rebuilt this run. Cache hits (`fromSnapshot === true`) keep their
    // existing snapshot — the inputHash already matched.
    if (incremental && r.inputHash && !r.fromSnapshot) {
      try {
        const snap = buildSnapshot({
          inputHash: r.inputHash,
          manifest: r.manifest,
          manifestJson: written.manifestJson,
          dartSrc: r.dartSource,
          aliasesDartSrc: r.aliasesDart,
          categoriesDartSrc: r.categoriesDart,
          librarySrc: written.librarySrc,
          pubspecSrc: written.pubspecSrc,
          licenseDartSrc: written.licenseDartSrc,
          license3rdPartyMd: written.license3rdPartyMd,
          ttfs: r.ttfs,
        });
        await writeSnapshot(snap);
      } catch (err) {
        // Snapshot writes are advisory — if persistence fails (disk
        // full, perms, …) keep moving so the rest of the regen still
        // completes. Next run rebuilds + retries.
        const short = err instanceof Error ? err.message.split('\n')[0]! : String(err);
        log.warn(`  snapshot write failed for "${r.prefix}": ${short}`);
      }
    }
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

  log.step('Writing category-meta packages (§22 Rec 4)');
  await writeCategoryMetaPackages(allManifests);

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
    const liveEntries = m
      ? Object.entries(m.icons).filter(([, i]) => !i.deprecated)
      : [];
    const live = liveEntries.map(([, i]) => i);
    const duotoneSamples = liveEntries
      .filter(([, i]) => i.duotone)
      .map(([name]) => name)
      .slice(0, 3);
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
      duotoneSamples,
      paintOrderSamples: cached?.paintOrderDroppedSamples ?? [],
      perIconTracedSamples: cached?.perIconTracedSamples ?? [],
      maskPatternCount: cached?.maskPatternCount ?? 0,
      maskPatternSamples: cached?.maskPatternSamples ?? [],
      vtraceConsidered: cached?.vtraceConsidered ?? 0,
      vtraceRecovered: cached?.vtraceRecovered ?? 0,
      vtraceFailed: cached?.vtraceFailed ?? 0,
      vtraceRecoveredSamples: cached?.vtraceRecoveredSamples ?? [],
      fillLikeSkipped: cached?.fillLikeSkipped ?? 0,
      fillLikeSkippedSamples: cached?.fillLikeSkippedSamples ?? [],
    });
  }
  await writeStrokeAudit(auditEntries);

  log.step('Verifying fonts against manifests');
  await verifyFontsAgainstManifests(allManifests);

  const cs = getCacheStats();
  const total = cs.hits + cs.misses;
  if (total > 0) {
    const hitPct = ((cs.hits / total) * 100).toFixed(0);
    const mb = (cs.bytesReused / (1024 * 1024)).toFixed(1);
    log.info(
      `TTF cache: ${cs.hits} hit / ${cs.misses} miss (${hitPct}% hit rate, ${mb} MB reused)`
    );
  }

  log.success('All artifacts written.');
}

async function processOneSet(
  prefix: string,
  collectionInfo: IconifyCollection,
  iconifyVersion: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  cacheEnabled: boolean
): Promise<{
  prefix: string;
  manifest: Manifest;
  ttfs: Map<string, Buffer>;
  dartSource: string;
  aliasesDart: string | null;
  categoriesDart: string | null;
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
    // §6 fix: scale every existing `stroke-width` proportionally rather
    // than flat-replacing with the configured value. The configured
    // weight is the TARGET stroke-width for an icon whose source pack
    // ships at `sourceBase`; the ratio applied to each existing width
    // is `target / sourceBase`. Iconoir uses `sourceBase=1.5`; every
    // other listed pack defaults to 2. Proportional scaling preserves
    // per-layer ratios — an icon with a thick body + thin accent stays
    // thick + thin in every weight variant instead of flattening to
    // the same width.
    const sourceBase = config.multiWeightStrokeSourceBase?.[prefix] ?? 2;
    const synth: ResolvedIcon[] = [];
    for (const orig of allResolved) {
      for (const [weightName, sw] of Object.entries(weights)) {
        const ratio = sw / sourceBase;
        synth.push({
          ...orig,
          name: `${orig.name}-${weightName}`,
          body: scaleStrokeWidths(orig.body, ratio),
          // If the source was an alias of canonical X, the synthetic
          // weight variant is an alias of (X + '-' + weightName) so the
          // alias-map split (§22 Rec 1) re-maps weight variants
          // consistently. Synth variants of non-aliases stay canonical.
          aliasOf: orig.aliasOf ? `${orig.aliasOf}-${weightName}` : undefined,
        });
      }
    }
    allResolved.push(...synth);
    log.info(
      `  "${prefix}": synthesized ${synth.length} weight variant${synth.length === 1 ? '' : 's'} (${Object.keys(weights).join(', ')}, base=${sourceBase})`
    );
  }

  // Animation flatten. line-md (and a handful of icon-park icons) ship
  // reveal-style SMIL animations on the path's `stroke-dashoffset`. Our
  // validator already rejects `<animate>` children, but the validator
  // runs AFTER stroke-fill, so by then the body has been traced — and
  // resvg renders the animation at t=0 (the START state, with offset
  // equal to the dasharray length → invisible stroke). Result: ~500
  // line-md icons shipped with their reveal-target paths missing
  // (account, beer, login, …). Pre-rasterize, walk each animation
  // element, apply its END value (last entry of `values=A;B;C` or `to=`)
  // to the parent attribute, and strip the animate tag.
  let animateFlattened = 0;
  for (const r of allResolved) {
    if (r.body.indexOf('<animate') === -1 && r.body.indexOf('<set') === -1) {
      continue;
    }
    const before = r.body;
    r.body = flattenAnimations(r.body);
    if (r.body !== before) animateFlattened += 1;
  }
  if (animateFlattened > 0) {
    log.info(
      `  "${prefix}": flattened ${animateFlattened} animation${animateFlattened === 1 ? '' : 's'} (end state)`
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
  // Track WHICH split path classified each icon, so codegen can emit the
  // right constructor (`IconifyIconData.duo` vs `.duoPaintOrder` vs
  // `.duoMaskInternal`) — which in turn drives the runtime widget's
  // render composition (hint-layer backdrop vs paint-order overlay).
  const duotoneKindByName = new Map<
    string,
    'hint' | 'paintOrder' | 'maskInternal'
  >();
  for (const r of allResolved) {
    if (!isDuotoneBody(r.body)) continue;
    const { primary, secondary } = splitDuotoneBody(r.body);
    if (primary.length === 0 || secondary.length === 0) continue;
    r.body = primary;
    secondaryByName.set(r.name, { ...r, body: secondary });
    duotoneNames.add(r.name);
    duotoneKindByName.set(r.name, 'hint');
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
    duotoneKindByName.set(r.name, 'paintOrder');
    twoColorSplitCount += 1;
  }
  if (twoColorSplitCount > 0) {
    log.info(
      `  "${prefix}": split ${twoColorSplitCount} two-color icon${twoColorSplitCount === 1 ? '' : 's'} into duotone primary/secondary`
    );
  }

  // Third duotone path: bodies built around an inverse-mask pattern
  // (`<defs><mask>...<path stroke="silver".../><path stroke="#fff".../>...
  // </mask></defs><path mask="url(#X)"/>`) — lets-icons `*-duotone-line`
  // family. Classify the mask's child elements by luminance: faint colours
  // (silver, light grey, stroke-opacity<1) go to secondary; bold `#fff`
  // and opaque colours go to primary. Both layers re-emit as flat bodies
  // with `currentColor`, so downstream stroke-fill traces them properly.
  // Without this split lets-icons `add-round-duotone-line` shipped with
  // only the foreground (the outer faint ring vanished in the trace
  // because silver-25% is below Potrace's threshold against white).
  let maskInternalSplitCount = 0;
  for (const r of allResolved) {
    if (duotoneNames.has(r.name)) continue;
    const split = trySplitMaskInternalBody(r.body);
    if (split === null) continue;
    r.body = split.primary;
    secondaryByName.set(r.name, { ...r, body: split.secondary });
    duotoneNames.add(r.name);
    duotoneKindByName.set(r.name, 'maskInternal');
    maskInternalSplitCount += 1;
  }
  if (maskInternalSplitCount > 0) {
    log.info(
      `  "${prefix}": split ${maskInternalSplitCount} mask-internal icon${maskInternalSplitCount === 1 ? '' : 's'} into duotone primary/secondary`
    );
  }

  // Colour-mapped pack preprocess. Some packs (Catppuccin etc.) tint each
  // icon with one or two palette accents via concrete `stroke="…"` /
  // `fill="…"` values. Iconify ships these as raw hex colours, NOT
  // `currentColor`, so the downstream rasterize-trace pass sees light-on-
  // light geometry and Potrace traces an empty silhouette (Catppuccin
  // originally shipped with 659 blank glyphs for this reason).
  //
  // Before stroke-fill, walk each icon: count distinct concrete colours,
  // then either split into duotone (exactly 2) or flatten every concrete
  // fill/stroke to `currentColor` (1 or 3+). Bodies already handled by
  // the opacity-based or fill-paint-order duotone splits above are skipped.
  const colorMappedSets = config.colorMappedSets ?? [];
  const isColorMappedSet = colorMappedSets.includes(prefix);
  if (isColorMappedSet) {
    let cmMono = 0;
    let cmDuo = 0;
    let cmFlatMulti = 0;
    for (const r of allResolved) {
      if (duotoneNames.has(r.name)) continue;
      const colors = extractConcreteColors(r.body);
      if (colors.size === 0) continue;
      if (colors.size === 2) {
        const split = trySplitTwoStrokeColorBody(r.body);
        if (split !== null) {
          r.body = split.primary;
          secondaryByName.set(r.name, { ...r, body: split.secondary });
          duotoneNames.add(r.name);
          // Colour-mapped 2-stroke split is paint-order semantics —
          // primary = first colour (typically background), secondary =
          // second (typically foreground accent).
          duotoneKindByName.set(r.name, 'paintOrder');
          cmDuo += 1;
          continue;
        }
      }
      r.body = normalizeColorsToCurrentColor(r.body);
      if (colors.size === 1) cmMono += 1;
      else cmFlatMulti += 1;
    }
    if (cmMono + cmDuo + cmFlatMulti > 0) {
      log.info(
        `  "${prefix}": colour-mapped preprocess — ${cmMono} mono, ${cmDuo} duotone-split, ${cmFlatMulti} 3+→flattened`
      );
    }
  }

  // Stroke / evenodd icon sets need rasterize-then-trace pre-processing
  // before font conversion (svgicons2svgfont collapses strokes to zero
  // width and TTF rendering uses non-zero winding regardless of an
  // `fill-rule="evenodd"` in the source). Two signals trigger the pass:
  //   1. Explicit allow-list in config.strokeFillSets (overrides detection)
  //   2. Auto-detection on the icon sample: stroke ratio ≥ 50% OR
  //      evenodd ratio ≥ 20% (50% combined catches gravity-ui-style sets
  //      whose icons use evenodd cutouts but no explicit stroke).
  // Count icons that use the inverse-mask pattern before stroke-fill
  // rewrites their bodies. These were silently broken by oslllo-svg-fixer
  // before the custom worker bypass — surface counts in the audit so we
  // can verify the fix landed and watch for regressions.
  let maskPatternCount = 0;
  const maskPatternNames: string[] = [];
  for (const r of allResolved) {
    if (bodyUsesMaskPattern(r.body)) {
      maskPatternCount += 1;
      if (maskPatternNames.length < 3) maskPatternNames.push(r.name);
    }
  }

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
  let perIconTracedNames: string[] = [];
  // Icons whose stroke-fill worker panicked the native rasterizer — bisect
  // isolated them and the pipeline drops them from the manifest just like
  // a glyph-validator failure.
  const strokeFillPanicNames = new Set<string>();
  // Collect primary + secondary work as ONE multi-job batch so we spawn
  // exactly one stroke-fill subprocess per pack (instead of two), even
  // when both halves of a duotone-heavy pack need tracing. Cross-pack
  // batching is deferred until the pipeline is restructured into
  // explicit phases — see RESEARCH_PLAN.md §15 for the plan.
  const sfJobs: StrokeFillJob[] = [];
  if (isStrokeFillSet) {
    sfJobs.push({ prefix, icons: allResolved });
    if (secondaryByName.size > 0) {
      sfJobs.push({
        prefix: `${prefix}-secondary`,
        icons: [...secondaryByName.values()],
      });
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
      perIconTracedNames = perIconNeeded.map((r) => r.name);
      log.info(
        `  "${prefix}": per-icon raster-trace on ${perIconNeeded.length} icon${perIconNeeded.length === 1 ? '' : 's'} (pack sample under threshold)`
      );
      sfJobs.push({ prefix, icons: perIconNeeded });
      // Secondary layers of duotone-split icons that also fall in the
      // per-icon set need tracing too — their primary half ships through
      // the same pack subprocess above, but the secondary lives in
      // `secondaryByName` and is built into a separate font.
      const perIconSecondary = [...secondaryByName.values()].filter((r) =>
        iconNeedsRasterTrace(r.body)
      );
      if (perIconSecondary.length > 0) {
        sfJobs.push({
          prefix: `${prefix}-secondary`,
          icons: perIconSecondary,
        });
      }
    }
  }
  // §6 fix: aggregate stroke-as-fill skip counts per pack so the audit
  // shows where rasterize-trace was short-circuited (BPMN-style thick
  // strokes that don't need tracing).
  let fillLikeSkippedTotal = 0;
  let fillLikeSkippedSamples: string[] = [];
  if (sfJobs.length > 0) {
    const sfResults = await strokeFillBatchMulti(sfJobs);
    for (const r of sfResults) {
      for (const n of r.panicSkipped) strokeFillPanicNames.add(n);
      // Only count primary-pack skips — secondary fonts are derived from
      // the same source bodies so their skip count would double-count.
      if (r.prefix === prefix && r.fillLikeSkipped) {
        fillLikeSkippedTotal += r.fillLikeSkipped.length;
        if (fillLikeSkippedSamples.length < 3) {
          fillLikeSkippedSamples = [
            ...fillLikeSkippedSamples,
            ...r.fillLikeSkipped.slice(0, 3 - fillLikeSkippedSamples.length),
          ];
        }
      }
    }
  }

  // vtracer recovery (opt-in via `config.vtracerSets`). For packs that
  // ship a lot of multi-colour bodies (twemoji, noto, fluent-emoji-flat,
  // circle-flags, …) the paint-order drop below would otherwise leak
  // ~thousands of icons per pack. vtracer rasterises each candidate and
  // re-traces it into stacked colour layers; we reduce those to the top
  // 2 by area and emit the icon as a duotone `(primary, secondary)` pair
  // with `kind: paintOrder`. Successfully recovered icons are then
  // EXCLUDED from the paint-order drop below — they've been converted
  // into a renderable duotone form. Bodies that vtracer can't reduce to
  // ≥2 layers, or whose worker panics, still fall through to the drop.
  //
  // The recovered icons feed the existing Secondary font pipeline via
  // the same `secondaryByName` map the two-colour and mask-internal
  // splitters use, so no further codegen changes are needed downstream.
  let vtraceConsidered = 0;
  let vtraceRecovered = 0;
  let vtraceFailed = 0;
  let vtraceRecoveredSamples: string[] = [];
  const isVtracerSet = (config.vtracerSets ?? []).includes(prefix);
  if (isVtracerSet) {
    const candidates = allResolved.filter(
      (r) => !duotoneNames.has(r.name) && isPaintOrderRiskBody(r.body)
    );
    if (candidates.length > 0) {
      vtraceConsidered = candidates.length;
      log.info(
        `  "${prefix}": vtracer-eligible — ${candidates.length} paint-order candidate${candidates.length === 1 ? '' : 's'}`
      );
      const vt = await vtraceBatch(prefix, candidates);
      vtraceRecovered = vt.recovered.length;
      vtraceFailed =
        vt.monochromeFailures.length +
        vt.panicSkipped.length +
        vt.otherFailures.length;
      for (const rec of vt.recovered) {
        // Primary body was mutated in-place by vtraceBatch; we just need
        // to register the secondary and mark the icon as paint-order
        // duotone so the rest of the pipeline routes it correctly.
        secondaryByName.set(rec.icon.name, {
          ...rec.icon,
          body: rec.secondary,
        });
        duotoneNames.add(rec.icon.name);
        duotoneKindByName.set(rec.icon.name, 'paintOrder');
      }
      vtraceRecoveredSamples = vt.recovered
        .slice(0, 3)
        .map((r) => r.icon.name);
      log.info(
        `  "${prefix}": vtracer recovered ${vtraceRecovered}/${candidates.length} (${vt.cacheHits} cached, ${vt.monochromeFailures.length} monochrome, ${vt.panicSkipped.length} panic, ${vt.otherFailures.length} other-fail)`
      );
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
    // Icons split into duotone above (either via opacity, 2-color split,
    // mask-internal split, OR vtracer multi-colour recovery) already have
    // their primary half normalised to a single fill — no need to drop.
    // Their secondary half is shipped separately via the Secondary font.
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
    paintOrderDroppedSamples: [...paintOrderDroppedNames].slice(0, 3),
    perIconTracedSamples: perIconTracedNames.slice(0, 3),
    maskPatternCount,
    maskPatternSamples: maskPatternNames,
    vtraceConsidered,
    vtraceRecovered,
    vtraceFailed,
    vtraceRecoveredSamples,
    fillLikeSkipped: fillLikeSkippedTotal,
    fillLikeSkippedSamples,
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
  //
  // §16-A8: tag each drop with its `deprecatedReason` so the
  // upstream-regression audit can bucket new deprecations by cause
  // (validator-rejected / panic-skipped / paint-order-dropped) vs.
  // upstream-removed.
  const resolved: ResolvedIcon[] = [];
  const droppedGlyphs: { name: string; reason: string }[] = [];
  const dropReasonByName = new Map<
    string,
    'validator-rejected' | 'panic-skipped' | 'paint-order-dropped'
  >();
  for (const ic of allResolved) {
    if (paintOrderDroppedNames.has(ic.name)) {
      droppedGlyphs.push({ name: ic.name, reason: 'paint-order risk (multi-fill body)' });
      dropReasonByName.set(ic.name, 'paint-order-dropped');
      secondaryByName.delete(ic.name);
      duotoneNames.delete(ic.name);
      continue;
    }
    if (strokeFillPanicNames.has(ic.name)) {
      droppedGlyphs.push({
        name: ic.name,
        reason: 'stroke-fill worker panicked on this body (native resvg crash)',
      });
      dropReasonByName.set(ic.name, 'panic-skipped');
      secondaryByName.delete(ic.name);
      duotoneNames.delete(ic.name);
      continue;
    }
    const v = validateIconBody(ic);
    if (v.ok) {
      resolved.push(ic);
    } else {
      droppedGlyphs.push({ name: ic.name, reason: v.reason });
      dropReasonByName.set(ic.name, 'validator-rejected');
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

  // §22 Rec 1: build the alias→canonical map for pure-rename aliases
  // (those whose body is identical to a canonical's, i.e. no per-alias
  // transform). The allocator uses this to assign the canonical's
  // codepoint to the alias and skip glyph-space allocation. Aliases
  // pointing at a canonical that didn't survive validation get dropped
  // (the canonical isn't in `icons` post-allocation, so pass 3 drops
  // the alias).
  const aliasOfMap: Record<string, string> = {};
  for (const r of resolved) {
    if (r.aliasOf !== undefined) aliasOfMap[r.name] = r.aliasOf;
  }

  // §22 Rec 2: pre-compute per-icon category lists from the upstream
  // pack's `categories` map. We invert `{categoryName: [iconNames]}` →
  // `{iconName: [categoryName, ...]}` once here so the per-icon stamp
  // below is O(1). Aliases inherit their canonical's category list at
  // the codegen site (a separate lookup), keeping the manifest entries
  // for aliases lean. Synthetic weight variants inherit categories
  // from their parent (the stripped base name).
  const categoriesByIcon = new Map<string, string[]>();
  if (set.categories && Object.keys(set.categories).length > 0) {
    for (const [catName, members] of Object.entries(set.categories)) {
      for (const memberName of members) {
        let arr = categoriesByIcon.get(memberName);
        if (!arr) {
          arr = [];
          categoriesByIcon.set(memberName, arr);
        }
        if (!arr.includes(catName)) arr.push(catName);
      }
    }
  }

  const { fonts, icons } = allocateCodepoints({
    prefix,
    fontFamilyBase,
    iconNames: resolved.map((r) => r.name),
    aliasOf: aliasOfMap,
    previous,
  });

  // §16-A8: stamp `deprecatedReason` on icons we just dropped (validator
  // / panic / paint-order). `allocateCodepoints` already marked icons
  // from the previous manifest that aren't in `iconNames` as deprecated
  // with `deprecatedReason: 'upstream-removed'`; that default is
  // OVERWRITTEN here when we have a more precise attribution — an icon
  // present in upstream but rejected by our pipeline is OUR regression,
  // not an upstream removal.
  for (const [name, reason] of dropReasonByName) {
    const entry = icons[name];
    if (entry && entry.deprecated) entry.deprecatedReason = reason;
  }

  // Mark duotone entries + add Secondary fonts to manifest. Secondary fonts
  // mirror Primary fonts that contain at least one duotone icon. They share
  // the same codepoint cursor (each duotone icon's secondary glyph sits at
  // the same codepoint in the Secondary font as its primary).
  //
  // §22 Rec 1 propagation: aliases live in `icons` too (allocator pass 3
  // gave them the canonical's codepoint). When the canonical is duotone
  // the alias must inherit `duotone` + `duotoneKind` so codegen routes
  // alias entries through the right Map type (`Map<String, IconifyIconData>`
  // works regardless, but for consistency the manifest mirrors the truth).
  for (const name of duotoneNames) {
    const e = icons[name];
    if (e && !e.deprecated) {
      e.duotone = true;
      const kind = duotoneKindByName.get(name);
      if (kind && kind !== 'hint') e.duotoneKind = kind;
      else if (e.duotoneKind && kind === 'hint') delete e.duotoneKind;
    }
  }
  // Inherit duotone flag onto alias entries pointing at duotone canonicals.
  for (const [aliasName, e] of Object.entries(icons)) {
    if (e.deprecated) continue;
    const canonicalName = e.aliasOf;
    if (!canonicalName) continue;
    const canonical = icons[canonicalName];
    if (!canonical || canonical.deprecated) continue;
    if (canonical.duotone) {
      e.duotone = true;
      if (canonical.duotoneKind && canonical.duotoneKind !== 'hint') {
        e.duotoneKind = canonical.duotoneKind;
      } else if (e.duotoneKind) {
        delete e.duotoneKind;
      }
    } else if (e.duotone) {
      // Stale duotone flag from a previous manifest run — strip it so
      // aliases-of-non-duotone stay solo.
      delete e.duotone;
      delete e.duotoneKind;
    }
    // Belt-and-braces: aliases should never appear in the allocator's
    // identifier-claim set with a `_` suffix unless the canonical also
    // collided (sanitizeIdentifier handles that). No-op for the common
    // case; left here as a marker for future readers.
    void aliasName;
  }
  // §22 Rec 2: stamp upstream `info.categories` membership onto every
  // canonical icon. Aliases are NOT stamped — the alias map points at
  // the canonical const, and the canonical const already lives under
  // its category list, so aliases reusing it through `lib/aliases.dart`
  // get the categorisation for free. Synthetic weight variants inherit
  // their parent's categories.
  if (categoriesByIcon.size > 0) {
    const weightsForSet = config.multiWeightStrokeSets?.[prefix];
    const weightSuffixes = weightsForSet ? Object.keys(weightsForSet) : [];
    for (const [name, e] of Object.entries(icons)) {
      if (e.deprecated) continue;
      if (e.aliasOf) continue;
      let cats = categoriesByIcon.get(name);
      if (!cats && weightSuffixes.length > 0) {
        for (const suffix of weightSuffixes) {
          const suffixTail = `-${suffix}`;
          if (name.endsWith(suffixTail)) {
            const baseName = name.slice(0, -suffixTail.length);
            cats = categoriesByIcon.get(baseName);
            if (cats) break;
          }
        }
      }
      if (cats && cats.length > 0) {
        e.categories = [...cats].sort();
      }
    }
  }
  // Walk canonicals only — aliases (e.aliasOf set) inherit duotone-ness
  // for codegen routing but they share the canonical's codepoint and
  // therefore must NOT contribute a separate glyph slot to the
  // Secondary font's iconCount.
  const primaryFamiliesWithDuotone = new Set<string>();
  for (const e of Object.values(icons)) {
    if (e.aliasOf) continue;
    if (e.duotone && !e.deprecated) primaryFamiliesWithDuotone.add(e.fontFamily);
  }
  for (const primaryFamily of primaryFamiliesWithDuotone) {
    const secName = secondaryFontFamily(primaryFamily);
    const primaryFont = fonts.find((f) => f.family === primaryFamily);
    if (!primaryFont) continue;
    let dtCount = 0;
    for (const e of Object.values(icons)) {
      if (e.aliasOf) continue;
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

  // Upstream `info.tags` from the full pack JSON (collections.json strips
  // them). Stored on the manifest so codegen can surface them on the
  // `packInfo` const (§22 Rec 5) without a second pass over @iconify/json.
  const upstreamTags = set.info.tags ?? [];

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
      ...(upstreamTags.length > 0 ? { tags: [...upstreamTags] } : {}),
    },
    fonts,
    icons,
  };

  // §22 Rec 1: split the icons map into canonicals + aliases for the
  // build phase. `iconsForBuild` is the canonical-only view fed into
  // `buildFonts` (and the iterate-until-empty verifier) — aliases must
  // NOT appear here, because every alias shares its canonical's
  // codepoint and font_builder would otherwise try to emit two glyphs
  // at the same codepoint, breaking the cmap. The full `icons` map
  // (with aliases) survives unchanged on `manifest` for codegen and
  // on-disk persistence.
  const iconsForBuild: Record<string, ManifestIconEntry> = {};
  const aliasEntries: Record<string, ManifestIconEntry> = {};
  for (const [name, e] of Object.entries(icons)) {
    if (e.aliasOf !== undefined) aliasEntries[name] = e;
    else iconsForBuild[name] = e;
  }

  // Recompute per-font `iconCount` so it reflects ONLY canonicals (live
  // members that actually take up a glyph slot). Aliases bypass the
  // font-cap logic. Secondary fonts get the duotone-canonical count.
  for (const f of fonts) f.iconCount = 0;
  for (const e of Object.values(iconsForBuild)) {
    if (e.deprecated) continue;
    const primaryF = fonts.find((x) => x.family === e.fontFamily);
    if (primaryF) primaryF.iconCount += 1;
    if (e.duotone) {
      const secName = secondaryFontFamily(e.fontFamily);
      const secF = fonts.find((x) => x.family === secName);
      if (secF) secF.iconCount += 1;
    }
  }

  // Manifest view used by `buildFonts` + the iterate-until-empty
  // verifier. Identical to `manifest` except `icons` excludes alias
  // entries — see the §22 Rec 1 invariant above.
  const buildManifest: Manifest = { ...manifest, icons: iconsForBuild };

  // Build fonts. If individual glyphs trip svgicons2svgfont mid-stream, the
  // builder catches it, drops them, and retries — we collect the names here
  // so we can flag them deprecated in the manifest (codepoint stays reserved
  // in case they get fixed upstream).
  const droppedDuringBuild = new Set<string>();
  let ttfs: Map<string, Buffer>;

  // RESEARCH_PLAN.md §3 — iterate-until-empty rebuild loop. svg2ttf can
  // SILENTLY drop path data on serialization: svgicons2svgfont accepts the
  // body, no JS error is thrown, but the emitted glyph slot has
  // `path.commands.length === 0`. Flutter renders that as `.notdef` (a
  // blank box). Before this loop landed, ~569 such empty glyphs shipped
  // across 37 fonts each regen — `FONT_AUDIT.md` flagged them all but the
  // pipeline never reacted.
  //
  // After every `buildFonts` we re-open every emitted TTF in-memory via
  // fontkit (`verifyGlyphsNonEmpty`) and mark any empty members as
  // `deprecated: true` with `deprecatedSince` set. Their codepoint stays
  // reserved (CLAUDE.md §3 invariant), but they don't ship as a renderable
  // glyph. We then re-build the affected fonts; the dropped icons are
  // excluded automatically because `buildFonts` skips `deprecated` entries.
  //
  // The loop terminates when (a) no font has empty glyphs after build, or
  // (b) `MAX_ITER` iterations have elapsed (safety cap so a pathological
  // pack can't spin forever — empirically resolves in 1-3 iterations).
  // Helper: cascade deprecation onto alias entries whose canonical was
  // just dropped. Aliases share the canonical's codepoint and would
  // otherwise resolve to a now-dead glyph slot. We update both the
  // full `icons` map (persisted on the manifest) and the `aliasEntries`
  // sidecar used to reconstruct the manifest after the build.
  const cascadeAliasDeprecations = (
    droppedCanonicalNames: Iterable<string>,
    today: string,
  ): void => {
    const dropped = new Set(droppedCanonicalNames);
    if (dropped.size === 0) return;
    for (const [aliasName, aliasEntry] of Object.entries(aliasEntries)) {
      if (!aliasEntry.aliasOf) continue;
      if (!dropped.has(aliasEntry.aliasOf)) continue;
      if (aliasEntry.deprecated) continue;
      aliasEntry.deprecated = true;
      aliasEntry.deprecatedSince = today;
      const fullEntry = icons[aliasName];
      if (fullEntry) {
        fullEntry.deprecated = true;
        fullEntry.deprecatedSince = today;
      }
    }
  };

  const MAX_ITER = 5;
  let iter = 0;
  while (true) {
    ttfs = await buildFonts({
      manifest: buildManifest,
      resolvedByName,
      secondaryByName,
      onGlyphDropped: (name) => droppedDuringBuild.add(name),
      cacheEnabled,
    });

    // Verify every primary + Secondary TTF for empty glyphs. We only need
    // to inspect the fonts that were actually built (skipped families with
    // iconCount===0 don't end up in the map). Uses the canonical-only
    // `iconsForBuild` view so verifier members match the emitted glyphs.
    const newlyEmpty = new Set<string>();
    for (const fontEntry of manifest.fonts) {
      const ttf = ttfs.get(fontEntry.family);
      if (!ttf) continue;

      const isSecondary = fontEntry.family.endsWith('Secondary');
      const primaryFamily = isSecondary
        ? fontEntry.family.slice(0, -'Secondary'.length)
        : fontEntry.family;

      // Reconstruct the member list the build saw — mirrors the loop in
      // font_builder.ts:buildFonts.
      const members: { name: string; codepoint: number }[] = [];
      for (const [iconName, m] of Object.entries(iconsForBuild)) {
        if (m.deprecated) continue;
        if (m.fontFamily !== primaryFamily) continue;
        if (isSecondary && !m.duotone) continue;
        members.push({ name: iconName, codepoint: m.codepoint });
      }
      if (members.length === 0) continue;

      const res = verifyGlyphsNonEmpty(ttf, members);
      if (res.openError) {
        // fontkit couldn't open the buffer — `font_verify.ts` will surface
        // this in FONT_AUDIT.md as a file-level error; nothing for us to
        // recover here, accept the TTF as-is and move on.
        continue;
      }
      for (const name of res.emptyMembers) newlyEmpty.add(name);
    }

    if (newlyEmpty.size === 0) break;

    // Mark every empty as deprecated and let the next iteration rebuild
    // without them. Mirrors the on-disk semantics for retry-on-error
    // drops (`droppedDuringBuild` below). Cascade onto aliases so a
    // dead canonical doesn't leave aliases pointing at a stale slot.
    // The reason is the §16-A2 bucket: every defence (validator,
    // retry-on-error, stroke-fill, paint-order, per-icon raster)
    // passed, the TTF cmap slot exists, but the glyph outline came out
    // empty. The `upstream-regressions` audit uses this reason to
    // distinguish silent-empty drift from validator-rejected / panic-
    // skipped / paint-order-dropped; `orphan-const-fix` writes the same
    // value when cleaning up pre-§3 residue on disk.
    const today = new Date().toISOString().slice(0, 10);
    for (const name of newlyEmpty) {
      droppedDuringBuild.add(name);
      const entry = icons[name];
      if (entry) {
        entry.deprecated = true;
        entry.deprecatedSince = today;
        entry.deprecatedReason = 'svg2ttf-silent-empty';
      }
      const buildEntry = iconsForBuild[name];
      if (buildEntry) {
        buildEntry.deprecated = true;
        buildEntry.deprecatedSince = today;
        buildEntry.deprecatedReason = 'svg2ttf-silent-empty';
      }
    }
    cascadeAliasDeprecations(newlyEmpty, today);
    // Recompute live count + per-font live counts so the next buildFonts
    // pass sees correct counts AND so we don't reference a font that just
    // emptied out. iconCount stays canonical-only (aliases don't take
    // up font space).
    {
      // `manifest.info.total` reports browseable name count, which
      // includes aliases (they're real names users can reference even
      // though they don't take a separate font slot). Recompute from
      // the full `icons` map.
      const liveCountUpdated = Object.values(icons).filter((i) => !i.deprecated).length;
      manifest.info.total = liveCountUpdated;
      for (const f of fonts) f.iconCount = 0;
      for (const e of Object.values(iconsForBuild)) {
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
    log.info(
      `  "${prefix}": iterate-until-empty — iter ${iter + 1}, dropped ${newlyEmpty.size} silent-empty glyph${newlyEmpty.size === 1 ? '' : 's'} (${[...newlyEmpty].slice(0, 3).join(', ')}${newlyEmpty.size > 3 ? '…' : ''})`
    );

    iter += 1;
    if (iter >= MAX_ITER) {
      log.warn(
        `  "${prefix}": iterate-until-empty hit MAX_ITER=${MAX_ITER}; ${newlyEmpty.size} more empties not resolved this run`
      );
      break;
    }
  }

  // Final reconciliation: catch any glyphs the underlying builder reported
  // via `onGlyphDropped` (svgicons2svgfont mid-stream errors) but that we
  // haven't yet folded into the manifest. The iterate loop above only
  // touches silent-empty glyphs; this block handles the explicit drops.
  if (droppedDuringBuild.size > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const justDroppedCanonicals: string[] = [];
    for (const name of droppedDuringBuild) {
      const entry = icons[name];
      if (entry && !entry.deprecated) {
        entry.deprecated = true;
        entry.deprecatedSince = today;
        if (!entry.aliasOf) justDroppedCanonicals.push(name);
      }
      const buildEntry = iconsForBuild[name];
      if (buildEntry && !buildEntry.deprecated) {
        buildEntry.deprecated = true;
        buildEntry.deprecatedSince = today;
      }
    }
    cascadeAliasDeprecations(justDroppedCanonicals, today);
    // Recompute live count + per-font live counts. iconCount is
    // canonical-only — aliases never count toward font capacity.
    // Browseable name count = canonicals + aliases.
    const liveCountUpdated = Object.values(icons).filter((i) => !i.deprecated).length;
    manifest.info.total = liveCountUpdated;
    for (const f of fonts) f.iconCount = 0;
    for (const e of Object.values(iconsForBuild)) {
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

  // Post-build glyph rename — §33 regression fix (2026-05-16).
  //
  // svg2ttf deduplicates glyphs by outline hash. When two
  // svgicons2svgfont inputs produce identical outlines (the common case
  // is Solar / Phosphor / IC duotone SECONDARY layers that all share a
  // circular or rectangular backdrop), only ONE glyph survives in the
  // GLYF table and every aliased codepoint's cmap entry resolves to
  // that glyph — under whichever name svg2ttf encountered first
  // (alphabetically). The OUTLINE rendered at the aliased codepoint is
  // visually identical (that's the whole point of dedup), so renderers
  // produce the right pixels — only the post-table NAME is wrong, which
  // is a font-tooling / audit-only nuisance.
  //
  // History: an earlier commit (2992fa83) tried to handle this by
  // DEMOTING any cmap-aliased duotone to solo, on the false premise
  // that the secondary was rendering a wrong-glyph letterform. That
  // demote silently dropped the outer ring / square frame for ~818
  // Solar duotones (`add-circle-bold-duotone`, `add-square-line-
  // duotone`, etc.) — the secondary layer holds the outer shape, the
  // primary holds the inner plus, and demoting threw the outer shape
  // away entirely. The visible regression is "only the inner plus
  // renders". This pass restores the rename-based fix (1600bbfe) so
  // each codepoint gets its own properly-named glyph (deep-copied from
  // the dedup victim) and `duotone: true` is preserved.
  //
  // Also clears the stale `secondaryAliased: true` markers left over in
  // manifests by the 2992fa83 demote run — the icon is duotone again,
  // the field is now meaningless.
  const { ttfs: renamedTtfs, stats: renameStats } = await renameGlyphsInTtfs(
    manifest,
    ttfs
  );
  if (renameStats.renamed + renameStats.duplicated > 0) {
    log.info(
      `  "${prefix}": glyph rename — ${renameStats.duplicated} dedup victim${renameStats.duplicated === 1 ? '' : 's'} duplicated, ${renameStats.renamed} renamed in place`
    );
  }
  void (renameStats satisfies GlyphRenameStats);

  // Clear stale `secondaryAliased` markers + restore `duotone: true` on
  // icons that the duotone-split path identified this run. The 2992fa83
  // demote-to-solo run set `duotone: false` on hundreds of icons whose
  // outer-shape secondary is correctly built and now properly named by
  // the rename pass above. Pipeline keeps the codepoint stable — only
  // the manifest flags flip back to "duotone" so codegen emits `.duo`.
  for (const [name, e] of Object.entries(manifest.icons)) {
    if (!e.secondaryAliased) continue;
    delete e.secondaryAliased;
    if (e.deprecated) continue;
    // Re-mark as duotone if the duotone-split path classified it this
    // run. Aliases inherit from their canonical (mirror the earlier
    // alias-inherit loop).
    if (duotoneNames.has(name)) {
      e.duotone = true;
      const kind = duotoneKindByName.get(name);
      if (kind && kind !== 'hint') e.duotoneKind = kind;
    } else if (e.aliasOf) {
      const canonical = manifest.icons[e.aliasOf];
      if (canonical && !canonical.deprecated && canonical.duotone) {
        e.duotone = true;
        if (canonical.duotoneKind && canonical.duotoneKind !== 'hint') {
          e.duotoneKind = canonical.duotoneKind;
        }
      }
    }
  }
  // Recompute Secondary font iconCounts now that the duotone flags are
  // restored — the iconCount loop above ran with stale `duotone: false`
  // values on the §33-affected icons.
  for (const f of manifest.fonts) {
    if (!f.family.endsWith('Secondary')) continue;
    const primaryFamily = f.family.slice(0, -'Secondary'.length);
    let dt = 0;
    for (const e of Object.values(manifest.icons)) {
      if (e.deprecated) continue;
      if (!e.duotone) continue;
      if (e.fontFamily !== primaryFamily) continue;
      dt += 1;
    }
    f.iconCount = dt;
  }

  // §22 Rec 3 — patch-bump this pack's version iff the content hash
  // changed vs the prior manifest. Must happen AFTER all deprecation
  // drops + font pruning so the hash reflects what we're actually
  // about to write to disk.
  const bump = decideVersionBump(manifest, previous);
  manifest.version = bump.nextVersion;
  manifest.contentHash = bump.nextHash;
  if (bump.reason === 'bumped') {
    log.info(
      `  "${prefix}": version ${previous?.version ?? '0.1.0'} → ${bump.nextVersion} (content changed)`
    );
  } else if (bump.reason === 'first') {
    log.info(`  "${prefix}": seeding initial version ${bump.nextVersion}`);
  }

  const {
    setDart: dartSource,
    aliasesDart,
    categoriesDart,
  } = emitSetDart({
    manifest,
    fontPackage: setPackageName(prefix),
  });

  return {
    prefix,
    manifest,
    ttfs: renamedTtfs,
    dartSource,
    aliasesDart,
    categoriesDart,
  };
}

interface WrittenSources {
  manifestJson: string;
  librarySrc: string;
  pubspecSrc: string;
  licenseDartSrc: string;
  license3rdPartyMd: string;
}

async function writeSetPackage(r: {
  prefix: string;
  manifest: Manifest;
  ttfs: Map<string, Buffer>;
  dartSource: string;
  aliasesDart: string | null;
  categoriesDart: string | null;
  /**
   * §13 Rec 1 — when present, these were pulled from a snapshot replay
   * and we write them verbatim. Otherwise we re-emit via the codegen
   * helpers from the live manifest.
   */
  librarySrc?: string;
  pubspecSrc?: string;
  licenseDartSrc?: string;
  license3rdPartyMd?: string;
}): Promise<WrittenSources> {
  const { prefix, manifest, ttfs, dartSource, aliasesDart, categoriesDart } = r;

  await writeManifest(manifest);
  // Capture the canonical (sorted) manifest JSON for snapshot persistence.
  // Must mirror writeManifest's sort exactly — that's the on-disk shape and
  // the cache-replay shape needs to match it byte-for-byte. Cheap: a small
  // re-stringify, no double-fs-write.
  const sortedIcons: Record<string, ManifestIconEntry> = {};
  for (const name of Object.keys(manifest.icons).sort()) {
    sortedIcons[name] = manifest.icons[name]!;
  }
  const manifestJson =
    JSON.stringify({ ...manifest, icons: sortedIcons }, null, 2) + '\n';

  // Layout: packages/iconifyx_<prefix>/{lib/, assets/fonts/}
  await mkdir(setPackageFontsDir(prefix), { recursive: true });
  await mkdir(path.join(setPackageSrcDir(prefix), 'sets'), { recursive: true });

  // Fonts. Clean out stale `.ttf` files first — after §32's sibling
  // merge, packs that previously emitted Mdi.ttf + Mdi_2.ttf + Mdi_3.ttf
  // now emit only Mdi.ttf, so the old siblings must be removed from
  // disk or `flutter pub get` will complain about declared assets that
  // are no longer in pubspec.yaml.
  const fontsDir = setPackageFontsDir(prefix);
  const declared = new Set([...ttfs.keys()].map((f) => `${f}.ttf`));
  const existing = await readdir(fontsDir).catch(() => [] as string[]);
  for (const file of existing) {
    if (!file.endsWith('.ttf')) continue;
    if (!declared.has(file)) {
      await rm(path.join(fontsDir, file));
    }
  }
  for (const [family, ttf] of ttfs) {
    await writeFile(path.join(fontsDir, `${family}.ttf`), ttf);
  }

  // Set Dart class file
  const setFile = path.join(
    setPackageSrcDir(prefix),
    'sets',
    dartFileNameFromPrefix(prefix)
  );
  await writeFile(setFile, dartSource, 'utf8');

  // §22 Rec 1: opt-in alias map at `lib/aliases.dart`. Written when the
  // pack has at least one pure-rename alias; removed otherwise (so a
  // pack that lost its last alias upstream doesn't leave a stale file
  // behind).
  const aliasesPath = path.join(setPackageLibDir(prefix), 'aliases.dart');
  if (aliasesDart !== null) {
    await writeFile(aliasesPath, aliasesDart, 'utf8');
  } else {
    await rm(aliasesPath).catch(() => {});
  }

  // §22 Rec 2: opt-in category map at `lib/categories.dart`. Same
  // contract as `aliases.dart` — only present for packs that ship
  // upstream `info.categories` data.
  const categoriesPath = path.join(setPackageLibDir(prefix), 'categories.dart');
  if (categoriesDart !== null) {
    await writeFile(categoriesPath, categoriesDart, 'utf8');
  } else {
    await rm(categoriesPath).catch(() => {});
  }

  // Package library file (top-level). When snapshot-replayed, reuse the
  // exact bytes the cache holds; otherwise emit fresh from manifest.
  const pkgName = setPackageName(prefix);
  const librarySrc = r.librarySrc ?? emitSetLibraryFile(manifest);
  await writeFile(
    path.join(setPackageLibDir(prefix), `${pkgName}.dart`),
    librarySrc,
    'utf8'
  );

  // License helpers — same cache-replay-or-emit dance.
  const license3rdPartyMd = r.license3rdPartyMd ?? emitSetThirdPartyLicense(manifest);
  await writeFile(
    path.join(setPackageDir(prefix), 'LICENSE-3RD-PARTY.md'),
    license3rdPartyMd,
    'utf8'
  );
  const licenseDartSrc = r.licenseDartSrc ?? emitSetLicenseDart(manifest);
  await writeFile(
    path.join(setPackageSrcDir(prefix), 'license.dart'),
    licenseDartSrc,
    'utf8'
  );

  // Pubspec.
  const pubspecSrc = r.pubspecSrc ?? emitSetPubspec({ manifest });
  await writeFile(
    path.join(setPackageDir(prefix), 'pubspec.yaml'),
    pubspecSrc,
    'utf8'
  );

  return {
    manifestJson,
    librarySrc,
    pubspecSrc,
    licenseDartSrc,
    license3rdPartyMd,
  };
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

/** Only emit category-meta packs that group at least this many member sets. */
const CATEGORY_META_MIN_MEMBERS = 3;

/**
 * §22 Rec 4 — emit one `iconifyx_<suffix>_meta` package per Iconify
 * `info.category` bucket that has ≥ `CATEGORY_META_MIN_MEMBERS` member
 * packs. Each emitted meta package is structurally identical to the
 * kitchen-sink `iconifyx` meta — just scoped to the one category.
 *
 * Versioning policy: meta package versions are derived from the JOIN
 * of their members' content hashes. Specifically, hash the sorted list
 * of `member.contentHash` values and use that as the meta's stable
 * fingerprint. We don't currently re-bump on hash drift for these
 * (Rec 3 is about per-set packs); the meta gets a static `0.1.0` for
 * now. Independent meta versioning is a follow-up if/when these get
 * published to pub.dev.
 */
async function writeCategoryMetaPackages(manifests: Manifest[]): Promise<void> {
  // Group manifests by raw `info.category` (the Iconify category, NOT the
  // display alias — we want the canonical key for the package suffix).
  const byCategory = new Map<string, Manifest[]>();
  for (const m of manifests) {
    const cat = m.category;
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }

  let emitted = 0;
  for (const [category, members] of byCategory) {
    if (members.length < CATEGORY_META_MIN_MEMBERS) continue;

    const memberPackages = members
      .map((m) => setPackageName(m.prefix))
      .sort();

    const metaName = categoryMetaPackageName(category);
    const metaDir = path.join(packagesDir(), metaName);
    await mkdir(path.join(metaDir, 'lib'), { recursive: true });

    await writeFile(
      path.join(metaDir, 'pubspec.yaml'),
      emitCategoryMetaPubspec({
        category,
        memberPackages,
        version: '0.1.0',
      }),
      'utf8'
    );
    await writeFile(
      path.join(metaDir, 'lib', `${metaName}.dart`),
      emitCategoryMetaLibraryFile({ category, memberPackages }),
      'utf8'
    );
    emitted += 1;
    log.info(
      `  ${metaName}: ${memberPackages.length} member pack${memberPackages.length === 1 ? '' : 's'}`
    );
  }

  if (emitted === 0) {
    log.info('  (no categories with ≥ 3 members; skipping)');
  } else {
    log.success(`  emitted ${emitted} category-meta package${emitted === 1 ? '' : 's'}`);
  }
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

  // The hand-written Flutter app reads these JSON files at startup and
  // constructs `IconifyIconData` instances at runtime — no per-set imports.
  //
  // Three sets of outputs live side-by-side until `kUseCdn = true` is
  // flipped in lib/bootstrap/icon_catalog.dart:
  //   1. `lib/data/{packs.json,icons_index.json}` — legacy bundled Flutter
  //      assets the current default reads from rootBundle.
  //   2. `lib/data/cdn_manifest.json` — tiny routing manifest committed
  //      alongside the legacy assets so the CDN fetcher has a starting
  //      point. Always bundled.
  //   3. `lib/cdn/...` — the CDN tree (packs.json + per-pack icons-index
  //      shards) intended to be served from jsDelivr. Not a Flutter asset
  //      itself; mirrors are pushed to GitHub for jsDelivr's gh: path.
  //
  // See website_codegen.ts header for the exact layout. See
  // RESEARCH_PLAN §11/§12 for the design rationale.
  const codegenInput = { entries, iconifyJsonVersion };
  const packsJsonBody = buildPacksJson(codegenInput);
  const iconsIndexBody = buildIconsIndexJson(codegenInput);

  await writeFile(path.join(dataDir, 'packs.json'), packsJsonBody, 'utf8');
  await writeFile(
    path.join(dataDir, 'icons_index.json'),
    iconsIndexBody,
    'utf8'
  );
  await writeFile(
    path.join(dataDir, 'cdn_manifest.json'),
    buildCdnManifest({ iconifyJsonVersion }),
    'utf8'
  );

  // CDN tree. Mirror the bundled `packs.json` verbatim (so a jsDelivr URL
  // returns the same bytes the legacy code reads from rootBundle), then
  // emit one shard per pack + a small index manifest.
  const cdnRoot = path.join(websiteDir(), 'lib', 'cdn');
  const cdnPacksDir = path.join(cdnRoot, 'packs', 'v1');
  const cdnIconsIndexDir = path.join(cdnRoot, 'icons-index', 'v1');
  await mkdir(cdnPacksDir, { recursive: true });
  await mkdir(cdnIconsIndexDir, { recursive: true });

  await writeFile(path.join(cdnPacksDir, 'packs.json'), packsJsonBody, 'utf8');

  const { shards, manifest: shardManifestBody } = buildIconShards(codegenInput);
  for (const [relPath, body] of shards) {
    // Shard paths always look like `icons-index/v1/<prefix>.json`. We only
    // need the leaf filename here because the directory is fixed.
    const filename = relPath.split('/').pop()!;
    await writeFile(path.join(cdnIconsIndexDir, filename), body, 'utf8');
  }
  await writeFile(
    path.join(cdnIconsIndexDir, 'index.json'),
    shardManifestBody,
    'utf8'
  );

  // Pubspec lists every per-set package as a direct path dep so their TTF
  // assets ship with the build — even though the Dart code never imports
  // them. The two JSON files (+ cdn_manifest.json) are declared as assets.
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
  // package directories are protected. So are §22 Rec 4 category-meta
  // packages (`iconifyx_<suffix>_meta`) — they're regenerated each
  // run from `manifest.category`, so they don't get removed here even
  // if no Iconify prefix corresponds to their suffix.
  const pkgRoot = packagesDir();
  if (existsSync(pkgRoot)) {
    for (const entry of await readdir(pkgRoot)) {
      if (!entry.startsWith('iconifyx_')) continue;
      if (entry === 'iconifyx_core') continue;
      if (entry.endsWith('_meta')) continue; // category-meta pack, regenerated each run
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
