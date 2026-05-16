# Manifest + codegen lint

Generated 2026-05-16; `@iconify/json` ^2.2.300. Three checks: A1 (manifest internal consistency), A2 (Dart codegen ↔ TTF reverse reconciliation), A3 (identifier rename detection across regens). Output is deterministic — same manifests + Dart + TTFs → byte-identical report.

## Summary

- Packs scanned: **225**
- A1 violations: **4,555 icon/font-level issues across 11 packs**
- A2 violations: **0 orphan consts across 0 packs**
- A3 renames detected: **0 icons across 0 packs** (vs previous git HEAD)

Detail per pack: [`docs/audit/manifest-lint/<prefix>.json`](docs/audit/manifest-lint/). Markdown caps each section at the top 100 rows for readability.

## A1 violations — manifest internal consistency

| Pack | Severity | Issue | Detail |
|---|---|---|---|
| `codicon` | error | `codepoint-collision` | 2 live icons share (Codicon, 0xe03e): 'circle', 'circle-outline' |
| `codicon` | error | `codepoint-collision` | 2 live icons share (Codicon, 0xe040): 'circle-large', 'circle-large-outline' |
| `codicon` | error | `codepoint-collision` | 2 live icons share (Codicon, 0xe047): 'circle-small-filled', 'debug-stackframe-dot' |
| `devicon` | error | `codepoint-collision` | 2 live icons share (Devicon, 0xe013): 'amazonwebservices', 'amazonwebservices-wordmark' |
| `devicon` | error | `codepoint-collision` | 2 live icons share (Devicon, 0xe38f): '3dsmax', 'threedsmax' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe088): 'ea-1x1', 'es-1x1' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe089): 'ea-4x3', 'es-4x3' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe18a): 'sh-ta-1x1', 'ta-1x1' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe18b): 'sh-ta-4x3', 'ta-4x3' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe1ed): 'ac-1x1', 'sh-ac-1x1' |
| `flag` | error | `codepoint-collision` | 2 live icons share (Flag, 0xe1ee): 'ac-4x3', 'sh-ac-4x3' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe002): 'address-book-outline', 'adress-book-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe003): 'address-book-solid', 'adress-book-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe00f): 'angle-down-outline', 'angle-down-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe011): 'angle-left-outline', 'angle-left-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe013): 'angle-right-outline', 'angle-right-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe016): 'angle-top-solid', 'angle-up-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe049): 'bars-from-left-outline', 'bars-from-left-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe04b): 'bars-outline', 'bars-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0b2): 'chart-mixed-outline', 'chart-mixed-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0b9): 'check-circle-solid', 'circle-check-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0c0): 'chevron-double-down-outline', 'chevron-double-down-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0c2): 'chevron-double-left-outline', 'chevron-double-left-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0c4): 'chevron-double-right-outline', 'chevron-double-right-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0c6): 'chevron-double-up-outline', 'chevron-double-up-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0c8): 'chevron-down-outline', 'chevron-down-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0ca): 'chevron-left-outline', 'chevron-left-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0cc): 'chevron-right-outline', 'chevron-right-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0ce): 'chevron-sort-outline', 'chevron-sort-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0d0): 'chevron-up-outline', 'chevron-up-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0e6): 'close-circle-outline', 'x-circle-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe0e8): 'close-outline', 'x-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe102): 'compress-outline', 'compress-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe147): 'face-laugh-solid', 'face-laughz-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe228): 'minus-outline', 'minus-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe251): 'paper-clip-outline', 'paper-clip-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe253): 'paper-plane-outline', 'papper-plane-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe259): 'grid-24x24px-outline', 'pause-outline' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe26e): 'plus-outline', 'plus-solid' |
| `flowbite` | error | `codepoint-collision` | 2 live icons share (Flowbite, 0xe2fe): 'dna-solid', 'truck-solid' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe064): '3d-rotation', 'baseline-3d-rotation' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe083): 'ac-unit', 'baseline-ac-unit' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe084): 'access-alarm', 'baseline-access-alarm' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe085): 'access-alarms', 'baseline-access-alarms' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe088): 'accessibility', 'baseline-accessibility' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe08a): 'accessible', 'baseline-accessible' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe08c): 'account-balance', 'baseline-account-balance' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe08d): 'account-balance-wallet', 'baseline-account-balance-wallet' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe08e): 'account-box', 'baseline-account-box' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe08f): 'account-circle', 'baseline-account-circle' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe092): 'adb', 'baseline-adb' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe093): 'add', 'baseline-add' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe094): 'add-a-photo', 'baseline-add-a-photo' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe095): 'add-alarm', 'baseline-add-alarm' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe096): 'add-alert', 'baseline-add-alert' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe097): 'add-box', 'baseline-add-box' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe09b): 'add-circle', 'baseline-add-circle' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe09c): 'add-circle-outline', 'baseline-add-circle-outline' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0a2): 'add-location', 'baseline-add-location' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0a8): 'add-shopping-cart', 'baseline-add-shopping-cart' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0ac): 'add-to-photos', 'baseline-add-to-photos' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0ad): 'add-to-queue', 'baseline-add-to-queue' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0b0): 'adjust', 'baseline-adjust' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0b6): 'airline-seat-flat', 'baseline-airline-seat-flat' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0b7): 'airline-seat-flat-angled', 'baseline-airline-seat-flat-angled' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0b8): 'airline-seat-individual-suite', 'baseline-airline-seat-individual-suite' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0b9): 'airline-seat-legroom-extra', 'baseline-airline-seat-legroom-extra' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0ba): 'airline-seat-legroom-normal', 'baseline-airline-seat-legroom-normal' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0bb): 'airline-seat-legroom-reduced', 'baseline-airline-seat-legroom-reduced' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0bc): 'airline-seat-recline-extra', 'baseline-airline-seat-recline-extra' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0bd): 'airline-seat-recline-normal', 'baseline-airline-seat-recline-normal' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c1): 'airplanemode-active', 'baseline-airplanemode-active' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c2): 'airplanemode-inactive', 'baseline-airplanemode-inactive' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c3): 'airplay', 'baseline-airplay' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c4): 'airport-shuttle', 'baseline-airport-shuttle' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c5): 'alarm', 'baseline-alarm' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c6): 'alarm-add', 'baseline-alarm-add' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c7): 'alarm-off', 'baseline-alarm-off' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c8): 'alarm-on', 'baseline-alarm-on' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0c9): 'album', 'baseline-album' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0d1): 'all-inclusive', 'baseline-all-inclusive' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0d2): 'all-out', 'baseline-all-out' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0d8): 'android', 'baseline-android' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0da): 'announcement', 'baseline-announcement' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0e4): 'apps', 'baseline-apps' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0e7): 'archive', 'baseline-archive' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0e9): 'arrow-back', 'baseline-arrow-back' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0f0): 'arrow-downward', 'baseline-arrow-downward' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0f1): 'arrow-drop-down', 'baseline-arrow-drop-down' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0f2): 'arrow-drop-down-circle', 'baseline-arrow-drop-down-circle' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0f3): 'arrow-drop-up', 'baseline-arrow-drop-up' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0f4): 'arrow-forward', 'baseline-arrow-forward' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0fa): 'arrow-upward', 'baseline-arrow-upward' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0fb): 'art-track', 'baseline-art-track' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0fd): 'aspect-ratio', 'baseline-aspect-ratio' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0fe): 'assessment', 'baseline-assessment' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe0ff): 'assignment', 'baseline-assignment' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe100): 'assignment-ind', 'baseline-assignment-ind' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe101): 'assignment-late', 'baseline-assignment-late' |
| `ic` | error | `codepoint-collision` | 2 live icons share (Ic, 0xe102): 'assignment-return', 'baseline-assignment-return' |

