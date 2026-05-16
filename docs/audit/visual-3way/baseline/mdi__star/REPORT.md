# Visual-diff: `mdi:star`

Generated 2026-05-16. Phase 1.5 three-way diff (see RESEARCH_PLAN §26 / §33b).

- **Package**: `iconifyx_mdi`
- **Primary codepoint**: `0xf6e3`
- **Primary font family**: `Mdi_2`
- **Duotone**: no

## Verdict

- **Status**: `same`
- **Primary reason**: `OK_3WAY`
- **Confidence**: `high`
- **Problem**: —
- **Remediation**: —

## Frames

| Layer | Image |
|---|---|
| Upstream Iconify SVG (resvg) | ![upstream](upstream.png) |
| TTF primary glyph (em-box) | ![glyph-primary](glyph-primary.png) |
| TTF composed (pure-TS, kind=solo) | ![ttf-composed](ttf-composed.png) |
| Flutter rendered (IconifyIcon, fvm flutter test) | ![flutter](flutter-rendered.png) |

## Diffs

| Pair | Heat-map | Metrics |
|---|---|---|
| SVG vs TTF (generator/build stage) | ![svg-vs-ttf](diff-svg-vs-ttf.png) | mismatch=0.09% ham=2 ssim=0.978 |
| TTF vs Flutter (widget render stage) | ![ttf-vs-flutter](diff-ttf-vs-flutter.png) | mismatch=0.01% ham=0 ssim=0.978 |
| SVG vs Flutter (end-to-end) | ![svg-vs-flutter](diff-svg-vs-flutter.png) | mismatch=0.01% ham=2 ssim=0.981 |

## Glyph metrics (raw TTF)

| Layer | Font | Glyph name | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |
|---|---|---|---:|---:|---|---|---|
| primary | `Mdi_2.ttf` | `grade` | 1000 | 0 | 83.0..917.0 | 125.0..917.0 | (500, 521) |

## End-to-end metrics (SVG vs Flutter)

- Canvas: 256 × 256
- Mismatch: 4 / 65,536 px (0.01 %)
- Ink ratio upstream: 0.2565
- Ink ratio Flutter:  0.2608
- Centroid drift: (-0.0, -0.3) px
- dHash: `0000104060202400` vs `0000104040202000` (Hamming 2/64)
- SSIM: 0.9809
