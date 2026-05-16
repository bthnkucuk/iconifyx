# Glyph metrics audit

Generated 2026-05-16; `@iconify/json` ^2.2.300. Scans every emitted TTF for font-level metric drift, duotone primary/secondary bbox mismatch, cmap-dedup collisions, and per-glyph outliers (narrow / wide / non-1000 advance). Output is deterministic — same input TTFs → byte-identical report.

## Summary

- TTFs scanned: **296**
- TTFs with non-canonical font metrics: **0** — every font is at the canonical 1000-em-quad.
- Duotone primary/secondary mismatch — **high risk** (non-overlapping bboxes or half-broken): **64 icons across 2 packs**
- Duotone primary/secondary mismatch — **asymmetric** (overlapping bboxes; informational, renders correctly via `IconifyIcon` BoxFit.contain): **10,495 icons across 61 packs**
- Glyph dedup collisions (different codepoints sharing one glyph name): **25,077 cases across 166 packs**
- Per-glyph outliers (narrow / wide / non-1000 advance): **14,838**

Detail per pack: [`docs/audit/glyph-metrics/<prefix>.json`](docs/audit/glyph-metrics/). Markdown caps each section at the top 50 rows for readability.

## Highest-risk duotone alignment misses

Score = `|primary.xMin - secondary.xMin| + |primary.xMax - secondary.xMax|`. Threshold: 200 units (= 4 % of em-quad).

Cause column: `shifted` = bboxes don't overlap on x or y axis (likely real misalignment, like the `solar:add-circle-bold-duotone` regression where the outer ring vanished from the primary layer); `asymmetric` = bboxes overlap in 2-D (one layer is a sub-region of the other — typical IC twotone / Phosphor duotone / paint-order wordmark, renders correctly in `IconifyIcon`); `primary-empty` / `secondary-empty` / `*-missing` = half-broken pair, same severity as shifted.

| Pack | Icon | Primary x-bbox | Secondary x-bbox | Score | Cause |
|---|---|---|---|---:|---|
| `solar` | `minimize-bold-duotone` | 593..951 | 51..407 | 1,086 | shifted |
| `solar` | `minimize-line-duotone` | 593..949 | 51..407 | 1,084 | shifted |
| `solar` | `maximize-line-duotone` | 592..949 | 51..407 | 1,083 | shifted |
| `solar` | `maximize-bold-duotone` | 587..949 | 51..407 | 1,078 | shifted |
| `devicon` | `capacitor-wordmark` | 236..1000 | 74..116 | 1,046 | shifted |
| `devicon` | `haskell-wordmark` | 1..207 | 240..1000 | 1,032 | shifted |
| `solar` | `skip-next-line-duotone` | 51..781 | 884..949 | 1,001 | shifted |
| `solar` | `skip-previous-bold-duotone` | 282..948 | 83..146 | 1,001 | shifted |
| `solar` | `skip-previous-line-duotone` | 219..949 | 51..116 | 1,001 | shifted |
| `solar` | `pause-bold-duotone` | 83..416 | 583..916 | 1,000 | shifted |
| `solar` | `pause-line-duotone` | 52..448 | 552..948 | 1,000 | shifted |
| `solar` | `skip-next-bold-duotone` | 83..755 | 884..949 | 995 | shifted |
| `solar` | `playback-speed-bold-duotone` | 374..948 | 49..312 | 961 | shifted |
| `solar` | `muted-line-duotone` | 32..677 | 717..952 | 960 | shifted |
| `solar` | `volume-loud-line-duotone` | 32..677 | 718..926 | 935 | shifted |
| `solar` | `sort-by-time-line-duotone` | 469..956 | 49..449 | 927 | shifted |
| `solar` | `repeat-bold-duotone` | 47..493 | 508..953 | 921 | shifted |
| `solar` | `repeat-line-duotone` | 47..493 | 508..953 | 921 | shifted |
| `solar` | `align-left-line-duotone` | 260..907 | 93..157 | 917 | shifted |
| `solar` | `align-right-line-duotone` | 93..740 | 843..907 | 917 | shifted |
| `solar` | `widget-2-line-duotone` | 68..469 | 527..927 | 917 | shifted |
| `solar` | `align-right-bold-duotone` | 109..695 | 828..892 | 916 | shifted |
| `solar` | `sort-by-time-bold-duotone` | 500..916 | 50..450 | 916 | shifted |
| `solar` | `widget-4-bold-duotone` | 541..917 | 84..458 | 916 | shifted |
| `solar` | `widget-4-line-duotone` | 531..927 | 73..469 | 916 | shifted |
| `solar` | `align-left-bold-duotone` | 306..890 | 109..172 | 915 | shifted |
| `solar` | `volume-loud-bold-duotone` | 84..659 | 724..916 | 897 | shifted |
| `solar` | `video-frame-2-bold-duotone` | 83..469 | 531..917 | 896 | shifted |
| `solar` | `widget-2-bold-duotone` | 80..477 | 523..920 | 886 | shifted |
| `solar` | `dumbbells-2-bold-duotone` | 500..918 | 83..459 | 876 | shifted |
| `solar` | `dislike-line-duotone` | 223..908 | 93..197 | 841 | shifted |
| `solar` | `like-line-duotone` | 222..908 | 93..197 | 840 | shifted |
| `solar` | `dislike-bold-duotone` | 254..875 | 93..197 | 839 | shifted |
| `solar` | `like-bold-duotone` | 254..875 | 93..197 | 839 | shifted |
| `solar` | `transfer-vertical-bold-duotone` | 551..866 | 134..449 | 834 | shifted |
| `solar` | `transfer-vertical-line-duotone` | 134..449 | 551..866 | 834 | shifted |
| `solar` | `volume-small-bold-duotone` | 124..726 | 794..875 | 819 | shifted |
| `solar` | `volume-small-line-duotone` | 32..677 | 718..801 | 810 | shifted |
| `solar` | `mirror-left-bold-duotone` | 134..542 | 567..917 | 808 | shifted |
| `solar` | `mirror-right-bold-duotone` | 509..917 | 134..488 | 804 | shifted |
| `solar` | `bluetooth-wave-bold-duotone` | 121..645 | 663..875 | 772 | shifted |
| `solar` | `trash-bin-minimalistic-2-line-duotone` | 112..886 | 351..650 | 475 | shifted |
| `solar` | `lightbulb-minimalistic-line-duotone` | 168..832 | 385..615 | 434 | shifted |
| `solar` | `dumbbells-bold-duotone` | 88..699 | 285..905 | 403 | shifted |
| `solar` | `tea-cup-bold-duotone` | 93..954 | 175..659 | 377 | shifted |
| `solar` | `lightbulb-minimalistic-bold-duotone` | 383..617 | 206..799 | 359 | shifted |
| `solar` | `user-bold-duotone` | 334..668 | 166..834 | 334 | shifted |
| `solar` | `user-line-duotone` | 302..702 | 133..865 | 332 | shifted |
| `solar` | `user-speak-bold-duotone` | 249..907 | 83..751 | 322 | shifted |
| `solar` | `user-speak-rounded-bold-duotone` | 249..907 | 113..721 | 322 | shifted |

