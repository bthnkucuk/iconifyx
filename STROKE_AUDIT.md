# Stroke / evenodd raster-fill audit

Generated 2026-05-16. For each set we sample the first 25 icons and measure two ratios: **stroke** (icons with `stroke=` and no fill) and **evenodd** (icons that rely on `fill-rule="evenodd"` for internal cutouts). Both cases need the rasterize+Potrace pre-pass (`oslllo-svg-fixer`) — otherwise stroke icons render as solid discs and evenodd icons lose their holes (the `car` / `bug` gravity-ui glyphs we initially shipped as blobs).

- **Sets receiving raster pre-pass:** 0 / 225
- **Of those, auto-detected:** 0
- **Sets with ≥20% raster signal that were NOT processed:** 0
- **Sets containing duo-tone icons:** 71 (20,989 icons across them)
- **Sets with ≥20% paint-order risk (multi-fill bodies that would render as monochrome blobs):** 0
- **Icons proactively dropped this run for paint-order risk:** 0

## Paint-order risk (multi-fill bodies)

Iconify bodies that paint two or more concrete colors (e.g. a light letterform on a dark background rect, like `logos:adobe-after-effects`) cannot be losslessly translated to a monochrome TTF — the foreground shape collapses into the background fill region (same `currentColor`, non-zero winding) and the glyph renders as a featureless filled blob. Rasterize-trace does NOT fix this (Potrace traces the combined silhouette as one filled region). The pipeline now drops such icons at validation so they never appear in the Dart class. Counts below are after duotone-split + stroke-fill, so packs neutralised by the raster pre-pass report 0%.

_No paint-order risk detected._

## Duotone sets (manual visual check recommended)

Open these sets in the example app and verify the primary / secondary layers of a few icons sit in their expected positions (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left). The "Spot-check" column lists 2–3 names per pack — start there, since these are the icons most likely to surface duotone layering bugs.

