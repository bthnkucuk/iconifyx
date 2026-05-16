#!/usr/bin/env python3
"""
Per-glyph blob risk scorer (§16 A14).

Reads JSON from stdin:
  {
    "ttf": "<absolute path to .ttf>",
    "size": 96,
    "glyphs": [
      { "codepoint": 0xe000, "name": "home" },
      ...
    ]
  }

For every glyph that exists in the TTF and has a non-empty outline:
  - rasterise to a `size x size` grayscale image at the font's em quad
    (BoxFit.contain, centred), then compute:
      fillRatio   - painted_pixels / total_pixels
      edgeEntropy - Shannon entropy (base 2) of the Sobel-edge magnitude
                    grayscale histogram. Smooth featureless blobs have a
                    histogram concentrated near 0 -> low entropy.
                    Stroke / detail-rich icons spread across more buckets
                    -> high entropy.
      dHash       - 64-bit perceptual hash of a downsampled 9x8 grayscale,
                    serialised as a 16-char lowercase hex string.

Emits JSON to stdout:
  {
    "ttf": "...",
    "size": 96,
    "results": [
      { "codepoint": 0xe000, "name": "home", "fillRatio": ..., "edgeEntropy": ..., "dHash": "..." },
      ...
    ],
    "skipped": [
      { "codepoint": 0xe001, "name": "broken", "reason": "no_glyph" | "empty_outline" | "render_error: ..." }
    ]
  }

This script is intentionally a pure stdin->stdout filter so the TS
caller can spawn it once per pack and stream batches in parallel.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from typing import Any

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFilter


@dataclass
class _BBox:
    xmin: float = math.inf
    ymin: float = math.inf
    xmax: float = -math.inf
    ymax: float = -math.inf

    def grow(self, x: float, y: float) -> None:
        if x < self.xmin:
            self.xmin = x
        if y < self.ymin:
            self.ymin = y
        if x > self.xmax:
            self.xmax = x
        if y > self.ymax:
            self.ymax = y

    def empty(self) -> bool:
        return not (math.isfinite(self.xmin) and math.isfinite(self.xmax) and self.xmax > self.xmin)


class _BBoxPen(BasePen):
    """Walks a glyph's outline accumulating its tight bbox."""

    def __init__(self, glyph_set: Any) -> None:
        super().__init__(glyph_set)
        self.bbox = _BBox()
        self.has_geometry = False

    def _moveTo(self, pt: tuple[float, float]) -> None:
        self.bbox.grow(*pt)

    def _lineTo(self, pt: tuple[float, float]) -> None:
        self.bbox.grow(*pt)
        self.has_geometry = True

    def _curveToOne(self, *pts: tuple[float, float]) -> None:
        for p in pts:
            self.bbox.grow(*p)
        self.has_geometry = True

    def _qCurveToOne(self, *pts: tuple[float, float]) -> None:
        for p in pts:
            self.bbox.grow(*p)
        self.has_geometry = True

    def _closePath(self) -> None:
        pass


class _RasterPen(BasePen):
    """
    Flatten the outline into polygons (one per closed subpath) and
    compose them with **even-odd** fill semantics so internal cut-outs
    survive (an mdi outlined square renders as a frame, NOT a filled
    box). Each subpath is rasterised into its own L8 buffer and then
    XOR-merged into the master canvas — overlapping inner contours
    therefore cancel, mirroring TrueType's effective fill behaviour
    for the typical (CW outer / CCW hole) winding the generator emits.

    For this audit we don't need pixel-accurate font rendering; we
    need a rasterisation that DISTINGUISHES outlined icons (with
    holes) from filled silhouettes. Even-odd XOR is the simplest
    approximation that achieves that.
    """

    _CURVE_STEPS = 12

    def __init__(
        self,
        glyph_set: Any,
        size: int,
        scale: float,
        ox: float,
        oy: float,
    ) -> None:
        super().__init__(glyph_set)
        self._size = size
        self._scale = scale
        self._ox = ox
        self._oy = oy
        self._current: list[tuple[float, float]] = []
        # Master canvas, XOR-merged.
        self._canvas = Image.new("L", (size, size), 0)
        self._subpath_buf = Image.new("L", (size, size), 0)
        self._subpath_draw = ImageDraw.Draw(self._subpath_buf)

    def _xy(self, pt: tuple[float, float]) -> tuple[float, float]:
        return (self._ox + pt[0] * self._scale, self._oy - pt[1] * self._scale)

    def _moveTo(self, pt: tuple[float, float]) -> None:
        self._flush()
        self._current.append(self._xy(pt))

    def _lineTo(self, pt: tuple[float, float]) -> None:
        self._current.append(self._xy(pt))

    def _curveToOne(self, pt1: tuple[float, float], pt2: tuple[float, float], pt3: tuple[float, float]) -> None:
        if not self._current:
            return
        p0 = self._current[-1]
        # cubic Bezier sample
        x0, y0 = p0
        x1, y1 = self._xy(pt1)
        x2, y2 = self._xy(pt2)
        x3, y3 = self._xy(pt3)
        steps = self._CURVE_STEPS
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
            y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
            self._current.append((x, y))

    def _qCurveToOne(self, pt1: tuple[float, float], pt2: tuple[float, float]) -> None:
        if not self._current:
            return
        p0 = self._current[-1]
        x0, y0 = p0
        x1, y1 = self._xy(pt1)
        x2, y2 = self._xy(pt2)
        steps = self._CURVE_STEPS
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
            y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
            self._current.append((x, y))

    def _closePath(self) -> None:
        self._flush(close=True)

    def _endPath(self) -> None:
        self._flush()

    def _flush(self, close: bool = False) -> None:
        if len(self._current) >= 3:
            poly = [(round(x), round(y)) for (x, y) in self._current]
            # Clear the subpath buffer, draw this contour solid, then
            # XOR onto the master canvas (even-odd composition).
            self._subpath_draw.rectangle((0, 0, self._size, self._size), fill=0)
            self._subpath_draw.polygon(poly, fill=255)
            self._canvas = ImageChops.logical_xor(
                self._canvas.point(lambda v: 255 if v else 0, mode="1"),
                self._subpath_buf.point(lambda v: 255 if v else 0, mode="1"),
            ).convert("L")
        self._current = []

    def result(self) -> Image.Image:
        return self._canvas


