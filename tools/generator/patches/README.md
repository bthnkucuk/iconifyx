# `svg2ttf` patch — glyph bbox accuracy + Fontelico determinism

This directory holds Bun-native `patchedDependencies` patches that ship with the
generator pipeline. Patches are applied automatically by `bun install` (no
postinstall hook required) via the `patchedDependencies` block in the
repo-root `package.json`.

## Patches

### `svg2ttf@6.1.0.patch` — Glyph bbox accumulator initial values

**Upstream bug**

`svg2ttf` (npm) initialises its per-glyph bbox accumulators to `0` in the
`Glyph.prototype.{xMin,yMin,xMax,yMax}` accessor getters. For glyphs whose
real geometry sits **strictly inside** the 1000-em quad (very common for
Iconify icons, which are designed with padding around a 1000×1000 viewBox),
the result is that `Math.min(0, anyPositive) === 0` and `Math.max(0,
anyNegative) === 0` — so the emitted `glyf` table header reports
`(xMin, yMin) = (0, 0)` regardless of the real minimum, and `(xMax, yMax) =
(0, …)` for any glyph that lives entirely below the baseline.

Empirical confirmation (pre-patch, `iconifyx_fontelico/assets/fonts/
Fontelico.ttf` glyph `crown`):

```
header:           xMin=0   yMin=0   xMax=917  yMax=973
actual extremes:  xMin=80  yMin=250 xMax=917  yMax=972
```

**Impact**

- Pollutes per-glyph `glyf` table headers (the canonical-metric
  post-process in `canonicalize_ttf.py` only force-sets the
  font-level `head.xMin/yMin/xMax/yMax`; it explicitly leaves
  per-glyph headers alone via `recalcBBoxes=False`).
- Breaks third-party font tooling that respects glyph headers.
- Contributes to **Fontelico.ttf non-determinism** flagged under
  `DETERMINISM_AUDIT.md` §16-A10: glyph-iteration order in
  the underlying `_.forEach` walk can shift the first point seen, and
  the buggy `0` initialiser interacts unpredictably with that.

**Fix**

Replace `0` with `±Infinity` sentinels in all four accessors. The
`hasPoints` fallback path is unchanged, so blank glyphs still report
`(0,0)` for {x,y}Min and `(width,0)` / `(0,0)` for {x,y}Max — preserving
existing behaviour for empty glyph slots.

**Upstream tracking — Track B**

See https://github.com/fontello/svg2ttf for the upstream source. A
follow-on PR is planned (Track B in RESEARCH_PLAN.md §16-A10). The
local patch ships immediately (Track A) so the determinism baseline is
unblocked.

## How to extend

1. `bun patch <name>@<version>` — Bun copies the package into
   `node_modules/<name>` as a writable working copy.
2. Edit the working copy.
3. `bun patch --commit node_modules/<name>` — Bun writes a `.patch`
   file alongside `package.json` and records the path in
   `patchedDependencies`. Move the file into this directory and update
   the path in the manifest if you want patches grouped under
   `tools/generator/patches/` (as we do here).
4. `bun install` reapplies on every install.
