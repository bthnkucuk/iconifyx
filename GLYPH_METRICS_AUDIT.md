# Glyph metrics audit

Generated 2026-05-15; `@iconify/json` ^2.2.300. Scans every emitted TTF for font-level metric drift, duotone primary/secondary bbox mismatch, cmap-dedup collisions, and per-glyph outliers (narrow / wide / non-1000 advance). Output is deterministic — same input TTFs → byte-identical report.

## Summary

- TTFs scanned: **295**
- TTFs with non-canonical font metrics: **294**
- Duotone primary/secondary mismatch (score > 200 or half-broken): **6,320 icons across 59 packs**
- Glyph dedup collisions (different codepoints sharing one glyph name): **18,513 cases across 166 packs**
- Per-glyph outliers (narrow / wide / non-1000 advance): **13,236**

Detail per pack: [`docs/audit/glyph-metrics/<prefix>.json`](docs/audit/glyph-metrics/). Markdown caps each section at the top 50 rows for readability.

## Highest-risk duotone alignment misses

Score = `|primary.xMin - secondary.xMin| + |primary.xMax - secondary.xMax|`. Threshold: 200 units (= 4 % of em-quad).

| Pack | Icon | Primary x-bbox | Secondary x-bbox | Score | Cause |
|---|---|---|---|---:|---|
| `devicon` | `capacitor` | 0..0 | 0..606 | ∞ | primary-empty |
| `devicon` | `chartjs` | 0..0 | 0..0 | ∞ | primary-empty |
| `devicon` | `chartjs-wordmark` | 0..0 | 0..0 | ∞ | primary-empty |
| `devicon` | `firebase` | 0..0 | 0..867 | ∞ | primary-empty |
| `devicon` | `firebase-wordmark` | 0..0 | 0..754 | ∞ | primary-empty |
| `devicon` | `jetpackcompose` | 0..947 | 0..0 | ∞ | secondary-empty |
| `devicon` | `travis` | 0..1003 | 0..0 | ∞ | secondary-empty |
| `devicon` | `travis-wordmark` | 0..1000 | 0..0 | ∞ | secondary-empty |
| `devicon` | `vapor` | 0..935 | 0..0 | ∞ | secondary-empty |
| `devicon` | `vapor-wordmark` | 0..1000 | 0..0 | ∞ | secondary-empty |
| `devicon` | `visualbasic` | 0..1003 | 0..0 | ∞ | secondary-empty |
| `devicon` | `vitest` | 0..0 | 0..0 | ∞ | primary-empty |
| `flat-ui` | `box` | 0..929 | 0..0 | ∞ | secondary-empty |
| `gcp` | `automl` | 0..534 | 0..0 | ∞ | secondary-empty |
| `glyphs` | `crosshairs-bold` | 0..891 | 0..0 | ∞ | secondary-empty |
| `glyphs` | `eye-lashes-duo` | 0..965 | 0..0 | ∞ | secondary-empty |
| `glyphs-poly` | `timer-fast` | 0..913 | 0..0 | ∞ | secondary-empty |
| `icon-park` | `switch-button` | 0..958 | 0..0 | ∞ | secondary-empty |
| `logos` | `geekbot` | 0..818 | 0..0 | ∞ | secondary-empty |
| `logos` | `gnu-net` | 0..905 | 0..0 | ∞ | secondary-empty |
| `skill-icons` | `cassandra-dark` | -1..1000 | 0..0 | ∞ | secondary-empty |
| `skill-icons` | `ipfs-light` | 0..0 | 0..839 | ∞ | primary-empty |
| `skill-icons` | `solidity` | 0..0 | 0..794 | ∞ | primary-empty |
| `skill-icons` | `verilog` | 0..1000 | 0..0 | ∞ | secondary-empty |
| `skill-icons` | `vitest-dark` | -1..1000 | 0..0 | ∞ | secondary-empty |
| `skill-icons` | `vitest-light` | 0..0 | 0..0 | ∞ | primary-empty |
| `token-branded` | `h2o` | 0..0 | 0..0 | ∞ | primary-empty |
| `token-branded` | `susd` | 0..0 | 0..0 | ∞ | primary-empty |
| `vscode-icons` | `file-type-knip` | 0..921 | 0..0 | ∞ | secondary-empty |
| `vscode-icons` | `file-type-light-prettier` | 0..821 | 0..0 | ∞ | secondary-empty |
| `vscode-icons` | `file-type-shellcheck` | 0..966 | 0..0 | ∞ | secondary-empty |
| `logos` | `campaignmonitor` | 0..10040 | 0..999 | 9,041 | shifted |
| `logos` | `yugabyte` | 0..7421 | 0..1090 | 6,331 | shifted |
| `logos` | `airbrake` | 0..5689 | 0..611 | 5,078 | shifted |
| `logos` | `apptentive` | 0..5689 | -16..719 | 4,986 | shifted |
| `logos` | `stackbit` | 0..5886 | -1..998 | 4,889 | shifted |
| `logos` | `backbone` | 0..5562 | 0..802 | 4,760 | shifted |
| `logos` | `capacitorjs` | 0..5225 | 0..603 | 4,622 | shifted |
| `logos` | `alpinejs` | 0..6169 | 0..1632 | 4,537 | shifted |
| `logos` | `elasticpath` | -10..943 | 0..5447 | 4,514 | shifted |
| `logos` | `openstack` | -1..1019 | 0..5447 | 4,429 | shifted |
| `logos` | `apache-superset` | 0..5753 | 0..1351 | 4,402 | shifted |
| `logos` | `adroll` | 0..1081 | 0..5390 | 4,309 | shifted |
| `logos` | `oreilly` | -1..5506 | 0..1221 | 4,286 | shifted |
| `logos` | `udacity` | -1..999 | 0..5279 | 4,281 | shifted |
| `logos` | `freedcamp` | 0..5383 | 0..1123 | 4,260 | shifted |
| `logos` | `bubble` | 0..4414 | -1..183 | 4,232 | shifted |
| `logos` | `jamstack` | 0..5225 | 0..994 | 4,231 | shifted |
| `logos` | `helpscout` | 0..5026 | -1..822 | 4,205 | shifted |
| `logos` | `hootsuite` | -4..5070 | 0..899 | 4,175 | shifted |

…6,270 more — see per-pack JSON.

## TTFs with non-canonical head/hhea/OS2 metrics

