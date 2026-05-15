# Stroke / evenodd raster-fill audit

Generated 2026-05-15. For each set we sample the first 25 icons and measure two ratios: **stroke** (icons with `stroke=` and no fill) and **evenodd** (icons that rely on `fill-rule="evenodd"` for internal cutouts). Both cases need the rasterize+Potrace pre-pass (`oslllo-svg-fixer`) — otherwise stroke icons render as solid discs and evenodd icons lose their holes (the `car` / `bug` gravity-ui glyphs we initially shipped as blobs).

- **Sets receiving raster pre-pass:** 111 / 225
- **Of those, auto-detected:** 85
- **Sets with ≥20% raster signal that were NOT processed:** 6
- **Sets containing duo-tone icons:** 70 (18,114 icons across them)
- **Sets with ≥20% paint-order risk (multi-fill bodies that would render as monochrome blobs):** 12
- **Icons proactively dropped this run for paint-order risk:** 17,158

If any "missed" sets render incorrectly in the example app, add their prefix to `strokeFillSets` in `tools/generator/config.yaml`.

## Paint-order risk (multi-fill bodies)

Iconify bodies that paint two or more concrete colors (e.g. a light letterform on a dark background rect, like `logos:adobe-after-effects`) cannot be losslessly translated to a monochrome TTF — the foreground shape collapses into the background fill region (same `currentColor`, non-zero winding) and the glyph renders as a featureless filled blob. Rasterize-trace does NOT fix this (Potrace traces the combined silhouette as one filled region). The pipeline now drops such icons at validation so they never appear in the Dart class. Counts below are after duotone-split + stroke-fill, so packs neutralised by the raster pre-pass report 0%.

| Set | Prefix | Paint-order % | Dropped | Raster applied | Spot-check |
|---|---|---:|---:|:---:|---|
| Circle Flags | `circle-flags` | 100% | 732 | — | `aa`, `ab`, `ac` |
| Kameleon color icons | `streamline-kameleon-color` | 88% | 334 | — | `aid-kit`, `airconditioner`, `airconditioner-duo` |
| Emoji One (Colored) | `emojione` | 84% | 1,683 | — | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| UnJS Logos | `unjs` | 76% | 44 | — | `c12`, `changelogen`, `citty` |
| Twitter Emoji | `twemoji` | 76% | 3,861 | — | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| Fluent Emoji Flat | `fluent-emoji-flat` | 72% | 2,342 | — | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| Firefox OS Emoji | `fxemoji` | 72% | 753 | — | `acorn`, `admissiontickets`, `aerialtramway` |
| Emoji One (v1) | `emojione-v1` | 68% | 951 | — | `admission-tickets`, `aerial-tramway`, `airplane` |
| Flat Color Icons | `flat-color-icons` | 60% | 208 | — | `about`, `accept-database`, `add-column` |
| Noto Emoji (v1) | `noto-v1` | 56% | 1,490 | — | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| Noto Emoji | `noto` | 48% | 3,419 | — | `1st-place-medal`, `2nd-place-medal`, `3rd-place-medal` |
| VSCode Icons | `vscode-icons` | 24% | 552 | — | `file-type-access`, `file-type-ada`, `file-type-affinitydesigner` |
| SVG Logos | `logos` | 8% | 623 | — | `admob`, `aerogear`, `ai` |
| Material Icon Theme | `material-icon-theme` | 4% | 134 | — | `apps-script`, `aurelia`, `auto` |
| Fluent UI System Icons | `fluent` | 0% | 5 | — | `flag-pride-16-filled`, `flag-pride-20-filled`, `flag-pride-24-filled` |
| Fluent UI System Color Icons | `fluent-color` | 0% | 27 | — | `building-government-16`, `building-government-20`, `building-government-24` |

## Duotone sets (manual visual check recommended)

Open these sets in the example app and verify the primary / secondary layers of a few icons sit in their expected positions (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left). The "Spot-check" column lists 2–3 names per pack — start there, since these are the icons most likely to surface duotone layering bugs.

