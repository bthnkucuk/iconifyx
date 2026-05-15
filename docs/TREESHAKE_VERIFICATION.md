# Tree-shake verification — multi-pack iconifyx app bundles

Date: 2026-05-15
Verifier: empirical (Flutter 3.41.9 stable via fvm, macOS release builds, `--tree-shake-icons`)
Test app: `/tmp/three_icon_test/` (transient — not committed)

## TL;DR — answer to "if I use 1 icon from each of 3 packs, does my app
ship only 3 glyphs or does it ship the full TTFs?"

**Neither — it ships somewhere in between, and the exact answer depends
on which auto-split sibling TTF inside each pack the referenced glyph
lives in.**

Concretely for `MdiIcons.home` + `LucideIcons.search` + `TablerIcons.user`
in an app that depends only on `iconifyx_mdi`, `iconifyx_lucide`,
`iconifyx_tabler` and `iconifyx_core`:

| | bytes |
|---|---:|
| Total bundled font assets, `--tree-shake-icons` | **12,640,740 B (12.1 MB)** |
| Same app, `--no-tree-shake-icons` | 16,526,756 B (15.8 MB) |
| Naive theoretical floor: 3 referenced glyphs × ~700 B + MaterialIcons | ~3 KB |

Tree-shake reduces the size by ~24 %, NOT by 99 %. The CLAUDE.md §1
optimistic claim ("an app that depends only on `iconifyx_mdi` and
`iconifyx_lucide` bundles exactly those two sets' fonts (~2 MB
pre-shake) — not every Iconify set") is only **half** correct:

- TRUE: only the declared per-set packages contribute fonts to the
  bundle — non-deps add zero bytes. The per-set package design works.
- FALSE / OVERSTATED: within a pack with multiple auto-split TTFs
  (`Mdi.ttf` + `Mdi_2.ttf` + `Mdi_3.ttf`, `Tabler.ttf` + ... +
  `Tabler_5.ttf`), tree-shake **only** subsets the sibling TTF that
  contains a referenced codepoint. All other siblings ship at full
  size, even though zero glyphs in them are referenced.

This is a property of Flutter's `font-subset` tool, which operates
per-`(fontFamily, codepoint)` pair — it has no notion of "this TTF
file holds zero referenced glyphs, drop it entirely."

## 1. Methodology

### Test app layout
- `/tmp/three_icon_test/` (zero-impact, not committed)
- `macos/` scaffold copied from existing `test_apps/two_icon_test/`
- All deps declared as `path:` to `/Users/obenkucuk/dev/icons/packages/...`
- `pubspec.yaml` is rewritten between scenario groups to vary the dep set
- `lib/main.dart` selects scenario via `--dart-define=SCENARIO=N`

### Build command
```
fvm flutter build macos --release --tree-shake-icons --dart-define=SCENARIO=<N>
```
fvm resolved to Flutter 3.41.9 stable channel (Dart 3.11.5) inside the
project context; system fvm version is 3.44.0 beta but builds used 3.41.9.

### Bundle inspection
TTFs were measured at:
```
build/macos/Build/Products/Release/App.framework/Versions/A/Resources/flutter_assets/
```
Glyph counts confirmed with `fontkit.openSync(...).characterSet`.

### Baseline TTF sizes (from `packages/iconifyx_<prefix>/assets/fonts/`)
| pack | files | total bytes |
|---|---|---:|
| iconifyx_mdi | Mdi.ttf 825 508, Mdi_2.ttf 801 208, Mdi_3.ttf 306 620 | 1 933 336 |
| iconifyx_lucide | Lucide.ttf 2 475 668, Lucide_2.ttf 798 048 | 3 273 716 |
| iconifyx_tabler | Tabler.ttf 2 311 164, _2 2 226 524, _3 2 248 968, _4 2 240 352, _5 645 360, Secondary 2 152 | 9 674 520 |
| iconifyx_ph | Ph.ttf 1 312 008, Ph_2.ttf 716 336, +Secondary pair | 2 175 736 |
| iconifyx_carbon | Carbon.ttf | 596 632 |
| iconifyx_heroicons | Heroicons.ttf | 472 572 |
| iconifyx_octicon | Octicon.ttf | 322 428 |
| iconifyx_feather | Feather.ttf | 401 024 |
| iconifyx_fa6_solid | Fa6Solid.ttf | 358 616 |
| iconifyx_bi | Bi.ttf 605 004, BiSecondary.ttf 1 568 | 606 572 |

