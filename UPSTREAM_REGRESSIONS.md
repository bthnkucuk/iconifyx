# Upstream regression detector

Generated 2026-05-16. Diff every `tools/generator/manifests/<prefix>.json` against its previous version at git HEAD; surface icons whose `deprecated` flag flipped from false→true this regen, bucketed by `deprecatedReason`. Output is deterministic — same manifests + git HEAD => byte-identical report.

## Summary

- Packs scanned: **225**
- New deprecations: **565 icons across 29 packs**
- New packs (no previous manifest, A8 skipped): **0**
- No suspicious packs (no validator / panic / paint-order drops on a non-bumped Iconify version).

### Breakdown by reason

| Reason | New deprecations |
|---|---:|
| `upstream-removed` | 0 |
| `validator-rejected` | 0 |
| `panic-skipped` | 0 |
| `paint-order-dropped` | 0 |
| `unknown` | 565 |

## New deprecations (this regen)

| Pack | Reason | Icon name | Identifier | Codepoint | Deprecated since |
|---|---|---|---|---|---|
| `codicon` | `unknown` | `blank` | `blank` | `0xe01e` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `0xbtc` | `n0xbtc` | `0xe000` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `2give` | `n2give` | `0xe002` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `aion` | `aion` | `0xe00f` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `atlas` | `atlas` | `0xe020` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `btdx` | `btdx` | `0xe04c` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `call` | `call` | `0xe054` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `cc` | `cc` | `0xe055` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `chain` | `chain` | `0xe059` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `ela` | `ela` | `0xe08e` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `elec` | `elec` | `0xe08f` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `elix` | `elix` | `0xe091` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `emc2` | `emc2` | `0xe095` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `ethos` | `ethos` | `0xe0a0` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `fida` | `fida` | `0xe0a9` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `fjc` | `fjc` | `0xe0ab` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `gmt` | `gmt` | `0xe0bc` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `gzr` | `gzr` | `0xe0ca` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `ins` | `ins` | `0xe0dc` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `iop` | `iop` | `0xe0de` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `iotx` | `iotx` | `0xe0e0` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `knc` | `knc` | `0xe0e8` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `loom` | `loom` | `0xe0f0` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `maid` | `maid` | `0xe0f6` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `msr` | `msr` | `0xe109` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `neu` | `neu` | `0xe116` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `npxs` | `npxs` | `0xe11f` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `ntbc` | `ntbc` | `0xe120` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `pink` | `pink` | `0xe138` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `safemoon` | `safemoon` | `0xe164` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `ser` | `ser` | `0xe16c` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `unity` | `unity` | `0xe1a4` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `wings` | `wings` | `0xe1ba` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `zen` | `zen` | `0xe1dc` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `zest` | `zest` | `0xe1dd` | 2026-05-16 |
| `cryptocurrency-color` | `unknown` | `zil` | `zil` | `0xe1de` | 2026-05-16 |
| `devicon` | `unknown` | `anaconda` | `anaconda` | `0xe015` | 2026-05-16 |
| `devicon` | `unknown` | `anaconda-wordmark` | `anacondaWordmark` | `0xe016` | 2026-05-16 |
| `devicon` | `unknown` | `angularmaterial` | `angularmaterial` | `0xe01f` | 2026-05-16 |
| `devicon` | `unknown` | `apex` | `apex` | `0xe030` | 2026-05-16 |
| `devicon` | `unknown` | `ballerina` | `ballerina` | `0xe053` | 2026-05-16 |
| `devicon` | `unknown` | `ballerina-wordmark` | `ballerinaWordmark` | `0xe054` | 2026-05-16 |
| `devicon` | `unknown` | `biome` | `biome` | `0xe05f` | 2026-05-16 |
| `devicon` | `unknown` | `c` | `c` | `0xe071` | 2026-05-16 |
| `devicon` | `unknown` | `canva` | `canva` | `0xe076` | 2026-05-16 |
| `devicon` | `unknown` | `capacitor` | `capacitor` | `0xe077` | 2026-05-16 |
| `devicon` | `unknown` | `chakraui` | `chakraui` | `0xe082` | 2026-05-16 |
| `devicon` | `unknown` | `chartjs` | `chartjs` | `0xe084` | 2026-05-16 |
| `devicon` | `unknown` | `chartjs-wordmark` | `chartjsWordmark` | `0xe085` | 2026-05-16 |
| `devicon` | `unknown` | `cloudflare` | `cloudflare` | `0xe08f` | 2026-05-16 |
| `devicon` | `unknown` | `contao` | `contao` | `0xe0a3` | 2026-05-16 |
| `devicon` | `unknown` | `contao-wordmark` | `contaoWordmark` | `0xe0a4` | 2026-05-16 |
| `devicon` | `unknown` | `cpanel` | `cpanel` | `0xe0af` | 2026-05-16 |
| `devicon` | `unknown` | `cpanel-wordmark` | `cpanelWordmark` | `0xe0b0` | 2026-05-16 |
| `devicon` | `unknown` | `datatables` | `datatables` | `0xe0c5` | 2026-05-16 |
| `devicon` | `unknown` | `discloud` | `discloud` | `0xe0d2` | 2026-05-16 |
| `devicon` | `unknown` | `ecto` | `ecto` | `0xe0ec` | 2026-05-16 |
| `devicon` | `unknown` | `emailjs` | `emailjs` | `0xe0f8` | 2026-05-16 |
| `devicon` | `unknown` | `firebase` | `firebase` | `0xe117` | 2026-05-16 |
| `devicon` | `unknown` | `firebase-wordmark` | `firebaseWordmark` | `0xe118` | 2026-05-16 |
| `devicon` | `unknown` | `gatling` | `gatling` | `0xe130` | 2026-05-16 |
| `devicon` | `unknown` | `gitea` | `gitea` | `0xe142` | 2026-05-16 |
| `devicon` | `unknown` | `githubcopilot` | `githubcopilot` | `0xe149` | 2026-05-16 |
| `devicon` | `unknown` | `githubcopilot-wordmark` | `githubcopilotWordmark` | `0xe14a` | 2026-05-16 |
| `devicon` | `unknown` | `gitpod` | `gitpod` | `0xe14f` | 2026-05-16 |
| `devicon` | `unknown` | `gnuradio` | `gnuradio` | `0xe153` | 2026-05-16 |
| `devicon` | `unknown` | `go-wordmark` | `goWordmark` | `0xe156` | 2026-05-16 |
| `devicon` | `unknown` | `grpc` | `grpc` | `0xe166` | 2026-05-16 |
| `devicon` | `unknown` | `hyprland` | `hyprland` | `0xe18b` | 2026-05-16 |
| `devicon` | `unknown` | `hyprland-wordmark` | `hyprlandWordmark` | `0xe18c` | 2026-05-16 |
| `devicon` | `unknown` | `ie10` | `ie10` | `0xe18d` | 2026-05-16 |
| `devicon` | `unknown` | `ionic` | `ionic` | `0xe19a` | 2026-05-16 |
| `devicon` | `unknown` | `ionic-wordmark` | `ionicWordmark` | `0xe19b` | 2026-05-16 |
| `devicon` | `unknown` | `jeet` | `jeet` | `0xe1a7` | 2026-05-16 |
| `devicon` | `unknown` | `jeet-wordmark` | `jeetWordmark` | `0xe1a8` | 2026-05-16 |
| `devicon` | `unknown` | `jetpackcompose` | `jetpackcompose` | `0xe1ac` | 2026-05-16 |
| `devicon` | `unknown` | `junie` | `junie` | `0xe1bb` | 2026-05-16 |
| `devicon` | `unknown` | `k3os` | `k3os` | `0xe1c3` | 2026-05-16 |
| `devicon` | `unknown` | `k3s` | `k3s` | `0xe1c5` | 2026-05-16 |
| `devicon` | `unknown` | `kaggle` | `kaggle` | `0xe1c8` | 2026-05-16 |
| `devicon` | `unknown` | `kaggle-wordmark` | `kaggleWordmark` | `0xe1c9` | 2026-05-16 |
| `devicon` | `unknown` | `linuxmint` | `linuxmint` | `0xe1f1` | 2026-05-16 |
| `devicon` | `unknown` | `linuxmint-wordmark` | `linuxmintWordmark` | `0xe1f2` | 2026-05-16 |
| `devicon` | `unknown` | `minitab` | `minitab` | `0xe21b` | 2026-05-16 |
| `devicon` | `unknown` | `moleculer` | `moleculer` | `0xe221` | 2026-05-16 |
| `devicon` | `unknown` | `moleculer-wordmark` | `moleculerWordmark` | `0xe222` | 2026-05-16 |
| `devicon` | `unknown` | `nano` | `nano` | `0xe232` | 2026-05-16 |
| `devicon` | `unknown` | `nano-wordmark` | `nanoWordmark` | `0xe233` | 2026-05-16 |
| `devicon` | `unknown` | `nim-wordmark` | `nimWordmark` | `0xe24e` | 2026-05-16 |
| `devicon` | `unknown` | `nomad` | `nomad` | `0xe258` | 2026-05-16 |
| `devicon` | `unknown` | `nuxt` | `nuxt` | `0xe264` | 2026-05-16 |
| `devicon` | `unknown` | `opensuse` | `opensuse` | `0xe278` | 2026-05-16 |
| `devicon` | `unknown` | `opensuse-wordmark` | `opensuseWordmark` | `0xe279` | 2026-05-16 |
| `devicon` | `unknown` | `passport` | `passport` | `0xe288` | 2026-05-16 |
| `devicon` | `unknown` | `passport-wordmark` | `passportWordmark` | `0xe289` | 2026-05-16 |
| `devicon` | `unknown` | `portainer` | `portainer` | `0xe2a5` | 2026-05-16 |
| `devicon` | `unknown` | `portainer-wordmark` | `portainerWordmark` | `0xe2a6` | 2026-05-16 |
| `devicon` | `unknown` | `postman-wordmark` | `postmanWordmark` | `0xe2ad` | 2026-05-16 |
| `devicon` | `unknown` | `qt` | `qt` | `0xe2d6` | 2026-05-16 |
| `devicon` | `unknown` | `qwik` | `qwik` | `0xe2dd` | 2026-05-16 |

