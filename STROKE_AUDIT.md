# Stroke / evenodd raster-fill audit

Generated 2026-05-13. For each set we sample the first 25 icons and measure two ratios: **stroke** (icons with `stroke=` and no fill) and **evenodd** (icons that rely on `fill-rule="evenodd"` for internal cutouts). Both cases need the rasterize+Potrace pre-pass (`oslllo-svg-fixer`) — otherwise stroke icons render as solid discs and evenodd icons lose their holes (the `car` / `bug` gravity-ui glyphs we initially shipped as blobs).

- **Sets receiving raster pre-pass:** 111 / 225
- **Of those, auto-detected:** 85
- **Sets with ≥20% raster signal that were NOT processed:** 6
- **Sets containing duo-tone icons:** 43 (7,387 icons across them)

If any "missed" sets render incorrectly in the example app, add their prefix to `strokeFillSets` in `tools/generator/config.yaml`.

## Duotone sets (manual visual check recommended)

Open these sets in the example app and verify the primary / secondary layers of a few icons sit in their expected positions (e.g. `ic/baseline-signal-wifi-1-bar-lock` — lock on the right, wifi bars on the left). Sorted by duotone-icon count.

| Set | Prefix | Duotone icons |
|---|---|---:|
| Solar | `solar` | 2,412 |
| Phosphor | `ph` | 1,528 |
| Google Material Icons | `ic` | 1,351 |
| Pepicons Print | `pepicons-print` | 703 |
| Streamline Emojis | `streamline-emojis` | 364 |
| IconaMoon | `iconamoon` | 234 |
| Stash Icons | `stash` | 193 |
| Unicons Monochrome | `uim` | 188 |
| Pepicons | `pepicons` | 125 |
| Duoicons | `duo-icons` | 91 |
| Qlementine Icons | `qlementine-icons` | 41 |
| NRK Core Icons | `nrk` | 23 |
| Noto Emoji | `noto` | 15 |
| Cryptocurrency Icons | `cryptocurrency` | 15 |
| Flat UI Icons | `flat-ui` | 14 |
| css.gg | `gg` | 11 |
| SVG Logos | `logos` | 9 |
| Devicon | `devicon` | 7 |
| Web3 Icons | `token` | 5 |
| Noto Emoji (v1) | `noto-v1` | 4 |
| Tabler Icons | `tabler` | 4 |
| Skill Icons | `skill-icons` | 4 |
| WordPress Icons | `wordpress` | 4 |
| Radix Icons | `radix-icons` | 4 |
| Huge Icons | `hugeicons` | 3 |
| Arcticons | `arcticons` | 3 |
| Grommet Icons | `grommet-icons` | 3 |
| Evil Icons | `ei` | 3 |
| Emoji One (Colored) | `emojione` | 3 |
| VSCode Icons | `vscode-icons` | 2 |
| Material Icon Theme | `material-icon-theme` | 2 |
| Glyphs Poly | `glyphs-poly` | 2 |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 2 |
| MingCute Icon | `mingcute` | 2 |
| Web3 Icons Branded | `token-branded` | 2 |
| Pixelarticons | `pixelarticons` | 2 |
| Clarity | `clarity` | 2 |
| Twitter Emoji | `twemoji` | 2 |
| Devicon Plain | `devicon-plain` | 1 |
| Fluent Emoji Flat | `fluent-emoji-flat` | 1 |
| Bitcoin Icons | `bitcoin-icons` | 1 |
| TDesign Icons | `tdesign` | 1 |
| Firefox OS Emoji | `fxemoji` | 1 |

## All sets

