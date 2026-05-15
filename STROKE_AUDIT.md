# Stroke / evenodd raster-fill audit

Generated 2026-05-15. For each set we sample the first 25 icons and measure two ratios: **stroke** (icons with `stroke=` and no fill) and **evenodd** (icons that rely on `fill-rule="evenodd"` for internal cutouts). Both cases need the rasterize+Potrace pre-pass (`oslllo-svg-fixer`) — otherwise stroke icons render as solid discs and evenodd icons lose their holes (the `car` / `bug` gravity-ui glyphs we initially shipped as blobs).

- **Sets receiving raster pre-pass:** 111 / 225
- **Of those, auto-detected:** 85
- **Sets with ≥20% raster signal that were NOT processed:** 6
- **Sets containing duo-tone icons:** 59 (15,147 icons across them)
- **Sets with ≥20% paint-order risk (multi-fill bodies that would render as monochrome blobs):** 12
- **Icons proactively dropped this run for paint-order risk:** 17,176

If any "missed" sets render incorrectly in the example app, add their prefix to `strokeFillSets` in `tools/generator/config.yaml`.

## Paint-order risk (multi-fill bodies)

Iconify bodies that paint two or more concrete colors (e.g. a light letterform on a dark background rect, like `logos:adobe-after-effects`) cannot be losslessly translated to a monochrome TTF — the foreground shape collapses into the background fill region (same `currentColor`, non-zero winding) and the glyph renders as a featureless filled blob. Rasterize-trace does NOT fix this (Potrace traces the combined silhouette as one filled region). The pipeline now drops such icons at validation so they never appear in the Dart class. Counts below are after duotone-split + stroke-fill, so packs neutralised by the raster pre-pass report 0%.

| Set | Prefix | Paint-order % | Dropped | Raster applied |
|---|---|---:|---:|:---:|
| Circle Flags | `circle-flags` | 100% | 732 | — |
| Kameleon color icons | `streamline-kameleon-color` | 88% | 334 | — |
| Emoji One (Colored) | `emojione` | 84% | 1,683 | — |
| UnJS Logos | `unjs` | 76% | 44 | — |
| Twitter Emoji | `twemoji` | 76% | 3,861 | — |
| Fluent Emoji Flat | `fluent-emoji-flat` | 72% | 2,342 | — |
| Firefox OS Emoji | `fxemoji` | 72% | 753 | — |
| Emoji One (v1) | `emojione-v1` | 68% | 951 | — |
| Flat Color Icons | `flat-color-icons` | 60% | 208 | — |
| Noto Emoji (v1) | `noto-v1` | 56% | 1,490 | — |
| Noto Emoji | `noto` | 48% | 3,419 | — |
| VSCode Icons | `vscode-icons` | 24% | 556 | — |
| SVG Logos | `logos` | 8% | 636 | — |
| Material Icon Theme | `material-icon-theme` | 4% | 135 | — |
| Fluent UI System Icons | `fluent` | 0% | 5 | — |
| Fluent UI System Color Icons | `fluent-color` | 0% | 27 | — |

## Duotone sets (manual visual check recommended)

Open these sets in the example app and verify the primary / secondary layers of a few icons sit in their expected positions (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left). Sorted by duotone-icon count.

