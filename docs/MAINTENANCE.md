# Maintenance playbook

How to keep `iconifyx` current. Run from repo root unless noted.

## Layout reminder

Every Iconify set is its own package under `packages/iconifyx_<prefix>/`. The hyphen-to-underscore conversion happens automatically (`fa6-solid` → `iconifyx_fa6_solid`). The meta package and example app are auto-regenerated to track whichever set packages exist.

## Routine: pull the latest Iconify sets

Iconify ships updates roughly every 2 days via `@iconify/json`.

```bash
bun update @iconify/json
bun run generate
```

The pipeline:
- Existing icons keep their codepoints (the allocator is append-only).
- New icons land in the next free slot of the same set's font (auto-split if it crosses 6000 live icons).
- Removed-upstream icons get `deprecated: true` in the manifest; their codepoints stay reserved.
- New Iconify sets become new `iconifyx_<prefix>/` package directories automatically.
- Meta package + example app pubspecs are rewritten to include any new deps.

Always inspect the diff before committing:

```bash
git diff --stat tools/generator/manifests/
git diff --stat packages/
```

A healthy diff looks like:

- `manifests/<prefix>.json` — only **additions** for new icon keys; no codepoint changes for existing icons.
- `packages/iconifyx_<prefix>/lib/src/sets/<prefix>.dart` — only **additions** for new icons.
- `packages/iconifyx_<prefix>/assets/fonts/*.ttf` — binary delta from svg2ttf; with `ts: 0` set, identical input → identical output.
- `packages/iconifyx/pubspec.yaml` and `packages/iconifyx/example/pubspec.yaml` — additions for new set packages.

If existing icons change codepoint, **stop**: the allocator broke and consumers' built apps will misrender. Investigate `tools/generator/src/codepoint_allocator.ts` and the manifest history.

## Routine: a set drops upstream

Iconify occasionally removes sets (renamed, deprecated). When `@iconify/json` no longer contains a prefix you have a manifest for:

```bash
bun run generate -- --clean
```

`--clean` removes both the manifest **and** the entire `packages/iconifyx_<prefix>/` directory for sets no longer in `@iconify/json`. (Earlier versions kept the manifest; we now delete it since the package directory is gone anyway, and re-adding starts a fresh allocation.)

## Routine: an icon disappears from a set

The allocator detects this automatically and marks the entry `deprecated: true` in the manifest. The icon is dropped from the emitted Dart class and font, but its codepoint stays reserved. You don't have to do anything.

## Excluding a set (license issue, broken SVGs, etc.)

```yaml
# tools/generator/config.yaml
excludedSets:
  - custom-brand-icons
  - your-new-exclusion
```

Re-run `bun run generate -- --clean` to remove its previously generated package + manifest. Re-adding to `excludedSets` later restarts fresh.

## Recovering a "failed" set

After the validator, retry, stroke-fill (with per-icon fallback), duotone split (opacity + 2-color), paint-order drop, and subprocess bisect passes, **only 4 sets currently fail entirely**: `svg-spinners`, `streamline-kameleon-color`, `fluent-color`, `circle-flags`. Everything else builds to at least a partial Dart class with codepoint-stable entries.

Per-icon failure modes you may still see logged during a regen:

```
warn   "<prefix>": skipping bad glyph "<name>" (paint-order risk / validator / stroke-fill panic)
```

These are non-fatal — the icon is marked `deprecated: true` in the manifest (codepoint stays reserved for future Iconify fixes) and excluded from the Dart class + TTF. Coverage and audit reports surface them.

To attempt rescue of a fully-failed set:

1. Open `node_modules/@iconify/json/json/<prefix>.json` and inspect `icons.<bad-glyph>.body`.
2. Most failures are non-standard SVG path commands, gradients, or 3+ color paint-order bodies. See `tools/generator/src/svg_preprocess.ts` for the existing detectors:
   - Opacity-based duotone → handled.
   - Two distinct fills → handled (split into duotone primary/secondary).
   - 3+ fills or gradients → dropped at paint-order. Extending `trySplitTwoColorBody` to handle nested groups may rescue a few more icons.
   - Stroke-only / evenodd → handled via stroke-fill (pack-level + per-icon).
3. `bun run generate -- --set <prefix>` to verify after any pre-pass change.

If `oslllo-svg-fixer` panics the worker on a specific body, the parent bisects automatically — no manual intervention. The panic-skipped icon is logged as `"<prefix>": skipping bad glyph "<name>" (stroke-fill panic)`.

## Updating Bun / Flutter