| Pack | TTF | unitsPerEm | head bbox | hhea asc/desc | OS/2 win asc/desc | OS/2 typo asc/desc | Drift |
|---|---|---:|---|---|---|---|---|
| `streamline-cyber-color` | `StreamlineCyberColor` | 1000 | -4..1004 / -4..1004 | 1000/0 | 1090/4 | 1000/0 | head.xMin=-4, head.xMax=1004, head.yMin=-4, head.yMax=1004, OS/2.winAsc=1090, OS/2.winDesc=4 |
| `ei` | `Ei` | 1000 | 0..960 / 0..896 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `ei` | `EiSecondary` | 1000 | 0..840 / 0..800 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `mdi-light` | `MdiLight` | 1000 | -1..963 / -1..959 | 1000/0 | 1090/1 | 1000/0 | head.xMin=-1, head.yMin=-1, OS/2.winAsc=1090 |
| `pepicons-pop` | `PepiconsPop` | 1000 | -1..1002 / -7..1008 | 1000/0 | 1090/7 | 1000/0 | head.xMin=-1, head.xMax=1002, head.yMin=-7, head.yMax=1008, OS/2.winAsc=1090, OS/2.winDesc=7 |
| `pepicons-pop` | `PepiconsPopSecondary` | 1000 | 0..654 / 0..347 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `ps` | `Ps` | 1000 | -26..1179 / -1..1018 | 1000/0 | 1090/1 | 1000/0 | head.xMin=-26, head.xMax=1179, head.yMin=-1, head.yMax=1018, OS/2.winAsc=1090 |
| `hugeicons` | `Hugeicons` | 1000 | 0..998 / 0..998 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `hugeicons` | `HugeiconsSecondary` | 1000 | 0..893 / 0..865 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `emojione` | `Emojione` | 1000 | -4..1001 / -2..1004 | 1000/0 | 1090/2 | 1000/0 | head.xMin=-4, head.xMax=1001, head.yMin=-2, head.yMax=1004, OS/2.winAsc=1090, OS/2.winDesc=2 |
| `emojione` | `EmojioneSecondary` | 1000 | -5..1005 / 0..1005 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-5, head.xMax=1005, head.yMax=1005, OS/2.winAsc=1090 |
| `fa7-brands` | `Fa7Brands` | 1000 | -7..1011 / 0..961 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-7, head.xMax=1011, OS/2.winAsc=1090 |
| `pixelarticons` | `Pixelarticons` | 1000 | 0..1000 / 0..1000 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `pixelarticons` | `PixelarticonsSecondary` | 1000 | 0..750 / 0..667 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `fluent` | `Fluent` | 1000 | -15..1010 / -12..1015 | 1000/0 | 1090/4 | 1000/0 | head.xMin=-15, head.xMax=1010, head.yMin=-12, head.yMax=1015, OS/2.winAsc=1090, OS/2.winDesc=4 |
| `formkit` | `Formkit` | 1000 | -11..3500 / -2..1003 | 1000/0 | 1090/2 | 1000/0 | head.xMin=-11, head.xMax=3500, head.yMin=-2, head.yMax=1003, OS/2.winAsc=1090, OS/2.winDesc=2 |
| `solar` | `Solar` | 1000 | -2..1004 / -1..1004 | 1000/0 | 1000/0 | 1000/0 | head.xMin=-2, head.xMax=1004, head.yMin=-1, head.yMax=1004 |
| `ion` | `Ion` | 1000 | -27..1019 / -6..1010 | 1000/0 | 1090/6 | 1000/0 | head.xMin=-27, head.xMax=1019, head.yMin=-6, head.yMax=1010, OS/2.winAsc=1090, OS/2.winDesc=6 |
| `heroicons-outline` | `HeroiconsOutline` | 1000 | 0..988 / 0..970 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `icon-park` | `IconPark` | 1000 | -9..1008 / -8..1006 | 1000/0 | 1090/8 | 1000/0 | head.xMin=-9, head.xMax=1008, head.yMin=-8, head.yMax=1006, OS/2.winAsc=1090, OS/2.winDesc=8 |
| `icon-park` | `IconParkSecondary` | 1000 | 0..1000 / 0..985 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `la` | `La` | 1000 | -4..1007 / -4..1000 | 1000/0 | 1090/4 | 1000/0 | head.xMin=-4, head.xMax=1007, head.yMin=-4, OS/2.winAsc=1090, OS/2.winDesc=4 |
| `ooui` | `Ooui` | 1000 | -15..1014 / -12..1009 | 1000/0 | 1090/12 | 1000/0 | head.xMin=-15, head.xMax=1014, head.yMin=-12, head.yMax=1009, OS/2.winAsc=1090, OS/2.winDesc=12 |
| `material-icon-theme` | `MaterialIconTheme` | 1000 | -1..1500 / -500..1834 | 1000/0 | 1834/500 | 1000/0 | head.xMin=-1, head.xMax=1500, head.yMin=-500, head.yMax=1834, OS/2.winAsc=1834, OS/2.winDesc=500 |
| `material-icon-theme` | `MaterialIconThemeSecondary` | 1000 | 0..1013 / 0..950 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1013, OS/2.winAsc=1090 |
| `marketeq` | `Marketeq` | 1000 | 0..945 / 0..939 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `ep` | `Ep` | 1000 | 0..1001 / 0..1000 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1001, OS/2.winAsc=1090 |
| `basil` | `Basil` | 1000 | -4..1006 / 0..990 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-4, head.xMax=1006, OS/2.winAsc=1090 |
| `system-uicons` | `SystemUicons` | 1000 | -1..954 / 0..960 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-1, OS/2.winAsc=1090 |
| `fad` | `Fad` | 1000 | 0..996 / 0..966 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `ant-design` | `AntDesign` | 1000 | 0..1001 / 0..1000 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1001, OS/2.winAsc=1090 |
| `ant-design` | `AntDesignSecondary` | 1000 | 0..932 / 0..938 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `majesticons` | `Majesticons` | 1000 | -22..1004 / 0..964 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-22, head.xMax=1004, OS/2.winAsc=1090 |
| `ci` | `Ci` | 1000 | -1..1008 / 0..1002 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-1, head.xMax=1008, head.yMax=1002, OS/2.winAsc=1090 |
| `maki` | `Maki` | 1000 | -10..1010 / -12..1007 | 1000/0 | 1090/12 | 1000/0 | head.xMin=-10, head.xMax=1010, head.yMin=-12, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=12 |
| `qlementine-icons` | `QlementineIcons` | 1000 | -15..1016 / -20..1011 | 1000/0 | 1090/20 | 1000/0 | head.xMin=-15, head.xMax=1016, head.yMin=-20, head.yMax=1011, OS/2.winAsc=1090, OS/2.winDesc=20 |
| `qlementine-icons` | `QlementineIconsSecondary` | 1000 | -6..1007 / 0..1000 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-6, head.xMax=1007, OS/2.winAsc=1090 |
| `flowbite` | `Flowbite` | 1000 | 0..1000 / 0..959 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `mono-icons` | `MonoIcons` | 1000 | 0..936 / 0..923 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `radix-icons` | `RadixIcons` | 1000 | -8..1005 / -2..1005 | 1000/0 | 1090/2 | 1000/0 | head.xMin=-8, head.xMax=1005, head.yMin=-2, head.yMax=1005, OS/2.winAsc=1090, OS/2.winDesc=2 |
| `radix-icons` | `RadixIconsSecondary` | 1000 | 0..1000 / 0..924 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `streamline-pixel` | `StreamlinePixel` | 1000 | -3..1011 / -14..1002 | 1000/0 | 1090/14 | 1000/0 | head.xMin=-3, head.xMax=1011, head.yMin=-14, head.yMax=1002, OS/2.winAsc=1090, OS/2.winDesc=14 |
| `fluent-emoji` | `FluentEmoji` | 1000 | 0..1001 / 0..978 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1001, OS/2.winAsc=1090 |
| `fluent-emoji` | `FluentEmojiSecondary` | 1000 | 0..750 / 0..624 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `fontelico` | `Fontelico` | 1000 | -16..1948 / -15..1006 | 1000/0 | 1090/15 | 1000/0 | head.xMin=-16, head.xMax=1948, head.yMin=-15, head.yMax=1006, OS/2.winAsc=1090, OS/2.winDesc=15 |
| `vscode-icons` | `VscodeIcons` | 1000 | -318..1191 / 0..1001 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-318, head.xMax=1191, head.yMax=1001, OS/2.winAsc=1090 |
| `vscode-icons` | `VscodeIconsSecondary` | 1000 | 0..1002 / 0..967 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1002, OS/2.winAsc=1090 |
| `mingcute` | `Mingcute` | 1000 | -2..1002 / 0..1003 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-2, head.xMax=1002, head.yMax=1003, OS/2.winAsc=1090 |
| `mingcute` | `MingcuteSecondary` | 1000 | 0..946 / 0..937 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `lucide` | `Lucide` | 1000 | 13..990 / 0..992 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `iwwa` | `Iwwa` | 1000 | -7..1001 / -1..1001 | 1000/0 | 1090/1 | 1000/0 | head.xMin=-7, head.xMax=1001, head.yMin=-1, head.yMax=1001, OS/2.winAsc=1090 |
| `noto` | `Noto` | 1000 | -1..1000 / 0..993 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-1, OS/2.winAsc=1090 |
| `noto` | `NotoSecondary` | 1000 | 0..994 / 0..980 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `vs` | `Vs` | 1000 | -13..1902 / -6..1059 | 1000/0 | 1090/6 | 1000/0 | head.xMin=-13, head.xMax=1902, head.yMin=-6, head.yMax=1059, OS/2.winAsc=1090, OS/2.winDesc=6 |
| `bpmn` | `Bpmn` | 1000 | 0..981 / 0..954 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `fluent-color` | `FluentColor` | 1000 | 0..1007 / -10..1001 | 1000/0 | 1090/10 | 1000/0 | head.xMax=1007, head.yMin=-10, head.yMax=1001, OS/2.winAsc=1090, OS/2.winDesc=10 |
| `pepicons` | `Pepicons` | 1000 | -1..1007 / -7..1005 | 1000/0 | 1090/7 | 1000/0 | head.xMin=-1, head.xMax=1007, head.yMin=-7, head.yMax=1005, OS/2.winAsc=1090, OS/2.winDesc=7 |
| `pepicons` | `PepiconsSecondary` | 1000 | 0..1011 / -11..975 | 1000/0 | 1090/11 | 1000/0 | head.xMax=1011, head.yMin=-11, OS/2.winAsc=1090, OS/2.winDesc=11 |
| `gravity-ui` | `GravityUi` | 1000 | -13..1013 / -7..1007 | 1000/0 | 1090/7 | 1000/0 | head.xMin=-13, head.xMax=1013, head.yMin=-7, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=7 |
| `token` | `Token` | 1000 | 0..931 / 0..926 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `token` | `TokenSecondary` | 1000 | 0..876 / 0..881 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `lineicons` | `Lineicons` | 1000 | -4..1007 / 0..989 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-4, head.xMax=1007, OS/2.winAsc=1090 |
| `fontisto` | `Fontisto` | 1000 | -20..1501 / -16..1012 | 1000/0 | 1090/16 | 1000/0 | head.xMin=-20, head.xMax=1501, head.yMin=-16, head.yMax=1012, OS/2.winAsc=1090, OS/2.winDesc=16 |
| `file-icons` | `FileIcons` | 1000 | -26..1252 / -15..1012 | 1000/0 | 1090/15 | 1000/0 | head.xMin=-26, head.xMax=1252, head.yMin=-15, head.yMax=1012, OS/2.winAsc=1090, OS/2.winDesc=15 |
| `academicons` | `Academicons` | 1000 | 0..1089 / 0..991 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1089, OS/2.winAsc=1090 |
| `brandico` | `Brandico` | 1000 | -14..1232 / -27..1011 | 1000/0 | 1090/27 | 1000/0 | head.xMin=-14, head.xMax=1232, head.yMin=-27, head.yMax=1011, OS/2.winAsc=1090, OS/2.winDesc=27 |
| `quill` | `Quill` | 1000 | 0..970 / 0..954 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `streamline-flex-color` | `StreamlineFlexColor` | 1000 | -36..1018 / -6..1008 | 1000/0 | 1090/6 | 1000/0 | head.xMin=-36, head.xMax=1018, head.yMin=-6, head.yMax=1008, OS/2.winAsc=1090, OS/2.winDesc=6 |
| `streamline-flex-color` | `StreamlineFlexColorSecondary` | 1000 | -7..1007 / -12..1006 | 1000/0 | 1090/12 | 1000/0 | head.xMin=-7, head.xMax=1007, head.yMin=-12, head.yMax=1006, OS/2.winAsc=1090, OS/2.winDesc=12 |
| `logos` | `Logos` | 1000 | -29..10040 / -15..1024 | 1000/0 | 1090/15 | 1000/0 | head.xMin=-29, head.xMax=10040, head.yMin=-15, head.yMax=1024, OS/2.winAsc=1090, OS/2.winDesc=15 |
| `logos` | `LogosSecondary` | 1000 | -16..7421 / -7..1019 | 1000/0 | 1090/7 | 1000/0 | head.xMin=-16, head.xMax=7421, head.yMin=-7, head.yMax=1019, OS/2.winAsc=1090, OS/2.winDesc=7 |
| `medical-icon` | `MedicalIcon` | 1000 | 0..1006 / -2..1004 | 1000/0 | 1090/2 | 1000/0 | head.xMax=1006, head.yMin=-2, head.yMax=1004, OS/2.winAsc=1090, OS/2.winDesc=2 |
| `streamline-plump` | `StreamlinePlump` | 1000 | -17..1005 / -18..1003 | 1000/0 | 1090/18 | 1000/0 | head.xMin=-17, head.xMax=1005, head.yMin=-18, head.yMax=1003, OS/2.winAsc=1090, OS/2.winDesc=18 |
| `boxicons` | `Boxicons` | 1000 | 0..1000 / 0..961 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `grommet-icons` | `GrommetIcons` | 1000 | -21..1960 / -14..1010 | 1000/0 | 1090/14 | 1000/0 | head.xMin=-21, head.xMax=1960, head.yMin=-14, head.yMax=1010, OS/2.winAsc=1090, OS/2.winDesc=14 |
| `grommet-icons` | `GrommetIconsSecondary` | 1000 | 0..1005 / 0..915 | 1000/0 | 1090/0 | 1000/0 | head.xMax=1005, OS/2.winAsc=1090 |
| `topcoat` | `Topcoat` | 1000 | 0..989 / 0..981 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `duo-icons` | `DuoIcons` | 1000 | 0..959 / 0..959 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `duo-icons` | `DuoIconsSecondary` | 1000 | 0..959 / 0..960 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `meteor-icons` | `MeteorIcons` | 1000 | -5..1010 / -18..1006 | 1000/0 | 1090/18 | 1000/0 | head.xMin=-5, head.xMax=1010, head.yMin=-18, head.yMax=1006, OS/2.winAsc=1090, OS/2.winDesc=18 |
| `nimbus` | `Nimbus` | 1000 | -5..1013 / -3..1004 | 1000/0 | 1090/3 | 1000/0 | head.xMin=-5, head.xMax=1013, head.yMin=-3, head.yMax=1004, OS/2.winAsc=1090, OS/2.winDesc=3 |
| `svg-spinners` | `SvgSpinners` | 1000 | 0..959 / 0..959 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `humbleicons` | `Humbleicons` | 1000 | 0..951 / 0..960 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `garden` | `Garden` | 1000 | -11..4377 / -11..1011 | 1000/0 | 1090/11 | 1000/0 | head.xMin=-11, head.xMax=4377, head.yMin=-11, head.yMax=1011, OS/2.winAsc=1090, OS/2.winDesc=11 |
| `streamline` | `Streamline` | 1000 | -39..1026 / -26..1010 | 1000/0 | 1090/26 | 1000/0 | head.xMin=-39, head.xMax=1026, head.yMin=-26, head.yMax=1010, OS/2.winAsc=1090, OS/2.winDesc=26 |
| `catppuccin` | `Catppuccin` | 1000 | -10..1009 / -10..1007 | 1000/0 | 1090/10 | 1000/0 | head.xMin=-10, head.xMax=1009, head.yMin=-10, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=10 |
| `catppuccin` | `CatppuccinSecondary` | 1000 | -4..1009 / -11..1007 | 1000/0 | 1090/11 | 1000/0 | head.xMin=-4, head.xMax=1009, head.yMin=-11, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=11 |
| `heroicons-solid` | `HeroiconsSolid` | 1000 | 0..978 / 0..957 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `famicons` | `Famicons` | 1000 | -27..1019 / -6..1010 | 1000/0 | 1090/6 | 1000/0 | head.xMin=-27, head.xMax=1019, head.yMin=-6, head.yMax=1010, OS/2.winAsc=1090, OS/2.winDesc=6 |
| `tdesign` | `Tdesign` | 1000 | -30..1018 / -44..1007 | 1000/0 | 1090/44 | 1000/0 | head.xMin=-30, head.xMax=1018, head.yMin=-44, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=44 |
| `tdesign` | `TdesignSecondary` | 1000 | 0..976 / 0..935 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `websymbol` | `Websymbol` | 1000 | 0..1550 / -1..1068 | 1000/0 | 1090/1 | 1000/0 | head.xMax=1550, head.yMin=-1, head.yMax=1068, OS/2.winAsc=1090 |
| `si-glyph` | `SiGlyph` | 1000 | -18..1149 / -15..1007 | 1000/0 | 1090/15 | 1000/0 | head.xMin=-18, head.xMax=1149, head.yMin=-15, head.yMax=1007, OS/2.winAsc=1090, OS/2.winDesc=15 |
| `pixel` | `Pixel` | 1000 | 0..980 / 0..959 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `wordpress` | `Wordpress` | 1000 | -8..956 / 0..1001 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-8, head.yMax=1001, OS/2.winAsc=1090 |
| `wordpress` | `WordpressSecondary` | 1000 | 0..824 / 0..824 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `skill-icons` | `SkillIcons` | 1000 | -1..1001 / -1..1001 | 1000/0 | 1090/1 | 1000/0 | head.xMin=-1, head.xMax=1001, head.yMin=-1, head.yMax=1001, OS/2.winAsc=1090 |
| `skill-icons` | `SkillIconsSecondary` | 1000 | 0..1000 / 0..1000 | 1000/0 | 1090/0 | 1000/0 | OS/2.winAsc=1090 |
| `uiw` | `Uiw` | 1000 | -11..1009 / -16..1009 | 1000/0 | 1090/16 | 1000/0 | head.xMin=-11, head.xMax=1009, head.yMin=-16, head.yMax=1009, OS/2.winAsc=1090, OS/2.winDesc=16 |
| `prime` | `Prime` | 1000 | -1..1001 / 0..954 | 1000/0 | 1090/0 | 1000/0 | head.xMin=-1, head.xMax=1001, OS/2.winAsc=1090 |

