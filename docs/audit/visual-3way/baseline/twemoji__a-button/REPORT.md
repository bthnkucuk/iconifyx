# Visual-diff: `twemoji:a-button`

Generated 2026-05-16. Phase 1.5 three-way diff (see RESEARCH_PLAN §26 / §33b).

- **Package**: `iconifyx_twemoji`
- **Primary codepoint**: `0xe1db`
- **Primary font family**: `Twemoji`
- **Duotone**: yes (kind=paintOrder)
- **Secondary font family**: `TwemojiSecondary`

## Verdict

- **Status**: `different`
- **Primary reason**: `GENERATOR_DIFF`
- **Confidence**: `medium`
- **Problem**: SVG vs TTF mismatch 81.8% (Hamming 0, SSIM 0.17); flutter render matches the TTF — bug is upstream of widget
- **Remediation**: Diff is in generator/font-build pipeline. Manual triage; bump --size to confirm structural

## Frames

| Layer | Image |
|---|---|
| Upstream Iconify SVG (resvg) | ![upstream](upstream.png) |
| TTF primary glyph (em-box) | ![glyph-primary](glyph-primary.png) |
| TTF secondary glyph (em-box) | ![glyph-secondary](glyph-secondary.png) |
| TTF composed (pure-TS, kind=paintOrder) | ![ttf-composed](ttf-composed.png) |
| Flutter rendered (IconifyIcon, fvm flutter test) | ![flutter](flutter-rendered.png) |

## Diffs

| Pair | Heat-map | Metrics |
|---|---|---|
| SVG vs TTF (generator/build stage) | ![svg-vs-ttf](diff-svg-vs-ttf.png) | mismatch=81.80% ham=0 ssim=0.174 |
| TTF vs Flutter (widget render stage) | ![ttf-vs-flutter](diff-ttf-vs-flutter.png) | mismatch=0.07% ham=1 ssim=0.966 |
| SVG vs Flutter (end-to-end) | ![svg-vs-flutter](diff-svg-vs-flutter.png) | mismatch=81.25% ham=1 ssim=0.191 |

## Glyph metrics (raw TTF)

| Layer | Font | Glyph name | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |
|---|---|---|---:|---:|---|---|---|
| primary | `Twemoji.ttf` | `anticlockwise-arrows-button` | 1000 | 0 | 0.0..1000.0 | 0.0..1000.0 | (500, 500) |
| secondary | `TwemojiSecondary.ttf` | `letter-a` | 1000 | 0 | 230.0..770.0 | 189.0..818.0 | (500, 504) |

## End-to-end metrics (SVG vs Flutter)

- Canvas: 256 × 256
- Mismatch: 53,246 / 65,536 px (81.25 %)
- Ink ratio upstream: 0.8195
- Ink ratio Flutter:  0.8183
- Centroid drift: (-0.0, -0.1) px
- dHash: `8000040412021200` vs `800004041a021200` (Hamming 1/64)
- SSIM: 0.1912

## Duotone alignment (TTF-space)

- **Primary centroid**: (500.0, 500.0) in em-units of 1000
- **Secondary centroid**: (500.0, 503.5)
- **Centroid delta**: (0.0, 3.5) em-units
- **Fraction of em**: (0.0 %, 0.4 %)
