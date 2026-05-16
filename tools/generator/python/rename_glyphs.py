#!/usr/bin/env python3
"""
Post-build glyph rename for iconifyx TTFs.

Problem
-------
`svg2ttf` deduplicates glyphs by outline hash. When two svgicons2svgfont
input bodies happen to produce identical outlines, only ONE glyph is
emitted; the cmap then aliases multiple codepoints to that glyph. The
kept glyph keeps the FIRST encountered name (alphabetically) so every
other codepoint reads as the wrong icon when third-party font tooling
inspects the cmap → glyph-name relationship (e.g. our `font_verify.ts`
cmap-name check, `fonttools ttx` dumps, browser dev tools).

Visual rendering is unaffected — same outline rendered, regardless of
the name. But:

  cmap[0xE013] -> glyph 'accessibility-bold-duotone'  # WRONG
                  manifest says cp 0xE013 == 'add-circle-bold-duotone'

This script rewrites the TTF so every cmap entry points at a glyph
whose post-table name matches the icon name from the manifest. For
codepoints that originally aliased to a shared glyph, we duplicate
the glyph under a fresh name so each codepoint owns a distinct
post-table entry.

Usage
-----
    rename_glyphs.py <ttf-path> <map-json-path> <output-ttf-path>

`map-json-path` is a JSON file mapping codepoint -> desired glyph name:

    { "57344": "home", "57345": "user", ... }

Codepoints are integers (decimal). Names are the iconify icon names
(the unsanitised originals — they're written into the `post` table,
not the Dart identifier).

The output TTF is byte-deterministic given the same input and map.

Constraints honoured
--------------------
- Codepoint stability: cmap codepoints are NOT changed; only the
  glyph-name a codepoint resolves to.
- Determinism: `recalcTimestamp=False`, `recalcBBoxes=False`. svg2ttf's
  ts=0 head-table timestamp is preserved.
- glyf, hmtx, post tables are kept consistent.
"""
from __future__ import annotations

import copy
import json
import sys
from collections import defaultdict
from typing import Any

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph


def _load_codepoint_map(path: str) -> dict[int, str]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    out: dict[int, str] = {}
    for k, v in raw.items():
        if not isinstance(v, str):
            raise ValueError(f"map value for {k!r} must be a string, got {type(v)}")
        out[int(k)] = v
    return out


def _safe_glyph_name(name: str, existing: set[str]) -> str:
    """
    Sanitise an icon name into a valid TrueType post-table glyph name.

    Per OpenType spec, glyph names are 1..63 ASCII chars from
    [A-Za-z0-9_.-]. Iconify icon names are already kebab-case ASCII and
    well within this range, so the function is largely a no-op for our
    inputs. Defensive replacements:
      - Anything outside [A-Za-z0-9_.-] becomes '_'.
      - Empty after sanitisation -> 'glyph'.
      - Truncate to 63 chars.
      - Append '.2', '.3', ... on collision.

    Collisions are extremely rare for our inputs (icon names are
    globally unique within a set's manifest by construction); the
    de-dup loop exists for safety in case a future caller passes
    overlapping names.
    """
    safe_chars: list[str] = []
    for ch in name:
        if (
            ("a" <= ch <= "z")
            or ("A" <= ch <= "Z")
            or ("0" <= ch <= "9")
            or ch in "_.-"
        ):
            safe_chars.append(ch)
        else:
            safe_chars.append("_")
    safe = "".join(safe_chars) or "glyph"
    if len(safe) > 63:
        safe = safe[:63]
    if safe not in existing:
        return safe
    # collision — append .2/.3/...
    n = 2
    base = safe
    while True:
        # respect the 63-char cap when appending the suffix
        suffix = f".{n}"
        candidate = (base[: 63 - len(suffix)]) + suffix
        if candidate not in existing:
            return candidate
        n += 1