…194 more — see per-pack JSON.

## Glyph dedup collisions (cmap collision via path dedup)

When `svg2ttf` collapses identical outlines, all original codepoints still cmap to the SAME glyph name. Every consumer of any of those codepoints renders the FIRST icon's letterform — visually wrong for every icon after the first.

| Pack | TTF | First-claimed glyph | # codepoints | Example icons sharing it |
|---|---|---|---:|---|
| `cryptocurrency-color` | `CryptocurrencyColor` | `aave` | 375 | `aave`, `abt`, `act`, `actn` |
| `material-icon-theme` | `MaterialIconTheme` | `folder-admin` | 218 | `folder-admin`, `folder-android`, `folder-angular`, `folder-animation` |
| `material-icon-theme` | `MaterialIconTheme` | `folder-admin-open` | 208 | `folder-admin-open`, `folder-android-open`, `folder-angular-open`, `folder-animation-open` |
| `twemoji` | `Twemoji` | `a-button` | 152 | `a-button`, `a-button-blood-type`, `ab-button`, `ab-button-blood-type` |
| `pepicons-print` | `PepiconsPrintSecondary` | `airplane-circle-filled` | 149 | `airplane-circle-filled`, `alarm-circle-filled`, `angle-down-circle-filled`, `angle-left-circle-filled` |
| `emojione` | `Emojione` | `antenna-bars` | 137 | `antenna-bars`, `anticlockwise-arrows-button`, `aquarius`, `aries` |
| `fluent-emoji-flat` | `FluentEmojiFlat` | `a-button-blood-type` | 125 | `a-button-blood-type`, `ab-button-blood-type`, `antenna-bars`, `aquarius` |
| `skill-icons` | `SkillIcons` | `ableton-dark` | 116 | `ableton-dark`, `ableton-light`, `actix-dark`, `actix-light` |
| `solar` | `SolarSecondary` | `4k-bold-duotone` | 112 | `4k-bold-duotone`, `add-square-bold-duotone`, `augmented-reality-bold-duotone`, `bluetooth-square-bold-duotone` |
| `solar` | `SolarSecondary` | `4k-line-duotone` | 77 | `4k-line-duotone`, `add-square-line-duotone`, `augmented-reality-line-duotone`, `bones-line-duotone` |
| `solar` | `SolarSecondary` | `accessibility-bold-duotone` | 69 | `accessibility-bold-duotone`, `add-circle-bold-duotone`, `bluetooth-circle-bold-duotone`, `bolt-circle-bold-duotone` |
| `iconamoon` | `IconamoonSecondary` | `arrow-bottom-left-5-circle-duotone` | 55 | `arrow-bottom-left-5-circle-duotone`, `arrow-bottom-left-6-circle-duotone`, `arrow-bottom-right-5-circle-duotone`, `arrow-bottom-right-6-circle-duotone` |
| `ph` | `PhSecondary` | `arrow-circle-down-duotone` | 53 | `arrow-circle-down-duotone`, `arrow-circle-down-left-duotone`, `arrow-circle-down-right-duotone`, `arrow-circle-left-duotone` |
| `solar` | `SolarSecondary` | `accessibility-line-duotone` | 52 | `accessibility-line-duotone`, `add-circle-line-duotone`, `check-circle-line-duotone`, `clock-circle-line-duotone` |
| `catppuccin` | `Catppuccin` | `folder-azure-pipelines` | 49 | `folder-azure-pipelines`, `folder-content`, `folder-database`, `folder-debug` |
| `flag` | `Flag` | `al-1x1` | 49 | `al-1x1`, `bd-1x1`, `bg-1x1`, `bh-1x1` |
| `openmoji` | `Openmoji` | `alabama-flag` | 49 | `alabama-flag`, `barcode`, `berlin-flag`, `black-rectangle` |
| `catppuccin` | `Catppuccin` | `folder-azure-pipelines-open` | 48 | `folder-azure-pipelines-open`, `folder-database-open`, `folder-debug-open`, `folder-direnv-open` |
| `streamline-color` | `StreamlineColor` | `add-circle-flat` | 47 | `add-circle-flat`, `attribution-flat`, `ball-flat`, `binance-circle-flat` |
| `flag` | `Flag` | `al-4x3` | 44 | `al-4x3`, `bd-4x3`, `bg-4x3`, `bh-4x3` |
| `iconamoon` | `IconamoonSecondary` | `arrow-bottom-left-3-square-duotone` | 38 | `arrow-bottom-left-3-square-duotone`, `arrow-bottom-left-4-square-duotone`, `arrow-bottom-right-3-square-duotone`, `arrow-bottom-right-4-square-duotone` |
| `ph` | `PhSecondary` | `file-archive-duotone` | 38 | `file-archive-duotone`, `file-arrow-down-duotone`, `file-arrow-up-duotone`, `file-c-duotone` |
| `streamline-emojis` | `StreamlineEmojisSecondary` | `australia` | 36 | `australia`, `baby-chick`, `brazil`, `cactus-2` |
| `si` | `SiSecondary` | `add-circle-duotone` | 35 | `add-circle-duotone`, `arrow-downward-circle-duotone`, `arrow-left-circle-duotone`, `arrow-right-circle-duotone` |
| `si` | `SiSecondary` | `add-square-duotone` | 33 | `add-square-duotone`, `arrow-downward-square-duotone`, `arrow-left-square-duotone`, `arrow-right-square-duotone` |
| `vscode-icons` | `VscodeIcons` | `folder-type-android` | 33 | `folder-type-android`, `folder-type-app`, `folder-type-audio`, `folder-type-circleci` |
| `streamline-color` | `StreamlineColor` | `add-circle` | 32 | `add-circle`, `binance-circle`, `button-record-3`, `circle` |
| `catppuccin` | `Catppuccin` | `folder-android` | 31 | `folder-android`, `folder-animation`, `folder-api`, `folder-assets` |
| `glyphs` | `GlyphsSecondary` | `angry-duo` | 31 | `angry-duo`, `dizzy-duo`, `flushed-duo`, `frown-duo` |
| `catppuccin` | `Catppuccin` | `folder-api-open` | 29 | `folder-api-open`, `folder-audit-open`, `folder-azure-devops-open`, `folder-benchmark-open` |
| `emojione` | `Emojione` | `a-button` | 28 | `a-button`, `ab-button`, `b-button`, `cl-button` |
| `vscode-icons` | `VscodeIcons` | `default-folder-opened` | 28 | `default-folder-opened`, `folder-type-app-opened`, `folder-type-audio-opened`, `folder-type-circleci-opened` |
| `streamline-emojis` | `StreamlineEmojisSecondary` | `astronaut-1` | 27 | `astronaut-1`, `astronaut-2`, `backhand-index-pointing-left-2`, `backhand-index-pointing-right-2` |
| `glyphs-poly` | `GlyphsPoly` | `angry` | 26 | `angry`, `dizzy`, `frown`, `frown-open` |
| `streamline-plump-color` | `StreamlinePlumpColor` | `arrow-right-circle-1-flat` | 23 | `arrow-right-circle-1-flat`, `arrow-right-circle-2-flat`, `ball-flat`, `button-play-circle-flat` |
| `meteocons` | `Meteocons` | `overcast-day-fill` | 22 | `overcast-day-fill`, `overcast-day-fog-fill`, `overcast-day-hail-fill`, `overcast-day-haze-fill` |
| `openmoji` | `Openmoji` | `men-wrestling` | 22 | `men-wrestling`, `people-wrestling`, `people-wrestling-dark-skin-tone-light-skin-tone`, `people-wrestling-dark-skin-tone-medium-dark-skin-tone` |
| `openmoji` | `Openmoji` | `people-with-bunny-ears` | 22 | `people-with-bunny-ears`, `people-with-bunny-ears-dark-skin-tone-light-skin-tone`, `people-with-bunny-ears-dark-skin-tone-medium-dark-skin-tone`, `people-with-bunny-ears-dark-skin-tone-medium-light-skin-tone` |
| `wi` | `Wi` | `forecast-io-rain` | 22 | `forecast-io-rain`, `owm-302`, `owm-311`, `owm-312` |
| `wi` | `Wi` | `owm-310` | 21 | `owm-310`, `owm-511`, `owm-611`, `owm-612` |
| `openmoji` | `Openmoji` | `angry-face` | 20 | `angry-face`, `annoyed-face-with-tongue`, `confounded-face`, `confused-face` |
| `openmoji` | `Openmoji` | `blue-square` | 20 | `blue-square`, `combining-enclosing-keycap`, `green-square`, `japanese-discount-button` |
| `wi` | `Wi` | `forecast-io-snow` | 20 | `forecast-io-snow`, `owm-600`, `owm-601`, `owm-621` |
| `icon-park` | `IconPark` | `checkbox` | 19 | `checkbox`, `direction`, `extend`, `facetime` |
| `twemoji` | `Twemoji` | `angry-face` | 19 | `angry-face`, `anguished-face`, `confounded-face`, `confused-face` |
| `emojione-v1` | `EmojioneV1` | `flag-for-bangladesh` | 18 | `flag-for-bangladesh`, `flag-for-china`, `flag-for-denmark`, `flag-for-finland` |
| `lets-icons` | `LetsIconsSecondary` | `add-duotone` | 18 | `add-duotone`, `add-ring-duotone`, `add-round-duotone`, `check-ring-duotone-line` |
| `noto-v1` | `NotoV1Secondary` | `man-bowing` | 18 | `man-bowing`, `man-bowing-dark-skin-tone`, `man-bowing-light-skin-tone`, `man-bowing-medium-dark-skin-tone` |
| `streamline-flex-color` | `StreamlineFlexColor` | `3d-rotate-1-flat` | 18 | `3d-rotate-1-flat`, `button-pause-circle-flat`, `button-record-1-flat`, `dark-dislay-mode-flat` |
| `glyphs` | `GlyphsSecondary` | `arrow-circle-duo` | 17 | `arrow-circle-duo`, `arrow-solid-circle-duo`, `caret-circle-duo`, `check-circle-duo` |