…465 more — see per-pack JSON at `docs/audit/upstream-regressions/<prefix>.json`.

## Per-pack detail

| Pack | New deprecations | iconifyJsonVersion (was → now) |
|---|---:|---|
| `codicon` | 1 | `2.2.472` (no bump) |
| `cryptocurrency-color` | 35 | `2.2.472` (no bump) |
| `devicon` | 121 | `2.2.472` (no bump) |
| `emojione-v1` | 2 | `2.2.472` (no bump) |
| `flag` | 6 | `2.2.472` (no bump) |
| `flagpack` | 10 | `2.2.472` (no bump) |
| `flat-ui` | 1 | `2.2.472` (no bump) |
| `flowbite` | 1 | `2.2.472` (no bump) |
| `fluent-emoji` | 10 | `2.2.472` (no bump) |
| `gcp` | 3 | `2.2.472` (no bump) |
| `glyphs` | 2 | `2.2.472` (no bump) |
| `glyphs-poly` | 11 | `2.2.472` (no bump) |
| `icon-park` | 2 | `2.2.472` (no bump) |
| `icon-park-outline` | 1 | `2.2.472` (no bump) |
| `logos` | 7 | `2.2.472` (no bump) |
| `material-icon-theme` | 5 | `2.2.472` (no bump) |
| `meteocons` | 158 | `2.2.472` (no bump) |
| `noto-v1` | 14 | `2.2.472` (no bump) |
| `openmoji` | 1 | `2.2.472` (no bump) |
| `oui` | 6 | `2.2.472` (no bump) |
| `qlementine-icons` | 1 | `2.2.472` (no bump) |
| `radix-icons` | 1 | `2.2.472` (no bump) |
| `skill-icons` | 21 | `2.2.472` (no bump) |
| `streamline-color` | 1 | `2.2.472` (no bump) |
| `streamline-cyber-color` | 3 | `2.2.472` (no bump) |
| `streamline-plump-color` | 6 | `2.2.472` (no bump) |
| `streamline-ultimate-color` | 7 | `2.2.472` (no bump) |
| `token-branded` | 98 | `2.2.472` (no bump) |
| `vscode-icons` | 30 | `2.2.472` (no bump) |