| Set | Prefix | Duotone icons |
|---|---|---:|
| Solar | `solar` | 2,412 |
| Phosphor | `ph` | 1,528 |
| Google Material Icons | `ic` | 1,351 |
| Freehand color icons | `streamline-freehand-color` | 971 |
| Streamline color | `streamline-color` | 810 |
| Pepicons Print | `pepicons-print` | 703 |
| Twitter Emoji | `twemoji` | 637 |
| Material Icon Theme | `material-icon-theme` | 541 |
| Fluent Emoji Flat | `fluent-emoji-flat` | 495 |
| Sharp color icons | `streamline-sharp-color` | 437 |
| Plump color icons | `streamline-plump-color` | 435 |
| Flex color icons | `streamline-flex-color` | 433 |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 379 |
| SVG Logos | `logos` | 372 |
| Streamline Emojis | `streamline-emojis` | 364 |
| VSCode Icons | `vscode-icons` | 328 |
| Glyphs Poly | `glyphs-poly` | 293 |
| Emoji One (Colored) | `emojione` | 271 |
| Noto Emoji (v1) | `noto-v1` | 242 |
| IconaMoon | `iconamoon` | 234 |
| Web3 Icons Branded | `token-branded` | 199 |
| Emoji One (v1) | `emojione-v1` | 197 |
| Stash Icons | `stash` | 193 |
| Unicons Monochrome | `uim` | 188 |
| Devicon | `devicon` | 177 |
| Firefox OS Emoji | `fxemoji` | 128 |
| Pepicons | `pepicons` | 125 |
| Skill Icons | `skill-icons` | 120 |
| Duoicons | `duo-icons` | 91 |
| IconPark | `icon-park` | 80 |
| Flat Color Icons | `flat-color-icons` | 61 |
| Noto Emoji | `noto` | 58 |
| Flag Icons | `flag` | 45 |
| Qlementine Icons | `qlementine-icons` | 41 |
| Google Cloud Icons | `gcp` | 40 |
| CoreUI Flags | `cif` | 35 |
| NRK Core Icons | `nrk` | 23 |
| Flat UI Icons | `flat-ui` | 19 |
| Flagpack | `flagpack` | 16 |
| Cryptocurrency Icons | `cryptocurrency` | 15 |
| css.gg | `gg` | 11 |
| Stickies color icons | `streamline-stickies-color` | 5 |
| Web3 Icons | `token` | 5 |
| Tabler Icons | `tabler` | 4 |
| WordPress Icons | `wordpress` | 4 |
| Radix Icons | `radix-icons` | 4 |
| Kameleon color icons | `streamline-kameleon-color` | 3 |
| Huge Icons | `hugeicons` | 3 |
| Arcticons | `arcticons` | 3 |
| Grommet Icons | `grommet-icons` | 3 |
| Evil Icons | `ei` | 3 |
| Ultimate color icons | `streamline-ultimate-color` | 2 |
| MingCute Icon | `mingcute` | 2 |
| Pixelarticons | `pixelarticons` | 2 |
| Clarity | `clarity` | 2 |
| Devicon Plain | `devicon-plain` | 1 |
| Bitcoin Icons | `bitcoin-icons` | 1 |
| Fluent Emoji | `fluent-emoji` | 1 |
| TDesign Icons | `tdesign` | 1 |

## Per-icon raster-trace fixes

Sets where the pack-level sample was below the stroke/evenodd threshold but individual icons still needed rasterize-trace. Without per-icon detection, `oui:check-in-circle-empty` shipped as a solid disc and `oui:chat-left` as a filled speech bubble (the `oui` pack sample showed only 16% evenodd, below the 20% pack threshold).

- **Icons rasterize-traced via per-icon path this run:** 4,610