…18,463 more — see per-pack JSON.

## Per-glyph metric outliers

`narrow` = content width < 100 (likely render-as-dot). `wide` = > 1100 (overflows em-box → clipped at consumer). `advance` = horizontal advance != 1000 (breaks TextPainter centring).

| Pack | TTF | Codepoint | Glyph | Reason | Width | Advance |
|---|---|---|---|---|---:|---:|
| `logos` | `Logos` | `0xe081` | `campaignmonitor` | advance | — | 10039 |
| `logos` | `LogosSecondary` | `0xe081` | `campaignmonitor` | advance | — | 10039 |
| `logos` | `Logos` | `0xe081` | `campaignmonitor` | wide | 10040 | — |
| `logos` | `Logos` | `0xe003` | `active-campaign` | advance | — | 9846 |
| `logos` | `Logos` | `0xe003` | `active-campaign` | wide | 9847 | — |
| `logos` | `Logos` | `0xe1ba` | `kickstarter` | advance | — | 9309 |
| `logos` | `Logos` | `0xe1ba` | `kickstarter` | wide | 9310 | — |
| `logos` | `Logos` | `0xe09c` | `codeclimate` | advance | — | 8982 |
| `logos` | `Logos` | `0xe28a` | `prestashop` | advance | — | 8982 |
| `logos` | `Logos` | `0xe09c` | `codeclimate` | wide | 8983 | — |
| `logos` | `Logos` | `0xe28a` | `prestashop` | wide | 8983 | — |
| `logos` | `Logos` | `0xe1db` | `logmatic` | advance | — | 8000 |
| `logos` | `LogosSecondary` | `0xe1db` | `logmatic` | advance | — | 8000 |
| `logos` | `Logos` | `0xe1db` | `logmatic` | wide | 7999 | — |
| `logos` | `Logos` | `0xe262` | `oracle` | advance | — | 7641 |
| `logos` | `Logos` | `0xe262` | `oracle` | wide | 7642 | — |
| `logos` | `Logos` | `0xe030` | `appdynamics` | advance | — | 7529 |
| `logos` | `Logos` | `0xe33f` | `tidal` | advance | — | 7529 |
| `logos` | `Logos` | `0xe030` | `appdynamics` | wide | 7531 | — |
| `logos` | `Logos` | `0xe33f` | `tidal` | wide | 7530 | — |
| `logos` | `Logos` | `0xe21a` | `model-context-protocol` | advance | — | 7420 |
| `logos` | `Logos` | `0xe338` | `teamwork` | advance | — | 7420 |
| `logos` | `LogosSecondary` | `0xe338` | `teamwork` | advance | — | 7420 |
| `logos` | `Logos` | `0xe39b` | `yugabyte` | advance | — | 7420 |
| `logos` | `LogosSecondary` | `0xe39b` | `yugabyte` | advance | — | 7420 |
| `logos` | `Logos` | `0xe21a` | `model-context-protocol` | wide | 7423 | — |
| `logos` | `LogosSecondary` | `0xe338` | `teamwork` | wide | 7421 | — |
| `logos` | `Logos` | `0xe39b` | `yugabyte` | wide | 7421 | — |
| `logos` | `Logos` | `0xe0a7` | `codesandbox` | advance | — | 7013 |
| `logos` | `Logos` | `0xe0b8` | `coursera` | advance | — | 7013 |
| `logos` | `Logos` | `0xe18c` | `immutable` | advance | — | 7013 |
| `logos` | `LogosSecondary` | `0xe18c` | `immutable` | advance | — | 7013 |
| `logos` | `Logos` | `0xe2ff` | `spidermonkey` | advance | — | 7013 |
| `logos` | `Logos` | `0xe0c9` | `datasette` | advance | — | 6918 |
| `logos` | `LogosSecondary` | `0xe0c9` | `datasette` | advance | — | 6918 |
| `logos` | `Logos` | `0xe2ff` | `spidermonkey` | wide | 7017 | — |
| `logos` | `Logos` | `0xe0a7` | `codesandbox` | wide | 7014 | — |
| `logos` | `Logos` | `0xe0b8` | `coursera` | wide | 7014 | — |
| `logos` | `Logos` | `0xe18c` | `immutable` | wide | 7014 | — |
| `logos` | `LogosSecondary` | `0xe18c` | `immutable` | wide | 7014 | — |
| `logos` | `Logos` | `0xe338` | `teamwork` | wide | 6959 | — |
| `logos` | `Logos` | `0xe091` | `cloudacademy` | advance | — | 6826 |
| `logos` | `Logos` | `0xe0c9` | `datasette` | wide | 6919 | — |
| `logos` | `LogosSecondary` | `0xe0c9` | `datasette` | wide | 6878 | — |
| `logos` | `Logos` | `0xe1c3` | `kustomer` | advance | — | 6736 |
| `logos` | `Logos` | `0xe091` | `cloudacademy` | wide | 6830 | — |
| `noto-v1` | `NotoV1` | `0xe1d7` | `right-anger-bubble` | wide | 6771 | — |
| `logos` | `Logos` | `0xe2ee` | `skaffolder` | advance | — | 6649 |
| `logos` | `LogosSecondary` | `0xe2ee` | `skaffolder` | advance | — | 6649 |
| `logos` | `Logos` | `0xe1c3` | `kustomer` | wide | 6735 | — |