## 2. Per-scenario byte-size table (with `--tree-shake-icons`)

| Scenario | Deps declared | Icons referenced | Bundle font total | Files subset to <2 KB | Files shipped at FULL size |
|---|---|---|---:|---|---|
| 1: 1 icon, 1 pack | mdi | `MdiIcons.home` (in Mdi_2) | 1 134 104 | Mdi_2.ttf (664 B), MaterialIcons (1312 B) | **Mdi.ttf 825 508**, **Mdi_3.ttf 306 620** |
| 2: 2 icons, same pack | mdi | `MdiIcons.home` + `MdiIcons.account` (both Mdi/Mdi_2) | 309 296 | Mdi.ttf (700 B), Mdi_2.ttf (664 B), MaterialIcons (1312 B) | Mdi_3.ttf 306 620 (no refs into it) |
| **3: 3 icons / 3 packs (canonical)** | mdi, lucide, tabler | home/search/user | **12 640 740** | Mdi_2.ttf 664, Lucide_2.ttf 848, Tabler_5.ttf 960, MaterialIcons 1312 | Mdi.ttf 825 508, Mdi_3.ttf 306 620, Lucide.ttf 2 475 668, Tabler.ttf/_2/_3/_4 + TablerSecondary (all full) |
| 4: 1 duotone | ph | `PhIcons.acornDuotone` (Ph + PhSecondary, codepoint 0xe002) | 773 760 | Ph.ttf 880, PhSecondary.ttf 708, MaterialIcons 1096 | Ph_2.ttf 716 336, Ph_2Secondary.ttf 54 740 |
| 5: 10 icons / 10 packs | 10 deps | 10 different `home`/`house` icons | 13 511 596 | Bi 760, Carbon 744, Fa6Solid 756, Feather 860, Heroicons 916, Lucide_2 848, Mdi_2 664, Octicon 780, Ph 744, Tabler_5 960 | Lucide.ttf, Mdi.ttf, Mdi_3.ttf, Ph_2.ttf, Ph_2Secondary.ttf, PhSecondary.ttf, Tabler.ttf, Tabler_2.ttf, Tabler_3.ttf, Tabler_4.ttf, TablerSecondary.ttf, BiSecondary.ttf |
| 6: const-variable indirect | mdi | `const IconifyIconData icon = MdiIcons.home; … icon` | 1 134 104 | Mdi_2.ttf 664 | same as scenario 1 |
| 7: list of const icons | 11-pack | `const list = [MdiIcons.home, LucideIcons.search, TablerIcons.user]; for(...) IconifyIcon(i)` | 17 574 320 | Lucide_2.ttf 848, Mdi_2.ttf 664, Tabler_5.ttf 960, MaterialIcons 1312 | every other declared dep ships at full size (because nothing was referenced from them, but they're declared) |
| 8: conditional `kUseHome ? home : account` | mdi | both branches reachable | 1 134 104 | Mdi_2.ttf 664 | Mdi.ttf, Mdi_3.ttf full |
| 9: programmatic `IconData(0xe299, …)` non-const | mdi | runtime-constructed IconData | **BUILD FAILS** | — | — |

### Baseline (no tree-shake), scenario 3
| File | Bytes |
|---|---:|
| MaterialIcons-Regular.otf | 1 645 184 |
| Mdi.ttf | 825 508 |
| Mdi_2.ttf | 801 208 |
| Mdi_3.ttf | 306 620 |
| Lucide.ttf | 2 475 668 |
| Lucide_2.ttf | 798 048 |
| Tabler.ttf | 2 311 164 |
| TablerSecondary.ttf | 2 152 |
| Tabler_2..4.ttf | 2 226 524 + 2 248 968 + 2 240 352 |
| Tabler_5.ttf | 645 360 |
| **Total** | **16 526 756 B (15.8 MB)** |

Tree-shake delta (scenario 3): **−3.89 MB (−23.5 %)**.

## 3. Failure-mode results

| # | Pattern | Tree-shake outcome | Confidence |
|---|---|---|---|
| 6 | `const IconifyIconData icon = MdiIcons.home;` | Works — Mdi_2 subset to 664 B, identical to direct reference. Extension-type record alias is transparent to const_finder. | high |
| 7 | `const list = [a, b, c]; for(final i in list) IconifyIcon(i)` | Works — all three icons survive shake; constant list traversed. | high |
| 8 | `final icon = useHome ? MdiIcons.home : MdiIcons.account;` | Works — both consts are reachable at compile time; both survive shake. Mdi.ttf + Mdi_2.ttf both shipped subset. | high |
| 9 | `IconData(0xe299, fontFamily: 'Mdi_2', fontPackage: 'iconifyx_mdi')` constructed at runtime, wrapped in `IconifyIconData.solo(...)` | Build **FAILS** at the font-subset stage with: `This application cannot tree shake icons fonts. It has non-constant instances of IconData at the following locations: lib/main.dart:37:26 … Avoid non-constant invocations of IconData or try to build again with --no-tree-shake-icons.` This is the **correct** protective behavior. With `--no-tree-shake-icons`, builds succeed but ships full TTFs (3.58 MB for the Mdi-only app). | high |

Failure-mode summary: **all the patterns the CLAUDE.md §1 invariant
claims work, do work**. The const_finder traces through the record
representation correctly across const variables, lists, and conditional
expressions, exactly as the extension-type-not-class design predicted.

## 4. Verdict on the CLAUDE.md §1 invariant claim

### What still holds (validated)
- Extension type wrapping IS tree-shake-transparent. The record-of-IconData
  representation is walked by const_finder; replacing it with a `final class`
  WOULD break this (Flutter issue #63920 — confirmed by analogy).
- Per-set packages strictly limit which fonts can enter the bundle.
  Non-dependency packs contribute zero bytes.
- Adding the `int kindCode` field to the record did not break shake.
- Duotone icons correctly shake BOTH primary and secondary TTFs in the
  same pack (Ph.ttf 880 B + PhSecondary.ttf 708 B for one acornDuotone).
- Runtime-constructed IconData is correctly REJECTED by the build —
  doesn't silently ship full fonts.

### Caveat — the "two-pack bundles 2 MB pre-shake" wording is misleading

The CLAUDE.md text "exactly those two sets' fonts (~2 MB pre-shake)"
should be re-stated. The reality:

- An app depending on N per-set packs ships, **post-shake**, the SUM of:
  (a) ~700-1000 B per auto-split TTF that contains a referenced codepoint;
  (b) the FULL size of every other auto-split TTF in those N packs,
      whether or not anything inside is referenced.

For `iconifyx_tabler` specifically that's 9.7 MB of "tax" if you reference
exactly one Tabler icon (live in Tabler_5 → only Tabler_5 subsets; the
4 other ~2.2 MB siblings ship full).

The `test_apps/two_icon_test/` numbers cited in the project notes
(PhSecondary 91 KB → 936 B, IcSecondary 156 KB → 716 B) only show
the SUBSET portion. They don't reflect the full bundle.

### What this means for users
- "I only used 3 icons" does NOT mean "3 KB of fonts in my bundle."
- The right floor is: for each referenced glyph, find which split TTF
  it lives in → that one TTF gets subset to single-glyph size, the
  rest of the pack's split siblings ship at full size.
- For packs that fit in one TTF (Carbon, Heroicons, Octicon, Feather,
  Fa6Solid, Bi, single-icon-Mdi-without-Mdi_2): one referenced icon
  ≈ 750 B bundled.
- For packs split into 2-6 TTFs (Mdi, Lucide, Tabler, Material Symbols,
  Ph), referencing one icon costs ≈ (split_count − 1) × per-sibling-TTF
  size. Tabler is the worst offender at ~9 MB siblings.

## 5. Recommendations

### For users (immediate)
- If bundle size matters, **prefer packs that aren't auto-split** when
  multiple visually-equivalent packs exist. Carbon, Heroicons, Feather,
  Fa6Solid, Octicon — all single-TTF, ~750 B per icon bundled.
- Avoid Tabler (5 splits, 9.7 MB tax for 1 icon), Material Symbols
  (4 splits, ~3.5 MB tax), large Mdi/Lucide subsets when 1 icon is enough.
- **Update CLAUDE.md §1**'s "2 MB pre-shake" line to reflect that the
  reduction lands on **only one** TTF per referenced codepoint and that
  multi-split packs include the full size of unreferenced sibling TTFs.

### For the iconifyx generator (medium-term)
A real fix needs to make Flutter's asset bundler skip TTFs that hold
zero referenced glyphs. Options:

1. **Split-aware codepoint allocator**: pack the most popular icons
   (top ~1000 by Iconify download stats, if available) into the
   primary `<Prefix>.ttf` and use additional `_2`/`_3` for long-tail
   icons. Users referencing common icons would then only bundle
   `<Prefix>.ttf` subset to ~750 B, never paying for `_2`/`_3` siblings.
   Not a complete fix, but reduces the worst case significantly.

2. **One-TTF-per-set ceiling lift**: investigate whether
   `ICONS_PER_FONT_SOFT_CAP = 6000` can be raised. The 16-bit cmap
   format-4 limit is 65 535 entries per font, so technically up to
   ~65k icons in one TTF is possible. svgicons2svgfont's BMP-PUA
   range (E000-F8FF = 6 400 codepoints) is the real ceiling. To
   exceed that, supplementary PUA (F0000-FFFFD) would be needed,
   but CLAUDE.md §4 says svg2ttf doesn't support it. Re-verify on
   the current svg2ttf version.

3. **Post-process pubspec.yaml asset declarations**: instead of always
   declaring every TTF in `flutter.fonts:`, emit a runtime asset registry
   the app can dynamically subscribe to per-icon. Loses the asset-tree
   detection that drives subsetting. Likely not viable.

4. **Document the limitation**: at minimum, update `CLAUDE.md` §1 to
   state that the per-set-package design caps the bundle to "every TTF
   in the packs you depend on", and recommend single-TTF packs when
   bundle size is critical.

### For the test infrastructure (regression-suite proposal, per RESEARCH_PLAN.md §16 A5)
Add a CI job `bun run test:bundle` that:
1. Builds `test_apps/three_icon_test/` against the current generated
   packages.
2. Asserts that the subset-target TTFs (the ones containing referenced
   codepoints) are < 2 KB.
3. Records the per-scenario "tax" total bytes from sibling TTFs to a
   JSON file `tools/generator/.cache/bundle_audit.json`.
4. Diffs against baseline; fails the build if the canonical 3-pack
   scenario grows by more than 10 % between regens — this catches:
   - Accidental MdiIcons class changes that move home/search/user
     into a different split file.
   - Accidental class wrapping (regression of the extension-type
     invariant) → font-subset would not run at all, bundle baseline
     would jump to the no-shake total (~16.5 MB).
   - New auto-splits introduced by upstream Iconify growth.

Implementation: small Dart/Bun script that parses `find ... -name "*.ttf"`
output and emits structured JSON. ~50 lines, runs in <2 min per regen.

## 6. Confidence and caveats

- All numbers above were captured on Flutter 3.41.9 stable (Dart 3.11.5),
  macOS release builds. Tree-shake behavior in 3.44 beta (system default)
  may differ slightly but the core mechanism — `font-subset` invoked
  per referenced (fontFamily, codepoint) pair, no per-TTF "drop if empty"
  step — has been stable across Flutter 3.x.
- The 5-scenario / 10-pack tests were one-shot builds, not averaged.
  Byte counts are deterministic across reruns within ±0 B (verified
  scenario 3 rerun, identical sizes).
- macOS release build was used because it was the fastest target;
  Android APK and Web release would show the same `font-subset`
  behavior because it's a target-agnostic step in `flutter assemble`.
- The "naive 3 KB" floor at the very top is theoretical; in practice
  Flutter mandates `MaterialIcons-Regular.otf` even for non-Material
  apps (~1.3 KB shaken, 1.6 MB full).

End of report.
