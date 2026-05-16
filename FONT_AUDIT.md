# Font / manifest reconciliation audit

Generated 2026-05-16. For every `(font, codepoint)` pair declared in a pack's manifest, we open the emitted TTF with `fontkit` and verify the codepoint maps to a glyph with a non-empty outline. Anything that fails one of those checks ships as a blank box in the consumer app.

- **Codepoints expected across all fonts:** 369,198
- **Codepoints missing from emitted TTF:** 7
- **Codepoints present but with empty outline:** 0
- **TTFs that failed to open:** 0

## Fonts with drift

| Prefix | Font | Expected | Missing | Empty | Sample missing/empty | Error |
|---|---|---:|---:|---:|---|---|
| `svg-spinners` | `SvgSpinners` | 27 | 4 | 0 | `pulse-ring`, `pulse-rings-2` | — |
| `devicon-plain` | `DeviconPlain` | 760 | 2 | 0 | `towergit-wordmark`, `uwsgi` | — |
| `eos-icons` | `EosIcons` | 247 | 1 | 0 | `arrow-rotate` | — |