…13,186 more — see per-pack JSON.

## Per-pack JSON detail

Click through for the full per-pack breakdown (every flagged glyph, every TTF's metrics).

| Pack | TTFs | Non-canonical fonts | Duotone misses | Dedup collisions | Outliers | Detail |
|---|---:|---:|---:|---:|---:|---|
| `academicons` | 1 | 1 | 0 | 0 | 104 | [`academicons.json`](docs/audit/glyph-metrics/academicons.json) |
| `akar-icons` | 1 | 1 | 0 | 18 | 0 | [`akar-icons.json`](docs/audit/glyph-metrics/akar-icons.json) |
| `ant-design` | 2 | 2 | 6 | 615 | 0 | [`ant-design.json`](docs/audit/glyph-metrics/ant-design.json) |
| `arcticons` | 2 | 2 | 2 | 130 | 1 | [`arcticons.json`](docs/audit/glyph-metrics/arcticons.json) |
| `basil` | 1 | 1 | 0 | 24 | 0 | [`basil.json`](docs/audit/glyph-metrics/basil.json) |
| `bi` | 2 | 2 | 0 | 8 | 0 | [`bi.json`](docs/audit/glyph-metrics/bi.json) |
| `bitcoin-icons` | 2 | 2 | 0 | 0 | 0 | [`bitcoin-icons.json`](docs/audit/glyph-metrics/bitcoin-icons.json) |
| `boxicons` | 1 | 1 | 0 | 411 | 0 | [`boxicons.json`](docs/audit/glyph-metrics/boxicons.json) |
| `bpmn` | 1 | 1 | 0 | 0 | 0 | [`bpmn.json`](docs/audit/glyph-metrics/bpmn.json) |
| `brandico` | 1 | 1 | 0 | 0 | 28 | [`brandico.json`](docs/audit/glyph-metrics/brandico.json) |
| `bx` | 1 | 1 | 0 | 814 | 0 | [`bx.json`](docs/audit/glyph-metrics/bx.json) |
| `bxl` | 1 | 1 | 0 | 2 | 0 | [`bxl.json`](docs/audit/glyph-metrics/bxl.json) |
| `bxs` | 1 | 1 | 0 | 0 | 0 | [`bxs.json`](docs/audit/glyph-metrics/bxs.json) |
| `bytesize` | 1 | 1 | 0 | 0 | 0 | [`bytesize.json`](docs/audit/glyph-metrics/bytesize.json) |
| `carbon` | 1 | 1 | 0 | 19 | 0 | [`carbon.json`](docs/audit/glyph-metrics/carbon.json) |
| `catppuccin` | 2 | 2 | 27 | 119 | 2 | [`catppuccin.json`](docs/audit/glyph-metrics/catppuccin.json) |
| `cbi` | 1 | 1 | 0 | 81 | 0 | [`cbi.json`](docs/audit/glyph-metrics/cbi.json) |
| `charm` | 1 | 1 | 0 | 1 | 0 | [`charm.json`](docs/audit/glyph-metrics/charm.json) |
| `ci` | 1 | 1 | 0 | 3 | 0 | [`ci.json`](docs/audit/glyph-metrics/ci.json) |
| `cib` | 1 | 1 | 0 | 1 | 0 | [`cib.json`](docs/audit/glyph-metrics/cib.json) |
| `cif` | 2 | 2 | 19 | 10 | 435 | [`cif.json`](docs/audit/glyph-metrics/cif.json) |
| `cil` | 1 | 1 | 0 | 37 | 0 | [`cil.json`](docs/audit/glyph-metrics/cil.json) |
| `circle-flags` | 1 | 1 | 0 | 1 | 0 | [`circle-flags.json`](docs/audit/glyph-metrics/circle-flags.json) |
| `circum` | 1 | 1 | 0 | 0 | 0 | [`circum.json`](docs/audit/glyph-metrics/circum.json) |
| `clarity` | 2 | 2 | 0 | 127 | 0 | [`clarity.json`](docs/audit/glyph-metrics/clarity.json) |
| `codex` | 1 | 1 | 0 | 0 | 0 | [`codex.json`](docs/audit/glyph-metrics/codex.json) |
| `codicon` | 1 | 1 | 0 | 11 | 7 | [`codicon.json`](docs/audit/glyph-metrics/codicon.json) |
| `covid` | 1 | 1 | 0 | 0 | 1 | [`covid.json`](docs/audit/glyph-metrics/covid.json) |
| `cryptocurrency` | 2 | 2 | 13 | 8 | 0 | [`cryptocurrency.json`](docs/audit/glyph-metrics/cryptocurrency.json) |
| `cryptocurrency-color` | 2 | 2 | 163 | 4 | 0 | [`cryptocurrency-color.json`](docs/audit/glyph-metrics/cryptocurrency-color.json) |
| `cuida` | 2 | 2 | 1 | 0 | 8 | [`cuida.json`](docs/audit/glyph-metrics/cuida.json) |
| `dashicons` | 1 | 1 | 0 | 5 | 0 | [`dashicons.json`](docs/audit/glyph-metrics/dashicons.json) |
| `devicon` | 2 | 2 | 92 | 5 | 1 | [`devicon.json`](docs/audit/glyph-metrics/devicon.json) |
| `devicon-plain` | 2 | 2 | 1 | 3 | 1 | [`devicon-plain.json`](docs/audit/glyph-metrics/devicon-plain.json) |
| `dinkie-icons` | 1 | 1 | 0 | 0 | 297 | [`dinkie-icons.json`](docs/audit/glyph-metrics/dinkie-icons.json) |
| `duo-icons` | 2 | 2 | 41 | 2 | 0 | [`duo-icons.json`](docs/audit/glyph-metrics/duo-icons.json) |
| `ei` | 2 | 2 | 2 | 0 | 0 | [`ei.json`](docs/audit/glyph-metrics/ei.json) |
| `el` | 1 | 1 | 0 | 1 | 0 | [`el.json`](docs/audit/glyph-metrics/el.json) |
| `emojione` | 2 | 2 | 116 | 73 | 0 | [`emojione.json`](docs/audit/glyph-metrics/emojione.json) |
| `emojione-monotone` | 1 | 1 | 0 | 290 | 0 | [`emojione-monotone.json`](docs/audit/glyph-metrics/emojione-monotone.json) |
| `emojione-v1` | 2 | 2 | 75 | 108 | 0 | [`emojione-v1.json`](docs/audit/glyph-metrics/emojione-v1.json) |
| `entypo` | 1 | 1 | 0 | 0 | 0 | [`entypo.json`](docs/audit/glyph-metrics/entypo.json) |
| `entypo-social` | 1 | 1 | 0 | 0 | 0 | [`entypo-social.json`](docs/audit/glyph-metrics/entypo-social.json) |
| `eos-icons` | 1 | 1 | 0 | 0 | 0 | [`eos-icons.json`](docs/audit/glyph-metrics/eos-icons.json) |
| `ep` | 1 | 1 | 0 | 1 | 0 | [`ep.json`](docs/audit/glyph-metrics/ep.json) |
| `et` | 1 | 1 | 0 | 0 | 97 | [`et.json`](docs/audit/glyph-metrics/et.json) |
| `eva` | 1 | 1 | 0 | 88 | 0 | [`eva.json`](docs/audit/glyph-metrics/eva.json) |
| `f7` | 1 | 1 | 0 | 10 | 0 | [`f7.json`](docs/audit/glyph-metrics/f7.json) |
| `fa` | 1 | 1 | 0 | 92 | 798 | [`fa.json`](docs/audit/glyph-metrics/fa.json) |
| `fa-brands` | 1 | 1 | 0 | 1 | 440 | [`fa-brands.json`](docs/audit/glyph-metrics/fa-brands.json) |
| `fa-regular` | 1 | 1 | 0 | 0 | 126 | [`fa-regular.json`](docs/audit/glyph-metrics/fa-regular.json) |
| `fa-solid` | 1 | 1 | 0 | 2 | 988 | [`fa-solid.json`](docs/audit/glyph-metrics/fa-solid.json) |
| `fa6-brands` | 1 | 1 | 0 | 23 | 487 | [`fa6-brands.json`](docs/audit/glyph-metrics/fa6-brands.json) |
| `fa6-regular` | 1 | 1 | 0 | 0 | 93 | [`fa6-regular.json`](docs/audit/glyph-metrics/fa6-regular.json) |
| `fa6-solid` | 1 | 1 | 0 | 1 | 1,425 | [`fa6-solid.json`](docs/audit/glyph-metrics/fa6-solid.json) |
| `fa7-brands` | 1 | 1 | 0 | 36 | 0 | [`fa7-brands.json`](docs/audit/glyph-metrics/fa7-brands.json) |
| `fa7-regular` | 1 | 1 | 0 | 91 | 0 | [`fa7-regular.json`](docs/audit/glyph-metrics/fa7-regular.json) |
| `fa7-solid` | 1 | 1 | 0 | 479 | 0 | [`fa7-solid.json`](docs/audit/glyph-metrics/fa7-solid.json) |
| `fad` | 1 | 1 | 0 | 0 | 2 | [`fad.json`](docs/audit/glyph-metrics/fad.json) |
| `famicons` | 1 | 1 | 0 | 52 | 0 | [`famicons.json`](docs/audit/glyph-metrics/famicons.json) |
| `fe` | 1 | 1 | 0 | 1 | 0 | [`fe.json`](docs/audit/glyph-metrics/fe.json) |
| `feather` | 1 | 1 | 0 | 8 | 0 | [`feather.json`](docs/audit/glyph-metrics/feather.json) |
| `file-icons` | 1 | 1 | 0 | 0 | 272 | [`file-icons.json`](docs/audit/glyph-metrics/file-icons.json) |
| `flag` | 2 | 2 | 14 | 21 | 517 | [`flag.json`](docs/audit/glyph-metrics/flag.json) |
| `flagpack` | 2 | 2 | 8 | 14 | 493 | [`flagpack.json`](docs/audit/glyph-metrics/flagpack.json) |
| `flat-color-icons` | 2 | 2 | 20 | 10 | 0 | [`flat-color-icons.json`](docs/audit/glyph-metrics/flat-color-icons.json) |
| `flat-ui` | 2 | 2 | 10 | 0 | 27 | [`flat-ui.json`](docs/audit/glyph-metrics/flat-ui.json) |
| `flowbite` | 1 | 1 | 0 | 41 | 0 | [`flowbite.json`](docs/audit/glyph-metrics/flowbite.json) |
| `fluent` | 1 | 1 | 0 | 160 | 31 | [`fluent.json`](docs/audit/glyph-metrics/fluent.json) |
| `fluent-color` | 1 | 1 | 0 | 1 | 0 | [`fluent-color.json`](docs/audit/glyph-metrics/fluent-color.json) |
| `fluent-emoji` | 2 | 2 | 0 | 16 | 9 | [`fluent-emoji.json`](docs/audit/glyph-metrics/fluent-emoji.json) |
| `fluent-emoji-flat` | 2 | 2 | 132 | 88 | 14 | [`fluent-emoji-flat.json`](docs/audit/glyph-metrics/fluent-emoji-flat.json) |
| `fluent-emoji-high-contrast` | 1 | 1 | 0 | 14 | 3 | [`fluent-emoji-high-contrast.json`](docs/audit/glyph-metrics/fluent-emoji-high-contrast.json) |
| `fluent-mdl2` | 1 | 1 | 0 | 9 | 6 | [`fluent-mdl2.json`](docs/audit/glyph-metrics/fluent-mdl2.json) |
| `fontelico` | 1 | 1 | 0 | 0 | 25 | [`fontelico.json`](docs/audit/glyph-metrics/fontelico.json) |
| `fontisto` | 1 | 1 | 0 | 2 | 513 | [`fontisto.json`](docs/audit/glyph-metrics/fontisto.json) |
| `formkit` | 1 | 1 | 0 | 3 | 104 | [`formkit.json`](docs/audit/glyph-metrics/formkit.json) |
| `foundation` | 1 | 1 | 0 | 0 | 0 | [`foundation.json`](docs/audit/glyph-metrics/foundation.json) |
| `fxemoji` | 2 | 2 | 58 | 14 | 3 | [`fxemoji.json`](docs/audit/glyph-metrics/fxemoji.json) |
| `gala` | 1 | 1 | 0 | 4 | 0 | [`gala.json`](docs/audit/glyph-metrics/gala.json) |
| `game-icons` | 1 | 1 | 0 | 3 | 0 | [`game-icons.json`](docs/audit/glyph-metrics/game-icons.json) |
| `garden` | 1 | 1 | 0 | 3 | 51 | [`garden.json`](docs/audit/glyph-metrics/garden.json) |
| `gcp` | 2 | 2 | 18 | 1 | 0 | [`gcp.json`](docs/audit/glyph-metrics/gcp.json) |
| `geo` | 1 | 1 | 0 | 1 | 0 | [`geo.json`](docs/audit/glyph-metrics/geo.json) |
| `gg` | 2 | 2 | 12 | 4 | 0 | [`gg.json`](docs/audit/glyph-metrics/gg.json) |
| `gis` | 1 | 1 | 0 | 0 | 0 | [`gis.json`](docs/audit/glyph-metrics/gis.json) |
| `glyphs` | 2 | 2 | 33 | 443 | 9 | [`glyphs.json`](docs/audit/glyph-metrics/glyphs.json) |
| `glyphs-poly` | 2 | 2 | 84 | 36 | 9 | [`glyphs-poly.json`](docs/audit/glyph-metrics/glyphs-poly.json) |
| `gravity-ui` | 1 | 1 | 0 | 3 | 0 | [`gravity-ui.json`](docs/audit/glyph-metrics/gravity-ui.json) |
| `gridicons` | 1 | 1 | 0 | 0 | 0 | [`gridicons.json`](docs/audit/glyph-metrics/gridicons.json) |
| `grommet-icons` | 2 | 2 | 4 | 5 | 4 | [`grommet-icons.json`](docs/audit/glyph-metrics/grommet-icons.json) |
| `guidance` | 1 | 1 | 0 | 0 | 0 | [`guidance.json`](docs/audit/glyph-metrics/guidance.json) |
| `healthicons` | 1 | 1 | 0 | 755 | 0 | [`healthicons.json`](docs/audit/glyph-metrics/healthicons.json) |
| `heroicons` | 1 | 1 | 0 | 16 | 0 | [`heroicons.json`](docs/audit/glyph-metrics/heroicons.json) |
| `heroicons-outline` | 1 | 1 | 0 | 0 | 0 | [`heroicons-outline.json`](docs/audit/glyph-metrics/heroicons-outline.json) |
| `heroicons-solid` | 1 | 1 | 0 | 2 | 0 | [`heroicons-solid.json`](docs/audit/glyph-metrics/heroicons-solid.json) |
| `hugeicons` | 2 | 2 | 1 | 38 | 1 | [`hugeicons.json`](docs/audit/glyph-metrics/hugeicons.json) |
| `humbleicons` | 1 | 1 | 0 | 2 | 0 | [`humbleicons.json`](docs/audit/glyph-metrics/humbleicons.json) |
| `ic` | 2 | 2 | 627 | 1,322 | 22 | [`ic.json`](docs/audit/glyph-metrics/ic.json) |
| `icomoon-free` | 1 | 1 | 0 | 0 | 32 | [`icomoon-free.json`](docs/audit/glyph-metrics/icomoon-free.json) |
| `icon-park` | 2 | 2 | 67 | 11 | 9 | [`icon-park.json`](docs/audit/glyph-metrics/icon-park.json) |
| `icon-park-outline` | 1 | 1 | 0 | 9 | 9 | [`icon-park-outline.json`](docs/audit/glyph-metrics/icon-park-outline.json) |
| `icon-park-solid` | 1 | 1 | 0 | 6 | 8 | [`icon-park-solid.json`](docs/audit/glyph-metrics/icon-park-solid.json) |
| `icon-park-twotone` | 1 | 1 | 0 | 6 | 8 | [`icon-park-twotone.json`](docs/audit/glyph-metrics/icon-park-twotone.json) |
| `iconamoon` | 2 | 2 | 20 | 300 | 0 | [`iconamoon.json`](docs/audit/glyph-metrics/iconamoon.json) |
| `iconoir` | 1 | 1 | 0 | 1,699 | 1 | [`iconoir.json`](docs/audit/glyph-metrics/iconoir.json) |
| `icons8` | 1 | 1 | 0 | 0 | 0 | [`icons8.json`](docs/audit/glyph-metrics/icons8.json) |
| `il` | 1 | 1 | 0 | 0 | 78 | [`il.json`](docs/audit/glyph-metrics/il.json) |
| `ion` | 1 | 1 | 0 | 254 | 0 | [`ion.json`](docs/audit/glyph-metrics/ion.json) |
| `iwwa` | 1 | 1 | 0 | 0 | 0 | [`iwwa.json`](docs/audit/glyph-metrics/iwwa.json) |
| `ix` | 1 | 1 | 0 | 17 | 0 | [`ix.json`](docs/audit/glyph-metrics/ix.json) |
| `jam` | 1 | 1 | 0 | 1 | 30 | [`jam.json`](docs/audit/glyph-metrics/jam.json) |
| `la` | 1 | 1 | 0 | 932 | 0 | [`la.json`](docs/audit/glyph-metrics/la.json) |
| `lets-icons` | 2 | 2 | 91 | 106 | 0 | [`lets-icons.json`](docs/audit/glyph-metrics/lets-icons.json) |
| `line-md` | 1 | 1 | 0 | 220 | 0 | [`line-md.json`](docs/audit/glyph-metrics/line-md.json) |
| `lineicons` | 1 | 1 | 0 | 0 | 146 | [`lineicons.json`](docs/audit/glyph-metrics/lineicons.json) |
| `logos` | 2 | 2 | 209 | 8 | 1,602 | [`logos.json`](docs/audit/glyph-metrics/logos.json) |
| `ls` | 1 | 1 | 0 | 2 | 397 | [`ls.json`](docs/audit/glyph-metrics/ls.json) |
| `lsicon` | 1 | 1 | 0 | 29 | 0 | [`lsicon.json`](docs/audit/glyph-metrics/lsicon.json) |
| `lucide` | 1 | 1 | 0 | 464 | 9 | [`lucide.json`](docs/audit/glyph-metrics/lucide.json) |
| `lucide-lab` | 1 | 1 | 0 | 60 | 0 | [`lucide-lab.json`](docs/audit/glyph-metrics/lucide-lab.json) |
| `mage` | 1 | 1 | 0 | 1 | 0 | [`mage.json`](docs/audit/glyph-metrics/mage.json) |
| `majesticons` | 1 | 1 | 0 | 58 | 0 | [`majesticons.json`](docs/audit/glyph-metrics/majesticons.json) |
| `maki` | 1 | 1 | 0 | 177 | 0 | [`maki.json`](docs/audit/glyph-metrics/maki.json) |
| `map` | 1 | 1 | 0 | 1 | 0 | [`map.json`](docs/audit/glyph-metrics/map.json) |
| `marketeq` | 1 | 1 | 0 | 1 | 0 | [`marketeq.json`](docs/audit/glyph-metrics/marketeq.json) |
| `material-icon-theme` | 2 | 2 | 18 | 253 | 5 | [`material-icon-theme.json`](docs/audit/glyph-metrics/material-icon-theme.json) |
| `material-symbols` | 1 | 1 | 0 | 572 | 3 | [`material-symbols.json`](docs/audit/glyph-metrics/material-symbols.json) |
| `material-symbols-light` | 1 | 1 | 0 | 36 | 9 | [`material-symbols-light.json`](docs/audit/glyph-metrics/material-symbols-light.json) |
| `mdi` | 1 | 1 | 0 | 1,334 | 8 | [`mdi.json`](docs/audit/glyph-metrics/mdi.json) |
| `mdi-light` | 1 | 1 | 0 | 4 | 0 | [`mdi-light.json`](docs/audit/glyph-metrics/mdi-light.json) |
| `medical-icon` | 1 | 1 | 0 | 0 | 26 | [`medical-icon.json`](docs/audit/glyph-metrics/medical-icon.json) |
| `memory` | 1 | 1 | 0 | 6 | 2 | [`memory.json`](docs/audit/glyph-metrics/memory.json) |
| `meteocons` | 1 | 1 | 0 | 54 | 0 | [`meteocons.json`](docs/audit/glyph-metrics/meteocons.json) |
| `meteor-icons` | 1 | 1 | 0 | 2 | 0 | [`meteor-icons.json`](docs/audit/glyph-metrics/meteor-icons.json) |
| `mi` | 1 | 1 | 0 | 2 | 0 | [`mi.json`](docs/audit/glyph-metrics/mi.json) |
| `mingcute` | 2 | 2 | 2 | 26 | 0 | [`mingcute.json`](docs/audit/glyph-metrics/mingcute.json) |
| `mono-icons` | 1 | 1 | 0 | 2 | 0 | [`mono-icons.json`](docs/audit/glyph-metrics/mono-icons.json) |
| `mynaui` | 1 | 1 | 0 | 255 | 0 | [`mynaui.json`](docs/audit/glyph-metrics/mynaui.json) |
| `nimbus` | 1 | 1 | 0 | 0 | 0 | [`nimbus.json`](docs/audit/glyph-metrics/nimbus.json) |
| `nonicons` | 1 | 1 | 0 | 0 | 0 | [`nonicons.json`](docs/audit/glyph-metrics/nonicons.json) |
| `noto` | 2 | 2 | 20 | 30 | 0 | [`noto.json`](docs/audit/glyph-metrics/noto.json) |
| `noto-v1` | 2 | 2 | 66 | 122 | 6 | [`noto-v1.json`](docs/audit/glyph-metrics/noto-v1.json) |
| `nrk` | 2 | 2 | 11 | 6 | 16 | [`nrk.json`](docs/audit/glyph-metrics/nrk.json) |
| `octicon` | 1 | 1 | 0 | 22 | 149 | [`octicon.json`](docs/audit/glyph-metrics/octicon.json) |
| `oi` | 1 | 1 | 0 | 0 | 0 | [`oi.json`](docs/audit/glyph-metrics/oi.json) |
| `ooui` | 1 | 1 | 0 | 10 | 0 | [`ooui.json`](docs/audit/glyph-metrics/ooui.json) |
| `openmoji` | 2 | 2 | 0 | 522 | 0 | [`openmoji.json`](docs/audit/glyph-metrics/openmoji.json) |
| `oui` | 1 | 1 | 0 | 3 | 3 | [`oui.json`](docs/audit/glyph-metrics/oui.json) |
| `pajamas` | 1 | 1 | 0 | 19 | 0 | [`pajamas.json`](docs/audit/glyph-metrics/pajamas.json) |
| `pepicons` | 2 | 2 | 0 | 9 | 0 | [`pepicons.json`](docs/audit/glyph-metrics/pepicons.json) |
| `pepicons-pencil` | 2 | 2 | 1 | 2 | 0 | [`pepicons-pencil.json`](docs/audit/glyph-metrics/pepicons-pencil.json) |
| `pepicons-pop` | 2 | 2 | 1 | 10 | 0 | [`pepicons-pop.json`](docs/audit/glyph-metrics/pepicons-pop.json) |
| `pepicons-print` | 2 | 2 | 2 | 374 | 0 | [`pepicons-print.json`](docs/audit/glyph-metrics/pepicons-print.json) |
| `ph` | 2 | 2 | 482 | 899 | 21 | [`ph.json`](docs/audit/glyph-metrics/ph.json) |
| `picon` | 1 | 1 | 0 | 1 | 39 | [`picon.json`](docs/audit/glyph-metrics/picon.json) |
| `pixel` | 1 | 1 | 0 | 1 | 0 | [`pixel.json`](docs/audit/glyph-metrics/pixel.json) |
| `pixelarticons` | 2 | 2 | 2 | 6 | 0 | [`pixelarticons.json`](docs/audit/glyph-metrics/pixelarticons.json) |
| `prime` | 1 | 1 | 0 | 4 | 0 | [`prime.json`](docs/audit/glyph-metrics/prime.json) |
| `proicons` | 1 | 1 | 0 | 25 | 0 | [`proicons.json`](docs/audit/glyph-metrics/proicons.json) |
| `ps` | 1 | 1 | 0 | 3 | 417 | [`ps.json`](docs/audit/glyph-metrics/ps.json) |
| `qlementine-icons` | 2 | 2 | 24 | 12 | 1 | [`qlementine-icons.json`](docs/audit/glyph-metrics/qlementine-icons.json) |
| `quill` | 1 | 1 | 0 | 5 | 0 | [`quill.json`](docs/audit/glyph-metrics/quill.json) |
| `radix-icons` | 2 | 2 | 0 | 7 | 0 | [`radix-icons.json`](docs/audit/glyph-metrics/radix-icons.json) |
| `raphael` | 1 | 1 | 0 | 0 | 0 | [`raphael.json`](docs/audit/glyph-metrics/raphael.json) |
| `ri` | 1 | 1 | 0 | 91 | 0 | [`ri.json`](docs/audit/glyph-metrics/ri.json) |
| `rivet-icons` | 1 | 1 | 0 | 0 | 0 | [`rivet-icons.json`](docs/audit/glyph-metrics/rivet-icons.json) |
| `roentgen` | 1 | 1 | 0 | 0 | 0 | [`roentgen.json`](docs/audit/glyph-metrics/roentgen.json) |
| `si` | 2 | 2 | 26 | 418 | 0 | [`si.json`](docs/audit/glyph-metrics/si.json) |
| `si-glyph` | 1 | 1 | 0 | 1 | 493 | [`si-glyph.json`](docs/audit/glyph-metrics/si-glyph.json) |
| `sidekickicons` | 1 | 1 | 0 | 0 | 0 | [`sidekickicons.json`](docs/audit/glyph-metrics/sidekickicons.json) |
| `simple-icons` | 1 | 1 | 0 | 12 | 0 | [`simple-icons.json`](docs/audit/glyph-metrics/simple-icons.json) |
| `simple-line-icons` | 1 | 1 | 0 | 0 | 3 | [`simple-line-icons.json`](docs/audit/glyph-metrics/simple-line-icons.json) |
| `skill-icons` | 2 | 2 | 24 | 41 | 0 | [`skill-icons.json`](docs/audit/glyph-metrics/skill-icons.json) |
| `solar` | 2 | 1 | 1,830 | 429 | 60 | [`solar.json`](docs/audit/glyph-metrics/solar.json) |
| `stash` | 2 | 2 | 71 | 82 | 1 | [`stash.json`](docs/audit/glyph-metrics/stash.json) |
| `streamline` | 1 | 1 | 0 | 209 | 0 | [`streamline.json`](docs/audit/glyph-metrics/streamline.json) |
| `streamline-block` | 1 | 1 | 0 | 0 | 0 | [`streamline-block.json`](docs/audit/glyph-metrics/streamline-block.json) |
| `streamline-color` | 2 | 2 | 342 | 87 | 0 | [`streamline-color.json`](docs/audit/glyph-metrics/streamline-color.json) |
| `streamline-cyber` | 1 | 1 | 0 | 0 | 0 | [`streamline-cyber.json`](docs/audit/glyph-metrics/streamline-cyber.json) |
| `streamline-cyber-color` | 1 | 1 | 0 | 4 | 0 | [`streamline-cyber-color.json`](docs/audit/glyph-metrics/streamline-cyber-color.json) |
| `streamline-emojis` | 2 | 2 | 60 | 39 | 0 | [`streamline-emojis.json`](docs/audit/glyph-metrics/streamline-emojis.json) |
| `streamline-flex` | 1 | 1 | 0 | 1 | 0 | [`streamline-flex.json`](docs/audit/glyph-metrics/streamline-flex.json) |
| `streamline-flex-color` | 2 | 2 | 191 | 21 | 0 | [`streamline-flex-color.json`](docs/audit/glyph-metrics/streamline-flex-color.json) |
| `streamline-freehand` | 1 | 1 | 0 | 0 | 0 | [`streamline-freehand.json`](docs/audit/glyph-metrics/streamline-freehand.json) |
| `streamline-freehand-color` | 2 | 2 | 472 | 14 | 0 | [`streamline-freehand-color.json`](docs/audit/glyph-metrics/streamline-freehand-color.json) |
| `streamline-kameleon-color` | 2 | 2 | 3 | 0 | 0 | [`streamline-kameleon-color.json`](docs/audit/glyph-metrics/streamline-kameleon-color.json) |
| `streamline-logos` | 1 | 1 | 0 | 0 | 0 | [`streamline-logos.json`](docs/audit/glyph-metrics/streamline-logos.json) |
| `streamline-pixel` | 1 | 1 | 0 | 0 | 0 | [`streamline-pixel.json`](docs/audit/glyph-metrics/streamline-pixel.json) |
| `streamline-plump` | 1 | 1 | 0 | 0 | 0 | [`streamline-plump.json`](docs/audit/glyph-metrics/streamline-plump.json) |
| `streamline-plump-color` | 2 | 2 | 123 | 25 | 0 | [`streamline-plump-color.json`](docs/audit/glyph-metrics/streamline-plump-color.json) |
| `streamline-sharp` | 1 | 1 | 0 | 0 | 0 | [`streamline-sharp.json`](docs/audit/glyph-metrics/streamline-sharp.json) |
| `streamline-sharp-color` | 2 | 2 | 139 | 27 | 0 | [`streamline-sharp-color.json`](docs/audit/glyph-metrics/streamline-sharp-color.json) |
| `streamline-stickies-color` | 2 | 2 | 0 | 0 | 0 | [`streamline-stickies-color.json`](docs/audit/glyph-metrics/streamline-stickies-color.json) |
| `streamline-ultimate` | 1 | 1 | 0 | 0 | 0 | [`streamline-ultimate.json`](docs/audit/glyph-metrics/streamline-ultimate.json) |
| `streamline-ultimate-color` | 2 | 2 | 0 | 4 | 0 | [`streamline-ultimate-color.json`](docs/audit/glyph-metrics/streamline-ultimate-color.json) |
| `subway` | 1 | 1 | 0 | 1 | 0 | [`subway.json`](docs/audit/glyph-metrics/subway.json) |
| `svg-spinners` | 1 | 1 | 0 | 5 | 0 | [`svg-spinners.json`](docs/audit/glyph-metrics/svg-spinners.json) |
| `system-uicons` | 1 | 1 | 0 | 2 | 0 | [`system-uicons.json`](docs/audit/glyph-metrics/system-uicons.json) |
| `tabler` | 2 | 2 | 0 | 337 | 22 | [`tabler.json`](docs/audit/glyph-metrics/tabler.json) |
| `tdesign` | 2 | 2 | 1 | 14 | 24 | [`tdesign.json`](docs/audit/glyph-metrics/tdesign.json) |
| `teenyicons` | 1 | 1 | 0 | 60 | 1 | [`teenyicons.json`](docs/audit/glyph-metrics/teenyicons.json) |
| `temaki` | 2 | 2 | 0 | 0 | 2 | [`temaki.json`](docs/audit/glyph-metrics/temaki.json) |
| `token` | 2 | 2 | 2 | 25 | 1 | [`token.json`](docs/audit/glyph-metrics/token.json) |
| `token-branded` | 2 | 2 | 62 | 20 | 0 | [`token-branded.json`](docs/audit/glyph-metrics/token-branded.json) |
| `topcoat` | 1 | 1 | 0 | 0 | 0 | [`topcoat.json`](docs/audit/glyph-metrics/topcoat.json) |
| `twemoji` | 2 | 2 | 230 | 166 | 0 | [`twemoji.json`](docs/audit/glyph-metrics/twemoji.json) |
| `typcn` | 1 | 1 | 0 | 0 | 0 | [`typcn.json`](docs/audit/glyph-metrics/typcn.json) |
| `uil` | 1 | 1 | 0 | 40 | 0 | [`uil.json`](docs/audit/glyph-metrics/uil.json) |
| `uim` | 2 | 2 | 87 | 17 | 0 | [`uim.json`](docs/audit/glyph-metrics/uim.json) |
| `uis` | 1 | 1 | 0 | 2 | 0 | [`uis.json`](docs/audit/glyph-metrics/uis.json) |
| `uit` | 1 | 1 | 0 | 1 | 0 | [`uit.json`](docs/audit/glyph-metrics/uit.json) |
| `uiw` | 1 | 1 | 0 | 0 | 0 | [`uiw.json`](docs/audit/glyph-metrics/uiw.json) |
| `unjs` | 1 | 1 | 0 | 0 | 0 | [`unjs.json`](docs/audit/glyph-metrics/unjs.json) |
| `vaadin` | 1 | 1 | 0 | 0 | 0 | [`vaadin.json`](docs/audit/glyph-metrics/vaadin.json) |
| `vs` | 1 | 1 | 0 | 13 | 135 | [`vs.json`](docs/audit/glyph-metrics/vs.json) |
| `vscode-icons` | 2 | 2 | 60 | 120 | 18 | [`vscode-icons.json`](docs/audit/glyph-metrics/vscode-icons.json) |
| `websymbol` | 1 | 1 | 0 | 0 | 58 | [`websymbol.json`](docs/audit/glyph-metrics/websymbol.json) |
| `weui` | 1 | 1 | 0 | 0 | 4 | [`weui.json`](docs/audit/glyph-metrics/weui.json) |
| `whh` | 1 | 1 | 0 | 28 | 1,106 | [`whh.json`](docs/audit/glyph-metrics/whh.json) |
| `wi` | 1 | 1 | 0 | 85 | 9 | [`wi.json`](docs/audit/glyph-metrics/wi.json) |
| `wordpress` | 2 | 2 | 2 | 6 | 0 | [`wordpress.json`](docs/audit/glyph-metrics/wordpress.json) |
| `wpf` | 1 | 1 | 0 | 90 | 0 | [`wpf.json`](docs/audit/glyph-metrics/wpf.json) |
| `zmdi` | 1 | 1 | 0 | 105 | 811 | [`zmdi.json`](docs/audit/glyph-metrics/zmdi.json) |
| `zondicons` | 1 | 1 | 0 | 24 | 0 | [`zondicons.json`](docs/audit/glyph-metrics/zondicons.json) |