| Set | Prefix | Duotone icons | Spot-check |
|---|---|---:|---|
| Solar | `solar` | 2,413 | `4k-bold-duotone`, `4k-line-duotone`, `accessibility-bold-duotone` |
| Glyphs | `glyphs` | 1,605 | `a-outline`, `accessible-duo`, `accessible-outline` |
| Phosphor | `ph` | 1,528 | `acorn-duotone`, `address-book-duotone`, `address-book-tabs-duotone` |
| Google Material Icons | `ic` | 1,500 | `baseline-battery-20`, `baseline-battery-30`, `baseline-battery-50` |
| Freehand color icons | `streamline-freehand-color` | 971 | `accessories-remote-shutter`, `accessories-retro-film-1`, `accounting-abacus` |
| Streamline color | `streamline-color` | 810 | `add-bell-notification-flat`, `add-circle-flat`, `add-layer-2-flat` |
| Pepicons Print | `pepicons-print` | 703 | `airplane`, `airplane-circle`, `airplane-circle-filled` |
| Twitter Emoji | `twemoji` | 637 | `a-button`, `a-button-blood-type`, `ab-button` |
| Material Icon Theme | `material-icon-theme` | 539 | `adobe-illustrator`, `adobe-illustrator-light`, `adobe-photoshop` |
| Fluent Emoji Flat | `fluent-emoji-flat` | 495 | `a-button-blood-type`, `ab-button-blood-type`, `adhesive-bandage` |
| Sharp color icons | `streamline-sharp-color` | 437 | `3d-move-flat`, `3d-rotate-y-axis-flat`, `3d-scale-flat` |
| Plump color icons | `streamline-plump-color` | 435 | `3d-coordinate-axis-flat`, `add-bell-notification-flat`, `add-layer-2-flat` |
| Flex color icons | `streamline-flex-color` | 433 | `3d-coordinate-axis-flat`, `3d-rotate-1-flat`, `3d-rotate-y-axis-flat` |
| Lets Icons | `lets-icons` | 380 | `3d-box-duotone`, `add-duotone`, `add-duotone-line` |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 379 | `aave`, `abt`, `act` |
| SVG Logos | `logos` | 378 | `100tb`, `6px`, `adobe-after-effects` |
| Streamline Emojis | `streamline-emojis` | 364 | `2`, `airplane`, `alien` |
| VSCode Icons | `vscode-icons` | 329 | `default-root-folder`, `default-root-folder-opened`, `file-type-access2` |
| Sargam Icons | `si` | 323 | `actions-duotone`, `add-alarm-duotone`, `add-circle-duotone` |
| Glyphs Poly | `glyphs-poly` | 294 | `adjust`, `adjust-1`, `analytics` |
| Emoji One (Colored) | `emojione` | 271 | `a-button`, `ab-button`, `antenna-bars` |
| Catppuccin Icons | `catppuccin` | 264 | `angular`, `angular-component`, `angular-directive` |
| Noto Emoji (v1) | `noto-v1` | 246 | `ab-button`, `ab-button-blood-type`, `american-football` |
| IconaMoon | `iconamoon` | 235 | `3d-duotone`, `arrow-bottom-left-3-square-duotone`, `arrow-bottom-left-4-square-duotone` |
| Web3 Icons Branded | `token-branded` | 205 | `0x0`, `adoge`, `aevo` |
| Emoji One (v1) | `emojione-v1` | 197 | `a-button`, `ab-button`, `anchor` |
| Stash Icons | `stash` | 193 | `airplane-duotone`, `arrows-switch-duotone`, `article-alt-duotone` |
| Devicon | `devicon` | 192 | `aframe`, `aftereffects`, `akka` |
| Unicons Monochrome | `uim` | 188 | `airplay`, `align`, `android` |
| Ant Design Icons | `ant-design` | 153 | `account-book-twotone`, `alert-twotone`, `api-twotone` |
| Skill Icons | `skill-icons` | 131 | `ableton-dark`, `ableton-light`, `actix-dark` |
| Firefox OS Emoji | `fxemoji` | 128 | `2hearts`, `alien`, `alienmonster` |
| Pepicons | `pepicons` | 125 | `airplane-print`, `alarm-print`, `angle-down-print` |
| Duoicons | `duo-icons` | 91 | `add-circle`, `airplay`, `alert-octagon` |
| IconPark | `icon-park` | 80 | `apple`, `avocado`, `baby-feet` |
| Flat Color Icons | `flat-color-icons` | 61 | `alphabetical-sorting-az`, `alphabetical-sorting-za`, `approval` |
| Noto Emoji | `noto` | 58 | `admission-tickets`, `alien`, `bell-pepper` |
| Flag Icons | `flag` | 47 | `at-1x1`, `at-4x3`, `bd-1x1` |
| Qlementine Icons | `qlementine-icons` | 45 | `anchor-bottom-left-16`, `anchor-bottom-middle-16`, `anchor-bottom-right-16` |
| Google Cloud Icons | `gcp` | 42 | `ai-platform`, `apigee-api-platform`, `automl` |
| CoreUI Flags | `cif` | 35 | `al`, `at`, `bd` |
| css.gg | `gg` | 31 | `align-bottom`, `align-center`, `align-left` |
| NRK Core Icons | `nrk` | 23 | `dialogue`, `download`, `edit` |
| Cryptocurrency Icons | `cryptocurrency` | 21 | `agi`, `aion`, `cix` |
| Flat UI Icons | `flat-ui` | 20 | `android`, `book`, `box` |
| Flagpack | `flagpack` | 16 | `al`, `bd`, `bh` |
| Web3 Icons | `token` | 10 | `akt`, `h2o`, `iotex` |
| Stickies color icons | `streamline-stickies-color` | 5 | `bluetooth-duo`, `help-duo`, `love-duo` |
| Grommet Icons | `grommet-icons` | 5 | `mastercard`, `star-half`, `wifi-low` |
| Tabler Icons | `tabler` | 4 | `brand-parsinta`, `brand-parsinta-bold`, `brand-parsinta-light` |
| WordPress Icons | `wordpress` | 4 | `corner-bottom-left`, `corner-bottom-right`, `corner-top-left` |
| Radix Icons | `radix-icons` | 4 | `shadow`, `shadow-inner`, `shadow-none` |
| Kameleon color icons | `streamline-kameleon-color` | 3 | `heart-key-duo`, `peace-duo`, `wrench-duo` |
| Huge Icons | `hugeicons` | 3 | `arrow-big-right-dash`, `hamburger-01`, `right-to-left-list-bullet` |
| Arcticons | `arcticons` | 3 | `auto-away`, `fairtiq`, `itinerary` |
| Evil Icons | `ei` | 3 | `envelope`, `spinner`, `spinner-2` |
| Devicon Plain | `devicon-plain` | 2 | `livewire`, `weblate-wordmark` |
| Ultimate color icons | `streamline-ultimate-color` | 2 | `amazon-web-services-logo`, `loading` |
| MingCute Icon | `mingcute` | 2 | `loading-3-fill`, `loading-3-line` |
| Pixelarticons | `pixelarticons` | 2 | `mail-right`, `mail-right-sharp` |
| Clarity | `clarity` | 2 | `vm-bug-inverse-line`, `vm-bug-line` |
| OpenMoji | `openmoji` | 1 | `tardis` |
| Bitcoin Icons | `bitcoin-icons` | 1 | `contacts-filled` |
| Cuida Icons | `cuida` | 1 | `sort-ascending-duotone` |
| Fluent Emoji | `fluent-emoji` | 1 | `tongue` |
| Pepicons Pop! | `pepicons-pop` | 1 | `keyboard-circle-filled` |
| Pepicons Pencil | `pepicons-pencil` | 1 | `keyboard-circle-filled` |
| TDesign Icons | `tdesign` | 1 | `order` |
| Bootstrap Icons | `bi` | 1 | `opencollective` |
| Temaki | `temaki` | 1 | `crossing-markings-zebra-bicolour` |

