# Font / manifest reconciliation audit

Generated 2026-05-16. For every `(font, codepoint)` pair declared in a pack's manifest, we open the emitted TTF with `fontkit` and verify the codepoint maps to a glyph with a non-empty outline. Anything that fails one of those checks ships as a blank box in the consumer app.

- **Codepoints expected across all fonts:** 366,800
- **Codepoints missing from emitted TTF:** 10
- **Codepoints present but with empty outline:** 569
- **TTFs that failed to open:** 0

## Fonts with drift

| Prefix | Font | Expected | Missing | Empty | Sample missing/empty | Error |
|---|---|---:|---:|---:|---|---|
| `meteocons` | `Meteocons` | 440 | 0 | 158 | `clear-day`, `clear-day-fill` | — |
| `devicon` | `Devicon` | 1,045 | 0 | 115 | `anaconda`, `anaconda-wordmark` | — |
| `token-branded` | `TokenBranded` | 1,664 | 0 | 98 | `10set`, `aag` | — |
| `cryptocurrency-color` | `CryptocurrencyColor` | 481 | 0 | 35 | `0xbtc`, `2give` | — |
| `vscode-icons` | `VscodeIcons` | 701 | 0 | 27 | `file-type-agda`, `file-type-codeowners` | — |
| `skill-icons` | `SkillIcons` | 400 | 0 | 18 | `aiscript-light`, `cloudflare-light` | — |
| `noto-v1` | `NotoV1` | 647 | 0 | 14 | `atom-symbol`, `birthday-cake` | — |
| `fluent-emoji` | `FluentEmoji` | 2,777 | 0 | 10 | `backhand-index-pointing-right`, `backhand-index-pointing-right-dark` | — |
| `glyphs-poly` | `GlyphsPoly` | 733 | 0 | 10 | `building-2`, `ear` | — |
| `flagpack` | `Flagpack` | 256 | 0 | 10 | `aq`, `ci` | — |
| `devicon` | `DeviconSecondary` | 192 | 0 | 9 | `chartjs`, `chartjs-wordmark` | — |
| `streamline-ultimate-color` | `StreamlineUltimateColor` | 587 | 0 | 7 | `cloud-loading`, `information-circle` | — |
| `oui` | `Oui` | 443 | 0 | 6 | `empty`, `menu` | — |
| `streamline-plump-color` | `StreamlinePlumpColor` | 998 | 0 | 6 | `mail-send-reply-all-flat`, `man-arm-raises-2-alternate-flat` | — |
| `flag` | `Flag` | 491 | 0 | 6 | `fm-1x1`, `fm-4x3` | — |
| `material-icon-theme` | `MaterialIconTheme` | 780 | 2 | 3 | `mjml`, `stylelint`, `apiblueprint` | — |
| `logos` | `Logos` | 937 | 0 | 5 | `appveyor`, `brandfolder-icon` | — |
| `svg-spinners` | `SvgSpinners` | 27 | 4 | 0 | `pulse-ring`, `pulse-rings-2` | — |
| `skill-icons` | `SkillIconsSecondary` | 131 | 0 | 4 | `cassandra-dark`, `verilog` | — |
| `streamline-cyber-color` | `StreamlineCyberColor` | 500 | 0 | 3 | `cannabis-leaf`, `hammer-3` | — |
| `vscode-icons` | `VscodeIconsSecondary` | 329 | 0 | 3 | `file-type-knip`, `file-type-light-prettier` | — |
| `logos` | `LogosSecondary` | 378 | 0 | 2 | `geekbot`, `gnu-net` | — |
| `glyphs` | `GlyphsSecondary` | 1,605 | 0 | 2 | `crosshairs-bold`, `eye-lashes-duo` | — |
| `token-branded` | `TokenBrandedSecondary` | 205 | 0 | 2 | `h2o`, `susd` | — |
| `emojione-v1` | `EmojioneV1` | 367 | 0 | 2 | `crown`, `womans-sandal` | — |
| `gcp` | `Gcp` | 214 | 0 | 2 | `advanced-solutions-lab`, `my-cloud` | — |
| `devicon-plain` | `DeviconPlain` | 760 | 2 | 0 | `towergit-wordmark`, `uwsgi` | — |
| `icon-park` | `IconPark` | 2,658 | 0 | 1 | `upload` | — |
| `icon-park` | `IconParkSecondary` | 80 | 0 | 1 | `switch-button` | — |
| `material-icon-theme` | `MaterialIconThemeSecondary` | 540 | 1 | 0 | `mjml` | — |
| `qlementine-icons` | `QlementineIcons` | 885 | 0 | 1 | `quality-0-16` | — |
| `flowbite` | `Flowbite` | 833 | 0 | 1 | `pizza-slice-outline` | — |
| `radix-icons` | `RadixIcons` | 345 | 0 | 1 | `transparency-grid` | — |
| `icon-park-outline` | `IconParkOutline` | 2,658 | 0 | 1 | `upload` | — |
| `streamline-color` | `StreamlineColor` | 1,996 | 0 | 1 | `gold-flat` | — |
| `glyphs-poly` | `GlyphsPolySecondary` | 294 | 0 | 1 | `timer-fast` | — |
| `eos-icons` | `EosIcons` | 247 | 1 | 0 | `arrow-rotate` | — |
| `flat-ui` | `FlatUiSecondary` | 20 | 0 | 1 | `box` | — |
| `gcp` | `GcpSecondary` | 42 | 0 | 1 | `automl` | — |
| `openmoji` | `Openmoji` | 4,049 | 0 | 1 | `signal` | — |
| `codicon` | `Codicon` | 568 | 0 | 1 | `blank` | — |
