"""Rasterize a single TTF glyph to a PNG.

The font-side comparison panel for the visual-diff CLI. Given a TTF + a
codepoint, walks the glyph outline via fontTools, emulates a `BoxFit.contain`
scale + centre transform so the visible outline fills the requested canvas
(matching how `IconifyIcon` rendered glyphs in the consumer app *before* we
fixed the BoxFit emulation, and how rasterized "what the TTF actually
contains" should be diff'd against), and rasterises through Pillow's
ImageDraw polygon fills.

We deliberately do NOT use TextPainter-style layout (=> centre on em-quad)
because that's what hides the bug: if the primary glyph is left-aligned to
xMin=2 and the secondary is centred to xMin=83, painting them BOTH at
em-origin overlays them with that exact 81-unit drift. Visual-diff wants
to see the raw outline content, not what TextPainter does with it.

Usage:
    python rasterize_glyph.py \
        --ttf /path/to/Solar.ttf \
        --codepoint 0xe013 \
        --size 256 \
        --bg 0xffffffff \
        --fg 0xff000000 \
        --mode em \
        --out /tmp/glyph.png

    --mode em      paint the glyph in its raw em-box position (lsb..lsb+width
                   in x, descent..ascent in y). The em-box gets scaled to the
                   output canvas size. THIS is the mode that surfaces the
                   left-alignment bug: a glyph with xMin=2/xMax=314 paints
                   as a small left-stuck shape inside a 1000-unit canvas.
    --mode bbox    paint the glyph's content bbox fitted to the canvas
                   (BoxFit.contain emulation). Shows what the icon "would
                   look like" if a single layer were rendered alone.

Output is a single PNG file at --out.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image, ImageDraw


def parse_color(raw: str) -> tuple[int, int, int, int]:
    s = raw.strip()
    if s.startswith("0x") or s.startswith("0X"):
        v = int(s, 16)
    else:
        v = int(s)
    a = (v >> 24) & 0xFF
    r = (v >> 16) & 0xFF
    g = (v >> 8) & 0xFF
    b = v & 0xFF
    return (r, g, b, a)


def flatten_curve(p0, p1, p2, steps: int = 16):
    """Quadratic curve flattening."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        omt = 1 - t
        x = omt * omt * p0[0] + 2 * omt * t * p1[0] + t * t * p2[0]
        y = omt * omt * p0[1] + 2 * omt * t * p1[1] + t * t * p2[1]
        out.append((x, y))
    return out


def flatten_cubic(p0, p1, p2, p3, steps: int = 16):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        omt = 1 - t
        x = (
            omt * omt * omt * p0[0]
            + 3 * omt * omt * t * p1[0]
            + 3 * omt * t * t * p2[0]
            + t * t * t * p3[0]
        )
        y = (
            omt * omt * omt * p0[1]
            + 3 * omt * omt * t * p1[1]
            + 3 * omt * t * t * p2[1]
            + t * t * t * p3[1]
        )
        out.append((x, y))
    return out