…10,509 more — see per-pack JSON.

## TTFs with non-canonical head/hhea/OS2 metrics

_Every TTF reports unitsPerEm=1000, head bbox within 0..1000, hhea/OS/2 ascent=1000, descent=0 (within ±1 unit)._

## Glyph dedup collisions (cmap collision via path dedup)

When `svg2ttf` collapses identical outlines, all original codepoints still cmap to the SAME glyph name. Every consumer of any of those codepoints renders the FIRST icon's letterform — visually wrong for every icon after the first.

| Pack | TTF | First-claimed glyph | # codepoints | Example icons sharing it |
|---|---|---|---:|---|
| `cryptocurrency-color` | `CryptocurrencyColor` | `aave` | 375 | `aave`, `abt`, `act`, `actn` |
| `circle-flags` | `CircleFlags` | `aa` | 222 | `aa`, `af-emirate`, `afar`, `al` |
| `material-icon-theme` | `MaterialIconTheme` | `folder-admin` | 218 | `folder-admin`, `folder-android`, `folder-angular`, `folder-animation` |
| `material-icon-theme` | `MaterialIconTheme` | `folder-admin-open` | 208 | `folder-admin-open`, `folder-android-open`, `folder-angular-open`, `folder-animation-open` |
| `twemoji` | `Twemoji` | `a-button` | 152 | `a-button`, `a-button-blood-type`, `ab-button`, `ab-button-blood-type` |
| `pepicons-print` | `PepiconsPrintSecondary` | `airplane-circle-filled` | 149 | `airplane-circle-filled`, `alarm-circle-filled`, `angle-down-circle-filled`, `angle-left-circle-filled` |
| `solar` | `SolarSecondary` | `4k-bold-duotone` | 145 | `4k-bold-duotone`, `add-square-bold-duotone`, `augmented-reality-bold-duotone`, `bluetooth-square-bold-duotone` |
| `emojione` | `Emojione` | `antenna-bars` | 137 | `antenna-bars`, `anticlockwise-arrows-button`, `aquarius`, `aries` |
| `fluent-emoji-flat` | `FluentEmojiFlat` | `a-button-blood-type` | 125 | `a-button-blood-type`, `ab-button-blood-type`, `antenna-bars`, `aquarius` |
| `skill-icons` | `SkillIcons` | `ableton-dark` | 116 | `ableton-dark`, `ableton-light`, `actix-dark`, `actix-light` |
| `solar` | `SolarSecondary` | `4k-line-duotone` | 100 | `4k-line-duotone`, `add-square-line-duotone`, `augmented-reality-line-duotone`, `bones-line-duotone` |
| `twemoji` | `Twemoji` | `envelope` | 99 | `envelope`, `flag-armenia`, `flag-azerbaijan`, `flag-barbados` |
| `solar` | `SolarSecondary` | `accessibility-bold-duotone` | 81 | `accessibility-bold-duotone`, `add-circle-bold-duotone`, `bluetooth-circle-bold-duotone`, `bolt-circle-bold-duotone` |
| `ph` | `PhSecondary` | `arrow-circle-down-duotone` | 77 | `arrow-circle-down-duotone`, `arrow-circle-down-left-duotone`, `arrow-circle-down-right-duotone`, `arrow-circle-left-duotone` |
| `solar` | `SolarSecondary` | `accessibility-line-duotone` | 57 | `accessibility-line-duotone`, `add-circle-line-duotone`, `check-circle-line-duotone`, `clock-circle-line-duotone` |
| `iconamoon` | `IconamoonSecondary` | `arrow-bottom-left-5-circle-duotone` | 55 | `arrow-bottom-left-5-circle-duotone`, `arrow-bottom-left-6-circle-duotone`, `arrow-bottom-right-5-circle-duotone`, `arrow-bottom-right-6-circle-duotone` |
| `catppuccin` | `Catppuccin` | `folder-azure-pipelines` | 49 | `folder-azure-pipelines`, `folder-content`, `folder-database`, `folder-debug` |
| `flag` | `Flag` | `al-1x1` | 49 | `al-1x1`, `bd-1x1`, `bg-1x1`, `bh-1x1` |
| `catppuccin` | `Catppuccin` | `folder-azure-pipelines-open` | 48 | `folder-azure-pipelines-open`, `folder-database-open`, `folder-debug-open`, `folder-direnv-open` |
| `openmoji` | `Openmoji` | `alabama-flag` | 47 | `alabama-flag`, `barcode`, `berlin-flag`, `black-rectangle` |
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
| `ph` | `PhSecondary` | `arrow-square-down-duotone` | 25 | `arrow-square-down-duotone`, `arrow-square-down-left-duotone`, `arrow-square-down-right-duotone`, `arrow-square-left-duotone` |
| `twemoji` | `TwemojiSecondary` | `eight-oclock` | 24 | `eight-oclock`, `eight-thirty`, `eleven-oclock`, `eleven-thirty` |
| `fluent-emoji-flat` | `FluentEmojiFlatSecondary` | `eight-oclock` | 23 | `eight-oclock`, `eleven-oclock`, `eleven-thirty`, `five-oclock` |
| `streamline-plump-color` | `StreamlinePlumpColor` | `arrow-right-circle-1-flat` | 23 | `arrow-right-circle-1-flat`, `arrow-right-circle-2-flat`, `ball-flat`, `button-play-circle-flat` |
| `meteocons` | `Meteocons` | `overcast-day-fill` | 22 | `overcast-day-fill`, `overcast-day-fog-fill`, `overcast-day-hail-fill`, `overcast-day-haze-fill` |
| `openmoji` | `Openmoji` | `men-wrestling` | 22 | `men-wrestling`, `people-wrestling`, `people-wrestling-dark-skin-tone-light-skin-tone`, `people-wrestling-dark-skin-tone-medium-dark-skin-tone` |
| `openmoji` | `Openmoji` | `people-with-bunny-ears` | 22 | `people-with-bunny-ears`, `people-with-bunny-ears-dark-skin-tone-light-skin-tone`, `people-with-bunny-ears-dark-skin-tone-medium-dark-skin-tone`, `people-with-bunny-ears-dark-skin-tone-medium-light-skin-tone` |
| `wi` | `Wi` | `forecast-io-rain` | 22 | `forecast-io-rain`, `owm-302`, `owm-311`, `owm-312` |
| `twemoji` | `TwemojiSecondary` | `flag-chad` | 21 | `flag-chad`, `flag-clipperton-island`, `flag-for-chad`, `flag-for-clipperton-island` |
| `wi` | `Wi` | `owm-310` | 21 | `owm-310`, `owm-511`, `owm-611`, `owm-612` |
| `openmoji` | `Openmoji` | `blue-square` | 20 | `blue-square`, `combining-enclosing-keycap`, `green-square`, `japanese-discount-button` |
| `wi` | `Wi` | `forecast-io-snow` | 20 | `forecast-io-snow`, `owm-600`, `owm-601`, `owm-621` |
| `icon-park` | `IconPark` | `checkbox` | 19 | `checkbox`, `direction`, `extend`, `facetime` |
| `twemoji` | `Twemoji` | `angry-face` | 19 | `angry-face`, `anguished-face`, `confounded-face`, `confused-face` |

