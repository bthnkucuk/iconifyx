"""Per-TTF glyph metric extractor for the glyph-metrics audit.

Reads TTF paths from stdin (one absolute path per line) and emits a single
JSON line per font on stdout, in the SAME order as the input. Each output
line is shaped like:

    {
      "path": "<abs path>",
      "head": { "unitsPerEm": int, "xMin": int, "xMax": int,
                "yMin": int, "yMax": int },
      "hhea": { "ascent": int, "descent": int, "advanceWidthMax": int },
      "os2":  { "usWinAscent": int, "usWinDescent": int,
                "sTypoAscender": int, "sTypoDescender": int },
      "glyphs": [
         { "cp": 0xe000, "name": "home", "adv": 1000, "lsb": 0,
           "xMin": 100, "xMax": 900, "yMin": 50, "yMax": 950,
           "contours": 4 },
         { "cp": 0xe001, "name": "home2", "empty": true }
      ]
    }

Errors are reported as `{ "path": "...", "error": "<message>" }` so the
calling TS orchestrator can surface them without crashing the run.

Running as a single batch subprocess (stdin loop) avoids paying the
~100 ms Python startup cost per font; the full ~600-TTF corpus then
processes in a few seconds on an M-series.
"""

from __future__ import annotations

import json
import sys

from fontTools.ttLib import TTFont


def _safe_int(v: object) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def extract(path: str) -> dict:
    font = TTFont(path)
    try:
        head = font["head"]
        hhea = font["hhea"]
        os2 = font["OS/2"] if "OS/2" in font else None
        glyf = font["glyf"]
        hmtx = font["hmtx"].metrics

        cmap_map: dict[int, str] = {}
        for sub in font["cmap"].tables:
            for cp, gn in sub.cmap.items():
                # Deterministic resolution: first encountered wins. We sort
                # the subtables by (platform, encoding, format) before
                # iterating for stable output across fontTools versions.
                cmap_map.setdefault(cp, gn)

            # We want strictly-deterministic output, so sort subtables.
            # (Outer for loop iterates in registration order which is
            # already deterministic for fontTools, but be defensive.)

        glyphs: list[dict] = []
        for cp in sorted(cmap_map.keys()):
            gn = cmap_map[cp]
            try:
                g = glyf[gn]
            except KeyError:
                glyphs.append(
                    {"cp": cp, "name": gn, "missing_glyph": True}
                )
                continue
            adv, lsb = hmtx.get(gn, (None, None))
            if g.numberOfContours and g.numberOfContours > 0:
                glyphs.append(
                    {
                        "cp": cp,
                        "name": gn,
                        "adv": _safe_int(adv),
                        "lsb": _safe_int(lsb),
                        "xMin": _safe_int(g.xMin),
                        "xMax": _safe_int(g.xMax),
                        "yMin": _safe_int(g.yMin),
                        "yMax": _safe_int(g.yMax),
                        "contours": int(g.numberOfContours),
                    }
                )
            else:
                glyphs.append(
                    {
                        "cp": cp,
                        "name": gn,
                        "adv": _safe_int(adv),
                        "lsb": _safe_int(lsb),
                        "empty": True,
                    }
                )

        result: dict = {
            "path": path,
            "head": {
                "unitsPerEm": _safe_int(head.unitsPerEm),
                "xMin": _safe_int(head.xMin),
                "xMax": _safe_int(head.xMax),
                "yMin": _safe_int(head.yMin),
                "yMax": _safe_int(head.yMax),
            },
            "hhea": {
                "ascent": _safe_int(hhea.ascent),
                "descent": _safe_int(hhea.descent),
                "advanceWidthMax": _safe_int(hhea.advanceWidthMax),
            },
            "os2": (
                {
                    "usWinAscent": _safe_int(os2.usWinAscent),
                    "usWinDescent": _safe_int(os2.usWinDescent),
                    "sTypoAscender": _safe_int(os2.sTypoAscender),
                    "sTypoDescender": _safe_int(os2.sTypoDescender),
                }
                if os2 is not None
                else None
            ),
            "glyphs": glyphs,
        }
        return result
    finally:
        font.close()


def main() -> int:
    for raw in sys.stdin:
        path = raw.rstrip("\n")
        if not path:
            continue
        try:
            data = extract(path)
        except Exception as e:  # noqa: BLE001 - surface to TS, never crash
            data = {"path": path, "error": f"{type(e).__name__}: {e}"}
        # One JSON object per line; flush so the TS reader can stream.
        sys.stdout.write(json.dumps(data, separators=(",", ":"), sort_keys=True))
        sys.stdout.write("\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
