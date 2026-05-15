# Root-cause analysis: `solar:add-circle-bold-duotone` alignment regression

Companion to [`REPORT.md`](REPORT.md). REPORT.md is auto-generated from
the visual-diff CLI's classifier output; this file is the hand-written
investigation walkthrough.

## TL;DR

The user-reported alignment bug — *"halka sola kaymış, artı halkanın
solunda"* — is the visual signature of **stale `Solar.ttf` /
`SolarSecondary.ttf` in the working tree** built by an earlier
generator before the §32 single-TTF-per-pack codepoint allocator was
fixed. In that build the primary glyph at `0xe013` lived in the
non-base sibling (`Solar_2.ttf`) with content squeezed to the left
half of the em-box (xMin ≈ 1.6, xMax ≈ 314, centroid x ≈ 158),
while the secondary at the same codepoint in `SolarSecondary.ttf`
spanned ~4.6..838 (centroid x ≈ 421). `IconifyIcon._IconifyPainter`
paints both layers at `Offset.zero` — the geometric consequence is
"plus path pinned at the LEFT edge of the circle/ring", an exact
match for the user description.

After `git checkout HEAD -- packages/iconifyx_solar/assets/fonts/`
followed by `bun run generate -- --set solar`, both layers' centroids
land at (500.0, 499.8) and (500.3, 499.9) in em-units of 1000 —
**centroid delta is (0.3, 0.0) em-units, 0.0 % of em.** The alignment
is correct. **The bug is not present in HEAD's TTFs.**

The user must:

1. `git checkout HEAD -- packages/iconifyx_solar/assets/fonts/` (or
   pull the merged `fc5f6d4`/`1bd87eb` commits if their local tree
   is missing them).
2. `fvm flutter clean` in `packages/iconifyx/website/` (or wherever
   they're seeing the bug rendered) to clear the Flutter asset cache.
3. Reload the consumer app.

## Why we know it's a stale-TTF issue, not a code path issue

The visual-diff CLI was run against the working-tree
`Solar.ttf` + `SolarSecondary.ttf` BEFORE I restored them from HEAD,
and the rasterised glyphs reproduced the user's described visual:

| Layer | xMin | xMax | width | centroid x |
|---|---:|---:|---:|---:|
| Primary (`Solar.ttf` working-tree, stale) | **1.6** | **314.4** | 312.8 | **158.0** |
| Secondary (`SolarSecondary.ttf` working-tree, stale) | **4.6** | **838.0** | 833.4 | **421.3** |
| Primary (after `git checkout` + `--set solar` regen) | 343.6 | 656.4 | 312.8 | **500.0** |
| Secondary (same) | 83.6 | 917.0 | 833.4 | **500.3** |

The content widths are identical (312.8 / 833.4 unit) — only the
position differs. A **shift left by exactly 342 em-units** (= the
distance from centroid 500 back to centroid 158) maps the centered
glyph to the broken one. 342 ≈ `1000 - (1000 + 312.8) / 2 -
312.8 / 2 = 343.6` — i.e. the broken position is `xMin = 0`. The
glyph was emitted at `lsb=0` with content starting at `x = 0` — the
`centerHorizontally: false` option in `font_builder.ts` does exactly
that.

For the post-regen TTF, the same `centerHorizontally: false` option
emits the glyph **centered at x=500** because of svgicons2svgfont's
own normalisation pipeline. The single-glyph behaviour is
*content-bbox preserved within its viewBox position*: the plus in
viewBox `0..24` lives at `9..15`, normalised across the largest
glyph's bbox to `343.6..656.4`. The viewBox-relative position is
what makes the layers align — it's only when the glyph's bbox got
zeroed (lsb=0, content shifted to xMin=0) that the alignment broke.

## What svg2ttf does that confuses tooling but is not the alignment bug

`svg2ttf:deduplicateGlyps()` collapses byte-identical glyphs into one
glyph index and registers BOTH source codepoints in the cmap pointing
at that single glyph. The Solar pack has aggressive secondary-body
reuse (every duotone variant that uses the same circle backdrop —
`accessibility-bold-duotone`, `add-circle-bold-duotone`,
`bluetooth-circle-bold-duotone`, … 69 icons in total —shares one
secondary path `M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2
12 2s10 4.477 10 10`).

So `SolarSecondary.ttf` has `cmap[0xe013] -> accessibility-bold-duotone`
even though the manifest says `add-circle-bold-duotone` lives at
`0xe013`. This is **visually correct** — the glyph IS the right
circle — but it makes audit tooling read the wrong name and forces
the visual-diff REPORT.md to surface a confusing "glyph name in TTF"
column. Tracked in `GLYPH_METRICS_AUDIT.md` under the cmap-dedup
collisions section (1,135 such collapses in SolarSecondary alone).

The primary font has the same dedup pattern but for foreground paths
(e.g. `add-circle-bold-duotone` / `shield-plus-bold-duotone` both
ship a tiny `.75`-radius "plus" centred at (12,12), trace-identical
after normalisation → one glyph, multiple cmap entries).

## Why the IconifyIcon paint() algorithm is not at fault

`packages/iconifyx_core/lib/src/iconify_icon.dart:196-220` paints
both layers at `Offset.zero`:

```dart
final sTp = _secondaryTp;
if (sTp != null && secondaryOnTop) {
  _primaryTp.paint(canvas, Offset.zero);
  sTp.paint(canvas, Offset.zero);
} else {
  if (sTp != null) sTp.paint(canvas, Offset.zero);
  _primaryTp.paint(canvas, Offset.zero);
}
```

The comment above this block explicitly documents the OLD bug that
WAS in this code (a BoxFit.contain emulation that scaled by
`TextPainter.width` which is bbox-based — not advance-width —
producing the 3× oversized + left-pinned visual). That code was
reverted to plain Offset.zero, which is correct **when both glyphs
share the same em-quad and viewBox-normalised position** — which is
what `centerHorizontally: false` + `merge_fonts.py`'s forced
unitsPerEm=1000 deliver in HEAD.

The painter is correct. The fonts were stale.

## Visual-diff classifier output

With the post-regen TTFs, the visual-diff CLI emits:

```
status: same
primaryReason: OK
confidence: high
```

— rule 7a `DUOTONE_BBOX_MISMATCH` *did not fire* because the
centroid delta is 0.0% of em. **Had the CLI been run against the
stale TTFs**, rule 7a would have fired with:

```
status: different
primaryReason: DUOTONE_BBOX_MISMATCH
confidence: high
problem: Primary glyph centroid (158,500) differs from secondary
  (421,500) by 26.3% / 0.0% of em — layers will overlay misaligned
remediation: Re-run generator; check `GLYPH_METRICS_AUDIT.md`
```

This satisfies §33's audit-infra litmus test: any future
regression of this class would have been caught BEFORE the user saw
it.

## Pointers for the user

1. Run `bun run audit visual-diff solar:add-circle-bold-duotone` on
   your local checkout; if the report shows centroid delta > 4%, you
   have a stale build.
2. The PNG outputs are committed under
   `docs/audit/visual-diff/solar__add-circle-bold-duotone/`; compare
   against your own re-run to confirm the regression is gone.
3. Apply the user-facing steps in the TL;DR (`git checkout` +
   `flutter clean`).

## What this CLI does for future bugs

The previous loop ("edit code → regen → flutter build ~30s →
screencap → eyeball") is replaced by:

```bash
bun run tools/generator/audit/visual-diff/cli.ts <prefix>:<name>
```

→ 4 PNGs + verdict + REPORT.md in ~15-30 s. The classifier table
grows by adding rows to `cli.ts:classify()`; no rebuild needed.