def commands_to_subpaths(commands: list) -> list[list[tuple[float, float]]]:
    """Convert fontTools pen commands to a list of polygon subpaths.

    fontTools pen API uses `qCurveTo` with multiple offcurves to encode
    TrueType-style chained quadratics. Each pair of consecutive offcurves
    has an implied oncurve at their midpoint.
    """
    subpaths: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    last: tuple[float, float] = (0.0, 0.0)
    start: tuple[float, float] = (0.0, 0.0)

    for op, args in commands:
        if op == "moveTo":
            if current:
                subpaths.append(current)
            (pt,) = args
            current = [(float(pt[0]), float(pt[1]))]
            last = current[-1]
            start = last
        elif op == "lineTo":
            (pt,) = args
            current.append((float(pt[0]), float(pt[1])))
            last = current[-1]
        elif op == "qCurveTo":
            # args is a tuple of points; the final one is the oncurve target
            # and the others are offcurves. When more than one offcurve is
            # present (TrueType implicit oncurves), we insert virtual oncurves
            # at midpoints.
            pts = [(float(p[0]), float(p[1])) for p in args]
            if pts[-1] is None or args[-1] is None:
                # all-offcurve closed contour — uncommon, skip safely.
                continue
            # Expand into pairs (off, on) with implied on between offs.
            anchors = [last]
            i = 0
            while i < len(pts) - 1:
                off = pts[i]
                next_off = pts[i + 1] if i + 1 < len(pts) - 1 else None
                if next_off is not None:
                    implied_on = ((off[0] + next_off[0]) / 2.0, (off[1] + next_off[1]) / 2.0)
                    # quadratic from anchors[-1] via off to implied_on
                    current.extend(flatten_curve(anchors[-1], off, implied_on))
                    anchors.append(implied_on)
                else:
                    # last offcurve; oncurve target is pts[-1]
                    current.extend(flatten_curve(anchors[-1], off, pts[-1]))
                    anchors.append(pts[-1])
                i += 1
            last = current[-1]
        elif op == "curveTo":
            # Cubic: args has 3 points (cp1, cp2, end)
            pts = [(float(p[0]), float(p[1])) for p in args]
            cp1, cp2, end = pts
            current.extend(flatten_cubic(last, cp1, cp2, end))
            last = current[-1]
        elif op == "closePath":
            if current and current[0] != current[-1]:
                current.append(current[0])
            subpaths.append(current)
            current = []
            last = start
        elif op == "endPath":
            if current:
                subpaths.append(current)
            current = []
    if current:
        subpaths.append(current)
    return subpaths


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ttf", required=True)
    p.add_argument("--codepoint", required=True)
    p.add_argument("--size", type=int, default=256)
    p.add_argument("--bg", default="0xffffffff")
    p.add_argument("--fg", default="0xff000000")
    p.add_argument(
        "--mode",
        choices=["em", "bbox"],
        default="em",
        help="em = paint glyph in its em-box position; bbox = BoxFit.contain on content",
    )
    p.add_argument("--out", required=True)
    p.add_argument(
        "--report",
        default=None,
        help="optional JSON report path with glyph metrics",
    )
    args = p.parse_args()

    ttf_path = Path(args.ttf)
    if not ttf_path.is_file():
        print(f"error: ttf not found: {ttf_path}", file=sys.stderr)
        return 2

    cp_raw = args.codepoint
    cp = int(cp_raw, 16) if cp_raw.lower().startswith("0x") else int(cp_raw)

    font = TTFont(str(ttf_path))
    cmap = font.getBestCmap()
    glyph_name = cmap.get(cp)
    if glyph_name is None:
        print(f"error: no glyph for codepoint {hex(cp)} in {ttf_path}", file=sys.stderr)
        return 3

    units_per_em = int(font["head"].unitsPerEm)
    descent = int(font["hhea"].descent)
    ascent = int(font["hhea"].ascent)

    glyph_set = font.getGlyphSet()
    glyph = glyph_set[glyph_name]
    advance = int(glyph.width)
    lsb = int(glyph.lsb)

    bp = BoundsPen(glyph_set)
    glyph.draw(bp)
    bounds = bp.bounds  # (xMin, yMin, xMax, yMax) or None if empty
    if bounds is None:
        # Empty glyph: emit a blank canvas at requested size.
        bg = parse_color(args.bg)
        img = Image.new("RGBA", (args.size, args.size), bg)
        img.save(args.out)
        if args.report:
            Path(args.report).write_text(
                json.dumps(
                    {
                        "ttf": str(ttf_path),
                        "codepoint": hex(cp),
                        "glyphName": glyph_name,
                        "advance": advance,
                        "lsb": lsb,
                        "unitsPerEm": units_per_em,
                        "bbox": None,
                        "empty": True,
                    },
                    indent=2,
                )
            )
        return 0

    rp = RecordingPen()
    glyph.draw(rp)
    subpaths = commands_to_subpaths(rp.value)

    bg_rgba = parse_color(args.bg)
    fg_rgba = parse_color(args.fg)
    canvas = args.size
    img = Image.new("RGBA", (canvas, canvas), bg_rgba)
    draw = ImageDraw.Draw(img)

    if args.mode == "em":
        # Em-box rendering: x ∈ [0, advance], y ∈ [descent, ascent].
        # For iconifyx fonts, this is x ∈ [0, 1000], y ∈ [0, 1000]
        # (force-set by merge_fonts.py to canonical em-quad).
        # If advance is 0 (rare), fall back to head bbox.
        em_xmin, em_xmax = 0.0, float(advance) if advance > 0 else float(units_per_em)
        em_ymin, em_ymax = float(descent), float(ascent)
    else:
        # BBox rendering: BoxFit.contain on the glyph's content bbox.
        em_xmin, em_xmax = float(bounds[0]), float(bounds[2])
        em_ymin, em_ymax = float(bounds[1]), float(bounds[3])

    src_w = em_xmax - em_xmin
    src_h = em_ymax - em_ymin
    if src_w <= 0 or src_h <= 0:
        img.save(args.out)
        return 0
    # Uniform scale (smallest dimension fits).
    scale = min(canvas / src_w, canvas / src_h)
    out_w = src_w * scale
    out_h = src_h * scale
    offset_x = (canvas - out_w) / 2.0
    offset_y = (canvas - out_h) / 2.0

    def transform(pt):
        x, y = pt
        # SVG/Skia y-down, font y-up: flip y around the source midpoint.
        u = (x - em_xmin) * scale + offset_x
        v = (em_ymax - y) * scale + offset_y
        return (u, v)

    # TrueType glyphs use a non-zero / even-odd winding rule depending on
    # subpath orientation. The simplest faithful emulation is to draw each
    # subpath onto a 1-bit mask, then XOR them together: every additional
    # contour flips inside↔outside in the overlap. This is equivalent to
    # even-odd fill and matches the visual result Flutter's text renderer
    # produces (which uses the canonical TrueType winding evaluator).
    #
    # Falling back to plain `draw.polygon` per subpath fills each as a
    # solid region in non-zero winding — that turns outlined glyphs
    # (Lucide / Tabler hearts, circles, etc.) into solid silhouettes,
    # which silently disagrees with what consumers see.
    mask = Image.new("L", (canvas, canvas), 0)
    for poly in subpaths:
        if len(poly) < 3:
            continue
        pts = [transform(p) for p in poly]
        sub = Image.new("L", (canvas, canvas), 0)
        ImageDraw.Draw(sub).polygon(pts, fill=255)
        # XOR: pixel ON iff (mask XOR sub) — emulates even-odd compound fill.
        from PIL import ImageChops
        mask = ImageChops.logical_xor(mask.convert("1"), sub.convert("1")).convert("L")
    # Composite fg onto the mask.
    fg_solid = Image.new("RGBA", (canvas, canvas), fg_rgba)
    img.paste(fg_solid, (0, 0), mask)

    img.save(args.out)

    if args.report:
        Path(args.report).write_text(
            json.dumps(
                {
                    "ttf": str(ttf_path),
                    "codepoint": hex(cp),
                    "glyphName": glyph_name,
                    "advance": advance,
                    "lsb": lsb,
                    "unitsPerEm": units_per_em,
                    "ascent": ascent,
                    "descent": descent,
                    "bbox": {
                        "xMin": bounds[0],
                        "yMin": bounds[1],
                        "xMax": bounds[2],
                        "yMax": bounds[3],
                        "width": bounds[2] - bounds[0],
                        "height": bounds[3] - bounds[1],
                        "cx": (bounds[0] + bounds[2]) / 2.0,
                        "cy": (bounds[1] + bounds[3]) / 2.0,
                    },
                    "renderMode": args.mode,
                    "canvas": canvas,
                    "empty": False,
                },
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