- **Bun**: edit `tools/generator/package.json` if any deps need a major bump, then `bun install`.
- **Flutter**: bump `environment.flutter` in `packages/iconifyx_core/pubspec.yaml`. The repo requires Dart 3.3+ for extension types; bumping below 3.3 breaks `IconifyIconData`.

## Releasing to pub.dev

With ~206 per-set packages, publishing manually is impractical. Recommended approach:

1. **Always publish `iconifyx_core` first** (others depend on it).
2. **Auto-publish set packages in batches.** Wrap `dart pub publish` in a shell loop over `packages/iconifyx_*/`, skipping `_core` and the meta package. Two-factor / signing prompts can be batched in one terminal session.
3. **Meta package last** — it depends on every published set package.

Versioning: bump every set package's `version:` in lockstep on each release. The pipeline doesn't currently auto-bump versions — that's a future feature. For now manually `sed` across `packages/*/pubspec.yaml` before publishing.

Schema:
- **PATCH** — Iconify upstream brought new icons; no schema/codepoint changes for existing icons.
- **MINOR** — added a brand-new icon set (new `iconifyx_<prefix>` package); or new feature in `_core`.
- **MAJOR** — `IconifyIconData` shape changed, or codepoint stability was broken (avoid at all costs).

## Testing

```bash
cd tools/generator
bun test
```

Currently 47 tests across 4 files:
- `identifier.test.ts` — Dart identifier sanitization edge cases (reserved words, leading digits, collisions).
- `codepoint_allocator.test.ts` — preservation of existing codepoints, deprecation flagging, auto-split, determinism.
- `glyph_validator.test.ts` — element rejection list, coord-bound regex (the `|\.\d+` alternation is invariant — see CLAUDE.md §5c).
- `svg_preprocess.test.ts` — duotone split (opacity + two-color), paint-order detection, per-icon raster-trace predicate.

Add tests whenever you change any of those files. They are the highest-risk parts of the pipeline.

## Determinism check (recommended before pushing)

```bash
bun run generate
git diff > /tmp/run1.diff
bun run generate
git diff > /tmp/run2.diff
diff /tmp/run1.diff /tmp/run2.diff   # should be empty
```

If the second run produces a different diff, find the source of nondeterminism — usually a `Date.now()` or unordered map iteration leaking into output.

## Tree-shake + bundle-size regression check (before publishing a release)

```bash
cd test_apps/two_icon_test
rm -rf build .dart_tool pubspec.lock
fvm flutter pub get
fvm flutter build macos --release --tree-shake-icons
find build/macos -name "*.ttf" -path "*flutter_assets*" | xargs ls -la
```

Expected:
- Only `iconifyx_mdi/` and `iconifyx_lucide/` font files are present in the bundle. **No other set's fonts.** If you see others, the per-set-package isolation broke.
- `Lucide.ttf` ≈ 720 bytes.
- `Mdi_2.ttf` ≈ 664 bytes (the split that contains `home`).
- `Mdi.ttf`, `Mdi_3.ttf` ≈ source size (fonts without referenced icons; this is a Flutter limitation we cannot avoid).

## Common gotchas

- **`flutter pub get` complains about missing assets.** You probably ran the generator with a set that ended up empty (every glyph failed). The pipeline emits a font entry in `pubspec.yaml` but no TTF. Run `bun run generate -- --clean` to remove the orphan reference.
- **`dart analyze` warns about unused fields.** Generated Dart files declare hundreds of constants; many are unreferenced by definition. Add `// ignore: unused_field` if you're seeing this in code outside the generated tree.
- **Bundle size jumped after upgrading `@iconify/json`.** Iconify added a new huge set (Fluent or Material Symbols ships ~15k icons each). Check `git diff packages/iconifyx_<that_set>/assets/fonts/`. The set will auto-split into multiple TTFs.
- **Codepoint above 0xF8FF.** Should never happen — the allocator caps each font at 6000 entries and the PUA range goes up to 0xF8FF (6400 slots). If you see this in a manifest, the allocator broke.

## When something is on fire

1. **Rolling back generation:** `git checkout HEAD -- packages/ tools/generator/manifests/`. Manifests + generated outputs go back to last known good state; consumers keep their codepoints.
2. **Skipping a broken set fast:** add it to `excludedSets` in `config.yaml`, run `bun run generate -- --clean`, commit. Consumers lose access to that set but the rest of the packages continue to build.
3. **Pub.dev rejected an upload because of size:** unlikely now (per-set packages are small — biggest is `iconifyx_mdi` at ~4 MB). If a future set is huge, the auto-split keeps font sizes reasonable; Dart source is the larger contributor. Worst-case fix: split the offending set's Dart class file into multiple files alphabetically.