## Per-icon raster-trace fixes

Sets where the pack-level sample was below the stroke/evenodd threshold but individual icons still needed rasterize-trace. Without per-icon detection, `oui:check-in-circle-empty` shipped as a solid disc and `oui:chat-left` as a filled speech bubble (the `oui` pack sample showed only 16% evenodd, below the 20% pack threshold).

- **Icons rasterize-traced via per-icon path this run:** 4,612

| Set | Prefix | Icons traced | Stroke % | Evenodd % | Spot-check |
|---|---|---:|---:|---:|---|
| IonIcons | `ion` | 559 | 48% | 0% | `accessibility-outline`, `add`, `add-circle-outline` |
| Famicons | `famicons` | 528 | 48% | 0% | `accessibility-outline`, `add`, `add-circle-outline` |
| Bootstrap Icons | `bi` | 395 | 0% | 0% | `activity`, `align-end`, `align-start` |
| Noto Emoji | `noto` | 376 | 12% | 0% | `admission-tickets`, `aerial-tramway`, `alarm-clock` |
| Stash Icons | `stash` | 358 | 0% | 12% | `airplane`, `airplane-duotone`, `airplane-light` |
| Garden SVG Icons | `garden` | 348 | 28% | 0% | `adjust-fill-16`, `adjust-stroke-12`, `adjust-stroke-16` |
| Noto Emoji (v1) | `noto-v1` | 276 | 24% | 0% | `admission-tickets`, `airplane`, `alembic` |
| Emoji One (v1) | `emojione-v1` | 257 | 0% | 8% | `airplane-arrival`, `airplane-departure`, `baby` |
| VSCode Icons | `vscode-icons` | 189 | 8% | 12% | `file-type-advpl`, `file-type-affinity`, `file-type-agda` |
| Fluent Emoji Flat | `fluent-emoji-flat` | 185 | 0% | 4% | `anchor`, `auto-rickshaw`, `backhand-index-pointing-up-dark` |
| Fluent UI System Color Icons | `fluent-color` | 179 | 0% | 0% | `animal-paw-print-20`, `approvals-app-16`, `approvals-app-20` |
| OpenSearch UI | `oui` | 112 | 0% | 16% | `aggregate`, `alert`, `analyze-event` |
| Codicons | `codicon` | 99 | 0% | 8% | `ask`, `azure`, `beaker-stop` |
| Fluent Emoji High Contrast | `fluent-emoji-high-contrast` | 97 | 0% | 0% | `baby-angel`, `bento-box`, `billed-cap` |
| Google Material Icons | `ic` | 78 | 0% | 0% | `baseline-bakery-dining`, `baseline-ballot`, `baseline-barcode` |
| Ant Design Icons | `ant-design` | 71 | 0% | 16% | `alipay-circle-filled`, `alipay-circle-outlined`, `alipay-outlined` |
| Framework7 Icons | `f7` | 64 | 0% | 0% | `at`, `at-circle-fill`, `bars` |
| Kameleon color icons | `streamline-kameleon-color` | 63 | 0% | 12% | `aid-kit-duo`, `astronaut-duo`, `bank-check-duo` |
| Devicon Plain | `devicon-plain` | 57 | 0% | 4% | `apache`, `arduino`, `arduino-wordmark` |
| SVG Logos | `logos` | 50 | 0% | 0% | `appveyor`, `argo`, `autocode` |
| Material Icon Theme | `material-icon-theme` | 35 | 8% | 8% | `advpl`, `apiblueprint`, `appveyor` |
| Twitter Emoji | `twemoji` | 35 | 0% | 0% | `detective`, `detective-dark-skin-tone`, `detective-light-skin-tone` |
| BPMN | `bpmn` | 32 | 28% | 0% | `business-rule`, `business-rule-task`, `call-activity` |
| Entypo+ | `entypo` | 19 | 0% | 0% | `blackboard`, `clapperboard`, `creative-commons-attribution` |
| Emoji One (Monotone) | `emojione-monotone` | 16 | 0% | 4% | `alien-monster`, `articulated-lorry`, `cherries` |
| UnJS Logos | `unjs` | 13 | 24% | 0% | `automd`, `bundle-runner`, `confbox` |
| Carbon | `carbon` | 11 | 0% | 0% | `airport-01`, `calendar-tools`, `executable-program` |
| Emoji One (Colored) | `emojione` | 11 | 0% | 0% | `blossom`, `cherries`, `cow` |
| TopCoat Icons | `topcoat` | 10 | 0% | 16% | `attachment`, `back`, `back-light` |
| Foundation | `foundation` | 10 | 0% | 4% | `background-color`, `crown`, `social-500px` |
| Nimbus | `nimbus` | 7 | 0% | 4% | `check`, `drag-dots`, `drink` |
| Custom Brand Icons | `cbi` | 7 | 0% | 0% | `desjardins-group`, `influxdata`, `ubiquiti-cam-flex` |
| Flat Color Icons | `flat-color-icons` | 6 | 8% | 0% | `android-os`, `automotive`, `electrical-threshold` |
| Mono Icons | `mi` | 6 | 0% | 4% | `backspace`, `enter`, `flag` |
| Mono Icons | `mono-icons` | 6 | 0% | 4% | `backspace`, `enter`, `flag` |
| Gridicons | `gridicons` | 5 | 0% | 0% | `reader-external`, `reader-follow`, `reader-following` |
| Zondicons | `zondicons` | 5 | 0% | 0% | `php-elephant`, `stand-by`, `yin-yang` |
| Circle Flags | `circle-flags` | 5 | 0% | 0% | `it-21`, `it-42`, `it-67` |
| Dashicons | `dashicons` | 5 | 0% | 0% | `amazon`, `google`, `googleplus` |
| Evil Icons | `ei` | 4 | 0% | 0% | `sc-github`, `sc-google-plus`, `sc-instagram` |
| Academicons | `academicons` | 3 | 0% | 0% | `dblp`, `mtmt`, `wiley` |
| Icons8 Windows 8 Icons | `wpf` | 2 | 0% | 4% | `android-os`, `androidos` |
| OOUI | `ooui` | 2 | 0% | 0% | `logo-codex`, `user-blocked` |
| Boxicons Brands | `bxl` | 2 | 0% | 0% | `github`, `whatsapp` |
| Line Awesome | `la` | 2 | 0% | 0% | `github`, `whatsapp` |
| BoxIcons v2 | `bx` | 2 | 0% | 0% | `bxl-github`, `bxl-whatsapp` |
| EOS Icons | `eos-icons` | 1 | 0% | 4% | `3d-print` |
| Unicons | `uil` | 1 | 0% | 0% | `outline` |
| Unicons Monochrome | `uim` | 1 | 0% | 0% | `dropbox` |
| Unicons Thin Line | `uit` | 1 | 0% | 0% | `social-media-logo` |
| SVG Spinners | `svg-spinners` | 1 | 0% | 0% | `ring-resize` |
| Clarity | `clarity` | 1 | 0% | 0% | `credit-card-solid` |
| Entypo+ Social | `entypo-social` | 1 | 0% | 0% | `vk` |
| Firefox OS Emoji | `fxemoji` | 1 | 0% | 0% | `speechbubble` |
| Map Icons | `map` | 1 | 0% | 0% | `sign-language` |
| Elusive Icons | `el` | 1 | 0% | 0% | `plurk-alt` |

