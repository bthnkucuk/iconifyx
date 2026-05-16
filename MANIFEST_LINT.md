# Manifest + codegen lint

Generated 2026-05-16; `@iconify/json` ^2.2.300. Three checks: A1 (manifest internal consistency), A2 (Dart codegen ↔ TTF reverse reconciliation), A3 (identifier rename detection across regens). Output is deterministic — same manifests + Dart + TTFs → byte-identical report.

## Summary

- Packs scanned: **225**
- A1 violations: **0 icon/font-level issues across 0 packs**
- A2 violations: **319 orphan consts across 11 packs**
- A3 renames detected: **0 icons across 0 packs** (vs previous git HEAD)

Detail per pack: [`docs/audit/manifest-lint/<prefix>.json`](docs/audit/manifest-lint/). Markdown caps each section at the top 100 rows for readability.

## A1 violations — manifest internal consistency

_No A1 violations — every manifest is internally consistent._

## A2 violations — Dart codegen ↔ TTF reverse reconciliation

| Pack | Constant | Codepoint | Family | Issue | Detail |
|---|---|---|---|---|---|
| `gcp` | `advancedSolutionsLab` | `0xe003` | `Gcp` | `glyph-empty` | Dart const 'advancedSolutionsLab' resolves to an empty glyph at 0xe003 in 'Gcp.ttf' |
| `devicon` | `anaconda` | `0xe015` | `Devicon` | `glyph-empty` | Dart const 'anaconda' resolves to an empty glyph at 0xe015 in 'Devicon.ttf' |
| `devicon` | `anacondaWordmark` | `0xe016` | `Devicon` | `glyph-empty` | Dart const 'anacondaWordmark' resolves to an empty glyph at 0xe016 in 'Devicon.ttf' |
| `devicon` | `angularmaterial` | `0xe01f` | `Devicon` | `glyph-empty` | Dart const 'angularmaterial' resolves to an empty glyph at 0xe01f in 'Devicon.ttf' |
| `devicon` | `apex` | `0xe030` | `Devicon` | `glyph-empty` | Dart const 'apex' resolves to an empty glyph at 0xe030 in 'Devicon.ttf' |
| `logos` | `appveyor` | `0xe03a` | `Logos` | `glyph-empty` | Dart const 'appveyor' resolves to an empty glyph at 0xe03a in 'Logos.ttf' |
| `flagpack` | `aq` | `0xe008` | `Flagpack` | `glyph-empty` | Dart const 'aq' resolves to an empty glyph at 0xe008 in 'Flagpack.ttf' |
| `gcp` | `automl` | `0xe015` | `GcpSecondary` | `glyph-empty` | Dart const 'automl' resolves to an empty glyph at 0xe015 in 'GcpSecondary.ttf' |
| `devicon` | `ballerina` | `0xe053` | `Devicon` | `glyph-empty` | Dart const 'ballerina' resolves to an empty glyph at 0xe053 in 'Devicon.ttf' |
| `devicon` | `ballerinaWordmark` | `0xe054` | `Devicon` | `glyph-empty` | Dart const 'ballerinaWordmark' resolves to an empty glyph at 0xe054 in 'Devicon.ttf' |
| `devicon` | `biome` | `0xe05f` | `Devicon` | `glyph-empty` | Dart const 'biome' resolves to an empty glyph at 0xe05f in 'Devicon.ttf' |
| `codicon` | `blank` | `0xe01e` | `Codicon` | `glyph-empty` | Dart const 'blank' resolves to an empty glyph at 0xe01e in 'Codicon.ttf' |
| `logos` | `brandfolderIcon` | `0xe06e` | `Logos` | `glyph-empty` | Dart const 'brandfolderIcon' resolves to an empty glyph at 0xe06e in 'Logos.ttf' |
| `logos` | `browserify` | `0xe071` | `Logos` | `glyph-empty` | Dart const 'browserify' resolves to an empty glyph at 0xe071 in 'Logos.ttf' |
| `devicon` | `c` | `0xe071` | `Devicon` | `glyph-empty` | Dart const 'c' resolves to an empty glyph at 0xe071 in 'Devicon.ttf' |
| `devicon` | `canva` | `0xe076` | `Devicon` | `glyph-empty` | Dart const 'canva' resolves to an empty glyph at 0xe076 in 'Devicon.ttf' |
| `devicon` | `capacitor` | `0xe077` | `Devicon` | `glyph-empty` | Dart const 'capacitor' resolves to an empty glyph at 0xe077 in 'Devicon.ttf' |
| `devicon` | `chakraui` | `0xe082` | `Devicon` | `glyph-empty` | Dart const 'chakraui' resolves to an empty glyph at 0xe082 in 'Devicon.ttf' |
| `devicon` | `chartjs` | `0xe084` | `Devicon` | `glyph-empty` | Dart const 'chartjs' resolves to an empty glyph at 0xe084 in 'Devicon.ttf' |
| `devicon` | `chartjs` | `0xe084` | `DeviconSecondary` | `glyph-empty` | Dart const 'chartjs' resolves to an empty glyph at 0xe084 in 'DeviconSecondary.ttf' |
| `devicon` | `chartjsWordmark` | `0xe085` | `Devicon` | `glyph-empty` | Dart const 'chartjsWordmark' resolves to an empty glyph at 0xe085 in 'Devicon.ttf' |
| `devicon` | `chartjsWordmark` | `0xe085` | `DeviconSecondary` | `glyph-empty` | Dart const 'chartjsWordmark' resolves to an empty glyph at 0xe085 in 'DeviconSecondary.ttf' |
| `flagpack` | `ci` | `0xe02d` | `Flagpack` | `glyph-empty` | Dart const 'ci' resolves to an empty glyph at 0xe02d in 'Flagpack.ttf' |
| `meteocons` | `clearDay` | `0xe004` | `Meteocons` | `glyph-empty` | Dart const 'clearDay' resolves to an empty glyph at 0xe004 in 'Meteocons.ttf' |
| `meteocons` | `clearDayFill` | `0xe005` | `Meteocons` | `glyph-empty` | Dart const 'clearDayFill' resolves to an empty glyph at 0xe005 in 'Meteocons.ttf' |
| `meteocons` | `clearNight` | `0xe006` | `Meteocons` | `glyph-empty` | Dart const 'clearNight' resolves to an empty glyph at 0xe006 in 'Meteocons.ttf' |
| `meteocons` | `clearNightFill` | `0xe007` | `Meteocons` | `glyph-empty` | Dart const 'clearNightFill' resolves to an empty glyph at 0xe007 in 'Meteocons.ttf' |
| `devicon` | `cloudflare` | `0xe08f` | `Devicon` | `glyph-empty` | Dart const 'cloudflare' resolves to an empty glyph at 0xe08f in 'Devicon.ttf' |
| `meteocons` | `cloudy` | `0xe00c` | `Meteocons` | `glyph-empty` | Dart const 'cloudy' resolves to an empty glyph at 0xe00c in 'Meteocons.ttf' |
| `meteocons` | `codeGreen` | `0xe00e` | `Meteocons` | `glyph-empty` | Dart const 'codeGreen' resolves to an empty glyph at 0xe00e in 'Meteocons.ttf' |
| `meteocons` | `codeOrange` | `0xe010` | `Meteocons` | `glyph-empty` | Dart const 'codeOrange' resolves to an empty glyph at 0xe010 in 'Meteocons.ttf' |
| `meteocons` | `codeYellow` | `0xe014` | `Meteocons` | `glyph-empty` | Dart const 'codeYellow' resolves to an empty glyph at 0xe014 in 'Meteocons.ttf' |
| `devicon` | `contao` | `0xe0a3` | `Devicon` | `glyph-empty` | Dart const 'contao' resolves to an empty glyph at 0xe0a3 in 'Devicon.ttf' |
| `devicon` | `contaoWordmark` | `0xe0a4` | `Devicon` | `glyph-empty` | Dart const 'contaoWordmark' resolves to an empty glyph at 0xe0a4 in 'Devicon.ttf' |
| `devicon` | `cpanel` | `0xe0af` | `Devicon` | `glyph-empty` | Dart const 'cpanel' resolves to an empty glyph at 0xe0af in 'Devicon.ttf' |
| `devicon` | `cpanelWordmark` | `0xe0b0` | `Devicon` | `glyph-empty` | Dart const 'cpanelWordmark' resolves to an empty glyph at 0xe0b0 in 'Devicon.ttf' |
| `glyphs` | `crosshairsBold` | `0xe3d1` | `GlyphsSecondary` | `glyph-empty` | Dart const 'crosshairsBold' resolves to an empty glyph at 0xe3d1 in 'GlyphsSecondary.ttf' |
| `devicon` | `datatables` | `0xe0c5` | `Devicon` | `glyph-empty` | Dart const 'datatables' resolves to an empty glyph at 0xe0c5 in 'Devicon.ttf' |
| `devicon` | `discloud` | `0xe0d2` | `Devicon` | `glyph-empty` | Dart const 'discloud' resolves to an empty glyph at 0xe0d2 in 'Devicon.ttf' |
| `meteocons` | `dust` | `0xe019` | `Meteocons` | `glyph-empty` | Dart const 'dust' resolves to an empty glyph at 0xe019 in 'Meteocons.ttf' |
| `meteocons` | `dustDay` | `0xe01a` | `Meteocons` | `glyph-empty` | Dart const 'dustDay' resolves to an empty glyph at 0xe01a in 'Meteocons.ttf' |
| `meteocons` | `dustDayFill` | `0xe01b` | `Meteocons` | `glyph-empty` | Dart const 'dustDayFill' resolves to an empty glyph at 0xe01b in 'Meteocons.ttf' |
| `meteocons` | `dustFill` | `0xe01c` | `Meteocons` | `glyph-empty` | Dart const 'dustFill' resolves to an empty glyph at 0xe01c in 'Meteocons.ttf' |
| `meteocons` | `dustNight` | `0xe01d` | `Meteocons` | `glyph-empty` | Dart const 'dustNight' resolves to an empty glyph at 0xe01d in 'Meteocons.ttf' |
| `meteocons` | `dustNightFill` | `0xe01e` | `Meteocons` | `glyph-empty` | Dart const 'dustNightFill' resolves to an empty glyph at 0xe01e in 'Meteocons.ttf' |
| `meteocons` | `dustWind` | `0xe01f` | `Meteocons` | `glyph-empty` | Dart const 'dustWind' resolves to an empty glyph at 0xe01f in 'Meteocons.ttf' |
| `meteocons` | `dustWindFill` | `0xe020` | `Meteocons` | `glyph-empty` | Dart const 'dustWindFill' resolves to an empty glyph at 0xe020 in 'Meteocons.ttf' |
| `devicon` | `ecto` | `0xe0ec` | `Devicon` | `glyph-empty` | Dart const 'ecto' resolves to an empty glyph at 0xe0ec in 'Devicon.ttf' |
| `devicon` | `emailjs` | `0xe0f8` | `Devicon` | `glyph-empty` | Dart const 'emailjs' resolves to an empty glyph at 0xe0f8 in 'Devicon.ttf' |
| `oui` | `empty` | `0xe090` | `Oui` | `glyph-empty` | Dart const 'empty' resolves to an empty glyph at 0xe090 in 'Oui.ttf' |
| `glyphs` | `eyeLashesDuo` | `0xe4c5` | `GlyphsSecondary` | `glyph-empty` | Dart const 'eyeLashesDuo' resolves to an empty glyph at 0xe4c5 in 'GlyphsSecondary.ttf' |
| `meteocons` | `fallingStars` | `0xe057` | `Meteocons` | `glyph-empty` | Dart const 'fallingStars' resolves to an empty glyph at 0xe057 in 'Meteocons.ttf' |
| `meteocons` | `fallingStarsFill` | `0xe058` | `Meteocons` | `glyph-empty` | Dart const 'fallingStarsFill' resolves to an empty glyph at 0xe058 in 'Meteocons.ttf' |
| `devicon` | `firebase` | `0xe117` | `Devicon` | `glyph-empty` | Dart const 'firebase' resolves to an empty glyph at 0xe117 in 'Devicon.ttf' |
| `devicon` | `firebaseWordmark` | `0xe118` | `Devicon` | `glyph-empty` | Dart const 'firebaseWordmark' resolves to an empty glyph at 0xe118 in 'Devicon.ttf' |
| `flagpack` | `fm` | `0xe04a` | `Flagpack` | `glyph-empty` | Dart const 'fm' resolves to an empty glyph at 0xe04a in 'Flagpack.ttf' |
| `flag` | `fm1x1` | `0xe09a` | `Flag` | `glyph-empty` | Dart const 'fm1x1' resolves to an empty glyph at 0xe09a in 'Flag.ttf' |
| `flag` | `fm4x3` | `0xe09b` | `Flag` | `glyph-empty` | Dart const 'fm4x3' resolves to an empty glyph at 0xe09b in 'Flag.ttf' |
| `meteocons` | `fog` | `0xe061` | `Meteocons` | `glyph-empty` | Dart const 'fog' resolves to an empty glyph at 0xe061 in 'Meteocons.ttf' |
| `meteocons` | `fogDay` | `0xe062` | `Meteocons` | `glyph-empty` | Dart const 'fogDay' resolves to an empty glyph at 0xe062 in 'Meteocons.ttf' |
| `meteocons` | `fogDayFill` | `0xe063` | `Meteocons` | `glyph-empty` | Dart const 'fogDayFill' resolves to an empty glyph at 0xe063 in 'Meteocons.ttf' |
| `meteocons` | `fogFill` | `0xe064` | `Meteocons` | `glyph-empty` | Dart const 'fogFill' resolves to an empty glyph at 0xe064 in 'Meteocons.ttf' |
| `meteocons` | `fogNight` | `0xe065` | `Meteocons` | `glyph-empty` | Dart const 'fogNight' resolves to an empty glyph at 0xe065 in 'Meteocons.ttf' |
| `meteocons` | `fogNightFill` | `0xe066` | `Meteocons` | `glyph-empty` | Dart const 'fogNightFill' resolves to an empty glyph at 0xe066 in 'Meteocons.ttf' |
| `flagpack` | `ga` | `0xe04d` | `Flagpack` | `glyph-empty` | Dart const 'ga' resolves to an empty glyph at 0xe04d in 'Flagpack.ttf' |
| `devicon` | `gatling` | `0xe130` | `Devicon` | `glyph-empty` | Dart const 'gatling' resolves to an empty glyph at 0xe130 in 'Devicon.ttf' |
| `logos` | `geekbot` | `0xe133` | `LogosSecondary` | `glyph-empty` | Dart const 'geekbot' resolves to an empty glyph at 0xe133 in 'LogosSecondary.ttf' |
| `devicon` | `gitea` | `0xe142` | `Devicon` | `glyph-empty` | Dart const 'gitea' resolves to an empty glyph at 0xe142 in 'Devicon.ttf' |
| `devicon` | `githubcopilot` | `0xe149` | `Devicon` | `glyph-empty` | Dart const 'githubcopilot' resolves to an empty glyph at 0xe149 in 'Devicon.ttf' |
| `devicon` | `githubcopilotWordmark` | `0xe14a` | `Devicon` | `glyph-empty` | Dart const 'githubcopilotWordmark' resolves to an empty glyph at 0xe14a in 'Devicon.ttf' |
| `devicon` | `gitpod` | `0xe14f` | `Devicon` | `glyph-empty` | Dart const 'gitpod' resolves to an empty glyph at 0xe14f in 'Devicon.ttf' |
| `logos` | `gnuNet` | `0xe144` | `LogosSecondary` | `glyph-empty` | Dart const 'gnuNet' resolves to an empty glyph at 0xe144 in 'LogosSecondary.ttf' |
| `devicon` | `gnuradio` | `0xe153` | `Devicon` | `glyph-empty` | Dart const 'gnuradio' resolves to an empty glyph at 0xe153 in 'Devicon.ttf' |
| `devicon` | `goWordmark` | `0xe156` | `Devicon` | `glyph-empty` | Dart const 'goWordmark' resolves to an empty glyph at 0xe156 in 'Devicon.ttf' |
| `devicon` | `grpc` | `0xe166` | `Devicon` | `glyph-empty` | Dart const 'grpc' resolves to an empty glyph at 0xe166 in 'Devicon.ttf' |
| `meteocons` | `hail` | `0xe069` | `Meteocons` | `glyph-empty` | Dart const 'hail' resolves to an empty glyph at 0xe069 in 'Meteocons.ttf' |
| `meteocons` | `hailFill` | `0xe06a` | `Meteocons` | `glyph-empty` | Dart const 'hailFill' resolves to an empty glyph at 0xe06a in 'Meteocons.ttf' |
| `meteocons` | `haze` | `0xe06b` | `Meteocons` | `glyph-empty` | Dart const 'haze' resolves to an empty glyph at 0xe06b in 'Meteocons.ttf' |
| `meteocons` | `hazeDay` | `0xe06c` | `Meteocons` | `glyph-empty` | Dart const 'hazeDay' resolves to an empty glyph at 0xe06c in 'Meteocons.ttf' |
| `meteocons` | `hazeDayFill` | `0xe06d` | `Meteocons` | `glyph-empty` | Dart const 'hazeDayFill' resolves to an empty glyph at 0xe06d in 'Meteocons.ttf' |
| `meteocons` | `hazeNight` | `0xe06f` | `Meteocons` | `glyph-empty` | Dart const 'hazeNight' resolves to an empty glyph at 0xe06f in 'Meteocons.ttf' |
| `meteocons` | `hazeNightFill` | `0xe070` | `Meteocons` | `glyph-empty` | Dart const 'hazeNightFill' resolves to an empty glyph at 0xe070 in 'Meteocons.ttf' |
| `flagpack` | `hn` | `0xe067` | `Flagpack` | `glyph-empty` | Dart const 'hn' resolves to an empty glyph at 0xe067 in 'Flagpack.ttf' |
| `meteocons` | `hurricane` | `0xe075` | `Meteocons` | `glyph-empty` | Dart const 'hurricane' resolves to an empty glyph at 0xe075 in 'Meteocons.ttf' |
| `meteocons` | `hurricaneFill` | `0xe076` | `Meteocons` | `glyph-empty` | Dart const 'hurricaneFill' resolves to an empty glyph at 0xe076 in 'Meteocons.ttf' |
| `devicon` | `hyprland` | `0xe18b` | `Devicon` | `glyph-empty` | Dart const 'hyprland' resolves to an empty glyph at 0xe18b in 'Devicon.ttf' |
| `devicon` | `hyprlandWordmark` | `0xe18c` | `Devicon` | `glyph-empty` | Dart const 'hyprlandWordmark' resolves to an empty glyph at 0xe18c in 'Devicon.ttf' |
| `flagpack` | `ie` | `0xe06c` | `Flagpack` | `glyph-empty` | Dart const 'ie' resolves to an empty glyph at 0xe06c in 'Flagpack.ttf' |
| `devicon` | `ie10` | `0xe18d` | `Devicon` | `glyph-empty` | Dart const 'ie10' resolves to an empty glyph at 0xe18d in 'Devicon.ttf' |
| `devicon` | `ionic` | `0xe19a` | `Devicon` | `glyph-empty` | Dart const 'ionic' resolves to an empty glyph at 0xe19a in 'Devicon.ttf' |
| `devicon` | `ionicWordmark` | `0xe19b` | `Devicon` | `glyph-empty` | Dart const 'ionicWordmark' resolves to an empty glyph at 0xe19b in 'Devicon.ttf' |
| `devicon` | `jeet` | `0xe1a7` | `Devicon` | `glyph-empty` | Dart const 'jeet' resolves to an empty glyph at 0xe1a7 in 'Devicon.ttf' |
| `devicon` | `jeetWordmark` | `0xe1a8` | `Devicon` | `glyph-empty` | Dart const 'jeetWordmark' resolves to an empty glyph at 0xe1a8 in 'Devicon.ttf' |
| `devicon` | `jetpackcompose` | `0xe1ac` | `DeviconSecondary` | `glyph-empty` | Dart const 'jetpackcompose' resolves to an empty glyph at 0xe1ac in 'DeviconSecondary.ttf' |
| `devicon` | `junie` | `0xe1bb` | `Devicon` | `glyph-empty` | Dart const 'junie' resolves to an empty glyph at 0xe1bb in 'Devicon.ttf' |
| `devicon` | `k3os` | `0xe1c3` | `Devicon` | `glyph-empty` | Dart const 'k3os' resolves to an empty glyph at 0xe1c3 in 'Devicon.ttf' |
| `devicon` | `k3s` | `0xe1c5` | `Devicon` | `glyph-empty` | Dart const 'k3s' resolves to an empty glyph at 0xe1c5 in 'Devicon.ttf' |
| `devicon` | `kaggle` | `0xe1c8` | `Devicon` | `glyph-empty` | Dart const 'kaggle' resolves to an empty glyph at 0xe1c8 in 'Devicon.ttf' |
| `devicon` | `kaggleWordmark` | `0xe1c9` | `Devicon` | `glyph-empty` | Dart const 'kaggleWordmark' resolves to an empty glyph at 0xe1c9 in 'Devicon.ttf' |
| `flagpack` | `kz` | `0xe083` | `Flagpack` | `glyph-empty` | Dart const 'kz' resolves to an empty glyph at 0xe083 in 'Flagpack.ttf' |

