# Visual-diff: `logos:adobe-photoshop`

Generated 2026-05-16. Phase 1.5 three-way diff (see RESEARCH_PLAN §26 / §33b).

- **Package**: `iconifyx_logos`
- **Primary codepoint**: `0xe342`
- **Primary font family**: `Logos`
- **Duotone**: yes (kind=paintOrder)
- **Secondary font family**: `LogosSecondary`

## Verdict

- **Status**: `different`
- **Primary reason**: `GENERATOR_DIFF`
- **Confidence**: `medium`
- **Problem**: SVG vs TTF mismatch 93.5% (Hamming 1, SSIM 0.21); flutter render matches the TTF — bug is upstream of widget
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
| SVG vs TTF (generator/build stage) | ![svg-vs-ttf](diff-svg-vs-ttf.png) | mismatch=93.53% ham=1 ssim=0.213 |
| TTF vs Flutter (widget render stage) | ![ttf-vs-flutter](diff-ttf-vs-flutter.png) | mismatch=0.13% ham=1 ssim=0.969 |
| SVG vs Flutter (end-to-end) | ![svg-vs-flutter](diff-svg-vs-flutter.png) | mismatch=92.96% ham=0 ssim=0.227 |

## Glyph metrics (raw TTF)

| Layer | Font | Glyph name | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |
|---|---|---|---:|---:|---|---|---|
| primary | `Logos.ttf` | `adobe-after-effects` | 1024 | 0 | 0.0..1024.0 | 2.0..1000.0 | (512, 501) |
| secondary | `LogosSecondary.ttf` | `adobe-photoshop` | 1024 | 0 | 231.0..846.0 | 285.0..746.0 | (539, 516) |

## End-to-end metrics (SVG vs Flutter)

- Canvas: 256 × 256
- Mismatch: 60,919 / 65,536 px (92.96 %)
- Ink ratio upstream: 0.8189
- Ink ratio Flutter:  0.8103
- Centroid drift: (0.0, -0.4) px
- dHash: `008000090a010080` vs `008000090a010080` (Hamming 0/64)
- SSIM: 0.2266

## Duotone alignment (TTF-space)

- **Primary centroid**: (512.0, 501.0) in em-units of 1000
- **Secondary centroid**: (538.5, 515.5)
- **Centroid delta**: (26.5, 14.5) em-units
- **Fraction of em**: (2.6 %, 1.5 %)