## Inverse-mask pattern (resvg-aware trace)

Icons whose body uses `<defs><mask id="X">...</mask></defs>` plus a consumer `<path mask="url(#X)"/>` (Solar bold, icon-park-twotone, icon-park-solid, line-md, pepicons-pop/pencil, lets-icons duotone-line, …). Before the custom stroke-fill worker landed, these icons shipped with their main body invisible because `oslllo-svg-fixer` force-set the first <path>'s fill to black inside the mask. The worker bypasses that step now and the bodies trace correctly via resvg.

- **Icons using the inverse-mask pattern across all packs:** 3,949

| Set | Prefix | Mask icons | % of pack | Spot-check |
|---|---|---:|---:|---|
| IconPark TwoTone | `icon-park-twotone` | 1,944 | 100% | `abnormal`, `acceleration`, `activity-source` |
| IconPark Solid | `icon-park-solid` | 928 | 47% | `abnormal`, `ad`, `add` |
| Material Line Icons | `line-md` | 482 | 38% | `beer`, `beer-alt`, `beer-alt-filled` |
| Pepicons Pop! | `pepicons-pop` | 254 | 20% | `airplane-circle-filled`, `alarm-circle-filled`, `angle-down-circle-filled` |
| Pepicons Pencil | `pepicons-pencil` | 254 | 20% | `airplane-circle-filled`, `alarm-circle-filled`, `angle-down-circle-filled` |
| Solar | `solar` | 28 | 0% | `accumulator-bold`, `card-bold`, `chat-round-dots-bold` |
| Circle Flags | `circle-flags` | 23 | 100% | `it-21`, `it-23`, `it-25` |
| VSCode Icons | `vscode-icons` | 11 | 2% | `file-type-azurepipelines`, `file-type-compass`, `file-type-gemini` |
| Devicon | `devicon` | 10 | 1% | `argocd`, `jekyll`, `lovable` |
| Lets Icons | `lets-icons` | 5 | 0% | `add-square-duotone-line`, `folder-copy-duotone-line`, `folder-dublicate-duotone-line` |
| Google Cloud Icons | `gcp` | 3 | 1% | `cloud-healthcare-api`, `pubsub`, `security-health-advisor` |
| Bitcoin Icons | `bitcoin-icons` | 2 | 1% | `chair-filled`, `printer-outline` |
| Skill Icons | `skill-icons` | 2 | 1% | `less-dark`, `less-light` |
| Noto Emoji (v1) | `noto-v1` | 1 | 0% | `bow-and-arrow` |
| Devicon Plain | `devicon-plain` | 1 | 0% | `starship` |
| Lineicons | `lineicons` | 1 | 0% | `facebook-rounded` |

