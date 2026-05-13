# Architecture

Why each major design decision was made, and what alternatives were considered.

## Why one package per Iconify set?

**Original design (rejected 2026-05-13):** 5 category-grouped sub-packages — `iconifyx_general` (Material, Lucide, Tabler, …), `_brands`, `_emoji`, `_flags`, `_misc`. This was clean conceptually but had a fatal bundle-size problem: an app that imports `iconifyx_general` to use one icon pulls in **every font** declared in that sub-package's pubspec (~50 MB). Flutter's tree-shaker only subsets fonts containing referenced icons; fonts with zero references ship at source size.

The user's actual use case: "if my app uses two icons, my bundle shouldn't grow by 80 MB."

**Current design:** one Dart package per Iconify set. An app that uses `MdiIcons.home` and `LucideIcons.house` declares exactly two icon-package deps; only those two sets' fonts get bundled. Total added size for two icons: **~1.1 MB** (the unused split fonts within the mdi package), down from 50+ MB.

**Trade-offs:**
- ✅ Bundle scales with what you use, not what's available.
- ✅ Each set's release cadence is independent; Iconify pushes new icons → only the affected `iconifyx_<prefix>` package version bumps.
- ✅ Smaller packages parse faster in `flutter pub get` and `dart analyze`.
- ❌ ~206 packages to publish to pub.dev. Mitigated by scripted bulk publish.
- ❌ The meta package's pubspec lists 200+ deps. Verbose but auto-generated.
- ❌ The example app pubspec also lists every set as a direct dep (transitive deps don't bundle Flutter font assets reliably). Auto-generated.

Alternatives considered:
- **One mega-package with optional Dart-side imports.** Wouldn't help: Flutter bundles assets declared in `pubspec.yaml`'s `fonts:` section regardless of whether the code imports them.
- **Two-level grouping (family→set, e.g. `iconifyx_fontawesome` containing solid/regular/brands as classes).** Possible but adds artificial coupling. Rejected.
- **Build-time pre-filtering with a configurator (font_awesome_flutter style).** Wouldn't compose well with multiple icon families and feels brittle.

## Why an extension type wrapper, not a class?

The user's original prompt showed a `final class FaIconData { final IconData data; … }` pattern (matching `font_awesome_flutter`'s current API surface). We almost adopted it directly, then discovered the trap:

Flutter's `--tree-shake-icons` build flag works by running `const_finder` over the compiled kernel and collecting every top-level `const IconData(...)` invocation. The collected codepoints then drive TTF subsetting. **Wrapper classes break this** — when a `const FaIconData(const IconData(0xe000, …))` appears in the kernel, `const_finder` does not recurse into the wrapper's representation and the inner `IconData` is missed. Confirmed by Flutter issues [#63920](https://github.com/flutter/flutter/issues/63920) (open, P1, "icon font tree shaking does not work with IconData subclasses") and [#181342](https://github.com/flutter/flutter/issues/181342) (note that `font_awesome_flutter` ships unshaken precisely because of this — they have a pre-build configurator script to let users strip styles manually).

A Dart 3.3 **extension type** sidesteps the problem entirely:

```dart
extension type const IconifyIconData(IconData data) {
  // …getters…
}
```

Extension types are zero-cost wrappers. The compile output is the representation — there is no class allocation, no method dispatch indirection, and crucially **no separate kernel node**. When you write:

```dart
static const IconifyIconData home = IconifyIconData(IconData(0xe000, …));
```

the kernel sees `static const IconData home = IconData(0xe000, …)` after extension type erasure. `const_finder` walks the kernel, finds the const IconData, and subsetting proceeds normally.

**Trade-offs:**
- ✅ Tree-shake works (verified empirically — two-icon app shrinks both referenced fonts to 664/720 bytes; see `test_apps/two_icon_test/`).
- ✅ Type-safe: `Icon(myIconifyIcon.data)` is the only legal use; passing a foreign `IconData` to widgets that expect `IconifyIconData` is a compile error.
- ✅ Future-proof against the upcoming `final class IconData` migration ([#181342](https://github.com/flutter/flutter/issues/181342)) — extension types don't extend/implement, they wrap, so the `final` constraint is irrelevant.
- ❌ Requires Dart 3.3+ (Flutter 3.19+). Acceptable: anyone targeting current Flutter has it.

Alternatives rejected:
- **Plain `static const IconData`** (no wrapper). Simplest and safest, but loses the type marker the user wanted.
- **Subclass `IconData`**. Will break once `IconData` becomes a `final class`.
- **A custom widget `IconifyIcon`** instead of a wrapper data class. Doesn't compose with existing `Icon` / `IconButton` / `Tab` APIs that take `IconData`. Extension type wraps the data, leaving the widget side alone.

## Why one TTF per set (and auto-split when needed)?

A single 300,000-glyph font would need a 16-bit codepoint per glyph — BMP PUA only has 6,400 slots, far from enough. The choices were:

1. **One font per set** (chosen). Each set lives in its own font family, codepoints reset to 0xE000 per font, no global ordering. Sets that exceed 6,000 live icons auto-split (`Mdi.ttf` + `Mdi_2.ttf` + `Mdi_3.ttf`). Total: ~250 TTFs across all sets.
2. **Supplementary PUA (0xF0000+).** Allows a single font for huge sets. Rejected because `svgicons2svgfont` is BMP-only (its cmap-format-4 generator caps at 16-bit), and Flutter's text rendering through `IconData` is empirically fragile beyond BMP.
3. **Glyph aliasing (one font, multiple semantic icons share codepoints).** Breaks tree-shaking because every codepoint subset would pull in every alias's geometry. Rejected.

The combination of "one set per Dart package" + "one TTF per set (auto-split for huge sets)" gives the best bundle scaling.

## Why pure manifests (not derived from JSON each run)?

Iconify's per-set JSON does not contain codepoints. We assign them. Once assigned, the assignment must be stable forever — consumers' built apps embed integer codepoints directly into the kernel, and changing them silently renders the wrong icon (or no icon).

Manifests at `tools/generator/manifests/*.json` are the source of truth. The pipeline reads them before assignment; existing icons keep their codepoint, new icons are appended. The allocator never reassigns. **Committing these JSON files is mandatory** — without them, every fresh checkout would shuffle codepoints.

A deprecated icon (removed upstream) is kept in the manifest with `deprecated: true`. Its codepoint stays reserved; if the icon reappears later, it picks up the same codepoint.

## Why Bun for the generator?

The user specified pnpm or Bun explicitly. Between them:

- **Bun** has TypeScript native (no `tsx`/`ts-node` glue), faster `bun install` for the dozen-deep dep tree of `@iconify/tools` + `svgicons2svgfont`, and a single binary in the dev env. Workspace support is good enough for our single-workspace generator.
- **pnpm** has a wider ecosystem of plug-ins. Not needed here.

We use Bun for the generator; Flutter packages still use the standard Dart / Flutter toolchain (`fvm`).

## Why `svgicons2svgfont` + `svg2ttf` instead of `svgtofont` or `fantasticon`?

- `svgtofont` is a wrapper that also generates CSS, HTML demo pages, and React/Vue types. Opinionated; we only want the TTF.
- `fantasticon` depends on `fontforge` natively; CI needs to install it; slower to set up.
- `svgicons2svgfont` + `svg2ttf` is the underlying duo both wrappers use. Calling them directly:
  - Removes one layer of abstraction (fewer transitive deps).
  - Lets us pass `ts: 0` to `svg2ttf` for deterministic output.
  - Lets us hand-feed glyph metadata (icon name + codepoint pairs) without filesystem detours.

## Why `ts: 0` for `svg2ttf`?

Without it, the resulting TTF embeds a `Date.now()` timestamp in the `head` table. Every run produces a binary-different TTF for the same input. CI diffs blow up; bisecting becomes a nightmare. `ts: 0` pins the timestamp; identical input now produces identical output.

## Why does the example app use a separate `main_minimal.dart`?

The tree-shake test needs a build that references **exactly one or two** icons, so we can measure font subsetting against a known target. The full browser at `main.dart` references every icon (it lists all of them in a grid) and therefore can't shrink fonts at all.

Since the refactor to per-set packages, the more rigorous bundle-size check moved to `test_apps/two_icon_test/` — a standalone Flutter app that declares only two icon-package deps and renders two icons, proving both the tree-shake behavior and the per-set-package isolation (no other set's fonts in the bundle).

## What we deliberately did NOT do

- **Pre-process SVGs with svgo for every set.** Would catch the 19 currently-failing sets but adds ~30s to every full run. Future work.
- **Convert stroke-only icons to filled paths.** `oslllo-svg-fixer` would handle Tabler / Lucide / Phosphor-thin properly, but those sets render acceptably as-is (svgicons2svgfont fills inside paths). If users complain about hollow icons, this is the fix.
- **Color emoji fonts.** Flutter renders monochrome icon fonts; color emoji needs COLR/CPAL tables or image rendering. We ship Twemoji et al. as monochrome with the user's acknowledgment that they look acceptable but not native.
- **Sub-package grouping by Iconify category.** Initially attempted; bundle-size killed it. The lesson: only group when something forces it (e.g. publishing constraints) and never at the cost of bundle scaling.

## Open known issues

- 19 of 225 sets fail to build (SVG path parse errors). Documented in `CLAUDE.md`. Workaround: add svgo preprocessing.
- Flutter Web tree-shake is unreliable ([flutter#154986](https://github.com/flutter/flutter/issues/154986)). Document; per-set-package design partially mitigates because web bundles only ship assets from declared deps.
- Auto-splitting of huge sets (mdi, fluent, material-symbols) means within one set, fonts without referenced icons still ship at full size (Flutter limitation). Acceptable trade-off given the per-set isolation gain.