| Set | Prefix | Duotone icons | Spot-check |
|---|---|---:|---|
| Twitter Emoji | `twemoji` | 4,498 | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| Glyphs | `glyphs` | 1,603 | `a-outline`, `accessible-duo`, `accessible-outline` |
| Solar | `solar` | 1,595 | `4k-bold-duotone`, `4k-line-duotone`, `accessibility-bold-duotone` |
| Google Material Icons | `ic` | 1,289 | `baseline-battery-20`, `baseline-battery-30`, `baseline-battery-50` |
| Phosphor | `ph` | 1,102 | `acorn-duotone`, `address-book-duotone`, `address-book-tabs-duotone` |
| Freehand color icons | `streamline-freehand-color` | 971 | `accessories-remote-shutter`, `accessories-retro-film-1`, `accounting-abacus` |
| Streamline color | `streamline-color` | 810 | `add-bell-notification-flat`, `add-circle-flat`, `add-layer-2-flat` |
| Circle Flags | `circle-flags` | 732 | `aa`, `ab`, `ac` |
| Pepicons Print | `pepicons-print` | 703 | `airplane`, `airplane-circle`, `airplane-circle-filled` |
| Material Icon Theme | `material-icon-theme` | 539 | `adobe-illustrator`, `adobe-illustrator-light`, `adobe-photoshop` |
| Fluent Emoji Flat | `fluent-emoji-flat` | 495 | `a-button-blood-type`, `ab-button-blood-type`, `adhesive-bandage` |
| Sharp color icons | `streamline-sharp-color` | 437 | `3d-move-flat`, `3d-rotate-y-axis-flat`, `3d-scale-flat` |
| Plump color icons | `streamline-plump-color` | 435 | `3d-coordinate-axis-flat`, `add-bell-notification-flat`, `add-layer-2-flat` |
| Flex color icons | `streamline-flex-color` | 433 | `3d-coordinate-axis-flat`, `3d-rotate-1-flat`, `3d-rotate-y-axis-flat` |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 379 | `aave`, `abt`, `act` |
| SVG Logos | `logos` | 375 | `100tb`, `6px`, `adobe-after-effects` |
| Streamline Emojis | `streamline-emojis` | 364 | `2`, `airplane`, `alien` |
| VSCode Icons | `vscode-icons` | 326 | `default-root-folder`, `default-root-folder-opened`, `file-type-access2` |
| Sargam Icons | `si` | 323 | `actions-duotone`, `add-alarm-duotone`, `add-circle-duotone` |
| Glyphs Poly | `glyphs-poly` | 293 | `adjust`, `adjust-1`, `analytics` |
| Lets Icons | `lets-icons` | 286 | `3d-box-duotone`, `add-duotone`, `add-duotone-line` |
| Emoji One (Colored) | `emojione` | 271 | `a-button`, `ab-button`, `antenna-bars` |
| Catppuccin Icons | `catppuccin` | 264 | `angular`, `angular-component`, `angular-directive` |
| Noto Emoji (v1) | `noto-v1` | 246 | `ab-button`, `ab-button-blood-type`, `american-football` |
| Web3 Icons Branded | `token-branded` | 203 | `0x0`, `adoge`, `aevo` |
| Emoji One (v1) | `emojione-v1` | 197 | `a-button`, `ab-button`, `anchor` |
| Stash Icons | `stash` | 193 | `airplane-duotone`, `arrows-switch-duotone`, `article-alt-duotone` |
| Unicons Monochrome | `uim` | 188 | `airplay`, `align`, `android` |
| Devicon | `devicon` | 180 | `aframe`, `aftereffects`, `akka` |
| Ant Design Icons | `ant-design` | 153 | `account-book-twotone`, `alert-twotone`, `api-twotone` |
| Firefox OS Emoji | `fxemoji` | 128 | `2hearts`, `alien`, `alienmonster` |
| Skill Icons | `skill-icons` | 125 | `ableton-dark`, `ableton-light`, `actix-dark` |
| Pepicons | `pepicons` | 125 | `airplane-print`, `alarm-print`, `angle-down-print` |
| IconaMoon | `iconamoon` | 98 | `3d-duotone`, `arrow-bottom-left-3-square-duotone`, `arrow-bottom-left-5-circle-duotone` |
| Duoicons | `duo-icons` | 91 | `add-circle`, `airplay`, `alert-octagon` |
| IconPark | `icon-park` | 79 | `apple`, `avocado`, `baby-feet` |
| Flat Color Icons | `flat-color-icons` | 61 | `alphabetical-sorting-az`, `alphabetical-sorting-za`, `approval` |
| Noto Emoji | `noto` | 58 | `admission-tickets`, `alien`, `bell-pepper` |
| Flag Icons | `flag` | 47 | `at-1x1`, `at-4x3`, `bd-1x1` |
| Qlementine Icons | `qlementine-icons` | 45 | `anchor-bottom-left-16`, `anchor-bottom-middle-16`, `anchor-bottom-right-16` |
| Google Cloud Icons | `gcp` | 41 | `ai-platform`, `apigee-api-platform`, `automl-vision` |
| CoreUI Flags | `cif` | 35 | `al`, `at`, `bd` |
| css.gg | `gg` | 31 | `align-bottom`, `align-center`, `align-left` |
| NRK Core Icons | `nrk` | 23 | `dialogue`, `download`, `edit` |
| Cryptocurrency Icons | `cryptocurrency` | 21 | `agi`, `aion`, `cix` |
| Flat UI Icons | `flat-ui` | 19 | `android`, `book`, `camera` |
| Flagpack | `flagpack` | 16 | `al`, `bd`, `bh` |
| Web3 Icons | `token` | 10 | `akt`, `h2o`, `iotex` |
| Stickies color icons | `streamline-stickies-color` | 5 | `bluetooth-duo`, `help-duo`, `love-duo` |
| Grommet Icons | `grommet-icons` | 5 | `mastercard`, `star-half`, `wifi-low` |
| Tabler Icons | `tabler` | 4 | `brand-parsinta`, `brand-parsinta-bold`, `brand-parsinta-light` |
| WordPress Icons | `wordpress` | 4 | `corner-bottom-left`, `corner-bottom-right`, `corner-top-left` |
| Radix Icons | `radix-icons` | 4 | `shadow`, `shadow-inner`, `shadow-none` |
| Huge Icons | `hugeicons` | 3 | `arrow-big-right-dash`, `hamburger-01`, `right-to-left-list-bullet` |
| Evil Icons | `ei` | 3 | `envelope`, `spinner`, `spinner-2` |
| Kameleon color icons | `streamline-kameleon-color` | 3 | `heart-key-duo`, `peace-duo`, `wrench-duo` |
| Arcticons | `arcticons` | 3 | `auto-away`, `fairtiq`, `itinerary` |
| MingCute Icon | `mingcute` | 2 | `loading-3-fill`, `loading-3-line` |
| Pixelarticons | `pixelarticons` | 2 | `mail-right`, `mail-right-sharp` |
| Clarity | `clarity` | 2 | `vm-bug-inverse-line`, `vm-bug-line` |
| Ultimate color icons | `streamline-ultimate-color` | 2 | `amazon-web-services-logo`, `loading` |
| Devicon Plain | `devicon-plain` | 2 | `livewire`, `weblate-wordmark` |
| TDesign Icons | `tdesign` | 1 | `order` |
| Bitcoin Icons | `bitcoin-icons` | 1 | `contacts-filled` |
| Cuida Icons | `cuida` | 1 | `sort-ascending-duotone` |
| Bootstrap Icons | `bi` | 1 | `opencollective` |
| Pepicons Pop! | `pepicons-pop` | 1 | `keyboard-circle-filled` |
| Pepicons Pencil | `pepicons-pencil` | 1 | `keyboard-circle-filled` |
| Temaki | `temaki` | 1 | `crossing-markings-zebra-bicolour` |
| OpenMoji | `openmoji` | 1 | `tardis` |
| Fluent Emoji | `fluent-emoji` | 1 | `tongue` |