## All sets

| Set | Prefix | Stroke % | Evenodd % | Paint-order % | Per-icon | Duotone | Applied | Source |
|---|---|---:|---:|---:|---:|---:|:---:|---|
| IonIcons | `ion` | 48% | 0% | 0% | 559 | — | — | none |
| Famicons | `famicons` | 48% | 0% | 0% | 528 | — | — | none |
| Garden SVG Icons | `garden` | 28% | 0% | 0% | 348 | — | — | none |
| BPMN | `bpmn` | 28% | 0% | 0% | 32 | — | — | none |
| UnJS Logos | `unjs` | 24% | 0% | 76% | 13 | — | — | none |
| Noto Emoji (v1) | `noto-v1` | 24% | 0% | 56% | 276 | 246 | — | none |
| VSCode Icons | `vscode-icons` | 8% | 12% | 24% | 189 | 329 | — | none |
| Ant Design Icons | `ant-design` | 0% | 16% | 0% | 71 | 153 | — | none |
| OpenSearch UI | `oui` | 0% | 16% | 0% | 112 | — | — | none |
| Material Icon Theme | `material-icon-theme` | 8% | 8% | 4% | 35 | 539 | — | none |
| TopCoat Icons | `topcoat` | 0% | 16% | 0% | 10 | — | — | none |
| Stash Icons | `stash` | 0% | 12% | 0% | 358 | 193 | — | none |
| Kameleon color icons | `streamline-kameleon-color` | 0% | 12% | 88% | 63 | 3 | — | none |
| Noto Emoji | `noto` | 12% | 0% | 48% | 376 | 58 | — | none |
| Codicons | `codicon` | 0% | 8% | 0% | 99 | — | — | none |
| Emoji One (v1) | `emojione-v1` | 0% | 8% | 68% | 257 | 197 | — | none |
| Flat Color Icons | `flat-color-icons` | 8% | 0% | 60% | 6 | 61 | — | none |
| EOS Icons | `eos-icons` | 0% | 4% | 0% | 1 | — | — | none |
| Mono Icons | `mi` | 0% | 4% | 0% | 6 | — | — | none |
| Nimbus | `nimbus` | 0% | 4% | 0% | 7 | — | — | none |
| Devicon Plain | `devicon-plain` | 0% | 4% | 0% | 57 | 2 | — | none |
| Fluent Emoji Flat | `fluent-emoji-flat` | 0% | 4% | 72% | 185 | 495 | — | none |
| Emoji One (Monotone) | `emojione-monotone` | 0% | 4% | 0% | 16 | — | — | none |
| Foundation | `foundation` | 0% | 4% | 0% | 10 | — | — | none |
| Icons8 Windows 8 Icons | `wpf` | 0% | 4% | 0% | 2 | — | — | none |
| Mono Icons | `mono-icons` | 0% | 4% | 0% | 6 | — | — | none |
| Material Line Icons | `line-md` | 100% | 0% | 0% | — | — | ✓ | auto |
| IconaMoon | `iconamoon` | 80% | 20% | 0% | — | 235 | ✓ | explicit |
| Iconoir | `iconoir` | 76% | 24% | 0% | — | — | ✓ | explicit |
| Lucide | `lucide` | 100% | 0% | 0% | — | — | ✓ | explicit |
| Lucide Lab | `lucide-lab` | 100% | 0% | 0% | — | — | ✓ | explicit |
| ProIcons | `proicons` | 100% | 4% | 0% | — | — | ✓ | auto |
| Meteor Icons | `meteor-icons` | 100% | 0% | 0% | — | — | ✓ | explicit |
| Humbleicons | `humbleicons` | 100% | 0% | 0% | — | — | ✓ | explicit |
| WeUI Icon | `weui` | 0% | 100% | 0% | — | — | ✓ | auto |
| Huge Icons | `hugeicons` | 100% | 0% | 0% | — | 3 | ✓ | explicit |
| Lets Icons | `lets-icons` | 84% | 16% | 0% | — | 380 | ✓ | auto |
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
| Catppuccin Icons | `catppuccin` | 100% | 24% | 0% | — | 264 | ✓ | auto |
| Logos free icons | `streamline-logos` | 36% | 64% | 0% | — | — | ✓ | auto |
| Arcticons | `arcticons` | 100% | 0% | 0% | — | 3 | ✓ | auto |
| OpenMoji | `openmoji` | 100% | 0% | 0% | — | 1 | ✓ | auto |
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
| Glyphs | `glyphs` | 88% | 24% | 0% | — | 1,605 | ✓ | auto |
| Siemens Industrial Experience Icons | `ix` | 0% | 96% | 0% | — | — | ✓ | auto |
| Ultimate color icons | `streamline-ultimate-color` | 96% | 4% | 0% | — | 2 | ✓ | auto |
| Stickies color icons | `streamline-stickies-color` | 96% | 0% | 0% | — | 5 | ✓ | auto |
| IconPark | `icon-park` | 96% | 0% | 0% | — | 80 | ✓ | auto |
| Majesticons | `majesticons` | 76% | 16% | 0% | — | — | ✓ | auto |
| Basil | `basil` | 0% | 92% | 0% | — | — | ✓ | explicit |
| Akar Icons | `akar-icons` | 88% | 4% | 0% | — | — | ✓ | explicit |
| Bitcoin Icons | `bitcoin-icons` | 48% | 44% | 0% | — | 1 | ✓ | auto |
| Cuida Icons | `cuida` | 0% | 92% | 0% | — | 1 | ✓ | auto |
| Freehand free icons | `streamline-freehand` | 0% | 92% | 0% | — | — | ✓ | auto |
| Freehand color icons | `streamline-freehand-color` | 0% | 92% | 0% | — | 971 | ✓ | auto |
| Streamline color | `streamline-color` | 52% | 44% | 0% | — | 810 | ✓ | auto |
| Flagpack | `flagpack` | 24% | 92% | 0% | — | 16 | ✓ | auto |
| Grommet Icons | `grommet-icons` | 68% | 24% | 0% | — | 5 | ✓ | auto |
| Solar | `solar` | 48% | 40% | 0% | — | 2,413 | ✓ | explicit |
| Sargam Icons | `si` | 68% | 20% | 0% | — | 323 | ✓ | auto |
| Feather Icon | `fe` | 0% | 88% | 0% | — | — | ✓ | auto |
| Gravity UI Icons | `gravity-ui` | 0% | 88% | 0% | — | — | ✓ | auto |
| Tabler Icons | `tabler` | 84% | 0% | 0% | — | 4 | ✓ | explicit |
| Flowbite Icons | `flowbite` | 68% | 16% | 0% | — | — | ✓ | auto |
| coolicons | `ci` | 84% | 0% | 0% | — | — | ✓ | auto |
| Gitlab SVGs | `pajamas` | 0% | 84% | 0% | — | — | ✓ | auto |
| Plump color icons | `streamline-plump-color` | 52% | 44% | 0% | — | 435 | ✓ | auto |
| Fluent Emoji | `fluent-emoji` | 68% | 40% | 0% | — | 1 | ✓ | auto |
| Glyphs Poly | `glyphs-poly` | 72% | 32% | 0% | — | 294 | ✓ | auto |
| Pepicons Print | `pepicons-print` | 0% | 76% | 0% | — | 703 | ✓ | auto |
| Teenyicons | `teenyicons` | 44% | 28% | 0% | — | — | ✓ | auto |
| HeroIcons v1 Solid | `heroicons-solid` | 0% | 72% | 0% | — | — | ✓ | auto |
| HeroIcons | `heroicons` | 28% | 40% | 0% | — | — | ✓ | auto |
| Pepicons | `pepicons` | 0% | 68% | 0% | — | 125 | ✓ | auto |
| Pepicons Pop! | `pepicons-pop` | 0% | 64% | 0% | — | 1 | ✓ | auto |
| Pepicons Pencil | `pepicons-pencil` | 0% | 64% | 0% | — | 1 | ✓ | auto |
| NRK Core Icons | `nrk` | 0% | 64% | 0% | — | 23 | ✓ | auto |
| TDesign Icons | `tdesign` | 60% | 0% | 0% | — | 1 | ✓ | explicit |
| css.gg | `gg` | 0% | 60% | 0% | — | 31 | ✓ | auto |
| Ultimate free icons | `streamline-ultimate` | 52% | 8% | 0% | — | — | ✓ | auto |
| Mage Icons | `mage` | 56% | 0% | 0% | — | — | ✓ | explicit |
| Flag Icons | `flag` | 40% | 40% | 0% | — | 47 | ✓ | auto |
| Meteocons | `meteocons` | 56% | 0% | 0% | — | — | ✓ | auto |
| Myna UI Icons | `mynaui` | 52% | 0% | 0% | — | — | ✓ | explicit |
| Nonicons | `nonicons` | 0% | 52% | 0% | — | — | ✓ | auto |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 0% | 52% | 0% | — | 379 | ✓ | auto |
| Duoicons | `duo-icons` | 0% | 48% | 0% | — | 91 | ✓ | auto |
| Google Cloud Icons | `gcp` | 0% | 48% | 0% | — | 42 | ✓ | auto |
| uiw icons | `uiw` | 0% | 44% | 0% | — | — | ✓ | auto |
| MingCute Icon | `mingcute` | 0% | 40% | 0% | — | 2 | ✓ | auto |
| Qlementine Icons | `qlementine-icons` | 0% | 40% | 0% | — | 45 | ✓ | auto |
| Flat UI Icons | `flat-ui` | 4% | 36% | 0% | — | 20 | ✓ | auto |
| SidekickIcons | `sidekickicons` | 28% | 4% | 0% | — | — | ✓ | explicit |
| Web3 Icons | `token` | 0% | 32% | 0% | — | 10 | ✓ | auto |
| CoreUI Flags | `cif` | 28% | 28% | 0% | — | 35 | ✓ | auto |
| Cryptocurrency Icons | `cryptocurrency` | 0% | 28% | 0% | — | 21 | ✓ | auto |
| WordPress Icons | `wordpress` | 0% | 24% | 0% | — | 4 | ✓ | auto |
| FormKit Icons | `formkit` | 4% | 20% | 0% | — | — | ✓ | auto |
| Radix Icons | `radix-icons` | 0% | 24% | 0% | — | 4 | ✓ | explicit |
| File Icons | `file-icons` | 0% | 24% | 0% | — | — | ✓ | auto |
| Skill Icons | `skill-icons` | 0% | 24% | 0% | — | 131 | ✓ | auto |
| Devicon | `devicon` | 0% | 20% | 0% | — | 192 | ✓ | auto |
| Web3 Icons Branded | `token-branded` | 0% | 20% | 0% | — | 205 | ✓ | auto |
| Font-GIS | `gis` | 0% | 20% | 0% | — | — | ✓ | auto |
| Lineicons | `lineicons` | 0% | 16% | 0% | — | — | ✓ | explicit |
| Octicons | `octicon` | 0% | 12% | 0% | — | — | ✓ | explicit |
| Prime Icons | `prime` | 0% | 8% | 0% | — | — | ✓ | explicit |
| Material Symbols | `material-symbols` | 0% | 0% | 0% | — | — | — | none |
| Material Symbols Light | `material-symbols-light` | 0% | 0% | 0% | — | — | — | none |
| Google Material Icons | `ic` | 0% | 0% | 0% | 78 | 1,500 | — | none |
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
| Bootstrap Icons | `bi` | 0% | 0% | 0% | 395 | 1 | — | none |
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
| Temaki | `temaki` | 0% | 0% | 0% | — | 1 | — | none |
| Dinkie Icons | `dinkie-icons` | 0% | 0% | 0% | — | — | — | none |
| Fluent UI System Color Icons | `fluent-color` | 0% | 0% | 0% | 179 | — | — | none |
| Simple Icons | `simple-icons` | 0% | 0% | 0% | — | — | — | none |
| SVG Logos | `logos` | 0% | 0% | 8% | 50 | 378 | — | none |
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