…25,027 more — see per-pack JSON.

## Per-glyph metric outliers

`narrow` = content width < 100 (likely render-as-dot). `wide` = > 1100 (overflows em-box → clipped at consumer). `advance` = horizontal advance != 1000 (breaks TextPainter centring).

| Pack | TTF | Codepoint | Glyph | Reason | Width | Advance |
|---|---|---|---|---|---:|---:|
| `logos` | `Logos` | `0xe081` | `campaignmonitor` | advance | — | 10039 |
| `logos` | `LogosSecondary` | `0xe081` | `campaignmonitor` | advance | — | 10039 |
| `logos` | `Logos` | `0xe003` | `active-campaign` | advance | — | 9846 |
| `logos` | `Logos` | `0xe003` | `active-campaign` | wide | 9847 | — |
| `logos` | `Logos` | `0xe1ba` | `kickstarter` | advance | — | 9309 |
| `logos` | `Logos` | `0xe1ba` | `kickstarter` | wide | 9310 | — |
| `logos` | `Logos` | `0xe09c` | `codeclimate` | advance | — | 8982 |
| `logos` | `Logos` | `0xe28a` | `prestashop` | advance | — | 8982 |
| `logos` | `Logos` | `0xe09c` | `codeclimate` | wide | 8983 | — |
| `logos` | `Logos` | `0xe28a` | `prestashop` | wide | 8983 | — |
| `logos` | `Logos` | `0xe081` | `campaignmonitor` | wide | 8655 | — |
| `logos` | `Logos` | `0xe1db` | `logmatic` | advance | — | 8000 |
| `logos` | `LogosSecondary` | `0xe1db` | `logmatic` | advance | — | 8000 |
| `logos` | `Logos` | `0xe1db` | `logmatic` | wide | 7998 | — |
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
| `logos` | `LogosSecondary` | `0xe0c9` | `datasette` | wide | 6860 | — |
| `logos` | `Logos` | `0xe1c3` | `kustomer` | advance | — | 6736 |
| `logos` | `Logos` | `0xe091` | `cloudacademy` | wide | 6830 | — |
| `noto-v1` | `NotoV1` | `0xe1d7` | `right-anger-bubble` | wide | 6771 | — |
| `logos` | `Logos` | `0xe2ee` | `skaffolder` | advance | — | 6649 |
| `logos` | `LogosSecondary` | `0xe2ee` | `skaffolder` | advance | — | 6649 |
| `logos` | `Logos` | `0xe1c3` | `kustomer` | wide | 6735 | — |
| `logos` | `Logos` | `0xe0a5` | `codersrank` | advance | — | 6564 |
| `logos` | `LogosSecondary` | `0xe0a5` | `codersrank` | advance | — | 6564 |

…14,788 more — see per-pack JSON.

## Per-pack JSON detail

