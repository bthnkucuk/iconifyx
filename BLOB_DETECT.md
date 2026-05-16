# Blob-risk audit (§16 A14)

Generated 2026-05-16. Each glyph in every primary TTF is rasterised to a 96×96 grayscale image and scored on three signals; a glyph is flagged `BLOB_RISK` only when ALL three exceed their thresholds:

- `fillRatio > 0.7` — painted_pixels / total_pixels.
- `edgeEntropy < 0.35` — Shannon entropy of FIND_EDGES histogram.
- `dHashCluster > 3` — pack-local perceptual-hash cluster size (including self).

Flagged glyphs are candidate paint-order-drop regressions, but the report is **informational only** — manifests are never mutated. Spot-check before opening regen tickets.

- **Total glyphs scanned:** 338,939
- **Glyphs flagged BLOB_RISK:** 1,798
- **Packs with at least one flag:** 37

## Top dHash clusters

| Pack | Cluster size | Sample names |
|---|---:|---|
| `twemoji` | 170 | `a-button`, `a-button-blood-type`, `ab-button`, `ab-button-blood-type`, `antenna-bars` |
| `fluent-emoji-flat` | 136 | `a-button-blood-type`, `ab-button-blood-type`, `antenna-bars`, `aquarius`, `aries` |
| `skill-icons` | 125 | `ableton-dark`, `ableton-light`, `activitypub-dark`, `actix-dark`, `actix-light` |
| `emojione-v1` | 79 | `a-button`, `ab-button`, `antenna-bars`, `anticlockwise-arrows-button`, `aquarius` |
| `flag` | 51 | `al-1x1`, `bd-1x1`, `bg-1x1`, `bh-1x1`, `bl-1x1` |

## Per-pack summary

| Pack | Glyphs scanned | Flagged | Top cluster |
|---|---:|---:|---:|
| `tabler` | 25,511 | 420 | 40 |
| `twemoji` | 715 | 183 | 170 |
| `fluent-emoji-flat` | 645 | 147 | 136 |
| `streamline-color` | 1,995 | 132 | 86 |
| `skill-icons` | 382 | 125 | 125 |
| `iconoir` | 8,080 | 96 | 8 |
| `emojione-v1` | 365 | 79 | 79 |
| `streamline-flex-color` | 998 | 64 | 31 |
| `streamline-sharp-color` | 999 | 49 | 39 |
| `flag` | 485 | 49 | 51 |
| `openmoji` | 4,048 | 46 | 49 |
| `mdi` | 13,998 | 45 | 21 |
| `noto-v1` | 633 | 42 | 42 |
| `logos` | 932 | 39 | 32 |
| `streamline-plump-color` | 992 | 35 | 30 |
| `emojione` | 357 | 34 | 138 |
| `ic` | 11,908 | 26 | 18 |
| `icon-park` | 2,657 | 19 | 19 |
| `vscode-icons` | 674 | 17 | 38 |
| `fluent-emoji` | 2,767 | 17 | 19 |
| `glyphs-poly` | 723 | 17 | 26 |
| `fluent` | 20,197 | 15 | 29 |
| `devicon` | 930 | 15 | 11 |
| `material-symbols` | 18,575 | 13 | 16 |
| `fxemoji` | 244 | 13 | 13 |
| `qlementine-icons` | 884 | 8 | 8 |
| `flat-color-icons` | 97 | 8 | 11 |
| `material-symbols-light` | 15,997 | 7 | 7 |
| `ion` | 2,602 | 5 | 7 |
| `ri` | 3,241 | 5 | 7 |
| `material-icon-theme` | 775 | 4 | 232 |
| `grommet-icons` | 637 | 4 | 4 |
| `mynaui` | 2,852 | 4 | 8 |
| `fluent-mdl2` | 1,735 | 4 | 6 |
| `uim` | 295 | 4 | 10 |
| `healthicons` | 3,373 | 4 | 6 |
| `emojione-monotone` | 1,674 | 4 | 28 |

Per-pack drill-down JSON: `docs/audit/blob-detect/<prefix>.json`