def _deep_copy_glyph(glyf, src_name: str) -> Glyph:
    """
    Return a fresh, independent Glyph object that paints the same outline
    as `glyf[src_name]`. We use `copy.deepcopy` so future edits to one
    copy cannot leak into another (composite glyph component lists,
    coordinate arrays, etc. are all duplicated).
    """
    src = glyf[src_name]
    return copy.deepcopy(src)


def rename_glyphs(in_ttf: str, codepoint_map: dict[int, str], out_ttf: str) -> dict[str, int]:
    """
    Open `in_ttf`, ensure every codepoint in `codepoint_map` resolves to
    a glyph whose post-table name equals the desired icon name, then
    save to `out_ttf`. Returns a small stats dict for the caller to log.
    """
    font = TTFont(in_ttf, recalcBBoxes=False, recalcTimestamp=False)

    # Use the format-4 BMP cmap subtable for read+write. svg2ttf emits a
    # single format-4 table; the "best" cmap surfaces that.
    cmap_table = font["cmap"]
    # Pick all subtables that map BMP codepoints (format 4 or 6); we'll
    # rewrite each one. svg2ttf only emits one subtable in practice, but
    # being safe here is harmless.
    target_subtables = [st for st in cmap_table.tables if st.isUnicode()]
    if not target_subtables:
        # No unicode cmap → nothing to rename.
        font.save(out_ttf)
        return {"renamed": 0, "duplicated": 0, "skipped": 0}

    # Read current mapping (cp -> glyph_name). All subtables should agree
    # for the cps we care about; we read from the first and write to all.
    primary = target_subtables[0]
    cmap = dict(primary.cmap)

    glyf = font["glyf"]
    hmtx = font["hmtx"]

    # Build: which glyphs are aliased to multiple codepoints? Those are
    # the dedup victims. For each such glyph, we keep ONE codepoint
    # (whichever the manifest agrees with, else the lowest cp) on the
    # original glyph and duplicate for every other cp.
    name_to_cps: dict[str, list[int]] = defaultdict(list)
    for cp, gname in cmap.items():
        name_to_cps[gname].append(cp)
    for cps in name_to_cps.values():
        cps.sort()

    existing_names: set[str] = set(font.getGlyphOrder())
    new_glyph_order: list[str] = list(font.getGlyphOrder())

    renamed = 0
    duplicated = 0
    skipped = 0

    # For each glyph in the cmap, ensure each codepoint that references
    # it resolves to a glyph whose name == the manifest's desired name.
    for current_name, cps in list(name_to_cps.items()):
        if not cps:
            continue
        # Identify the canonical codepoint to keep on the original
        # glyph. Prefer a cp whose manifest name matches current_name
        # (idempotency for already-correct mappings). Else pick the
        # lowest cp whose manifest name matches "current_name's intent"
        # — i.e. fall back to the first cp.
        canonical_cp: int | None = None
        for cp in cps:
            desired = codepoint_map.get(cp)
            if desired is not None and desired == current_name:
                canonical_cp = cp
                break
        if canonical_cp is None:
            canonical_cp = cps[0]

        # Renaming the canonical glyph itself only matters if its
        # current name doesn't equal the manifest's desired name for
        # the canonical cp.
        canonical_desired = codepoint_map.get(canonical_cp)
        if canonical_desired is not None and canonical_desired != current_name:
            new_name = _safe_glyph_name(canonical_desired, existing_names)
            _rename_in_place(font, glyf, hmtx, new_glyph_order, current_name, new_name)
            existing_names.discard(current_name)
            existing_names.add(new_name)
            # Rewrite cmap entry for canonical_cp.
            cmap[canonical_cp] = new_name
            current_name = new_name
            renamed += 1

        # For every OTHER cp aliasing the same glyph, duplicate.
        for cp in cps:
            if cp == canonical_cp:
                continue
            desired = codepoint_map.get(cp)
            if desired is None:
                skipped += 1
                continue
            if desired == current_name:
                # Lucky: alias already has the correct name (shouldn't
                # happen if canonical was different, but safe).
                continue
            new_name = _safe_glyph_name(desired, existing_names)
            _duplicate_glyph(
                font, glyf, hmtx, new_glyph_order, current_name, new_name
            )
            existing_names.add(new_name)
            cmap[cp] = new_name
            duplicated += 1

    # Propagate the rewritten cmap to every unicode subtable.
    for st in target_subtables:
        st.cmap = dict(cmap)

    # Glyph order may have grown; assign it back so post/hmtx/glyf stay
    # in sync.
    font.setGlyphOrder(new_glyph_order)

    # Post table format: svg2ttf emits format 3.0 (no glyph names) by
    # default. To make our rename observable to third-party tooling we
    # need format 2.0 (which stores per-glyph names). fontTools handles
    # the encoding when we set the format + extraNames; the heavy work
    # is just setting `formatType` to 2.0 and giving the post table a
    # glyphOrder-aligned list. fontTools' compile() picks the right
    # standard-name indices automatically.
    post = font["post"]
    if getattr(post, "formatType", None) != 2.0:
        post.formatType = 2.0
        # fontTools' post format-2 compiler reads glyph names from
        # font.getGlyphOrder() and generates `extraNames` for any name
        # that isn't in the Mac standard set. Initialise to an empty
        # list — fontTools fills it during compile.
        post.extraNames = []
        post.mapping = {}
        post.glyphOrder = new_glyph_order

    font.save(out_ttf)
    return {"renamed": renamed, "duplicated": duplicated, "skipped": skipped}