…219 more — see per-pack JSON.

## A3 renames (across last regen)

_No identifier renames detected — every non-deprecated icon preserved its Dart identifier vs. HEAD._

## Per-pack detail

Click through for the full per-pack breakdown (every flagged row).

| Pack | A1 | A2 | A3 | Detail |
|---|---:|---:|---:|---|
| `codicon` | 0 | 1 | 0 | [`codicon.json`](docs/audit/manifest-lint/codicon.json) |
| `devicon` | 0 | 124 | 0 | [`devicon.json`](docs/audit/manifest-lint/devicon.json) |
| `flag` | 0 | 6 | 0 | [`flag.json`](docs/audit/manifest-lint/flag.json) |
| `flagpack` | 0 | 10 | 0 | [`flagpack.json`](docs/audit/manifest-lint/flagpack.json) |
| `flowbite` | 0 | 1 | 0 | [`flowbite.json`](docs/audit/manifest-lint/flowbite.json) |
| `gcp` | 0 | 3 | 0 | [`gcp.json`](docs/audit/manifest-lint/gcp.json) |
| `glyphs` | 0 | 2 | 0 | [`glyphs.json`](docs/audit/manifest-lint/glyphs.json) |
| `logos` | 0 | 7 | 0 | [`logos.json`](docs/audit/manifest-lint/logos.json) |
| `meteocons` | 0 | 158 | 0 | [`meteocons.json`](docs/audit/manifest-lint/meteocons.json) |
| `openmoji` | 0 | 1 | 0 | [`openmoji.json`](docs/audit/manifest-lint/openmoji.json) |
| `oui` | 0 | 6 | 0 | [`oui.json`](docs/audit/manifest-lint/oui.json) |
