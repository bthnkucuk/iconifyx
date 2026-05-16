# Backers

iconifyx is built and maintained by:

- **[@obenkucuk](https://github.com/obenkucuk)**
- **[@bthnkucuk](https://github.com/bthnkucuk)**

The project leans heavily on prior open-source work — none of it would
ship without:

- **Iconify** ([@iconify-design](https://github.com/iconify/iconify)) — the
  upstream icon-set JSON registry (`@iconify/json`) that every per-set
  package in this family is generated from. ~225 packs, ~165K source
  icons before synthesised weight variants.
- **Flutter** — the `IconData` + `--tree-shake-icons` + `const_finder`
  toolchain that makes per-app font subsetting work end-to-end.
- **svgicons2svgfont + svg2ttf** ([@fontello](https://github.com/fontello))
  — the SVG → SVG-font → TTF compilers at the core of the build pipeline,
  plus the local `svg2ttf@6.1.0.patch` for glyph-header bbox accuracy.
- **fontTools** + **Pillow** — the Python venv that powers
  `canonicalize_ttf.py`, `merge_fonts.py`, `rename_glyphs.py`, and the
  visual-diff rasteriser.
- **htmlparser2** + **domutils** — the AST migration that drove the
  duotone-split / paint-order-risk recovery passes.
- **@neplex/vectorizer** (vtracer Rust crate Node binding) — multi-colour
  recovery that brought twemoji from 715 to 4,576 icons and circle-flags
  from 5 to 737.
- **fontkit** — the runtime cmap / glyph-bbox introspection that the
  manifest-lint + secondary-name-check audits run against.
- **oslllo-svg-fixer** + **oslllo-potrace** — the rasterize-and-trace
  pre-pass for stroke / evenodd packs.

If you depend on iconifyx and your project is open-source we'd love a
mention back. If you're building something commercial, no credit is
required — the per-set Apache / MIT / CC license terms passed through
from upstream Iconify are what govern usage.

Want to contribute? Open an issue or PR on
[github.com/bthnkucuk/iconifyx](https://github.com/bthnkucuk/iconifyx).
