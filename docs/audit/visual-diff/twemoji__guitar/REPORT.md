# Visual-diff: `twemoji:guitar`

Generated 2026-05-16. Phase 1 single-icon diff (see RESEARCH_PLAN §33).

- **Package**: `iconifyx_twemoji`
- **Primary codepoint**: `0xe7fe`
- **Primary font family**: `Twemoji`
- **Duotone**: yes (kind=paintOrder)
- **Secondary font family**: `TwemojiSecondary`

## Verdict

- **Status**: `different`
- **Primary reason**: `DUOTONE_BBOX_MISMATCH`
- **Confidence**: `high`
- **Problem**: Primary glyph centroid (-378,510) differs from secondary (-238,621) by 14.0% / 11.1% of em — layers will overlay misaligned
- **Remediation**: GLYPH_METRICS_AUDIT.md likely flags this pair. Root cause is usually svg2ttf glyph dedup (identical SVG bodies collapsed into one glyph with whichever first-encountered xMin) — see RESEARCH_PLAN §33 for fix.

## Frames

| Layer | Image |
|---|---|
| Upstream Iconify SVG (resvg) | ![upstream](upstream.png) |
| TTF primary glyph (em-box) | ![glyph-primary](glyph-primary.png) |
| TTF secondary glyph (em-box) | ![glyph-secondary](glyph-secondary.png) |

## Glyph metrics (raw TTF)

| Layer | Font | Glyph name in TTF | Advance | LSB | bbox xMin..xMax | bbox yMin..yMax | Centroid |
|---|---|---|---:|---:|---|---|---|
| primary | `Twemoji.ttf` | `guitar` | 1000 | -875 | -871.3..115.0 | 17.9..1002.5 | (-378, 510) |
| secondary | `TwemojiSecondary.ttf` | `guitar` | 1000 | -612 | -612.0..136.0 | 242.0..1000.0 | (-238, 621) |

## Duotone alignment (TTF-space)

- **Primary centroid**: (-378.2, 510.2) in em-units of 1000
- **Secondary centroid**: (-238.0, 621.0)
- **Centroid delta**: (140.2, 110.8) em-units
- **Fraction of em**: (14.0 %, 11.1 %)

> ⚠️ Centroid drift exceeds the 4 % threshold beyond which the two layers will visibly overlay out of alignment when `IconifyIcon` paints both at `Offset.zero`.
