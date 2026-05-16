# Secondary-glyph cmap-name audit

Generated 2026-05-16. For every duotone icon in every pack, open the matching `<Family>Secondary.ttf` and check that `cmap[codepoint]` resolves to a glyph whose name equals the icon name. A mismatch means `svg2ttf`'s outline-dedup aliased the codepoint to a different glyph's name, so the icon ships with the wrong secondary letterform (visible as duotone misalignment / wrong shape). The pipeline demotes any aliased duotone to `.solo` at codegen time; this report verifies how many would be flagged on the next regen.

- **Duotone icons checked across all packs:** 4,745
- **Aliased (cmap → wrong glyph name):** 0
- **Missing (codepoint not in cmap at all):** 0
- **Secondary TTFs that failed to open:** 0

_No aliased secondaries — every duotone icon paints its own secondary glyph._