| Set | Prefix | Icons traced | Stroke % | Evenodd % |
|---|---|---:|---:|---:|
| IonIcons | `ion` | 559 | 48% | 0% |
| Famicons | `famicons` | 528 | 48% | 0% |
| Bootstrap Icons | `bi` | 395 | 0% | 0% |
| Noto Emoji | `noto` | 376 | 12% | 0% |
| Stash Icons | `stash` | 358 | 0% | 12% |
| Garden SVG Icons | `garden` | 348 | 28% | 0% |
| Noto Emoji (v1) | `noto-v1` | 276 | 24% | 0% |
| Emoji One (v1) | `emojione-v1` | 260 | 0% | 8% |
| VSCode Icons | `vscode-icons` | 189 | 8% | 12% |
| Fluent Emoji Flat | `fluent-emoji-flat` | 185 | 0% | 4% |
| Fluent UI System Color Icons | `fluent-color` | 179 | 0% | 0% |
| OpenSearch UI | `oui` | 112 | 0% | 16% |
| Codicons | `codicon` | 99 | 0% | 8% |
| Fluent Emoji High Contrast | `fluent-emoji-high-contrast` | 97 | 0% | 0% |
| Google Material Icons | `ic` | 78 | 0% | 0% |
| Ant Design Icons | `ant-design` | 71 | 0% | 16% |
| Framework7 Icons | `f7` | 64 | 0% | 0% |
| Kameleon color icons | `streamline-kameleon-color` | 63 | 0% | 12% |
| Devicon Plain | `devicon-plain` | 57 | 0% | 4% |
| SVG Logos | `logos` | 50 | 0% | 0% |
| Material Icon Theme | `material-icon-theme` | 35 | 8% | 8% |
| Twitter Emoji | `twemoji` | 35 | 0% | 0% |
| BPMN | `bpmn` | 27 | 28% | 0% |
| Entypo+ | `entypo` | 19 | 0% | 0% |
| Emoji One (Monotone) | `emojione-monotone` | 16 | 0% | 4% |
| UnJS Logos | `unjs` | 13 | 24% | 0% |
| Carbon | `carbon` | 11 | 0% | 0% |
| Emoji One (Colored) | `emojione` | 11 | 0% | 0% |
| TopCoat Icons | `topcoat` | 10 | 0% | 16% |
| Foundation | `foundation` | 10 | 0% | 4% |
| Nimbus | `nimbus` | 7 | 0% | 4% |
| Custom Brand Icons | `cbi` | 7 | 0% | 0% |
| Flat Color Icons | `flat-color-icons` | 6 | 8% | 0% |
| Mono Icons | `mi` | 6 | 0% | 4% |
| Mono Icons | `mono-icons` | 6 | 0% | 4% |
| Gridicons | `gridicons` | 5 | 0% | 0% |
| Zondicons | `zondicons` | 5 | 0% | 0% |
| Circle Flags | `circle-flags` | 5 | 0% | 0% |
| Dashicons | `dashicons` | 5 | 0% | 0% |
| Evil Icons | `ei` | 4 | 0% | 0% |
| Academicons | `academicons` | 3 | 0% | 0% |
| Icons8 Windows 8 Icons | `wpf` | 2 | 0% | 4% |
| OOUI | `ooui` | 2 | 0% | 0% |
| Boxicons Brands | `bxl` | 2 | 0% | 0% |
| Line Awesome | `la` | 2 | 0% | 0% |
| BoxIcons v2 | `bx` | 2 | 0% | 0% |
| EOS Icons | `eos-icons` | 1 | 0% | 4% |
| Unicons | `uil` | 1 | 0% | 0% |
| Unicons Monochrome | `uim` | 1 | 0% | 0% |
| Unicons Thin Line | `uit` | 1 | 0% | 0% |
| SVG Spinners | `svg-spinners` | 1 | 0% | 0% |
| Clarity | `clarity` | 1 | 0% | 0% |
| Entypo+ Social | `entypo-social` | 1 | 0% | 0% |
| Firefox OS Emoji | `fxemoji` | 1 | 0% | 0% |
| Map Icons | `map` | 1 | 0% | 0% |
| Elusive Icons | `el` | 1 | 0% | 0% |

## All sets