| Set | Prefix | Stroke % | Evenodd % | Duotone | Applied | Source |
|---|---|---:|---:|---:|:---:|---|
| IonIcons | `ion` | 48% | 0% | — | — | none |
| Famicons | `famicons` | 48% | 0% | — | — | none |
| Garden SVG Icons | `garden` | 28% | 0% | — | — | none |
| BPMN | `bpmn` | 28% | 0% | — | — | none |
| UnJS Logos | `unjs` | 24% | 0% | — | — | none |
| Noto Emoji (v1) | `noto-v1` | 24% | 0% | 4 | — | none |
| VSCode Icons | `vscode-icons` | 8% | 12% | 2 | — | none |
| Ant Design Icons | `ant-design` | 0% | 16% | — | — | none |
| OpenSearch UI | `oui` | 0% | 16% | — | — | none |
| Material Icon Theme | `material-icon-theme` | 8% | 8% | 2 | — | none |
| TopCoat Icons | `topcoat` | 0% | 16% | — | — | none |
| Stash Icons | `stash` | 0% | 12% | 193 | — | none |
| Kameleon color icons | `streamline-kameleon-color` | 0% | 12% | — | — | none |
| Noto Emoji | `noto` | 12% | 0% | 15 | — | none |
| Codicons | `codicon` | 0% | 8% | — | — | none |
| Emoji One (v1) | `emojione-v1` | 0% | 8% | — | — | none |
| Flat Color Icons | `flat-color-icons` | 8% | 0% | — | — | none |
| EOS Icons | `eos-icons` | 0% | 4% | — | — | none |
| Mono Icons | `mi` | 0% | 4% | — | — | none |
| Nimbus | `nimbus` | 0% | 4% | — | — | none |
| Devicon Plain | `devicon-plain` | 0% | 4% | 1 | — | none |
| Fluent Emoji Flat | `fluent-emoji-flat` | 0% | 4% | 1 | — | none |
| Emoji One (Monotone) | `emojione-monotone` | 0% | 4% | — | — | none |
| Foundation | `foundation` | 0% | 4% | — | — | none |
| Icons8 Windows 8 Icons | `wpf` | 0% | 4% | — | — | none |
| Mono Icons | `mono-icons` | 0% | 4% | — | — | none |
| Material Line Icons | `line-md` | 100% | 0% | — | ✓ | auto |
| IconaMoon | `iconamoon` | 80% | 20% | 234 | ✓ | explicit |
| Iconoir | `iconoir` | 76% | 24% | — | ✓ | explicit |
| Lucide | `lucide` | 100% | 0% | — | ✓ | explicit |
| Lucide Lab | `lucide-lab` | 100% | 0% | — | ✓ | explicit |
| ProIcons | `proicons` | 100% | 4% | — | ✓ | auto |
| Meteor Icons | `meteor-icons` | 100% | 0% | — | ✓ | explicit |
| Humbleicons | `humbleicons` | 100% | 0% | — | ✓ | explicit |
| WeUI Icon | `weui` | 0% | 100% | — | ✓ | auto |
| Huge Icons | `hugeicons` | 100% | 0% | 3 | ✓ | explicit |
| Lets Icons | `lets-icons` | 84% | 16% | — | ✓ | auto |
| Plump free icons | `streamline-plump` | 36% | 64% | — | ✓ | auto |
| Sharp free icons | `streamline-sharp` | 36% | 64% | — | ✓ | auto |
| IconPark Outline | `icon-park-outline` | 100% | 0% | — | ✓ | auto |
| Cyber free icons | `streamline-cyber` | 100% | 0% | — | ✓ | auto |
| Guidance | `guidance` | 100% | 0% | — | ✓ | explicit |
| Lsicon | `lsicon` | 48% | 52% | — | ✓ | auto |
| Charm Icons | `charm` | 100% | 0% | — | ✓ | auto |
| Bytesize Icons | `bytesize` | 100% | 0% | — | ✓ | auto |
| Streamline Block | `streamline-block` | 0% | 100% | — | ✓ | auto |
| System UIcons | `system-uicons` | 100% | 40% | — | ✓ | auto |
| CodeX Icons | `codex` | 100% | 0% | — | ✓ | auto |
| Streamline | `streamline` | 36% | 64% | — | ✓ | auto |
| Flex free icons | `streamline-flex` | 36% | 64% | — | ✓ | auto |
| Ultimate color icons | `streamline-ultimate-color` | 100% | 4% | — | ✓ | auto |
| Stickies color icons | `streamline-stickies-color` | 100% | 0% | — | ✓ | auto |
| Streamline color | `streamline-color` | 52% | 52% | — | ✓ | auto |
| Flex color icons | `streamline-flex-color` | 52% | 60% | — | ✓ | auto |
| Sharp color icons | `streamline-sharp-color` | 52% | 48% | — | ✓ | auto |
| Cyber color icons | `streamline-cyber-color` | 100% | 0% | — | ✓ | auto |
| Marketeq | `marketeq` | 100% | 0% | — | ✓ | auto |
| Catppuccin Icons | `catppuccin` | 100% | 24% | — | ✓ | auto |
| Logos free icons | `streamline-logos` | 36% | 64% | — | ✓ | auto |
| Arcticons | `arcticons` | 100% | 0% | 3 | ✓ | auto |
| OpenMoji | `openmoji` | 100% | 0% | — | ✓ | auto |
| Streamline Emojis | `streamline-emojis` | 100% | 0% | 364 | ✓ | auto |
| Flagpack | `flagpack` | 24% | 100% | — | ✓ | auto |
| FontAudio | `fad` | 0% | 100% | — | ✓ | auto |
| Health Icons | `healthicons` | 0% | 100% | — | ✓ | auto |
| Covid Icons | `covid` | 100% | 0% | — | ✓ | auto |
| Gala Icons | `gala` | 100% | 0% | — | ✓ | auto |
| HeroIcons v1 Outline | `heroicons-outline` | 100% | 0% | — | ✓ | explicit |
| SmartIcons Glyph | `si-glyph` | 0% | 100% | — | ✓ | auto |
| Feather Icons | `feather` | 100% | 0% | — | ✓ | explicit |
| IconPark Solid | `icon-park-solid` | 96% | 0% | — | ✓ | auto |
| IconPark TwoTone | `icon-park-twotone` | 96% | 0% | — | ✓ | auto |
| Quill Icons | `quill` | 92% | 8% | — | ✓ | auto |
| Siemens Industrial Experience Icons | `ix` | 0% | 96% | — | ✓ | auto |
| IconPark | `icon-park` | 96% | 0% | — | ✓ | auto |
| Majesticons | `majesticons` | 76% | 16% | — | ✓ | auto |
| Basil | `basil` | 0% | 92% | — | ✓ | explicit |
| Akar Icons | `akar-icons` | 88% | 4% | — | ✓ | explicit |
| Bitcoin Icons | `bitcoin-icons` | 48% | 44% | 1 | ✓ | auto |
| Cuida Icons | `cuida` | 0% | 92% | — | ✓ | auto |
| Freehand free icons | `streamline-freehand` | 0% | 92% | — | ✓ | auto |
| Plump color icons | `streamline-plump-color` | 52% | 52% | — | ✓ | auto |
| Freehand color icons | `streamline-freehand-color` | 0% | 92% | — | ✓ | auto |
| Grommet Icons | `grommet-icons` | 68% | 24% | 3 | ✓ | auto |
| Solar | `solar` | 48% | 40% | 2,412 | ✓ | explicit |
| Sargam Icons | `si` | 68% | 24% | — | ✓ | auto |
| Feather Icon | `fe` | 0% | 88% | — | ✓ | auto |
| Gravity UI Icons | `gravity-ui` | 0% | 88% | — | ✓ | auto |
| Glyphs | `glyphs` | 68% | 24% | — | ✓ | auto |
| Glyphs Poly | `glyphs-poly` | 72% | 40% | 2 | ✓ | auto |
| Tabler Icons | `tabler` | 84% | 0% | 4 | ✓ | explicit |
| Flowbite Icons | `flowbite` | 68% | 16% | — | ✓ | auto |
| coolicons | `ci` | 84% | 0% | — | ✓ | auto |
| Gitlab SVGs | `pajamas` | 0% | 84% | — | ✓ | auto |
| Fluent Emoji | `fluent-emoji` | 68% | 40% | — | ✓ | auto |
| Pepicons Print | `pepicons-print` | 0% | 76% | 703 | ✓ | auto |
| Teenyicons | `teenyicons` | 44% | 28% | — | ✓ | auto |
| HeroIcons v1 Solid | `heroicons-solid` | 0% | 72% | — | ✓ | auto |
| HeroIcons | `heroicons` | 28% | 40% | — | ✓ | auto |
| Pepicons | `pepicons` | 0% | 68% | 125 | ✓ | auto |
| Pepicons Pop! | `pepicons-pop` | 0% | 64% | — | ✓ | auto |
| Pepicons Pencil | `pepicons-pencil` | 0% | 64% | — | ✓ | auto |
| NRK Core Icons | `nrk` | 0% | 64% | 23 | ✓ | auto |
| TDesign Icons | `tdesign` | 60% | 0% | 1 | ✓ | explicit |
| css.gg | `gg` | 0% | 60% | 11 | ✓ | auto |
| Ultimate free icons | `streamline-ultimate` | 52% | 8% | — | ✓ | auto |
| Mage Icons | `mage` | 56% | 0% | — | ✓ | explicit |
| Flag Icons | `flag` | 40% | 40% | — | ✓ | auto |
| Meteocons | `meteocons` | 56% | 0% | — | ✓ | auto |
| Myna UI Icons | `mynaui` | 52% | 0% | — | ✓ | explicit |
| Nonicons | `nonicons` | 0% | 52% | — | ✓ | auto |
| Cryptocurrency Color Icons | `cryptocurrency-color` | 0% | 52% | 2 | ✓ | auto |
| Duoicons | `duo-icons` | 0% | 48% | 91 | ✓ | auto |
| Skill Icons | `skill-icons` | 0% | 48% | 4 | ✓ | auto |
| Google Cloud Icons | `gcp` | 0% | 48% | — | ✓ | auto |
| uiw icons | `uiw` | 0% | 44% | — | ✓ | auto |
| MingCute Icon | `mingcute` | 0% | 40% | 2 | ✓ | auto |
| Qlementine Icons | `qlementine-icons` | 0% | 40% | 41 | ✓ | auto |
| Flat UI Icons | `flat-ui` | 4% | 36% | 14 | ✓ | auto |
| SidekickIcons | `sidekickicons` | 28% | 4% | — | ✓ | explicit |
| Web3 Icons | `token` | 0% | 32% | 5 | ✓ | auto |
| CoreUI Flags | `cif` | 28% | 28% | — | ✓ | auto |
| Cryptocurrency Icons | `cryptocurrency` | 0% | 28% | 15 | ✓ | auto |
| WordPress Icons | `wordpress` | 0% | 24% | 4 | ✓ | auto |
| FormKit Icons | `formkit` | 4% | 20% | — | ✓ | auto |
| Radix Icons | `radix-icons` | 0% | 24% | 4 | ✓ | explicit |
| File Icons | `file-icons` | 0% | 24% | — | ✓ | auto |
| Devicon | `devicon` | 0% | 20% | 7 | ✓ | auto |
| Web3 Icons Branded | `token-branded` | 0% | 20% | 2 | ✓ | auto |
| Font-GIS | `gis` | 0% | 20% | — | ✓ | auto |
| Lineicons | `lineicons` | 0% | 16% | — | ✓ | explicit |
| Octicons | `octicon` | 0% | 12% | — | ✓ | explicit |
| Prime Icons | `prime` | 0% | 8% | — | ✓ | explicit |
| Material Symbols | `material-symbols` | 0% | 0% | — | — | none |
| Material Symbols Light | `material-symbols-light` | 0% | 0% | — | — | none |
| Google Material Icons | `ic` | 0% | 0% | 1,351 | — | none |
| Material Design Icons | `mdi` | 0% | 0% | — | — | none |
| Material Design Light | `mdi-light` | 0% | 0% | — | ✓ | explicit |
| Boxicons | `boxicons` | 0% | 0% | — | — | none |
| Remix Icon | `ri` | 0% | 0% | — | — | none |
| Unicons | `uil` | 0% | 0% | — | — | none |
| Pixelarticons | `pixelarticons` | 0% | 0% | 2 | — | none |
| Pixel Icon | `pixel` | 0% | 0% | — | — | none |
| Typicons | `typcn` | 0% | 0% | — | — | none |
| Circum Icons | `circum` | 0% | 0% | — | ✓ | explicit |
| Unicons Monochrome | `uim` | 0% | 0% | 188 | — | none |
| Unicons Thin Line | `uit` | 0% | 0% | — | — | none |
| Unicons Solid | `uis` | 0% | 0% | — | — | none |
| Gridicons | `gridicons` | 0% | 0% | — | — | none |
| SVG Spinners | `svg-spinners` | 0% | 0% | — | — | none |
| Jam Icons | `jam` | 0% | 0% | — | ✓ | explicit |
| Carbon | `carbon` | 0% | 0% | — | — | none |
| CoreUI Free | `cil` | 0% | 0% | — | — | none |
| Röntgen | `roentgen` | 0% | 0% | — | — | none |
| Element Plus | `ep` | 0% | 0% | — | — | none |
| Bootstrap Icons | `bi` | 0% | 0% | — | — | none |
| Pixel free icons | `streamline-pixel` | 0% | 0% | — | — | none |
| Rivet Icons | `rivet-icons` | 0% | 0% | — | — | none |
| Fluent UI System Icons | `fluent` | 0% | 0% | — | — | none |
| Phosphor | `ph` | 0% | 0% | 1,528 | — | none |
| Clarity | `clarity` | 0% | 0% | 2 | — | none |
| Memory Icons | `memory` | 0% | 0% | — | — | none |
| Zondicons | `zondicons` | 0% | 0% | — | — | none |
| Evil Icons | `ei` | 0% | 0% | 3 | — | none |
| Framework7 Icons | `f7` | 0% | 0% | — | — | none |
| Font Awesome Solid | `fa7-solid` | 0% | 0% | — | — | none |
| Font Awesome Regular | `fa7-regular` | 0% | 0% | — | — | none |
| Pico-icon | `picon` | 0% | 0% | — | — | none |
| OOUI | `ooui` | 0% | 0% | — | — | none |
| Maki | `maki` | 0% | 0% | — | — | none |
| Temaki | `temaki` | 0% | 0% | — | — | none |
| Dinkie Icons | `dinkie-icons` | 0% | 0% | — | — | none |
| Fluent UI System Color Icons | `fluent-color` | 0% | 0% | — | — | none |
| Simple Icons | `simple-icons` | 0% | 0% | — | — | none |
| SVG Logos | `logos` | 0% | 0% | 9 | — | none |
| CoreUI Brands | `cib` | 0% | 0% | — | — | none |
| Font Awesome Brands | `fa7-brands` | 0% | 0% | — | — | none |
| Boxicons Brands | `bxl` | 0% | 0% | — | — | none |
| Custom Brand Icons | `cbi` | 0% | 0% | — | — | none |
| Brandico | `brandico` | 0% | 0% | — | — | none |
| Entypo+ Social | `entypo-social` | 0% | 0% | — | — | none |
| Twitter Emoji | `twemoji` | 0% | 0% | 2 | — | none |
| Fluent Emoji High Contrast | `fluent-emoji-high-contrast` | 0% | 0% | — | — | none |
| Emoji One (Colored) | `emojione` | 0% | 0% | 3 | — | none |
| Firefox OS Emoji | `fxemoji` | 0% | 0% | 1 | — | none |
| Circle Flags | `circle-flags` | 0% | 0% | — | — | none |
| Map Icons | `map` | 0% | 0% | — | — | none |
| GeoGlyphs | `geo` | 0% | 0% | — | — | none |
| Game Icons | `game-icons` | 0% | 0% | — | — | none |
| Academicons | `academicons` | 0% | 0% | — | — | none |
| Weather Icons | `wi` | 0% | 0% | — | — | none |
| Medical Icons | `medical-icon` | 0% | 0% | — | — | none |
| Line Awesome | `la` | 0% | 0% | — | — | none |
| Eva Icons | `eva` | 0% | 0% | — | — | none |
| Dashicons | `dashicons` | 0% | 0% | — | — | none |
| Entypo+ | `entypo` | 0% | 0% | — | — | none |
| Raphael | `raphael` | 0% | 0% | — | — | none |
| Icons8 Windows 10 Icons | `icons8` | 0% | 0% | — | — | none |
| Innowatio Font | `iwwa` | 0% | 0% | — | — | none |
| BoxIcons v2 | `bx` | 0% | 0% | — | — | none |
| BoxIcons v2 Solid | `bxs` | 0% | 0% | — | — | none |
| Font Awesome 6 Solid | `fa6-solid` | 0% | 0% | — | — | none |
| Font Awesome 6 Regular | `fa6-regular` | 0% | 0% | — | — | none |
| Font Awesome 6 Brands | `fa6-brands` | 0% | 0% | — | — | none |
| Font Awesome 5 Solid | `fa-solid` | 0% | 0% | — | — | none |
| Font Awesome 5 Regular | `fa-regular` | 0% | 0% | — | — | none |
| Font Awesome 5 Brands | `fa-brands` | 0% | 0% | — | — | none |
| Font Awesome 4 | `fa` | 0% | 0% | — | — | none |
| Fluent UI MDL2 | `fluent-mdl2` | 0% | 0% | — | — | none |
| Fontisto | `fontisto` | 0% | 0% | — | — | none |
| IcoMoon Free | `icomoon-free` | 0% | 0% | — | — | none |
| Subway Icon Set | `subway` | 0% | 0% | — | — | none |
| Open Iconic | `oi` | 0% | 0% | — | — | none |
| Simple line icons | `simple-line-icons` | 0% | 0% | — | — | none |
| Elegant | `et` | 0% | 0% | — | ✓ | explicit |
| Elusive Icons | `el` | 0% | 0% | — | — | none |
| Vaadin Icons | `vaadin` | 0% | 0% | — | — | none |
| WebHostingHub Glyphs | `whh` | 0% | 0% | — | — | none |
| Material Design Iconic Font | `zmdi` | 0% | 0% | — | — | none |
| Ligature Symbols | `ls` | 0% | 0% | — | — | none |
| Vesper Icons | `vs` | 0% | 0% | — | — | none |
| Icalicons | `il` | 0% | 0% | — | — | none |
| Web Symbols Liga | `websymbol` | 0% | 0% | — | — | none |
| Fontelico | `fontelico` | 0% | 0% | — | — | none |
| PrestaShop Icons | `ps` | 0% | 0% | — | — | none |
