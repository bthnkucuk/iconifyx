# Duotone rendering

Many Iconify packs ship duo-tone variants: Phosphor `*-duotone`, Solar
`*-bold-duotone` / `*-line-duotone`, the Material `ic` family, Iconamoon,
Pepicons-print, `logos`, `lets-icons *-duotone-line`, dozens of others.
The visual recipe is not the same for all of them — and they don't
render the same way either. iconifyx supports three flavours through
one widget API.

## The three kinds

`IconifyIconData` carries a `kindCode` integer alongside its two
`IconData` layers:

```dart
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  static const int kindSolo = 0;
  static const int kindHint = 1;
  static const int kindPaintOrder = 2;
  static const int kindMaskInternal = 3;
  // ...
}
```

### `kindHint` (Phosphor / Solar / `ic`)

The Iconify canonical convention is two `<path>` elements inside a
`<g fill="currentColor">`, where one has `opacity=".2"` (or `fill-opacity`
or `stroke-opacity`):

```html
<g fill="currentColor">
  <path d="…" opacity=".2"/>     <!-- secondary -->
  <path d="…"/>                  <!-- primary -->
</g>
```

`IconifyIcon` renders this by painting the **secondary BEHIND the
primary at 40 % opacity in the primary colour**. Both layers stay
tinted the user's accent colour; the secondary just sits softer.

```dart
IconifyIcon(PhIcons.acornDuotone, size: 24, color: Colors.indigo)
```

### `kindPaintOrder` (logos / crypto-color / Fluent emoji 2-fill)

Bodies with exactly two distinct concrete fills — e.g. a dark
background tile plus a light foreground letterform, as in
`logos:adobe-after-effects` or many 2-colour Iconify emojis. The
element painting **first** in source order is the background; the second
fill is the foreground letterform.

iconifyx normalises both layers to `currentColor` at generate time, and
emits them as primary (background) + secondary (foreground). At runtime,
`IconifyIcon` paints the **primary first** (background tile filled in the
user's `color`), then the **secondary on top at 100 % opacity in the
caller-supplied `secondaryColor`**. The secondary acts as a knockout
mask: the foreground letterform punches a hole through the background
tile to whatever surface the icon sits on.

```dart
IconifyIcon(
  LogosIcons.adobeAfterEffects,
  size: 24,
  color: AppTheme.darkBlue,
  secondaryColor: Theme.of(context).colorScheme.surface, // or any colour
)
```

If you don't supply `secondaryColor`, the widget falls back to
`IconifyIcon.paintOrderSecondaryFallback` (white). On dark themes that
will look wrong — the foreground letterform stays white instead of
matching the surface. **Always pass `secondaryColor` for paint-order
duotones in themed UIs.**

### `kindMaskInternal` (lets-icons `*-duotone-line`)

The lets-icons `*-duotone-line` family encodes its layering through an
SVG mask:

```html
<defs><mask id="X"><g fill="none" stroke-width="1.2">
  <circle stroke="silver" stroke-opacity=".25"/>   <!-- faint outer ring -->
  <path stroke="#fff" d="..."/>                     <!-- bold foreground -->
</g></mask></defs>
<path fill="currentColor" mask="url(#X)"/>
```

The generator's `trySplitMaskInternalBody` classifies each mask child
by effective luminance vs a white background: `stroke-opacity<1` or
light-grey-keyword/hex (`silver`, `lightgray`, `#aaa`-`#eee`) goes to
the secondary layer; opaque colours go to the primary layer.

Visually the result is the same as a hint-layer duotone, so
`IconifyIcon` composes it the same way (secondary BEHIND primary at
40 % opacity). The manifest preserves `duotoneKind: 'maskInternal'` so
audit tooling can tell them apart.

## One widget, automatic dispatch

There is **one** `IconifyIcon(...)` constructor. It reads
`icon.kind` and dispatches to the right composition rule:

```dart
IconifyIcon(MdiIcons.home, size: 24, color: Colors.indigo)
IconifyIcon(PhIcons.acornDuotone, size: 24)                  // kindHint
IconifyIcon(LogosIcons.adobeAfterEffects, size: 24)          // kindPaintOrder
IconifyIcon(LetsIconsIcons.alarmclockDuotoneLine, size: 24)  // kindMaskInternal
```

You don't need to know which kind an icon is. The generator stamped the
kind into the const at codegen time; the widget reads it at paint time.

If you want to override the secondary appearance for a specific call
site, pass `secondaryColor:` and/or `secondaryOpacity:`:

```dart
IconifyIcon(
  PhIcons.acornDuotone,
  color: Colors.blue,
  secondaryColor: Colors.red,
  secondaryOpacity: 0.5,
)
```

## Implementation: one CustomPaint, two TextPainters, no Stack

`IconifyIcon` is a single `CustomPaint` whose painter caches two
laid-out `TextPainter` instances (one per layer). On every paint the
painter:

1. Applies a `BoxFit.contain`-emulating scale + centre transform so
   wide-aspect glyphs (the wordmarks in `logos`) shrink to fit the
   requested `size`.
2. Paints the secondary `TextPainter` first when the kind is `kindHint`
   or `kindMaskInternal`, with `40 % * primary colour`.
3. Paints the primary `TextPainter` second (kind hint / mask-internal),
   or first then secondary on top (kind paintOrder).

There is no `Stack`, no `Positioned`, no nested `RenderObjects`. Two
`TextPainter.paint` calls in one render layer. On 15K-icon grids in the
website that matters — every layer saved is N×60 fewer composite ops per
second.

The outer shape mirrors `Icon`: `Semantics(label: …, child: SizedBox(…,
child: CustomPaint(…)))`. Drop-in replaceable.

## Runtime construction (website only)

The Flutter web site (`packages/iconifyx/website`) does NOT import every
generated `IconifyIconData` const — loading 165 K consts into the kernel
compile-time-blows the website build. Instead it ships a JSON tuple
catalog (`lib/data/icons_index.json`) with rows like:

```json
["acorn", 57344, 0, 1]
```

That is `[name, codepoint, fontFamilyIndex, kindCode]`. The website's
`IconRecord.toIconifyData()` reconstructs `IconifyIconData` from the
tuple **at runtime**. The 4th slot (`kindCode`) is load-bearing:
dropping it makes every paint-order pack render as hint-layer
(secondary at 40 % behind primary → foreground letterform invisible).

If you ever store iconifyx metadata in a custom catalog, mirror the
4th slot. The generator's `website_codegen.ts` is the reference.