| Set | Prefix | Stroke % | Evenodd % | Paint-order % | Per-icon | Duotone | Applied | Source |
|---|---|---:|---:|---:|---:|---:|:---:|---|
| IonIcons | `ion` | 48% | 0% | 0% | 559 | — | — | none |
| Famicons | `famicons` | 48% | 0% | 0% | 528 | — | — | none |
| Garden SVG Icons | `garden` | 28% | 0% | 0% | 348 | — | — | none |
| BPMN | `bpmn` | 28% | 0% | 0% | 27 | — | — | none |
| UnJS Logos | `unjs` | 24% | 0% | 76% | 13 | — | — | none |
| Noto Emoji (v1) | `noto-v1` | 24% | 0% | 56% | 276 | 242 | — | none |
| VSCode Icons | `vscode-icons` | 8% | 12% | 24% | 189 | 328 | — | none |
| Ant Design Icons | `ant-design` | 0% | 16% | 0% | 71 | — | — | none |
| OpenSearch UI | `oui` | 0% | 16% | 0% | 112 | — | — | none |
| Material Icon Theme | `material-icon-theme` | 8% | 8% | 4% | 35 | 541 | — | none |
| TopCoat Icons | `topcoat` | 0% | 16% | 0% | 10 | — | — | none |
| Stash Icons | `stash` | 0% | 12% | 0% | 358 | 193 | — | none |
| Kameleon color icons | `streamline-kameleon-color` | 0% | 12% | 88% | 63 | 3 | — | none |
| Noto Emoji | `noto` | 12% | 0% | 48% | 376 | 58 | — | none |
| Codicons | `codicon` | 0% | 8% | 0% | 99 | — | — | none |
| Emoji One (v1) | `emojione-v1` | 0% | 8% | 68% | 260 | 197 | — | none |
| Flat Color Icons | `flat-color-icons` | 8% | 0% | 60% | 6 | 61 | — | none |
| EOS Icons | `eos-icons` | 0% | 4% | 0% | 1 | — | — | none |
| Mono Icons | `mi` | 0% | 4% | 0% | 6 | — | — | none |
| Nimbus | `nimbus` | 0% | 4% | 0% | 7 | — | — | none |
| Devicon Plain | `devicon-plain` | 0% | 4% | 0% | 57 | 1 | — | none |
| Fluent Emoji Flat | `fluent-emoji-flat` | 0% | 4% | 72% | 185 | 495 | — | none |
| Emoji One (Monotone) | `emojione-monotone` | 0% | 4% | 0% | 16 | — | — | none |
| Foundation | `foundation` | 0% | 4% | 0% | 10 | — | — | none |
| Icons8 Windows 8 Icons | `wpf` | 0% | 4% | 0% | 2 | — | — | none |
| Mono Icons | `mono-icons` | 0% | 4% | 0% | 6 | — | — | none |
| Material Line Icons | `line-md` | 100% | 0% | 0% | — | — | ✓ | auto |
| IconaMoon | `iconamoon` | 80% | 20% | 0% | — | 234 | ✓ | explicit |
| Iconoir | `iconoir` | 76% | 24% | 0% | — | — | ✓ | explicit |
| Lucide | `lucide` | 100% | 0% | 0% | — | — | ✓ | explicit |
| Lucide Lab | `lucide-lab` | 100% | 0% | 0% | — | — | ✓ | explicit |
| ProIcons | `proicons` | 100% | 4% | 0% | — | — | ✓ | auto |
| Meteor Icons | `meteor-icons` | 100% | 0% | 0% | — | — | ✓ | explicit |
| Humbleicons | `humbleicons` | 100% | 0% | 0% | — | — | ✓ | explicit |
| WeUI Icon | `weui` | 0% | 100% | 0% | — | — | ✓ | auto |
| Huge Icons | `hugeicons` | 100% | 0% | 0% | — | 3 | ✓ | explicit |
| Lets Icons | `lets-icons` | 84% | 16% | 0% | — | — | ✓ | auto |
| Plump free icons | `streamline-plump` | 36% | 64% | 0% | — | — | ✓ | auto |
| Sharp free icons | `streamline-sharp` | 36% | 64% | 0% | — | — | ✓ | auto |
| IconPark Outline | `icon-park-outline` | 100% | 0% | 0% | — | — | ✓ | auto |
| Cyber free icons | `streamline-cyber` | 100% | 0% | 0% | — | — | ✓ | auto |
| Guidance | `guidance` | 100% | 0% | 0% | — | — | ✓ | explicit |
| Lsicon | `lsicon` | 48% | 52% | 0% | — | — | ✓ | auto |
| Charm Icons | `charm` | 100% | 0% | 0% | — | — | ✓ | auto |
| Bytesize Icons | `bytesize` | 100% | 0% | 0% | — | — | ✓ | auto |
| Streamline Block | `streamline-block` | 0% | 100% | 0% | — | — | ✓ | auto |
| System UIcons | `system-uicons` | 100% | 40% | 0% | — | — | ✓ | auto |
| CodeX Icons | `codex` | 100% | 0% | 0% | — | — | ✓ | auto |
| Streamline | `streamline` | 36% | 64% | 0% | — | — | ✓ | auto |
| Flex free icons | `streamline-flex` | 36% | 64% | 0% | — | — | ✓ | auto |
| Flex color icons | `streamline-flex-color` | 52% | 60% | 0% | — | 433 | ✓ | auto |
| Sharp color icons | `streamline-sharp-color` | 52% | 48% | 0% | — | 437 | ✓ | auto |
| Cyber color icons | `streamline-cyber-color` | 100% | 0% | 0% | — | — | ✓ | auto |
| Marketeq | `marketeq` | 100% | 0% | 0% | — | — | ✓ | auto |
| Catppuccin Icons | `catppuccin` | 100% | 24% | 0% | — | — | ✓ | auto |
| Logos free icons | `streamline-logos` | 36% | 64% | 0% | — | — | ✓ | auto |
| Arcticons | `arcticons` | 100% | 0% | 0% | — | 3 | ✓ | auto |
| OpenMoji | `openmoji` | 100% | 0% | 0% | — | — | ✓ | auto |
| Streamline Emojis | `streamline-emojis` | 100% | 0% | 0% | — | 364 | ✓ | auto |
| FontAudio | `fad` | 0% | 100% | 0% | — | — | ✓ | auto |
| Health Icons | `healthicons` | 0% | 100% | 0% | — | — | ✓ | auto |
| Covid Icons | `covid` | 100% | 0% | 0% | — | — | ✓ | auto |
| Gala Icons | `gala` | 100% | 0% | 0% | — | — | ✓ | auto |
| HeroIcons v1 Outline | `heroicons-outline` | 100% | 0% | 0% | — | — | ✓ | explicit |
| SmartIcons Glyph | `si-glyph` | 0% | 100% | 0% | — | — | ✓ | auto |
| Feather Icons | `feather` | 100% | 0% | 0% | — | — | ✓ | explicit |
| IconPark Solid | `icon-park-solid` | 96% | 0% | 0% | — | — | ✓ | auto |
| IconPark TwoTone | `icon-park-twotone` | 96% | 0% | 0% | — | — | ✓ | auto |
| Quill Icons | `quill` | 92% | 8% | 0% | — | — | ✓ | auto |
| Siemens Industrial Experience Icons | `ix` | 0% | 96% | 0% | — | — | ✓ | auto |
| Ultimate color icons | `streamline-ultimate-color` | 96% | 4% | 0% | — | 2 | ✓ | auto |
| Stickies color icons | `streamline-stickies-color` | 96% | 0% | 0% | — | 5 | ✓ | auto |
| IconPark | `icon-park` | 96% | 0% | 0% | — | 80 | ✓ | auto |
| Majesticons | `majesticons` | 76% | 16% | 0% | — | — | ✓ | auto |
| Basil | `basil` | 0% | 92% | 0% | — | — | ✓ | explicit |
| Akar Icons | `akar-icons` | 88% | 4% | 0% | — | — | ✓ | explicit |
| Bitcoin Icons | `bitcoin-icons` | 48% | 44% | 0% | — | 1 | ✓ | auto |
| Cuida Icons | `cuida` | 0% | 92% | 0% | — | — | ✓ | auto |
| Freehand free icons | `streamline-freehand` | 0% | 92% | 0% | — | — | ✓ | auto |
| Freehand color icons | `streamline-freehand-color` | 0% | 92% | 0% | — | 971 | ✓ | auto |
| Streamline color | `streamline-color` | 52% | 44% | 0% | — | 810 | ✓ | auto |
| Flagpack | `flagpack` | 24% | 92% | 0% | — | 16 | ✓ | auto |
| Grommet Icons | `grommet-icons` | 68% | 24% | 0% | — | 3 | ✓ | auto |
| Solar | `solar` | 48% | 40% | 0% | — | 2,412 | ✓ | explicit |
| Sargam Icons | `si` | 68% | 24% | 0% | — | — | ✓ | auto |
| Feather Icon | `fe` | 0% | 88% | 0% | — | — | ✓ | auto |
| Gravity UI Icons | `gravity-ui` | 0% | 88% | 0% | — | — | ✓ | auto |
| Glyphs | `glyphs` | 68% | 24% | 0% | — | — | ✓ | auto |
| Tabler Icons | `tabler` | 84% | 0% | 0% | — | 4 | ✓ | explicit |
| Flowbite Icons | `flowbite` | 68% | 16% | 0% | — | — | ✓ | auto |
| coolicons | `ci` | 84% | 0% | 0% | — | — | ✓ | auto |
| Gitlab SVGs | `pajamas` | 0% | 84% | 0% | — | — | ✓ | auto |
| Plump color icons | `streamline-plump-color` | 52% | 44% | 0% | — | 435 | ✓ | auto |
| Fluent Emoji | `fluent-emoji` | 68% | 40% | 0% | — | 1 | ✓ | auto |
| Glyphs Poly | `glyphs-poly` | 72% | 32% | 0% | — | 293 | ✓ | auto |
| Pepicons Print | `pepicons-print` | 0% | 76% | 0% | — | 703 | ✓ | auto |
| Teenyicons | `teenyicons` | 44% | 28% | 0% | — | — | ✓ | auto |
| HeroIcons v1 Solid | `heroicons-solid` | 0% | 72% | 0% | — | — | ✓ | auto |
| HeroIcons | `heroicons` | 28% | 40% | 0% | — | — | ✓ | auto |
| Pepicons | `pepicons` | 0% | 68% | 0% | — | 125 | ✓ | auto |
| Pepicons Pop! | `pepicons-pop` | 0% | 64% | 0% | — | — | ✓ | auto |
| Pepicons Pencil | `pepicons-pencil` | 0% | 64% | 0% | — | — | ✓ | auto |
| NRK Core Icons | `nrk` | 0% | 64% | 0% | — | 23 | ✓ | auto |
| TDesign Icons | `tdesign` | 60% | 0% | 0% | — | 1 | ✓ | explicit |
| css.gg | `gg` | 0% | 60% | 0% | — | 11 | ✓ | auto |
| Ultimate free icons | `streamline-ultimate` | 52% | 8% | 0% | — | — | ✓ | auto |
| Mage Icons | `mage` | 56% | 0% | 0% | — | — | ✓ | explicit |
| Flag Icons | `flag` | 40% | 40% | 0% | — | 45 | ✓ | auto |
| Meteocons | `meteocons` | 56% | 0% | 0% | — | — | ✓ | auto |
| Myna UI Icons | `mynaui` | 52% | 0% | 0% | — | — | ✓ | explicit |
| Nonicons | `nonicons` | 0% | 52% | 0% | — | — | ✓ | auto |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 0% | 52% | 0% | — | 379 | ✓ | auto |
| Duoicons | `duo-icons` | 0% | 48% | 0% | — | 91 | ✓ | auto |
| Google Cloud Icons | `gcp` | 0% | 48% | 0% | — | 40 | ✓ | auto |
| uiw icons | `uiw` | 0% | 44% | 0% | — | — | ✓ | auto |
| MingCute Icon | `mingcute` | 0% | 40% | 0% | — | 2 | ✓ | auto |
| Qlementine Icons | `qlementine-icons` | 0% | 40% | 0% | — | 41 | ✓ | auto |
| Flat UI Icons | `flat-ui` | 4% | 36% | 0% | — | 19 | ✓ | auto |
| SidekickIcons | `sidekickicons` | 28% | 4% | 0% | — | — | ✓ | explicit |
| Web3 Icons | `token` | 0% | 32% | 0% | — | 5 | ✓ | auto |
| CoreUI Flags | `cif` | 28% | 28% | 0% | — | 35 | ✓ | auto |
| Cryptocurrency Icons | `cryptocurrency` | 0% | 28% | 0% | — | 15 | ✓ | auto |
| WordPress Icons | `wordpress` | 0% | 24% | 0% | — | 4 | ✓ | auto |
| FormKit Icons | `formkit` | 4% | 20% | 0% | — | — | ✓ | auto |
| Radix Icons | `radix-icons` | 0% | 24% | 0% | — | 4 | ✓ | explicit |
| File Icons | `file-icons` | 0% | 24% | 0% | — | — | ✓ | auto |
| Skill Icons | `skill-icons` | 0% | 24% | 0% | — | 120 | ✓ | auto |
| Devicon | `devicon` | 0% | 20% | 0% | — | 177 | ✓ | auto |
| Web3 Icons Branded | `token-branded` | 0% | 20% | 0% | — | 199 | ✓ | auto |
| Font-GIS | `gis` | 0% | 20% | 0% | — | — | ✓ | auto |
| Lineicons | `lineicons` | 0% | 16% | 0% | — | — | ✓ | explicit |
| Octicons | `octicon` | 0% | 12% | 0% | — | — | ✓ | explicit |
| Prime Icons | `prime` | 0% | 8% | 0% | — | — | ✓ | explicit |
| Material Symbols | `material-symbols` | 0% | 0% | 0% | — | — | — | none |
| Material Symbols Light | `material-symbols-light` | 0% | 0% | 0% | — | — | — | none |
| Google Material Icons | `ic` | 0% | 0% | 0% | 78 | 1,351 | — | none |
| Material Design Icons | `mdi` | 0% | 0% | 0% | — | — | — | none |
| Material Design Light | `mdi-light` | 0% | 0% | 0% | — | — | ✓ | explicit |
| Boxicons | `boxicons` | 0% | 0% | 0% | — | — | — | none |
| Remix Icon | `ri` | 0% | 0% | 0% | — | — | — | none |
| Unicons | `uil` | 0% | 0% | 0% | 1 | — | — | none |
| Pixelarticons | `pixelarticons` | 0% | 0% | 0% | — | 2 | — | none |
| Pixel Icon | `pixel` | 0% | 0% | 0% | — | — | — | none |
| Typicons | `typcn` | 0% | 0% | 0% | — | — | — | none |
| Circum Icons | `circum` | 0% | 0% | 0% | — | — | ✓ | explicit |
| Unicons Monochrome | `uim` | 0% | 0% | 0% | 1 | 188 | — | none |
| Unicons Thin Line | `uit` | 0% | 0% | 0% | 1 | — | — | none |
| Unicons Solid | `uis` | 0% | 0% | 0% | — | — | — | none |
| Gridicons | `gridicons` | 0% | 0% | 0% | 5 | — | — | none |
| SVG Spinners | `svg-spinners` | 0% | 0% | 0% | 1 | — | — | none |
| Jam Icons | `jam` | 0% | 0% | 0% | — | — | ✓ | explicit |
| Carbon | `carbon` | 0% | 0% | 0% | 11 | — | — | none |
| CoreUI Free | `cil` | 0% | 0% | 0% | — | — | — | none |
| Röntgen | `roentgen` | 0% | 0% | 0% | — | — | — | none |
| Element Plus | `ep` | 0% | 0% | 0% | — | — | — | none |
| Bootstrap Icons | `bi` | 0% | 0% | 0% | 395 | — | — | none |
| Pixel free icons | `streamline-pixel` | 0% | 0% | 0% | — | — | — | none |
| Rivet Icons | `rivet-icons` | 0% | 0% | 0% | — | — | — | none |
| Fluent UI System Icons | `fluent` | 0% | 0% | 0% | — | — | — | none |
| Phosphor | `ph` | 0% | 0% | 0% | — | 1,528 | — | none |
| Clarity | `clarity` | 0% | 0% | 0% | 1 | 2 | — | none |
| Memory Icons | `memory` | 0% | 0% | 0% | — | — | — | none |
| Zondicons | `zondicons` | 0% | 0% | 0% | 5 | — | — | none |
| Evil Icons | `ei` | 0% | 0% | 0% | 4 | 3 | — | none |
| Framework7 Icons | `f7` | 0% | 0% | 0% | 64 | — | — | none |
| Font Awesome Solid | `fa7-solid` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome Regular | `fa7-regular` | 0% | 0% | 0% | — | — | — | none |
| Pico-icon | `picon` | 0% | 0% | 0% | — | — | — | none |
| OOUI | `ooui` | 0% | 0% | 0% | 2 | — | — | none |
| Maki | `maki` | 0% | 0% | 0% | — | — | — | none |
| Temaki | `temaki` | 0% | 0% | 0% | — | — | — | none |
| Dinkie Icons | `dinkie-icons` | 0% | 0% | 0% | — | — | — | none |
| Fluent UI System Color Icons | `fluent-color` | 0% | 0% | 0% | 179 | — | — | none |
| Simple Icons | `simple-icons` | 0% | 0% | 0% | — | — | — | none |
| SVG Logos | `logos` | 0% | 0% | 8% | 50 | 372 | — | none |
| CoreUI Brands | `cib` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome Brands | `fa7-brands` | 0% | 0% | 0% | — | — | — | none |
| Boxicons Brands | `bxl` | 0% | 0% | 0% | 2 | — | — | none |
| Custom Brand Icons | `cbi` | 0% | 0% | 0% | 7 | — | — | none |
| Brandico | `brandico` | 0% | 0% | 0% | — | — | — | none |
| Entypo+ Social | `entypo-social` | 0% | 0% | 0% | 1 | — | — | none |
| Twitter Emoji | `twemoji` | 0% | 0% | 76% | 35 | 637 | — | none |
| Fluent Emoji High Contrast | `fluent-emoji-high-contrast` | 0% | 0% | 0% | 97 | — | — | none |
| Emoji One (Colored) | `emojione` | 0% | 0% | 84% | 11 | 271 | — | none |
| Firefox OS Emoji | `fxemoji` | 0% | 0% | 72% | 1 | 128 | — | none |
| Circle Flags | `circle-flags` | 0% | 0% | 100% | 5 | — | — | none |
| Map Icons | `map` | 0% | 0% | 0% | 1 | — | — | none |
| GeoGlyphs | `geo` | 0% | 0% | 0% | — | — | — | none |
| Game Icons | `game-icons` | 0% | 0% | 0% | — | — | — | none |
| Academicons | `academicons` | 0% | 0% | 0% | 3 | — | — | none |
| Weather Icons | `wi` | 0% | 0% | 0% | — | — | — | none |
| Medical Icons | `medical-icon` | 0% | 0% | 0% | — | — | — | none |
| Line Awesome | `la` | 0% | 0% | 0% | 2 | — | — | none |
| Eva Icons | `eva` | 0% | 0% | 0% | — | — | — | none |
| Dashicons | `dashicons` | 0% | 0% | 0% | 5 | — | — | none |
| Entypo+ | `entypo` | 0% | 0% | 0% | 19 | — | — | none |
| Raphael | `raphael` | 0% | 0% | 0% | — | — | — | none |
| Icons8 Windows 10 Icons | `icons8` | 0% | 0% | 0% | — | — | — | none |
| Innowatio Font | `iwwa` | 0% | 0% | 0% | — | — | — | none |
| BoxIcons v2 | `bx` | 0% | 0% | 0% | 2 | — | — | none |
| BoxIcons v2 Solid | `bxs` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 6 Solid | `fa6-solid` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 6 Regular | `fa6-regular` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 6 Brands | `fa6-brands` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 5 Solid | `fa-solid` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 5 Regular | `fa-regular` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 5 Brands | `fa-brands` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome 4 | `fa` | 0% | 0% | 0% | — | — | — | none |
| Fluent UI MDL2 | `fluent-mdl2` | 0% | 0% | 0% | — | — | — | none |
| Fontisto | `fontisto` | 0% | 0% | 0% | — | — | — | none |
| IcoMoon Free | `icomoon-free` | 0% | 0% | 0% | — | — | — | none |
| Subway Icon Set | `subway` | 0% | 0% | 0% | — | — | — | none |
| Open Iconic | `oi` | 0% | 0% | 0% | — | — | — | none |
| Simple line icons | `simple-line-icons` | 0% | 0% | 0% | — | — | — | none |
| Elegant | `et` | 0% | 0% | 0% | — | — | ✓ | explicit |
| Elusive Icons | `el` | 0% | 0% | 0% | 1 | — | — | none |
| Vaadin Icons | `vaadin` | 0% | 0% | 0% | — | — | — | none |
| WebHostingHub Glyphs | `whh` | 0% | 0% | 0% | — | — | — | none |
| Material Design Iconic Font | `zmdi` | 0% | 0% | 0% | — | — | — | none |
| Ligature Symbols | `ls` | 0% | 0% | 0% | — | — | — | none |
| Vesper Icons | `vs` | 0% | 0% | 0% | — | — | — | none |
| Icalicons | `il` | 0% | 0% | 0% | — | — | — | none |
| Web Symbols Liga | `websymbol` | 0% | 0% | 0% | — | — | — | none |
| Fontelico | `fontelico` | 0% | 0% | 0% | — | — | — | none |
| PrestaShop Icons | `ps` | 0% | 0% | 0% | — | — | — | none |
