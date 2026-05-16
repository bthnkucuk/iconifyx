# Secondary-glyph cmap-name audit

Generated 2026-05-16. For every duotone icon in every pack, open the matching `<Family>Secondary.ttf` and check that `cmap[codepoint]` resolves to a glyph whose name equals the icon name. A mismatch means `svg2ttf`'s outline-dedup aliased the codepoint to a different glyph's name, so the icon ships with the wrong secondary letterform (visible as duotone misalignment / wrong shape). The pipeline demotes any aliased duotone to `.solo` at codegen time; this report verifies how many would be flagged on the next regen.

- **Duotone icons checked across all packs:** 17,922
- **Aliased (cmap → wrong glyph name):** 3,569
- **Missing (codepoint not in cmap at all):** 0
- **Secondary TTFs that failed to open:** 0

## Secondary fonts with aliased duotone codepoints

| Prefix | Secondary font | Declared | Aliased | Missing | Sample aliasing | Error |
|---|---|---:|---:|---:|---|---|
| `solar` | `SolarSecondary` | 1,954 | 676 | 0 | `add-circle-bold-duotone`→`accessibility-bold-duotone`, `add-circle-line-duotone`→`accessibility-line-duotone` | — |
| `pepicons-print` | `PepiconsPrintSecondary` | 703 | 444 | 0 | `airplane-circle-off`→`airplane-circle`, `airplane-off`→`airplane` | — |
| `ph` | `PhSecondary` | 998 | 281 | 0 | `airplane-taxiing-duotone`→`airplane-in-flight-duotone`, `arrow-circle-down-left-duotone`→`arrow-circle-down-duotone` | — |
| `twemoji` | `TwemojiSecondary` | 637 | 262 | 0 | `a-button`→`letter-a`, `a-button-blood-type`→`letter-a` | — |
| `material-icon-theme` | `MaterialIconThemeSecondary` | 539 | 244 | 0 | `adobe-illustrator-light`→`adobe-illustrator`, `adobe-photoshop-light`→`adobe-photoshop` | — |
| `fluent-emoji-flat` | `FluentEmojiFlatSecondary` | 495 | 164 | 0 | `backhand-index-pointing-down-dark`→`backhand-index-pointing-down-light`, `backhand-index-pointing-down-medium`→`backhand-index-pointing-down-light` | — |
| `glyphs` | `GlyphsSecondary` | 1,605 | 162 | 0 | `adjust-duo`→`adjust-1-duo`, `alarm-minus-duo`→`alarm-exclamation-duo` | — |
| `streamline-emojis` | `StreamlineEmojisSecondary` | 364 | 138 | 0 | `astronaut-2`→`astronaut-1`, `baby-angel-1`→`alien` | — |
| `si` | `SiSecondary` | 323 | 138 | 0 | `ai-duotone`→`ai-alt-1-duotone`, `ai-edit-duotone`→`ai-edit-alt-2-duotone` | — |
| `iconamoon` | `IconamoonSecondary` | 235 | 137 | 0 | `arrow-bottom-left-4-square-duotone`→`arrow-bottom-left-3-square-duotone`, `arrow-bottom-left-6-circle-duotone`→`arrow-bottom-left-5-circle-duotone` | — |
| `ph` | `Ph_2Secondary` | 530 | 117 | 0 | `number-square-two-duotone`→`number-square-three-duotone`, `number-square-zero-duotone`→`number-square-three-duotone` | — |
| `solar` | `Solar_2Secondary` | 459 | 116 | 0 | `square-double-alt-arrow-left-bold-duotone`→`square-double-alt-arrow-down-bold-duotone`, `square-double-alt-arrow-left-line-duotone`→`square-double-alt-arrow-down-line-duotone` | — |
| `noto-v1` | `NotoV1Secondary` | 246 | 106 | 0 | `ab-button-blood-type`→`ab-button`, `b-button-blood-type`→`b-button` | — |
| `lets-icons` | `LetsIconsSecondary` | 380 | 94 | 0 | `add-ring-duotone`→`add-duotone`, `add-ring-duotone-line`→`add-duotone-line` | — |
| `catppuccin` | `CatppuccinSecondary` | 264 | 93 | 0 | `angular-component`→`angular`, `angular-directive`→`angular` | — |
| `emojione` | `EmojioneSecondary` | 271 | 70 | 0 | `check-box-with-check`→`ballot-box-with-check`, `counterclockwise-arrows-button`→`anticlockwise-arrows-button` | — |
| `vscode-icons` | `VscodeIconsSecondary` | 329 | 66 | 0 | `file-type-apib2`→`file-type-apib`, `file-type-light-jsconfig`→`file-type-jsconfig` | — |
| `emojione-v1` | `EmojioneV1Secondary` | 197 | 43 | 0 | `check-box-with-check`→`ballot-box-with-check`, `counterclockwise-arrows-button`→`anticlockwise-arrows-button` | — |
| `streamline-color` | `StreamlineColorSecondary` | 810 | 42 | 0 | `add-square-flat`→`add-circle-flat`, `bag-suitcase-2-flat`→`bag-suitcase-1-flat` | — |
| `skill-icons` | `SkillIconsSecondary` | 131 | 41 | 0 | `ableton-light`→`ableton-dark`, `actix-light`→`actix-dark` | — |
| `streamline-freehand-color` | `StreamlineFreehandColorSecondary` | 971 | 19 | 0 | `credit-card-visa`→`credit-card-mastercard`, `crypto-currency-namecoin`→`crypto-currency-litecoin` | — |
| `noto` | `NotoSecondary` | 58 | 13 | 0 | `cat-face-with-wry-smile`→`cat-face-with-tears-of-joy`, `cat-with-tears-of-joy`→`cat-face-with-tears-of-joy` | — |
| `streamline-sharp-color` | `StreamlineSharpColorSecondary` | 437 | 10 | 0 | `brightness-1-flat`→`sun-flat`, `chat-bubble-disable-oval-flat`→`battery-empty-2-flat` | — |
| `pepicons` | `PepiconsSecondary` | 125 | 9 | 0 | `bell-print`→`bell-off-print`, `cloud-print`→`cloud-down-print` | — |
| `devicon` | `DeviconSecondary` | 192 | 9 | 0 | `amazonwebservices-wordmark`→`amazonwebservices`, `chartjs-wordmark`→`chartjs` | — |
| `uim` | `UimSecondary` | 188 | 9 | 0 | `calender`→`calendar`, `clock-two`→`clock-ten` | — |
| `duo-icons` | `DuoIconsSecondary` | 91 | 8 | 0 | `appstore`→`add-circle`, `chart-pie`→`add-circle` | — |
| `ant-design` | `AntDesignSecondary` | 153 | 7 | 0 | `canlendar-twotone`→`calendar-twotone`, `ci-twotone`→`ci-circle-twotone` | — |
| `streamline-flex-color` | `StreamlineFlexColorSecondary` | 433 | 7 | 0 | `humidity-none-flat`→`cloud-off-flat`, `online-medical-service-monitor-flat`→`code-monitor-1-flat` | — |
| `fxemoji` | `FxemojiSecondary` | 128 | 7 | 0 | `heartpurple`→`heartgreen`, `nobicycles`→`donotlittersymbol` | — |
| `flag` | `FlagSecondary` | 47 | 5 | 0 | `id-1x1`→`pl-1x1`, `id-4x3`→`pl-4x3` | — |
| `token-branded` | `TokenBrandedSecondary` | 205 | 4 | 0 | `hedera-hashgraph`→`hedera`, `milkomeda-c1`→`milkomeda-a1` | — |
| `streamline-plump-color` | `StreamlinePlumpColorSecondary` | 435 | 4 | 0 | `compass-navigator-flat`→`atom-flat`, `location-pin-disabled-flat`→`disable-heart-flat` | — |
| `icon-park` | `IconParkSecondary` | 80 | 3 | 0 | `radio-two`→`inclusive-gateway`, `setting`→`preview-open` | — |
| `wordpress` | `WordpressSecondary` | 4 | 3 | 0 | `corner-bottom-right`→`corner-bottom-left`, `corner-top-left`→`corner-bottom-left` | — |
| `cryptocurrency-color` | `CryptocurrencyColorSecondary` | 379 | 3 | 0 | `neo`→`gas`, `paxg`→`pax` | — |
| `flat-color-icons` | `FlatColorIconsSecondary` | 61 | 2 | 0 | `flash-off`→`dislike`, `ok`→`approval` | — |
| `nrk` | `NrkSecondary` | 23 | 2 | 0 | `media-direkte-notlive`→`media-direkte-golive`, `media-playlist-remove`→`media-playlist-add` | — |
| `glyphs-poly` | `GlyphsPolySecondary` | 294 | 2 | 0 | `male`→`female`, `map-signs`→`directions-sign` | — |
| `stash` | `StashSecondary` | 193 | 2 | 0 | `folder-duotone`→`folder-alt-duotone`, `lock-opened-duotone`→`lock-closed-duotone` | — |
| `pixelarticons` | `PixelarticonsSecondary` | 2 | 1 | 0 | `mail-right-sharp`→`mail-right` | — |
| `radix-icons` | `RadixIconsSecondary` | 4 | 1 | 0 | `shadow-none`→`shadow` | — |
| `logos` | `LogosSecondary` | 378 | 1 | 0 | `eta-lang`→`eta-icon` | — |
| `gg` | `GgSecondary` | 31 | 1 | 0 | `spinner-two`→`spinner` | — |
| `flagpack` | `FlagpackSecondary` | 16 | 1 | 0 | `qa`→`bh` | — |
| `clarity` | `ClaritySecondary` | 2 | 1 | 0 | `vm-bug-line`→`vm-bug-inverse-line` | — |
| `cif` | `CifSecondary` | 35 | 1 | 0 | `ua`→`id` | — |
