"""Force canonical 1000-em-quad metrics on a TTF, in place.

Used by the iconifyx generator after every emitted TTF (merged
multi-sibling AND single-tier) to ensure ALL emitted fonts share the
exact same reference frame for Flutter text rendering. Without this,
primary/secondary duotone TTFs end up with subtly different
head/hhea/OS/2 values because `svg2ttf` recomputes them from the union
of actual glyph extents, which differs pack-by-pack. The drift causes
duotone primary + secondary glyphs to paint with slightly different
baseline / em-extent assumptions in Flutter's TextPainter — visually
manifesting as the Solar `add-circle-bold-duotone` alignment bug.

Empirically measured (GLYPH_METRICS_AUDIT.md): 294/295 TTFs were
non-canonical BEFORE this script ran. Target after: 0 non-canonical.

CLI:
    uv run canonicalize_ttf.py <path/to.ttf>

Modifies the file in place. Uses `recalcBBoxes=False` so head.xMin
etc. stay at the canonical 0..1000 box (otherwise fontTools recomputes
from glyph extents on save, undoing the canonicalisation).
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont


def canonicalize(path: Path) -> None:
    # recalcBBoxes=False on the constructor — needed so save() below
    # doesn't recompute head.xMin/xMax/yMin/yMax from glyph extents,
    # which would undo the canonical 0..1000 em-quad we force.
    font = TTFont(str(path), recalcBBoxes=False)

    # head: standard 0..1000 em-quad. Iconify designs to a normalised
    # viewBox already; bold strokes that overshoot by a couple of units
    # don't justify drifting the canvas reference frame.
    h = font["head"]
    h.unitsPerEm = 1000
    h.xMin = 0
    h.xMax = 1000
    h.yMin = 0
    h.yMax = 1000

    # hhea: standard ascent=1000, descent=0, no line gap.
    hh = font["hhea"]
    hh.ascent = 1000
    hh.descent = 0
    hh.lineGap = 0
    hh.advanceWidthMax = 1000
    hh.minLeftSideBearing = 0
    hh.minRightSideBearing = 0
    hh.xMaxExtent = 1000

    # OS/2: keep the standard 1000 ascent symmetric across BOTH
    # win-metrics and typo-metrics. Flutter's TextPainter on different
    # platforms may consult different OS/2 fields for line height; we
    # set both consistently so the y-origin is identical regardless.
    if "OS/2" in font:
        o = font["OS/2"]
        o.usWinAscent = 1000
        o.usWinDescent = 0
        o.sTypoAscender = 1000
        o.sTypoDescender = 0
        o.sTypoLineGap = 0
        o.xAvgCharWidth = 1000

    # The constructor's recalcBBoxes=False is what makes this stick;
    # save() honours that flag from the constructor.
    font.save(str(path))
    font.close()


def main(argv: list[str]) -> int:
    if len(argv) < 1:
        print("usage: canonicalize_ttf.py <path.ttf> [<path.ttf>...]", file=sys.stderr)
        return 2
    for raw in argv:
        path = Path(raw)
        if not path.is_file():
            print(f"error: not a file: {path}", file=sys.stderr)
            return 2
        canonicalize(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