def _rasterise(
    glyph_set: Any,
    glyph_name: str,
    units_per_em: int,
    size: int,
) -> Image.Image | None:
    """
    Returns a grayscale image of the glyph filled in white on black, or
    None if the outline is empty.
    """
    # Pass 1: bbox
    bbox_pen = _BBoxPen(glyph_set)
    glyph_set[glyph_name].draw(bbox_pen)
    if bbox_pen.bbox.empty() or not bbox_pen.has_geometry:
        return None

    bb = bbox_pen.bbox
    gw = bb.xmax - bb.xmin
    gh = bb.ymax - bb.ymin
    if gw <= 0 or gh <= 0:
        return None

    # BoxFit.contain into size x size, with 8% padding.
    inner = size * 0.92
    scale = min(inner / gw, inner / gh)
    px_w = gw * scale
    px_h = gh * scale
    # Anchor at top-left of inner box, then offset glyph by its bbox
    # min (so the glyph's bbox lands at the inner-box origin).
    # PIL Y axis points DOWN, glyph Y axis points UP -> flip.
    ox = (size - px_w) / 2 - bb.xmin * scale
    oy = (size + px_h) / 2 + bb.ymin * scale

    raster_pen = _RasterPen(glyph_set, size, scale, ox, oy)
    glyph_set[glyph_name].draw(raster_pen)
    # Force-flush dangling contour
    raster_pen._flush()  # noqa: SLF001
    return raster_pen.result()


def fill_ratio(img: Image.Image, threshold: int = 8) -> float:
    """painted_pixels / total_pixels (painted = grayscale > threshold)."""
    px = img.load()
    if px is None:
        return 0.0
    w, h = img.size
    painted = 0
    for y in range(h):
        for x in range(w):
            if px[x, y] > threshold:
                painted += 1
    return painted / (w * h)


def edge_entropy(img: Image.Image) -> float:
    """
    Shannon entropy (base 2) of the FIND_EDGES grayscale histogram.

    A solid blob's edge map is a thin contour with most pixels at
    0 -> histogram peaks at 0 -> low entropy.
    A stroke-icon's edge map has many medium-intensity pixels along
    every stroke -> entropy spreads across more buckets.
    """
    edges = img.filter(ImageFilter.FIND_EDGES)
    hist = edges.histogram()  # 256 buckets
    total = sum(hist)
    if total == 0:
        return 0.0
    e = 0.0
    for c in hist:
        if c == 0:
            continue
        p = c / total
        e -= p * math.log2(p)
    return e


def dhash(img: Image.Image) -> str:
    """
    64-bit dHash via 9x8 difference (Zauner, 2010).
    Returns 16-char lowercase hex.
    """
    small = img.resize((9, 8), Image.Resampling.LANCZOS)
    px = small.load()
    if px is None:
        return "0" * 16
    bits = 0
    for y in range(8):
        for x in range(8):
            if px[x, y] > px[x + 1, y]:
                bits = (bits << 1) | 1
            else:
                bits = bits << 1
    return f"{bits:016x}"


def _cmap_codepoint_to_glyph(font: TTFont) -> dict[int, str]:
    cmap = font.getBestCmap()
    return cmap or {}


def _process(payload: dict[str, Any]) -> dict[str, Any]:
    ttf_path = payload["ttf"]
    size = int(payload.get("size", 96))
    glyphs = payload["glyphs"]

    font = TTFont(ttf_path)
    upem = font["head"].unitsPerEm
    cmap = _cmap_codepoint_to_glyph(font)
    glyph_set = font.getGlyphSet()

    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for entry in glyphs:
        cp = int(entry["codepoint"])
        name = entry["name"]
        glyph_name = cmap.get(cp)
        if glyph_name is None:
            skipped.append({"codepoint": cp, "name": name, "reason": "no_glyph"})
            continue
        try:
            img = _rasterise(glyph_set, glyph_name, upem, size)
        except Exception as e:  # noqa: BLE001
            skipped.append({"codepoint": cp, "name": name, "reason": f"render_error: {type(e).__name__}: {e}"})
            continue
        if img is None:
            skipped.append({"codepoint": cp, "name": name, "reason": "empty_outline"})
            continue
        fr = fill_ratio(img)
        ee = edge_entropy(img)
        dh = dhash(img)
        results.append(
            {
                "codepoint": cp,
                "name": name,
                "fillRatio": round(fr, 4),
                "edgeEntropy": round(ee, 4),
                "dHash": dh,
            }
        )

    return {
        "ttf": ttf_path,
        "size": size,
        "results": results,
        "skipped": skipped,
    }


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        sys.stderr.write("blob_detect.py: empty stdin\n")
        sys.exit(2)
    payload = json.loads(raw)
    out = _process(payload)
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
