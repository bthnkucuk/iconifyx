"""Merge iconifyx auto-split sibling TTFs into ONE TTF with cmap format 12.

Background:
    iconifyx uses svgicons2svgfont + svg2ttf to emit per-set TTFs. The
    underlying cmap format 4 is BMP-only, so any set with > 6000 icons
    is auto-split into ``Mdi.ttf + Mdi_2.ttf + Mdi_3.ttf`` etc. — each
    file uses the same BMP PUA codepoint range (0xE000-0xF8FF).

    When a consumer app references ``MdiIcons.home`` (codepoint living
    in Mdi_2.ttf), Flutter's ``--tree-shake-icons`` shrinks Mdi_2.ttf
    to ~700 bytes, but Mdi.ttf + Mdi_3.ttf ship at FULL SIZE because
    Flutter's asset bundler has no "drop unreferenced TTF" step.

    Fix: merge all siblings into a single TTF using ``cmap format 12``
    (32-bit Unicode, supports Supplementary Private Use Area
    U+F0000-U+10FFFF). First sibling's codepoints stay in BMP
    (preserves codepoint-stability invariant for existing icons).
    Subsequent siblings' codepoints get remapped sequentially into
    supp PUA. Result: one TTF per pack; Flutter's font-subset shrinks
    it directly; no sibling tax.

    Empirically verified: see ``docs/RESEARCH_PLAN.md`` §32.

Usage:
    uv run merge_fonts.py \\
        --inputs Mdi.ttf:Mdi_2.ttf:Mdi_3.ttf \\
        --output Mdi_merged.ttf \\
        --remap-output remap.json \\
        --family-name Mdi \\
        --supp-start 0xF0000

Outputs:
    - merged TTF at --output (cmap format 12, contains all glyphs)
    - JSON remap at --remap-output, shape:
        {
            "Mdi_2": {<orig_cp_hex>: <new_cp_hex>, ...},
            "Mdi_3": {<orig_cp_hex>: <new_cp_hex>, ...}
        }
      The first input file is NOT included (its codepoints don't change).
      Codepoints are JSON strings ("0xe000") so the consumer doesn't
      have to deal with JS number precision on large ints.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable


def parse_cp(s: str) -> int:
    """Parse a codepoint string like '0xF0000' or '983040'."""
    s = s.strip()
    if s.lower().startswith("0x"):
        return int(s, 16)
    return int(s)


def collect_codepoints_to_glyph(font: TTFont) -> dict[int, str]:
    """Walk all cmap subtables and return {codepoint -> glyphName}.

    Later subtables override earlier ones in fontTools' internal model;
    in practice all subtables agree for the iconifyx fonts (every
    codepoint maps to exactly one glyph).
    """
    out: dict[int, str] = {}
    for sub in font["cmap"].tables:
        for cp, name in sub.cmap.items():
            out[cp] = name
    return out


def new_cmap_format_12(
    platform_id: int, plat_enc_id: int, cmap: dict[int, str]
) -> CmapSubtable:
    """Build a CmapSubtable in format 12 (32-bit Unicode)."""
    t = CmapSubtable.newSubtable(12)
    t.platformID = platform_id
    t.platEncID = plat_enc_id
    t.format = 12
    t.reserved = 0
    t.length = 0
    t.language = 0
    t.cmap = dict(cmap)
    return t


def new_cmap_format_4(
    platform_id: int, plat_enc_id: int, cmap: dict[int, str]
) -> CmapSubtable:
    """Build a CmapSubtable in format 4 (BMP-only). Filters out non-BMP."""
    t = CmapSubtable.newSubtable(4)
    t.platformID = platform_id
    t.platEncID = plat_enc_id
    t.format = 4
    t.length = 0
    t.language = 0
    t.cmap = {cp: name for cp, name in cmap.items() if cp <= 0xFFFF}
    return t


def merge_fonts(
    input_paths: list[Path],
    output_path: Path,
    family_name: str,
    supp_start: int,
    explicit_remap: dict[str, dict[int, int]] | None = None,
) -> dict[str, dict[str, str]]:
    """Merge N sibling TTFs into one TTF with cmap format 12.

    Returns the remap manifest: {sibling_stem -> {orig_cp_hex -> new_cp_hex}}.
    The first input is the base; its codepoints don't change. Each
    subsequent input has its codepoints remapped:

    - If ``explicit_remap`` is given and the sibling's stem appears in it,
      each glyph's new codepoint is looked up in that map (used to pair
      duotone secondary fonts to the same codepoints as their primaries).
    - Otherwise, codepoints are allocated sequentially from ``supp_start``.

    A glyph whose original codepoint has no entry in ``explicit_remap`` (e.g.
    a glyph in the secondary font that no longer exists in the primary)
    falls back to sequential allocation, advancing the cursor.
    """
    if not input_paths:
        raise SystemExit("at least one input TTF required")

    base = TTFont(str(input_paths[0]))
    base_cmap = collect_codepoints_to_glyph(base)
    base_glyph_order = list(base.getGlyphOrder())
    base_glyph_set = set(base_glyph_order)

    merged_cmap: dict[int, str] = dict(base_cmap)
    next_supp_cp = supp_start
    remap_manifest: dict[str, dict[str, str]] = {}

    for sibling_path in input_paths[1:]:
        sib = TTFont(str(sibling_path))
        sib_cmap = collect_codepoints_to_glyph(sib)
        sib_stem = sibling_path.stem
        per_sibling_remap: dict[str, str] = {}
        # Per-sibling explicit lookup table (None means sequential allocation).
        sib_explicit = (
            explicit_remap.get(sib_stem) if explicit_remap is not None else None
        )

        # Sort by original codepoint so the remap is deterministic.
        for orig_cp in sorted(sib_cmap.keys()):
            orig_glyph_name = sib_cmap[orig_cp]
            # Skip .notdef and the dummy 0xE000 glyph that svgicons2svgfont
            # always emits as the first cmap entry (it's the substitute
            # glyph; not a real icon).
            if orig_glyph_name == ".notdef":
                continue
            if orig_cp == 0xE000 and orig_glyph_name in {
                "uniE000",
                "u1F0E000",
            }:
                # svg2ttf adds a placeholder at U+E000 in every font;
                # collapse into the base's existing one.
                continue

            # Pick a collision-free glyph name in the merged font.
            new_glyph_name = f"{sib_stem}__{orig_glyph_name}"
            collision_n = 0
            while (
                new_glyph_name in base_glyph_set
                or new_glyph_name in merged_cmap.values()
            ):
                collision_n += 1
                new_glyph_name = f"{sib_stem}__{orig_glyph_name}__{collision_n}"

            # Import glyf data + hmtx into base.
            base["glyf"].glyphs[new_glyph_name] = copy.deepcopy(
                sib["glyf"].glyphs[orig_glyph_name]
            )
            base["hmtx"].metrics[new_glyph_name] = sib["hmtx"].metrics[orig_glyph_name]
            base_glyph_order.append(new_glyph_name)
            base_glyph_set.add(new_glyph_name)

            # Allocate the new codepoint. Prefer the explicit map when one
            # is given (used to pair duotone secondary glyphs to their
            # primaries' new codepoints). Fall back to sequential supp-PUA
            # allocation otherwise.
            if sib_explicit is not None and orig_cp in sib_explicit:
                new_cp = sib_explicit[orig_cp]
            else:
                new_cp = next_supp_cp
                next_supp_cp += 1
                if next_supp_cp > 0x10FFFF:
                    raise SystemExit(
                        f"supp PUA exhausted: tried to allocate {new_cp:#x}, max 0x10FFFF"
                    )

            merged_cmap[new_cp] = new_glyph_name
            per_sibling_remap[f"0x{orig_cp:x}"] = f"0x{new_cp:x}"

        sib.close()
        remap_manifest[sib_stem] = per_sibling_remap

    # Apply the new glyph order to the base font.
    base.setGlyphOrder(base_glyph_order)
    base["maxp"].numGlyphs = len(base_glyph_order)

    # Rebuild cmap: format 12 for both Unicode platforms (0/4 and 3/10),
    # plus format 4 fallbacks for the BMP-only subset (some legacy text
    # paths still consult format 4 first).
    new_tables: list[CmapSubtable] = [
        new_cmap_format_12(platform_id=0, plat_enc_id=4, cmap=merged_cmap),
        new_cmap_format_12(platform_id=3, plat_enc_id=10, cmap=merged_cmap),
        new_cmap_format_4(platform_id=0, plat_enc_id=3, cmap=merged_cmap),
        new_cmap_format_4(platform_id=3, plat_enc_id=1, cmap=merged_cmap),
    ]
    base["cmap"].tableVersion = 0
    base["cmap"].tables = new_tables

    # Ensure name table reports the family as expected (svg2ttf already
    # writes it correctly for the base, but multi-sibling merge can leave
    # stale Mdi_2 references in some name records).
    name_table = base["name"]
    for record in name_table.names:
        if record.nameID not in (1, 4, 6, 16, 17):
            continue
        try:
            current = record.toUnicode()
        except Exception:
            continue
        # Replace any "<base>_<n>" / "<base>_<n>Secondary" with the canonical
        # family. Conservative: only rewrite when the current string starts
        # with the family stem.
        if not current.startswith(family_name):
            continue
        new_val = family_name
        if record.nameID == 6:
            # PostScript name: no spaces allowed.
            new_val = family_name.replace(" ", "")
        if record.platformID == 0 or record.platformID == 3:
            record.string = new_val.encode("utf-16-be")
        else:
            try:
                record.string = new_val.encode("mac-roman")
            except Exception:
                pass

    base.save(str(output_path))
    base.close()
    return remap_manifest


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--inputs",
        required=True,
        help="Colon-separated list of TTF paths. First is base (BMP preserved); rest get remapped.",
    )
    p.add_argument("--output", required=True, help="Output merged TTF path.")
    p.add_argument(
        "--remap-output",
        required=True,
        help="JSON file recording {sibling_stem -> {orig_cp_hex -> new_cp_hex}}.",
    )
    p.add_argument(
        "--family-name",
        required=True,
        help="Canonical font family name to enforce in the output's name table.",
    )
    p.add_argument(
        "--supp-start",
        default="0xF0000",
        help="First codepoint of the supp PUA range to allocate from. Default 0xF0000.",
    )
    p.add_argument(
        "--remap-input",
        default=None,
        help=(
            "Optional JSON file with explicit codepoint mappings, shape "
            "{sibling_stem: {orig_cp_hex: new_cp_hex}}. Glyphs in a sibling "
            "are remapped via this lookup when available; unmapped glyphs "
            "fall back to sequential supp-PUA allocation."
        ),
    )

    args = p.parse_args(argv)
    inputs = [Path(s) for s in args.inputs.split(":")]
    for ip in inputs:
        if not ip.is_file():
            print(f"error: input not found: {ip}", file=sys.stderr)
            return 2

    output = Path(args.output)
    remap_out = Path(args.remap_output)
    supp_start = parse_cp(args.supp_start)

    output.parent.mkdir(parents=True, exist_ok=True)
    remap_out.parent.mkdir(parents=True, exist_ok=True)

    explicit_remap: dict[str, dict[int, int]] | None = None
    if args.remap_input is not None:
        with open(args.remap_input) as f:
            raw = json.load(f)
        explicit_remap = {
            sib_stem: {parse_cp(k): parse_cp(v) for k, v in m.items()}
            for sib_stem, m in raw.items()
        }

    remap = merge_fonts(
        input_paths=inputs,
        output_path=output,
        family_name=args.family_name,
        supp_start=supp_start,
        explicit_remap=explicit_remap,
    )

    with remap_out.open("w") as f:
        json.dump(remap, f, indent=2, sort_keys=True)
        f.write("\n")

    print(
        f"merged {len(inputs)} fonts -> {output} "
        f"({sum(len(m) for m in remap.values())} codepoints remapped)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