Click through for the full per-pack breakdown (every flagged glyph, every TTF's metrics).

| Pack | TTFs | Non-canonical fonts | Duotone misses | Dedup collisions | Outliers | Detail |
|---|---:|---:|---:|---:|---:|---|
| `academicons` | 1 | 0 | 0 | 0 | 104 | [`academicons.json`](docs/audit/glyph-metrics/academicons.json) |
| `akar-icons` | 1 | 0 | 0 | 18 | 0 | [`akar-icons.json`](docs/audit/glyph-metrics/akar-icons.json) |
| `ant-design` | 2 | 0 | 6 | 615 | 0 | [`ant-design.json`](docs/audit/glyph-metrics/ant-design.json) |
| `arcticons` | 2 | 0 | 1 | 315 | 0 | [`arcticons.json`](docs/audit/glyph-metrics/arcticons.json) |
| `basil` | 1 | 0 | 0 | 24 | 0 | [`basil.json`](docs/audit/glyph-metrics/basil.json) |
| `bi` | 2 | 0 | 0 | 8 | 0 | [`bi.json`](docs/audit/glyph-metrics/bi.json) |
| `boxicons` | 1 | 0 | 0 | 411 | 0 | [`boxicons.json`](docs/audit/glyph-metrics/boxicons.json) |
| `brandico` | 1 | 0 | 0 | 0 | 28 | [`brandico.json`](docs/audit/glyph-metrics/brandico.json) |
| `bx` | 1 | 0 | 0 | 814 | 0 | [`bx.json`](docs/audit/glyph-metrics/bx.json) |
| `bxl` | 1 | 0 | 0 | 2 | 0 | [`bxl.json`](docs/audit/glyph-metrics/bxl.json) |
| `carbon` | 1 | 0 | 0 | 19 | 0 | [`carbon.json`](docs/audit/glyph-metrics/carbon.json) |
| `catppuccin` | 2 | 0 | 27 | 119 | 2 | [`catppuccin.json`](docs/audit/glyph-metrics/catppuccin.json) |
| `cbi` | 1 | 0 | 0 | 81 | 0 | [`cbi.json`](docs/audit/glyph-metrics/cbi.json) |
| `charm` | 1 | 0 | 0 | 1 | 0 | [`charm.json`](docs/audit/glyph-metrics/charm.json) |
| `ci` | 1 | 0 | 0 | 3 | 0 | [`ci.json`](docs/audit/glyph-metrics/ci.json) |
| `cib` | 1 | 0 | 0 | 1 | 0 | [`cib.json`](docs/audit/glyph-metrics/cib.json) |
| `cif` | 2 | 0 | 19 | 10 | 435 | [`cif.json`](docs/audit/glyph-metrics/cif.json) |
| `cil` | 1 | 0 | 0 | 37 | 0 | [`cil.json`](docs/audit/glyph-metrics/cil.json) |
| `circle-flags` | 2 | 0 | 619 | 313 | 329 | [`circle-flags.json`](docs/audit/glyph-metrics/circle-flags.json) |
| `clarity` | 2 | 0 | 0 | 127 | 0 | [`clarity.json`](docs/audit/glyph-metrics/clarity.json) |
| `codicon` | 1 | 0 | 0 | 8 | 7 | [`codicon.json`](docs/audit/glyph-metrics/codicon.json) |
| `covid` | 1 | 0 | 0 | 0 | 1 | [`covid.json`](docs/audit/glyph-metrics/covid.json) |
| `cryptocurrency` | 2 | 0 | 13 | 8 | 0 | [`cryptocurrency.json`](docs/audit/glyph-metrics/cryptocurrency.json) |
| `cryptocurrency-color` | 2 | 0 | 163 | 4 | 0 | [`cryptocurrency-color.json`](docs/audit/glyph-metrics/cryptocurrency-color.json) |
| `cuida` | 2 | 0 | 1 | 0 | 8 | [`cuida.json`](docs/audit/glyph-metrics/cuida.json) |
| `dashicons` | 1 | 0 | 0 | 5 | 0 | [`dashicons.json`](docs/audit/glyph-metrics/dashicons.json) |
| `devicon` | 2 | 0 | 147 | 2 | 10 | [`devicon.json`](docs/audit/glyph-metrics/devicon.json) |
| `devicon-plain` | 2 | 0 | 1 | 3 | 1 | [`devicon-plain.json`](docs/audit/glyph-metrics/devicon-plain.json) |
| `dinkie-icons` | 1 | 0 | 0 | 0 | 297 | [`dinkie-icons.json`](docs/audit/glyph-metrics/dinkie-icons.json) |
| `duo-icons` | 2 | 0 | 41 | 2 | 0 | [`duo-icons.json`](docs/audit/glyph-metrics/duo-icons.json) |
| `ei` | 2 | 0 | 2 | 0 | 0 | [`ei.json`](docs/audit/glyph-metrics/ei.json) |
| `el` | 1 | 0 | 0 | 1 | 0 | [`el.json`](docs/audit/glyph-metrics/el.json) |
| `emojione` | 2 | 0 | 116 | 73 | 0 | [`emojione.json`](docs/audit/glyph-metrics/emojione.json) |
| `emojione-monotone` | 1 | 0 | 0 | 290 | 0 | [`emojione-monotone.json`](docs/audit/glyph-metrics/emojione-monotone.json) |
| `emojione-v1` | 2 | 0 | 75 | 108 | 0 | [`emojione-v1.json`](docs/audit/glyph-metrics/emojione-v1.json) |
| `ep` | 1 | 0 | 0 | 1 | 0 | [`ep.json`](docs/audit/glyph-metrics/ep.json) |
| `et` | 1 | 0 | 0 | 0 | 97 | [`et.json`](docs/audit/glyph-metrics/et.json) |
| `eva` | 1 | 0 | 0 | 88 | 0 | [`eva.json`](docs/audit/glyph-metrics/eva.json) |
| `f7` | 1 | 0 | 0 | 10 | 0 | [`f7.json`](docs/audit/glyph-metrics/f7.json) |
| `fa` | 1 | 0 | 0 | 92 | 798 | [`fa.json`](docs/audit/glyph-metrics/fa.json) |
| `fa-brands` | 1 | 0 | 0 | 1 | 440 | [`fa-brands.json`](docs/audit/glyph-metrics/fa-brands.json) |
| `fa-regular` | 1 | 0 | 0 | 0 | 126 | [`fa-regular.json`](docs/audit/glyph-metrics/fa-regular.json) |
| `fa-solid` | 1 | 0 | 0 | 2 | 988 | [`fa-solid.json`](docs/audit/glyph-metrics/fa-solid.json) |
| `fa6-brands` | 1 | 0 | 0 | 23 | 487 | [`fa6-brands.json`](docs/audit/glyph-metrics/fa6-brands.json) |
| `fa6-regular` | 1 | 0 | 0 | 0 | 93 | [`fa6-regular.json`](docs/audit/glyph-metrics/fa6-regular.json) |
| `fa6-solid` | 1 | 0 | 0 | 1 | 1,425 | [`fa6-solid.json`](docs/audit/glyph-metrics/fa6-solid.json) |
| `fa7-brands` | 1 | 0 | 0 | 36 | 0 | [`fa7-brands.json`](docs/audit/glyph-metrics/fa7-brands.json) |
| `fa7-regular` | 1 | 0 | 0 | 91 | 0 | [`fa7-regular.json`](docs/audit/glyph-metrics/fa7-regular.json) |
| `fa7-solid` | 1 | 0 | 0 | 479 | 0 | [`fa7-solid.json`](docs/audit/glyph-metrics/fa7-solid.json) |
| `fad` | 1 | 0 | 0 | 0 | 2 | [`fad.json`](docs/audit/glyph-metrics/fad.json) |
| `famicons` | 1 | 0 | 0 | 52 | 0 | [`famicons.json`](docs/audit/glyph-metrics/famicons.json) |
| `fe` | 1 | 0 | 0 | 1 | 0 | [`fe.json`](docs/audit/glyph-metrics/fe.json) |
| `feather` | 1 | 0 | 0 | 8 | 0 | [`feather.json`](docs/audit/glyph-metrics/feather.json) |
| `file-icons` | 1 | 0 | 0 | 0 | 272 | [`file-icons.json`](docs/audit/glyph-metrics/file-icons.json) |
| `flag` | 2 | 0 | 23 | 17 | 511 | [`flag.json`](docs/audit/glyph-metrics/flag.json) |
| `flagpack` | 2 | 0 | 8 | 14 | 478 | [`flagpack.json`](docs/audit/glyph-metrics/flagpack.json) |
| `flat-color-icons` | 2 | 0 | 20 | 10 | 0 | [`flat-color-icons.json`](docs/audit/glyph-metrics/flat-color-icons.json) |
| `flat-ui` | 2 | 0 | 9 | 0 | 27 | [`flat-ui.json`](docs/audit/glyph-metrics/flat-ui.json) |
| `flowbite` | 1 | 0 | 0 | 12 | 0 | [`flowbite.json`](docs/audit/glyph-metrics/flowbite.json) |
| `fluent` | 1 | 0 | 0 | 687 | 15 | [`fluent.json`](docs/audit/glyph-metrics/fluent.json) |
| `fluent-color` | 1 | 0 | 0 | 1 | 0 | [`fluent-color.json`](docs/audit/glyph-metrics/fluent-color.json) |
| `fluent-emoji` | 2 | 0 | 0 | 16 | 9 | [`fluent-emoji.json`](docs/audit/glyph-metrics/fluent-emoji.json) |
| `fluent-emoji-flat` | 2 | 0 | 1,719 | 226 | 153 | [`fluent-emoji-flat.json`](docs/audit/glyph-metrics/fluent-emoji-flat.json) |
| `fluent-emoji-high-contrast` | 1 | 0 | 0 | 14 | 3 | [`fluent-emoji-high-contrast.json`](docs/audit/glyph-metrics/fluent-emoji-high-contrast.json) |
| `fluent-mdl2` | 1 | 0 | 0 | 9 | 6 | [`fluent-mdl2.json`](docs/audit/glyph-metrics/fluent-mdl2.json) |
| `fontelico` | 1 | 0 | 0 | 0 | 25 | [`fontelico.json`](docs/audit/glyph-metrics/fontelico.json) |
| `fontisto` | 1 | 0 | 0 | 2 | 513 | [`fontisto.json`](docs/audit/glyph-metrics/fontisto.json) |
| `formkit` | 1 | 0 | 0 | 3 | 104 | [`formkit.json`](docs/audit/glyph-metrics/formkit.json) |
| `fxemoji` | 2 | 0 | 58 | 14 | 3 | [`fxemoji.json`](docs/audit/glyph-metrics/fxemoji.json) |
| `gala` | 1 | 0 | 0 | 4 | 0 | [`gala.json`](docs/audit/glyph-metrics/gala.json) |
| `game-icons` | 1 | 0 | 0 | 3 | 0 | [`game-icons.json`](docs/audit/glyph-metrics/game-icons.json) |
| `garden` | 1 | 0 | 0 | 3 | 51 | [`garden.json`](docs/audit/glyph-metrics/garden.json) |
| `gcp` | 2 | 0 | 29 | 1 | 9 | [`gcp.json`](docs/audit/glyph-metrics/gcp.json) |
| `geo` | 1 | 0 | 0 | 1 | 0 | [`geo.json`](docs/audit/glyph-metrics/geo.json) |
| `gg` | 2 | 0 | 12 | 4 | 0 | [`gg.json`](docs/audit/glyph-metrics/gg.json) |
| `glyphs` | 2 | 0 | 50 | 443 | 19 | [`glyphs.json`](docs/audit/glyph-metrics/glyphs.json) |
| `glyphs-poly` | 2 | 0 | 83 | 36 | 9 | [`glyphs-poly.json`](docs/audit/glyph-metrics/glyphs-poly.json) |
| `gravity-ui` | 1 | 0 | 0 | 3 | 0 | [`gravity-ui.json`](docs/audit/glyph-metrics/gravity-ui.json) |
| `grommet-icons` | 2 | 0 | 4 | 5 | 4 | [`grommet-icons.json`](docs/audit/glyph-metrics/grommet-icons.json) |
| `healthicons` | 1 | 0 | 0 | 755 | 0 | [`healthicons.json`](docs/audit/glyph-metrics/healthicons.json) |
| `heroicons` | 1 | 0 | 0 | 16 | 0 | [`heroicons.json`](docs/audit/glyph-metrics/heroicons.json) |
| `heroicons-solid` | 1 | 0 | 0 | 2 | 0 | [`heroicons-solid.json`](docs/audit/glyph-metrics/heroicons-solid.json) |
| `hugeicons` | 2 | 0 | 1 | 38 | 1 | [`hugeicons.json`](docs/audit/glyph-metrics/hugeicons.json) |
| `humbleicons` | 1 | 0 | 0 | 2 | 0 | [`humbleicons.json`](docs/audit/glyph-metrics/humbleicons.json) |
| `ic` | 2 | 0 | 533 | 2,297 | 22 | [`ic.json`](docs/audit/glyph-metrics/ic.json) |
| `icomoon-free` | 1 | 0 | 0 | 0 | 32 | [`icomoon-free.json`](docs/audit/glyph-metrics/icomoon-free.json) |
| `icon-park` | 2 | 0 | 66 | 11 | 9 | [`icon-park.json`](docs/audit/glyph-metrics/icon-park.json) |
| `icon-park-outline` | 1 | 0 | 0 | 9 | 9 | [`icon-park-outline.json`](docs/audit/glyph-metrics/icon-park-outline.json) |
| `icon-park-solid` | 1 | 0 | 0 | 6 | 8 | [`icon-park-solid.json`](docs/audit/glyph-metrics/icon-park-solid.json) |
| `icon-park-twotone` | 1 | 0 | 0 | 6 | 8 | [`icon-park-twotone.json`](docs/audit/glyph-metrics/icon-park-twotone.json) |
| `iconamoon` | 2 | 0 | 49 | 263 | 3 | [`iconamoon.json`](docs/audit/glyph-metrics/iconamoon.json) |
| `iconoir` | 1 | 0 | 0 | 2,325 | 0 | [`iconoir.json`](docs/audit/glyph-metrics/iconoir.json) |
| `il` | 1 | 0 | 0 | 0 | 78 | [`il.json`](docs/audit/glyph-metrics/il.json) |
| `ion` | 1 | 0 | 0 | 254 | 0 | [`ion.json`](docs/audit/glyph-metrics/ion.json) |
| `ix` | 1 | 0 | 0 | 17 | 0 | [`ix.json`](docs/audit/glyph-metrics/ix.json) |
| `jam` | 1 | 0 | 0 | 1 | 30 | [`jam.json`](docs/audit/glyph-metrics/jam.json) |
| `la` | 1 | 0 | 0 | 932 | 0 | [`la.json`](docs/audit/glyph-metrics/la.json) |
| `lets-icons` | 2 | 0 | 68 | 106 | 0 | [`lets-icons.json`](docs/audit/glyph-metrics/lets-icons.json) |
| `line-md` | 1 | 0 | 0 | 220 | 0 | [`line-md.json`](docs/audit/glyph-metrics/line-md.json) |
| `lineicons` | 1 | 0 | 0 | 0 | 146 | [`lineicons.json`](docs/audit/glyph-metrics/lineicons.json) |
| `logos` | 2 | 0 | 311 | 5 | 1,563 | [`logos.json`](docs/audit/glyph-metrics/logos.json) |
| `ls` | 1 | 0 | 0 | 2 | 397 | [`ls.json`](docs/audit/glyph-metrics/ls.json) |
| `lsicon` | 1 | 0 | 0 | 29 | 0 | [`lsicon.json`](docs/audit/glyph-metrics/lsicon.json) |
| `lucide` | 1 | 0 | 0 | 825 | 0 | [`lucide.json`](docs/audit/glyph-metrics/lucide.json) |
| `lucide-lab` | 1 | 0 | 0 | 60 | 0 | [`lucide-lab.json`](docs/audit/glyph-metrics/lucide-lab.json) |
| `mage` | 1 | 0 | 0 | 1 | 0 | [`mage.json`](docs/audit/glyph-metrics/mage.json) |
| `majesticons` | 1 | 0 | 0 | 58 | 0 | [`majesticons.json`](docs/audit/glyph-metrics/majesticons.json) |
| `maki` | 1 | 0 | 0 | 177 | 0 | [`maki.json`](docs/audit/glyph-metrics/maki.json) |
| `map` | 1 | 0 | 0 | 1 | 0 | [`map.json`](docs/audit/glyph-metrics/map.json) |
| `marketeq` | 1 | 0 | 0 | 1 | 0 | [`marketeq.json`](docs/audit/glyph-metrics/marketeq.json) |
| `material-icon-theme` | 2 | 0 | 18 | 253 | 5 | [`material-icon-theme.json`](docs/audit/glyph-metrics/material-icon-theme.json) |
| `material-symbols` | 1 | 0 | 0 | 2,258 | 0 | [`material-symbols.json`](docs/audit/glyph-metrics/material-symbols.json) |
| `material-symbols-light` | 1 | 0 | 0 | 242 | 0 | [`material-symbols-light.json`](docs/audit/glyph-metrics/material-symbols-light.json) |
| `mdi` | 1 | 0 | 0 | 16 | 4 | [`mdi.json`](docs/audit/glyph-metrics/mdi.json) |
| `mdi-light` | 1 | 0 | 0 | 4 | 0 | [`mdi-light.json`](docs/audit/glyph-metrics/mdi-light.json) |
| `medical-icon` | 1 | 0 | 0 | 0 | 26 | [`medical-icon.json`](docs/audit/glyph-metrics/medical-icon.json) |
| `memory` | 1 | 0 | 0 | 6 | 2 | [`memory.json`](docs/audit/glyph-metrics/memory.json) |
| `meteocons` | 1 | 0 | 0 | 54 | 30 | [`meteocons.json`](docs/audit/glyph-metrics/meteocons.json) |
| `meteor-icons` | 1 | 0 | 0 | 2 | 0 | [`meteor-icons.json`](docs/audit/glyph-metrics/meteor-icons.json) |
| `mi` | 1 | 0 | 0 | 2 | 0 | [`mi.json`](docs/audit/glyph-metrics/mi.json) |
| `mingcute` | 2 | 0 | 2 | 26 | 0 | [`mingcute.json`](docs/audit/glyph-metrics/mingcute.json) |
| `mono-icons` | 1 | 0 | 0 | 2 | 0 | [`mono-icons.json`](docs/audit/glyph-metrics/mono-icons.json) |
| `mynaui` | 1 | 0 | 0 | 255 | 0 | [`mynaui.json`](docs/audit/glyph-metrics/mynaui.json) |
| `noto` | 2 | 0 | 20 | 30 | 0 | [`noto.json`](docs/audit/glyph-metrics/noto.json) |
| `noto-v1` | 2 | 0 | 66 | 122 | 6 | [`noto-v1.json`](docs/audit/glyph-metrics/noto-v1.json) |
| `nrk` | 2 | 0 | 11 | 6 | 16 | [`nrk.json`](docs/audit/glyph-metrics/nrk.json) |
| `octicon` | 1 | 0 | 0 | 22 | 149 | [`octicon.json`](docs/audit/glyph-metrics/octicon.json) |
| `ooui` | 1 | 0 | 0 | 10 | 0 | [`ooui.json`](docs/audit/glyph-metrics/ooui.json) |
| `openmoji` | 2 | 0 | 3 | 485 | 1 | [`openmoji.json`](docs/audit/glyph-metrics/openmoji.json) |
| `oui` | 1 | 0 | 0 | 3 | 3 | [`oui.json`](docs/audit/glyph-metrics/oui.json) |
| `pajamas` | 1 | 0 | 0 | 19 | 0 | [`pajamas.json`](docs/audit/glyph-metrics/pajamas.json) |
| `pepicons` | 2 | 0 | 0 | 9 | 0 | [`pepicons.json`](docs/audit/glyph-metrics/pepicons.json) |
| `pepicons-pencil` | 2 | 0 | 1 | 2 | 0 | [`pepicons-pencil.json`](docs/audit/glyph-metrics/pepicons-pencil.json) |
| `pepicons-pop` | 2 | 0 | 1 | 10 | 0 | [`pepicons-pop.json`](docs/audit/glyph-metrics/pepicons-pop.json) |
| `pepicons-print` | 2 | 0 | 2 | 374 | 0 | [`pepicons-print.json`](docs/audit/glyph-metrics/pepicons-print.json) |
| `ph` | 2 | 0 | 374 | 1,368 | 21 | [`ph.json`](docs/audit/glyph-metrics/ph.json) |
| `picon` | 1 | 0 | 0 | 1 | 39 | [`picon.json`](docs/audit/glyph-metrics/picon.json) |
| `pixel` | 1 | 0 | 0 | 1 | 0 | [`pixel.json`](docs/audit/glyph-metrics/pixel.json) |
| `pixelarticons` | 2 | 0 | 2 | 6 | 0 | [`pixelarticons.json`](docs/audit/glyph-metrics/pixelarticons.json) |
| `prime` | 1 | 0 | 0 | 4 | 0 | [`prime.json`](docs/audit/glyph-metrics/prime.json) |
| `proicons` | 1 | 0 | 0 | 25 | 0 | [`proicons.json`](docs/audit/glyph-metrics/proicons.json) |
| `ps` | 1 | 0 | 0 | 3 | 417 | [`ps.json`](docs/audit/glyph-metrics/ps.json) |
| `qlementine-icons` | 2 | 0 | 24 | 12 | 1 | [`qlementine-icons.json`](docs/audit/glyph-metrics/qlementine-icons.json) |
| `quill` | 1 | 0 | 0 | 5 | 0 | [`quill.json`](docs/audit/glyph-metrics/quill.json) |
| `radix-icons` | 2 | 0 | 0 | 7 | 0 | [`radix-icons.json`](docs/audit/glyph-metrics/radix-icons.json) |
| `ri` | 1 | 0 | 0 | 91 | 0 | [`ri.json`](docs/audit/glyph-metrics/ri.json) |
| `si` | 2 | 0 | 26 | 418 | 0 | [`si.json`](docs/audit/glyph-metrics/si.json) |
| `si-glyph` | 1 | 0 | 0 | 1 | 493 | [`si-glyph.json`](docs/audit/glyph-metrics/si-glyph.json) |
| `simple-icons` | 1 | 0 | 0 | 12 | 0 | [`simple-icons.json`](docs/audit/glyph-metrics/simple-icons.json) |
| `simple-line-icons` | 1 | 0 | 0 | 0 | 3 | [`simple-line-icons.json`](docs/audit/glyph-metrics/simple-line-icons.json) |
| `skill-icons` | 2 | 0 | 18 | 40 | 0 | [`skill-icons.json`](docs/audit/glyph-metrics/skill-icons.json) |
| `solar` | 2 | 0 | 1,136 | 517 | 60 | [`solar.json`](docs/audit/glyph-metrics/solar.json) |
| `stash` | 2 | 0 | 71 | 82 | 1 | [`stash.json`](docs/audit/glyph-metrics/stash.json) |
| `streamline` | 1 | 0 | 0 | 209 | 0 | [`streamline.json`](docs/audit/glyph-metrics/streamline.json) |
| `streamline-color` | 2 | 0 | 342 | 87 | 0 | [`streamline-color.json`](docs/audit/glyph-metrics/streamline-color.json) |
| `streamline-cyber-color` | 1 | 0 | 0 | 4 | 0 | [`streamline-cyber-color.json`](docs/audit/glyph-metrics/streamline-cyber-color.json) |
| `streamline-emojis` | 2 | 0 | 60 | 39 | 0 | [`streamline-emojis.json`](docs/audit/glyph-metrics/streamline-emojis.json) |
| `streamline-flex` | 1 | 0 | 0 | 1 | 0 | [`streamline-flex.json`](docs/audit/glyph-metrics/streamline-flex.json) |
| `streamline-flex-color` | 2 | 0 | 191 | 21 | 0 | [`streamline-flex-color.json`](docs/audit/glyph-metrics/streamline-flex-color.json) |
| `streamline-freehand-color` | 2 | 0 | 472 | 14 | 0 | [`streamline-freehand-color.json`](docs/audit/glyph-metrics/streamline-freehand-color.json) |
| `streamline-kameleon-color` | 2 | 0 | 3 | 0 | 0 | [`streamline-kameleon-color.json`](docs/audit/glyph-metrics/streamline-kameleon-color.json) |
| `streamline-plump-color` | 2 | 0 | 123 | 25 | 0 | [`streamline-plump-color.json`](docs/audit/glyph-metrics/streamline-plump-color.json) |
| `streamline-sharp-color` | 2 | 0 | 139 | 27 | 0 | [`streamline-sharp-color.json`](docs/audit/glyph-metrics/streamline-sharp-color.json) |
| `streamline-ultimate-color` | 2 | 0 | 0 | 4 | 0 | [`streamline-ultimate-color.json`](docs/audit/glyph-metrics/streamline-ultimate-color.json) |
| `subway` | 1 | 0 | 0 | 1 | 0 | [`subway.json`](docs/audit/glyph-metrics/subway.json) |
| `svg-spinners` | 1 | 0 | 0 | 5 | 0 | [`svg-spinners.json`](docs/audit/glyph-metrics/svg-spinners.json) |
| `system-uicons` | 1 | 0 | 0 | 2 | 0 | [`system-uicons.json`](docs/audit/glyph-metrics/system-uicons.json) |
| `tabler` | 2 | 0 | 0 | 1,887 | 0 | [`tabler.json`](docs/audit/glyph-metrics/tabler.json) |
| `tdesign` | 2 | 0 | 1 | 14 | 24 | [`tdesign.json`](docs/audit/glyph-metrics/tdesign.json) |
| `teenyicons` | 1 | 0 | 0 | 60 | 1 | [`teenyicons.json`](docs/audit/glyph-metrics/teenyicons.json) |
| `temaki` | 2 | 0 | 0 | 0 | 2 | [`temaki.json`](docs/audit/glyph-metrics/temaki.json) |
| `token` | 2 | 0 | 2 | 25 | 1 | [`token.json`](docs/audit/glyph-metrics/token.json) |
| `token-branded` | 2 | 0 | 60 | 20 | 0 | [`token-branded.json`](docs/audit/glyph-metrics/token-branded.json) |
| `twemoji` | 2 | 0 | 2,971 | 1,043 | 1,197 | [`twemoji.json`](docs/audit/glyph-metrics/twemoji.json) |
| `uil` | 1 | 0 | 0 | 40 | 0 | [`uil.json`](docs/audit/glyph-metrics/uil.json) |
| `uim` | 2 | 0 | 87 | 17 | 0 | [`uim.json`](docs/audit/glyph-metrics/uim.json) |
| `uis` | 1 | 0 | 0 | 2 | 0 | [`uis.json`](docs/audit/glyph-metrics/uis.json) |
| `uit` | 1 | 0 | 0 | 1 | 0 | [`uit.json`](docs/audit/glyph-metrics/uit.json) |
| `vs` | 1 | 0 | 0 | 13 | 135 | [`vs.json`](docs/audit/glyph-metrics/vs.json) |
| `vscode-icons` | 2 | 0 | 57 | 119 | 18 | [`vscode-icons.json`](docs/audit/glyph-metrics/vscode-icons.json) |
| `websymbol` | 1 | 0 | 0 | 0 | 58 | [`websymbol.json`](docs/audit/glyph-metrics/websymbol.json) |
| `weui` | 1 | 0 | 0 | 0 | 4 | [`weui.json`](docs/audit/glyph-metrics/weui.json) |
| `whh` | 1 | 0 | 0 | 28 | 1,106 | [`whh.json`](docs/audit/glyph-metrics/whh.json) |
| `wi` | 1 | 0 | 0 | 85 | 9 | [`wi.json`](docs/audit/glyph-metrics/wi.json) |
| `wordpress` | 2 | 0 | 2 | 6 | 0 | [`wordpress.json`](docs/audit/glyph-metrics/wordpress.json) |
| `wpf` | 1 | 0 | 0 | 90 | 0 | [`wpf.json`](docs/audit/glyph-metrics/wpf.json) |
| `zmdi` | 1 | 0 | 0 | 105 | 811 | [`zmdi.json`](docs/audit/glyph-metrics/zmdi.json) |
| `zondicons` | 1 | 0 | 0 | 24 | 0 | [`zondicons.json`](docs/audit/glyph-metrics/zondicons.json) |
