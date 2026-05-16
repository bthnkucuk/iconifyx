# Visual-diff: `emojione:a-button`

Generated 2026-05-16. Phase 1.5 three-way diff (see RESEARCH_PLAN §26 / §33b).

- **Package**: `iconifyx_emojione`
- **Primary codepoint**: `0xe000`
- **Primary font family**: `Emojione`
- **Duotone**: yes (kind=paintOrder)
- **Secondary font family**: `EmojioneSecondary`

## Verdict

- **Status**: `different`
- **Primary reason**: `GENERATOR_FILLED_BLOB`
- **Confidence**: `high`
- **Problem**: TTF glyph is mostly solid ink (77.7%) while upstream is sparse (0.0%) — flutter render matches the TTF
- **Remediation**: Likely paint-order risk drop (§5e) OR stroke-fill missed evenodd cutouts

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
| SVG vs TTF (generator/build stage) | ![svg-vs-ttf](diff-svg-vs-ttf.png) | mismatch=77.29% ham=0 ssim=0.141 |
| TTF vs Flutter (widget render stage) | ![ttf-vs-flutter](diff-ttf-vs-flutter.png) | mismatch=0.07% ham=0 ssim=0.917 |
| SVG vs Flutter (end-to-end) | ![svg-vs-flutter](diff-svg-vs-flutter.png) | mismatch=75.72% ham=0 ssim=0.169 |

## Glyph metrics (raw TTF)

| Layer | Font | Glyph name | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |
|---|---|---|---:|---:|---|---|---|
| primary | `Emojione.ttf` | `a-button` | 1000 | 0 | 31.0..969.0 | 31.0..969.0 | (500, 500) |
| secondary | `EmojioneSecondary.ttf` | `a-button` | 1000 | 0 | 266.0..734.0 | 281.0..781.0 | (500, 531) |

## End-to-end metrics (SVG vs Flutter)

- Canvas: 256 × 256
- Mismatch: 49,626 / 65,536 px (75.72 %)
- Ink ratio upstream: 0.0000
- Ink ratio Flutter:  0.7675
- Centroid drift: (-0.5, -0.4) px
- dHash: `0080848484928080` vs `0080848484928080` (Hamming 0/64)
- SSIM: 0.1687

## Duotone alignment (TTF-space)

- **Primary centroid**: (500.0, 500.0) in em-units of 1000
- **Secondary centroid**: (500.0, 531.0)
- **Centroid delta**: (0.0, 31.0) em-units
- **Fraction of em**: (0.0 %, 3.1 %)