## Per-icon raster-trace fixes

Sets where the pack-level sample was below the stroke/evenodd threshold but individual icons still needed rasterize-trace. Without per-icon detection, `oui:check-in-circle-empty` shipped as a solid disc and `oui:chat-left` as a filled speech bubble (the `oui` pack sample showed only 16% evenodd, below the 20% pack threshold).

- **Icons rasterize-traced via per-icon path this run:** 0

_No per-icon traces this run._

## Inverse-mask pattern (resvg-aware trace)

Icons whose body uses `<defs><mask id="X">...</mask></defs>` plus a consumer `<path mask="url(#X)"/>` (Solar bold, icon-park-twotone, icon-park-solid, line-md, pepicons-pop/pencil, lets-icons duotone-line, …). Before the custom stroke-fill worker landed, these icons shipped with their main body invisible because `oslllo-svg-fixer` force-set the first <path>'s fill to black inside the mask. The worker bypasses that step now and the bodies trace correctly via resvg.

- **Icons using the inverse-mask pattern across all packs:** 0

_No mask-pattern icons detected._

## vtracer recovery (multi-colour → duotone)

Packs opted into `config.vtracerSets` (e.g. `twemoji`, `noto`, `fluent-emoji-flat`, `circle-flags`) route their paint-order-risk candidates through `@neplex/vectorizer` (visioncortex vtracer): rasterise the source via `@resvg/resvg-js`, trace into stacked colour layers, reduce to the top-2 by polygon area, and re-emit as a paint-order duotone primary+secondary pair (`kind: paintOrder`). The recovered icons render through the same widget composition logos use. Bodies vtracer can't reduce to ≥2 distinct layers, plus any worker panics, still fall through to the paint-order drop.

- **Total vtracer candidates this run:** 0
- **Recovered as paint-order duotone:** 0
- **Still dropped (monochrome trace / panic / other-fail):** 0

_No packs opted in this run. Add a prefix to `vtracerSets` in `tools/generator/config.yaml`._

## All sets