def _rename_in_place(
    font: TTFont,
    glyf,
    hmtx,
    glyph_order: list[str],
    old: str,
    new: str,
) -> None:
    """
    Rename a glyph from `old` to `new` in the glyf, hmtx, and glyphOrder
    tables. Does NOT touch the cmap — the caller is expected to rewrite
    the cmap entry afterwards.

    fontTools stores per-glyph tables as dicts keyed by glyph name; we
    have to repopulate the dict to preserve insertion order so the
    glyph IDs remain stable for everything we DIDN'T touch.
    """
    if old == new:
        return
    # glyf table.
    glyf_glyphs = glyf.glyphs
    glyf_glyphs[new] = glyf_glyphs.pop(old)

    # hmtx table.
    hmtx_metrics = hmtx.metrics
    hmtx_metrics[new] = hmtx_metrics.pop(old)

    # glyph order.
    idx = glyph_order.index(old)
    glyph_order[idx] = new


def _duplicate_glyph(
    font: TTFont,
    glyf,
    hmtx,
    glyph_order: list[str],
    src: str,
    new_name: str,
) -> None:
    """
    Create a copy of `src` named `new_name` in glyf + hmtx, appending to
    the end of `glyph_order`. The new glyph is a full deep-copy of the
    source so any in-place edits to one cannot leak into the other.
    Loca / horizontal-metrics counts auto-recompute at save() time.
    """
    glyf_glyphs = glyf.glyphs
    if new_name in glyf_glyphs:
        # Already present (e.g. fallback from a previous run). Nothing to do.
        return
    glyf_glyphs[new_name] = _deep_copy_glyph(glyf, src)
    hmtx_metrics = hmtx.metrics
    # Mirror the advance/lsb of the source glyph.
    hmtx_metrics[new_name] = tuple(hmtx_metrics[src])
    glyph_order.append(new_name)


def _main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(
            "usage: rename_glyphs.py <in.ttf> <map.json> <out.ttf>",
            file=sys.stderr,
        )
        return 2
    in_ttf, map_path, out_ttf = argv[1], argv[2], argv[3]
    codepoint_map = _load_codepoint_map(map_path)
    stats = rename_glyphs(in_ttf, codepoint_map, out_ttf)
    # Emit a single JSON line so the TS wrapper can parse.
    print(json.dumps(stats))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
