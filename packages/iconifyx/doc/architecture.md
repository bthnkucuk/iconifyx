# iconifyx architecture

iconifyx ships every Iconify icon set as a tree-shake-friendly Flutter
package. The design choices behind that — the package layout, the way
`IconifyIconData` is declared, the single-TTF-per-pack font output — are
all in service of one promise:

> If you use **N** icons from **M** packs in a Flutter app, you ship the
> font bytes for **those N icons across those M packs and nothing else.**

This page walks through how that promise is kept and where it would
break if anyone touched the wrong knob.

## Tree-shake design: extension type over a record

`IconifyIconData` is defined as:

```dart
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  static const int kindSolo = 0;
  static const int kindHint = 1;
  static const int kindPaintOrder = 2;
  static const int kindMaskInternal = 3;

  const IconifyIconData.solo(IconData icon) : this((icon, null, kindSolo));
  const IconifyIconData.duo(
    IconData primary,
    IconData secondary, {
    int kind = kindHint,
  }) : this((primary, secondary, kind));

  IconData get primary => _layers.$1;
  IconData? get secondary => _layers.$2;
  int get kind => _layers.$3;
  bool get isDuotone => _layers.$2 != null;
}
```

That **extension type over a record** is not a stylistic choice — it is
load-bearing for `flutter build --tree-shake-icons`.

### Why a `class IconifyIconData { final IconData primary; ... }` would silently break things

Flutter's `--tree-shake-icons` flag turns on a compile-time pass called
**const_finder**. It walks the kernel of your app and, for every
`const IconData(...)` literal that is actually referenced, emits a
codepoint into a "keep list" that is then handed to `font-subset`. Any
codepoint **not** on the keep list is stripped out of every icon font in
the build.

The const_finder traverses three kinds of constants:

1. Top-level `const IconData(...)` literals.
2. Static `const` fields on classes annotated `@staticIconProvider`.
3. **Record fields** — including records inside extension type
   representations.

It does **not** look inside ordinary class constructors.
[flutter/flutter#63920](https://github.com/flutter/flutter/issues/63920)
documents the exact behaviour: a `final class Wrapper { final IconData
icon; const Wrapper(this.icon); }` hides the inner `IconData` from the
const_finder. `font_awesome_flutter` ships with broken tree-shake for
exactly this reason — the whole 1.4 MB-of-fonts payload lands in every
release build even if you only used five icons.

With the extension type the Dart kernel sees a const record, and the
const_finder reaches the inner `const IconData(...)` literals through
the record's positional fields. Tree-shake keeps working.

### Empirically verified

The repo's `test_apps/treeshake_regression/` (and the historical
`test_apps/two_icon_test/`) measure this every release:

| Pack | Pre-shake `Secondary.ttf` | Post-shake `Secondary.ttf` |
| --- | --- | --- |
| `iconifyx_ph` | 91 KB | **936 bytes** |
| `iconifyx_ic` | 156 KB | **716 bytes** |

The 9-icon `two_icon_test/` bundle includes 4 duotone icons. The
secondary fonts for Phosphor and Material's `ic` family subset down to
under 1 KB each. If anyone rewrites `IconifyIconData` as a class, those
numbers regress to "full font shipped".

### Don't change the wrapper without re-running the bundle gate

Changing the field layout, adding fields, swapping the record for a
class, or anything that touches the const_finder's view of the wrapper
**must** be paired with re-running `treeshake_regression`. The CI gate
fails any PR that pushes the bundle above 35 KB on the 10-pack × 5-icon
smoke test.

## Per-pack package layout

Each Iconify set ships as its own Dart package: `iconifyx_mdi`,
`iconifyx_lucide`, `iconifyx_ph`, … (with `-` → `_` for Dart package
naming, so `fa6-solid` → `iconifyx_fa6_solid`).

The `iconifyx` package itself is a meta package: it depends on every
per-set package and re-exports their libraries. That's a convenience —
if you don't mind bundling every font, you can write
`import 'package:iconifyx/iconifyx.dart';` and have everything.

For a real production app you **don't** depend on `iconifyx`. You
depend on the specific per-set packages you use:

```yaml
dependencies:
  iconifyx_core: ^0.1.0
  iconifyx_mdi:    ^0.1.0
  iconifyx_lucide: ^0.1.0
```