| Set | Prefix | Stroke % | Evenodd % | Paint-order % | Per-icon | Duotone | Applied | Source |
|---|---|---:|---:|---:|---:|---:|:---:|---|
| Material Symbols | `material-symbols` | 0% | 0% | 0% | — | — | — | none |
| Material Symbols Light | `material-symbols-light` | 0% | 0% | 0% | — | — | — | none |
| Google Material Icons | `ic` | 0% | 0% | 0% | — | 1,289 | — | none |
| Material Design Icons | `mdi` | 0% | 0% | 0% | — | — | — | none |
| Material Design Light | `mdi-light` | 0% | 0% | 0% | — | — | — | none |
| Material Line Icons | `line-md` | 0% | 0% | 0% | — | — | — | none |
| Solar | `solar` | 0% | 0% | 0% | — | 1,595 | — | none |
| Tabler Icons | `tabler` | 0% | 0% | 0% | — | 4 | — | none |
| Boxicons | `boxicons` | 0% | 0% | 0% | — | — | — | none |
| MingCute Icon | `mingcute` | 0% | 0% | 0% | — | 2 | — | none |
| Remix Icon | `ri` | 0% | 0% | 0% | — | — | — | none |
| Myna UI Icons | `mynaui` | 0% | 0% | 0% | — | — | — | none |
| IconaMoon | `iconamoon` | 0% | 0% | 0% | — | 98 | — | none |
| Iconoir | `iconoir` | 0% | 0% | 0% | — | — | — | none |
| Lucide | `lucide` | 0% | 0% | 0% | — | — | — | none |
| Lucide Lab | `lucide-lab` | 0% | 0% | 0% | — | — | — | none |
| Unicons | `uil` | 0% | 0% | 0% | — | — | — | none |
| TDesign Icons | `tdesign` | 0% | 0% | 0% | — | 1 | — | none |
| Sargam Icons | `si` | 0% | 0% | 0% | — | 323 | — | none |
| Majesticons | `majesticons` | 0% | 0% | 0% | — | — | — | none |
| css.gg | `gg` | 0% | 0% | 0% | — | 31 | — | none |
| Flowbite Icons | `flowbite` | 0% | 0% | 0% | — | — | — | none |
| Basil | `basil` | 0% | 0% | 0% | — | — | — | none |
| Pixelarticons | `pixelarticons` | 0% | 0% | 0% | — | 2 | — | none |
| Pixel Icon | `pixel` | 0% | 0% | 0% | — | — | — | none |
| Akar Icons | `akar-icons` | 0% | 0% | 0% | — | — | — | none |
| coolicons | `ci` | 0% | 0% | 0% | — | — | — | none |
| ProIcons | `proicons` | 0% | 0% | 0% | — | — | — | none |
| Typicons | `typcn` | 0% | 0% | 0% | — | — | — | none |
| Meteor Icons | `meteor-icons` | 0% | 0% | 0% | — | — | — | none |
| Prime Icons | `prime` | 0% | 0% | 0% | — | — | — | none |
| Circum Icons | `circum` | 0% | 0% | 0% | — | — | — | none |
| Feather Icon | `fe` | 0% | 0% | 0% | — | — | — | none |
| EOS Icons | `eos-icons` | 0% | 0% | 0% | — | — | — | none |
| Bitcoin Icons | `bitcoin-icons` | 0% | 0% | 0% | — | 1 | — | none |
| Humbleicons | `humbleicons` | 0% | 0% | 0% | — | — | — | none |
| Unicons Monochrome | `uim` | 0% | 0% | 0% | — | 188 | — | none |
| Unicons Thin Line | `uit` | 0% | 0% | 0% | — | — | — | none |
| Unicons Solid | `uis` | 0% | 0% | 0% | — | — | — | none |
| Gridicons | `gridicons` | 0% | 0% | 0% | — | — | — | none |
| Mono Icons | `mi` | 0% | 0% | 0% | — | — | — | none |
| Cuida Icons | `cuida` | 0% | 0% | 0% | — | 1 | — | none |
| WeUI Icon | `weui` | 0% | 0% | 0% | — | — | — | none |
| Duoicons | `duo-icons` | 0% | 0% | 0% | — | 91 | — | none |
| SVG Spinners | `svg-spinners` | 0% | 0% | 0% | — | — | — | none |
| Huge Icons | `hugeicons` | 0% | 0% | 0% | — | 3 | — | none |
| Lets Icons | `lets-icons` | 0% | 0% | 0% | — | 286 | — | none |
| Ultimate free icons | `streamline-ultimate` | 0% | 0% | 0% | — | — | — | none |
| Plump free icons | `streamline-plump` | 0% | 0% | 0% | — | — | — | none |
| Sharp free icons | `streamline-sharp` | 0% | 0% | 0% | — | — | — | none |
| Mage Icons | `mage` | 0% | 0% | 0% | — | — | — | none |
| Stash Icons | `stash` | 0% | 0% | 0% | — | 193 | — | none |
| Lineicons | `lineicons` | 0% | 0% | 0% | — | — | — | none |
| WordPress Icons | `wordpress` | 0% | 0% | 0% | — | 4 | — | none |
| IconPark Outline | `icon-park-outline` | 0% | 0% | 0% | — | — | — | none |
| IconPark Solid | `icon-park-solid` | 0% | 0% | 0% | — | — | — | none |
| IconPark TwoTone | `icon-park-twotone` | 0% | 0% | 0% | — | — | — | none |
| Jam Icons | `jam` | 0% | 0% | 0% | — | — | — | none |
| Cyber free icons | `streamline-cyber` | 0% | 0% | 0% | — | — | — | none |
| Guidance | `guidance` | 0% | 0% | 0% | — | — | — | none |
| Carbon | `carbon` | 0% | 0% | 0% | — | — | — | none |
| IonIcons | `ion` | 0% | 0% | 0% | — | — | — | none |
| Famicons | `famicons` | 0% | 0% | 0% | — | — | — | none |
| Ant Design Icons | `ant-design` | 0% | 0% | 0% | — | 153 | — | none |
| Lsicon | `lsicon` | 0% | 0% | 0% | — | — | — | none |
| Gravity UI Icons | `gravity-ui` | 0% | 0% | 0% | — | — | — | none |
| CoreUI Free | `cil` | 0% | 0% | 0% | — | — | — | none |
| Röntgen | `roentgen` | 0% | 0% | 0% | — | — | — | none |
| Element Plus | `ep` | 0% | 0% | 0% | — | — | — | none |
| Charm Icons | `charm` | 0% | 0% | 0% | — | — | — | none |
| Quill Icons | `quill` | 0% | 0% | 0% | — | — | — | none |
| Bytesize Icons | `bytesize` | 0% | 0% | 0% | — | — | — | none |
| Bootstrap Icons | `bi` | 0% | 0% | 0% | — | 1 | — | none |
| Pixel free icons | `streamline-pixel` | 0% | 0% | 0% | — | — | — | none |
| Streamline Block | `streamline-block` | 0% | 0% | 0% | — | — | — | none |
| Rivet Icons | `rivet-icons` | 0% | 0% | 0% | — | — | — | none |
| Nimbus | `nimbus` | 0% | 0% | 0% | — | — | — | none |
| FormKit Icons | `formkit` | 0% | 0% | 0% | — | — | — | none |
| Fluent UI System Icons | `fluent` | 0% | 0% | 0% | — | — | — | none |
| Phosphor | `ph` | 0% | 0% | 0% | — | 1,102 | — | none |
| Glyphs | `glyphs` | 0% | 0% | 0% | — | 1,603 | — | none |
| Glyphs Poly | `glyphs-poly` | 0% | 0% | 0% | — | 293 | — | none |
| Teenyicons | `teenyicons` | 0% | 0% | 0% | — | — | — | none |
| Clarity | `clarity` | 0% | 0% | 0% | — | 2 | — | none |
| Freehand free icons | `streamline-freehand` | 0% | 0% | 0% | — | — | — | none |
| Siemens Industrial Experience Icons | `ix` | 0% | 0% | 0% | — | — | — | none |
| Octicons | `octicon` | 0% | 0% | 0% | — | — | — | none |
| Memory Icons | `memory` | 0% | 0% | 0% | — | — | — | none |
| System UIcons | `system-uicons` | 0% | 0% | 0% | — | — | — | none |
| Radix Icons | `radix-icons` | 0% | 0% | 0% | — | 4 | — | none |
| Zondicons | `zondicons` | 0% | 0% | 0% | — | — | — | none |
| uiw icons | `uiw` | 0% | 0% | 0% | — | — | — | none |
| CodeX Icons | `codex` | 0% | 0% | 0% | — | — | — | none |
| Evil Icons | `ei` | 0% | 0% | 0% | — | 3 | — | none |
| HeroIcons | `heroicons` | 0% | 0% | 0% | — | — | — | none |
| SidekickIcons | `sidekickicons` | 0% | 0% | 0% | — | — | — | none |
| Pepicons Pop! | `pepicons-pop` | 0% | 0% | 0% | — | 1 | — | none |
| Pepicons Print | `pepicons-print` | 0% | 0% | 0% | — | 703 | — | none |
| Pepicons Pencil | `pepicons-pencil` | 0% | 0% | 0% | — | 1 | — | none |
| Framework7 Icons | `f7` | 0% | 0% | 0% | — | — | — | none |
| Gitlab SVGs | `pajamas` | 0% | 0% | 0% | — | — | — | none |
| Garden SVG Icons | `garden` | 0% | 0% | 0% | — | — | — | none |
| Streamline | `streamline` | 0% | 0% | 0% | — | — | — | none |
| Flex free icons | `streamline-flex` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome Solid | `fa7-solid` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome Regular | `fa7-regular` | 0% | 0% | 0% | — | — | — | none |
| Pico-icon | `picon` | 0% | 0% | 0% | — | — | — | none |
| OOUI | `ooui` | 0% | 0% | 0% | — | — | — | none |
| Maki | `maki` | 0% | 0% | 0% | — | — | — | none |
| Temaki | `temaki` | 0% | 0% | 0% | — | 1 | — | none |
| OpenSearch UI | `oui` | 0% | 0% | 0% | — | — | — | none |
| NRK Core Icons | `nrk` | 0% | 0% | 0% | — | 23 | — | none |
| Dinkie Icons | `dinkie-icons` | 0% | 0% | 0% | — | — | — | none |
| Qlementine Icons | `qlementine-icons` | 0% | 0% | 0% | — | 45 | — | none |
| Ultimate color icons | `streamline-ultimate-color` | 0% | 0% | 0% | — | 2 | — | none |
| Plump color icons | `streamline-plump-color` | 0% | 0% | 0% | — | 435 | — | none |
| Freehand color icons | `streamline-freehand-color` | 0% | 0% | 0% | — | 971 | — | none |
| Kameleon color icons | `streamline-kameleon-color` | 0% | 0% | 0% | — | 3 | — | none |
| Stickies color icons | `streamline-stickies-color` | 0% | 0% | 0% | — | 5 | — | none |
| Fluent UI System Color Icons | `fluent-color` | 0% | 0% | 0% | — | — | — | none |
| Streamline color | `streamline-color` | 0% | 0% | 0% | — | 810 | — | none |
| Flex color icons | `streamline-flex-color` | 0% | 0% | 0% | — | 433 | — | none |
| Sharp color icons | `streamline-sharp-color` | 0% | 0% | 0% | — | 437 | — | none |
| Cyber color icons | `streamline-cyber-color` | 0% | 0% | 0% | — | — | — | none |
| IconPark | `icon-park` | 0% | 0% | 0% | — | 79 | — | none |
| Marketeq | `marketeq` | 0% | 0% | 0% | — | — | — | none |
| VSCode Icons | `vscode-icons` | 0% | 0% | 0% | — | 326 | — | none |
| Codicons | `codicon` | 0% | 0% | 0% | — | — | — | none |
| Material Icon Theme | `material-icon-theme` | 0% | 0% | 0% | — | 539 | — | none |
| File Icons | `file-icons` | 0% | 0% | 0% | — | — | — | none |
| Devicon | `devicon` | 0% | 0% | 0% | — | 180 | — | none |
| Devicon Plain | `devicon-plain` | 0% | 0% | 0% | — | 2 | — | none |
| Catppuccin Icons | `catppuccin` | 0% | 0% | 0% | — | 264 | — | none |
| Skill Icons | `skill-icons` | 0% | 0% | 0% | — | 125 | — | none |
| Google Cloud Icons | `gcp` | 0% | 0% | 0% | — | 41 | — | none |
| UnJS Logos | `unjs` | 0% | 0% | 0% | — | — | — | none |
| Simple Icons | `simple-icons` | 0% | 0% | 0% | — | — | — | none |
| SVG Logos | `logos` | 0% | 0% | 0% | — | 375 | — | none |
| Logos free icons | `streamline-logos` | 0% | 0% | 0% | — | — | — | none |
| CoreUI Brands | `cib` | 0% | 0% | 0% | — | — | — | none |
| Font Awesome Brands | `fa7-brands` | 0% | 0% | 0% | — | — | — | none |
| Boxicons Brands | `bxl` | 0% | 0% | 0% | — | — | — | none |
| Nonicons | `nonicons` | 0% | 0% | 0% | — | — | — | none |
| Arcticons | `arcticons` | 0% | 0% | 0% | — | 3 | — | none |
| Custom Brand Icons | `cbi` | 0% | 0% | 0% | — | — | — | none |
| Brandico | `brandico` | 0% | 0% | 0% | — | — | — | none |
| Entypo+ Social | `entypo-social` | 0% | 0% | 0% | — | — | — | none |
| Web3 Icons | `token` | 0% | 0% | 0% | — | 10 | — | none |
| Web3 Icons Branded | `token-branded` | 0% | 0% | 0% | — | 203 | — | none |
| Cryptocurrency Icons | `cryptocurrency` | 0% | 0% | 0% | — | 21 | — | none |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 0% | 0% | 0% | — | 379 | — | none |
| OpenMoji | `openmoji` | 0% | 0% | 0% | — | 1 | — | none |
| Twitter Emoji | `twemoji` | 0% | 0% | 0% | — | 4,498 | — | none |
| Noto Emoji | `noto` | 0% | 0% | 0% | — | 58 | — | none |
| Fluent Emoji Flat | `fluent-emoji-flat` | 0% | 0% | 0% | — | 495 | — | none |
| Fluent Emoji High Contrast | `fluent-emoji-high-contrast` | 0% | 0% | 0% | — | — | — | none |
| Noto Emoji (v1) | `noto-v1` | 0% | 0% | 0% | — | 246 | — | none |
| Emoji One (Colored) | `emojione` | 0% | 0% | 0% | — | 271 | — | none |
| Emoji One (Monotone) | `emojione-monotone` | 0% | 0% | 0% | — | — | — | none |
| Emoji One (v1) | `emojione-v1` | 0% | 0% | 0% | — | 197 | — | none |
| Firefox OS Emoji | `fxemoji` | 0% | 0% | 0% | — | 128 | — | none |
| Streamline Emojis | `streamline-emojis` | 0% | 0% | 0% | — | 364 | — | none |
| Circle Flags | `circle-flags` | 0% | 0% | 0% | — | 732 | — | none |
| Flag Icons | `flag` | 0% | 0% | 0% | — | 47 | — | none |
| Flagpack | `flagpack` | 0% | 0% | 0% | — | 16 | — | none |
| CoreUI Flags | `cif` | 0% | 0% | 0% | — | 35 | — | none |
| Font-GIS | `gis` | 0% | 0% | 0% | — | — | — | none |
| Map Icons | `map` | 0% | 0% | 0% | — | — | — | none |
| GeoGlyphs | `geo` | 0% | 0% | 0% | — | — | — | none |
| Game Icons | `game-icons` | 0% | 0% | 0% | — | — | — | none |
| FontAudio | `fad` | 0% | 0% | 0% | — | — | — | none |
| Academicons | `academicons` | 0% | 0% | 0% | — | — | — | none |
| Weather Icons | `wi` | 0% | 0% | 0% | — | — | — | none |
| Meteocons | `meteocons` | 0% | 0% | 0% | — | — | — | none |
| Health Icons | `healthicons` | 0% | 0% | 0% | — | — | — | none |
| Medical Icons | `medical-icon` | 0% | 0% | 0% | — | — | — | none |
| Covid Icons | `covid` | 0% | 0% | 0% | — | — | — | none |
| Line Awesome | `la` | 0% | 0% | 0% | — | — | — | none |
| Eva Icons | `eva` | 0% | 0% | 0% | — | — | — | none |
| Dashicons | `dashicons` | 0% | 0% | 0% | — | — | — | none |
| Flat Color Icons | `flat-color-icons` | 0% | 0% | 0% | — | 61 | — | none |
| Entypo+ | `entypo` | 0% | 0% | 0% | — | — | — | none |
| Foundation | `foundation` | 0% | 0% | 0% | — | — | — | none |
| Raphael | `raphael` | 0% | 0% | 0% | — | — | — | none |
| Icons8 Windows 10 Icons | `icons8` | 0% | 0% | 0% | — | — | — | none |
| Innowatio Font | `iwwa` | 0% | 0% | 0% | — | — | — | none |
| Gala Icons | `gala` | 0% | 0% | 0% | — | — | — | none |
| HeroIcons v1 Outline | `heroicons-outline` | 0% | 0% | 0% | — | — | — | none |
| HeroIcons v1 Solid | `heroicons-solid` | 0% | 0% | 0% | — | — | — | none |
| BoxIcons v2 | `bx` | 0% | 0% | 0% | — | — | — | none |
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
| Icons8 Windows 8 Icons | `wpf` | 0% | 0% | 0% | — | — | — | none |
| Simple line icons | `simple-line-icons` | 0% | 0% | 0% | — | — | — | none |
| Elegant | `et` | 0% | 0% | 0% | — | — | — | none |
| Elusive Icons | `el` | 0% | 0% | 0% | — | — | — | none |
| Vaadin Icons | `vaadin` | 0% | 0% | 0% | — | — | — | none |
| Grommet Icons | `grommet-icons` | 0% | 0% | 0% | — | 5 | — | none |
| WebHostingHub Glyphs | `whh` | 0% | 0% | 0% | — | — | — | none |
| SmartIcons Glyph | `si-glyph` | 0% | 0% | 0% | — | — | — | none |
| Material Design Iconic Font | `zmdi` | 0% | 0% | 0% | — | — | — | none |
| Ligature Symbols | `ls` | 0% | 0% | 0% | — | — | — | none |
| BPMN | `bpmn` | 0% | 0% | 0% | — | — | — | none |
| Flat UI Icons | `flat-ui` | 0% | 0% | 0% | — | 19 | — | none |
| Vesper Icons | `vs` | 0% | 0% | 0% | — | — | — | none |
| TopCoat Icons | `topcoat` | 0% | 0% | 0% | — | — | — | none |
| Icalicons | `il` | 0% | 0% | 0% | — | — | — | none |
| Web Symbols Liga | `websymbol` | 0% | 0% | 0% | — | — | — | none |
| Fontelico | `fontelico` | 0% | 0% | 0% | — | — | — | none |
| PrestaShop Icons | `ps` | 0% | 0% | 0% | — | — | — | none |
| Feather Icons | `feather` | 0% | 0% | 0% | — | — | — | none |
| Mono Icons | `mono-icons` | 0% | 0% | 0% | — | — | — | none |
| Pepicons | `pepicons` | 0% | 0% | 0% | — | 125 | — | none |
| Fluent Emoji | `fluent-emoji` | 0% | 0% | 0% | — | 1 | — | none |