…4,455 more — see per-pack JSON.

## A2 violations — Dart codegen ↔ TTF reverse reconciliation

_No A2 violations — every emitted `IconData(0xNNNN, …)` in generated Dart resolves to a non-empty glyph in the declared TTF._

## A3 renames (across last regen)

_No identifier renames detected — every non-deprecated icon preserved its Dart identifier vs. HEAD._

## Per-pack detail

Click through for the full per-pack breakdown (every flagged row).

| Pack | A1 | A2 | A3 | Detail |
|---|---:|---:|---:|---|
| `codicon` | 4 | 0 | 0 | [`codicon.json`](docs/audit/manifest-lint/codicon.json) |
| `devicon` | 3 | 0 | 0 | [`devicon.json`](docs/audit/manifest-lint/devicon.json) |
| `flag` | 7 | 0 | 0 | [`flag.json`](docs/audit/manifest-lint/flag.json) |
| `flowbite` | 30 | 0 | 0 | [`flowbite.json`](docs/audit/manifest-lint/flowbite.json) |
| `ic` | 952 | 0 | 0 | [`ic.json`](docs/audit/manifest-lint/ic.json) |
| `iconamoon` | 38 | 0 | 0 | [`iconamoon.json`](docs/audit/manifest-lint/iconamoon.json) |
| `logos` | 3 | 0 | 0 | [`logos.json`](docs/audit/manifest-lint/logos.json) |
| `mdi` | 3,417 | 0 | 0 | [`mdi.json`](docs/audit/manifest-lint/mdi.json) |
| `openmoji` | 60 | 0 | 0 | [`openmoji.json`](docs/audit/manifest-lint/openmoji.json) |
| `ph` | 34 | 0 | 0 | [`ph.json`](docs/audit/manifest-lint/ph.json) |
| `solar` | 7 | 0 | 0 | [`solar.json`](docs/audit/manifest-lint/solar.json) |