Then `flutter build --release` (which enables `--tree-shake-icons` by
default) bundles only `Mdi.ttf` (subset) and `Lucide.ttf` (subset). No
other fonts ship. The bundle-size measurement on the 10-pack × 5-icon
smoke test is **17.66 KB** of fonts on macOS release.

### Why not category groups?

An earlier version of this package family used 5 grouped packages
(`iconifyx_general`, `iconifyx_brands`, `iconifyx_emoji`, …). It saved
some duplication in `pubspec.yaml`, but every package contained tens of
fonts. Depending on `iconifyx_general` for a single MDI icon meant
shipping every font in the "general" group — tens of MB of unused fonts
per app.

The per-set layout costs a slightly longer `pubspec.yaml`, in return for
the only bundle-size contract that actually scales. We pay it once.

## Single TTF per pack (§32, cmap format 12)

`svgicons2svgfont` and `svg2ttf` only support **BMP-only** cmap format 4
(16-bit codepoints, U+0000–U+FFFF). The PUA range we use for icons
(U+E000–U+F8FF) gives us only 6,400 slots. Packs with more icons
(Material Design Icons, Tabler, Phosphor with synthesised weight
variants) used to auto-split into `Mdi.ttf` + `Mdi_2.ttf` + `Mdi_3.ttf`
mid-pipeline.

That split was correct for the font writer but **wrong for tree-shake**.
Each TTF was a separate font asset; `font-subset` ran against each TTF
independently. An app that referenced a single icon from `Mdi_2.ttf`
still shipped the full `Mdi.ttf` and `Mdi_3.ttf` as ungated assets —
because Flutter's tree-shake operates per-font-family and "the icon
isn't here" was indistinguishable from "the icon was tree-shaken".

§32 fixed this. The generator now runs a Python `fontTools` post-pass
(`tools/generator/src/font_merger.ts`) that takes every sibling group
and merges them into one TTF with:

- **cmap format 12** (32-bit Unicode codepoints).
- **BMP PUA `0xE000-0xF8FF`** for the first sibling's icons (codepoint
  stability preserved verbatim — your existing apps' codepoints don't
  shift).
- **Supplementary PUA `0xF0000-0x10FFFF`** for ex-sibling icons,
  remapped sequentially.

Each per-pack package now ships exactly **one** primary TTF (plus one
`<Family>Secondary.ttf` if the pack has duotone icons). `font-subset`
sees a single font per pack and subsets it correctly under
`--tree-shake-icons`.

Empirical drop: **12.1 MB → 2.5 KB** on a 3-pack test that hit the
auto-split path before §32. Supplementary PUA renders correctly on
macOS desktop release, Flutter web (CanvasKit) release, and iOS — see
`docs/RESEARCH_PLAN.md` §32 for the empirical Flutter render verdict.

## Determinism contract

Same Iconify JSON version + same iconifyx generator version =
**byte-identical** TTFs across machines and CI runs.

Three things make this work:

1. **`svg2ttf({ ts: 0 })`** in `font_builder.ts`. Without it, the TTF
   header writes a real Unix timestamp and every regen drifts.
2. **`canonicalize_ttf.py`** + a patched `svg2ttf` `Glyph._getBounds`
   (commit `b2b4b988`) that fixes Fontelico determinism (§16-A10) and
   glyph header bbox accuracy.
3. **Committed manifests** (`tools/generator/manifests/<prefix>.json`).
   These record every codepoint assignment ever made for a pack. The
   allocator preserves them verbatim, only ever appending new icons.
   Deleting a manifest re-runs allocation from scratch and shifts every
   codepoint, which breaks already-built consumer apps.

A regen-twice byte-diff audit (`DETERMINISM.md`) runs on every CI build
and surfaces any drift. The audit gate has been clean since §16-A10.

## See also

- [`doc/duotone.md`](duotone.md) — how the three duotone kinds work and
  why `IconifyIcon` composes them with a `CustomPaint` instead of a
  `Stack`.
- [`doc/flutter_3_44_iconData.md`](flutter_3_44_iconData.md) — why the
  extension type also isolates consumers from Flutter's upcoming
  `final class IconData` change.
- [`doc/pipeline.md`](pipeline.md) — what the generator actually does
  per pack, in order.
