# iconifyx website — agent rules

A Flutter web app that browses every Iconify pack shipped by iconifyx
(~206 packs, ~165k icons). Performance and lazy-rendering are non-negotiable
— this CLAUDE.md captures the patterns we've already learned the hard way.

Read [the repo-root CLAUDE.md](../../../CLAUDE.md) first for the package
family layout and the generator pipeline. Everything below is **website-only**.

## Hard rules

### 1. No `shrinkWrap` + `NeverScrollableScrollPhysics` in lists

A `ListView`/`GridView` with `shrinkWrap: true, physics:
NeverScrollableScrollPhysics()` eagerly mounts every child — that defeats
lazy rendering. We removed every such pattern from the codebase
(`pack_card.dart`, `_PopularGrid`, `_CategoryLeading`, `_MetaCard`,
`_Related`). Acceptable substitutes for small fixed sets:

- 2×2/3×3 grids: a `Column` of `Row`s with `Expanded(AspectRatio(child))`
  per cell (see `_AllPacksCard` for the layered coral-square pattern).
- N items with even cell width: `LayoutBuilder` + `Row`/`Wrap` of
  fixed-width `SizedBox`s.

### 2. Use `SliverChildBuilderDelegate`-style slivers for big lists

Anything iterating `packs` (~206) or `icons` (15k per pack) MUST be a top-
level `SliverGrid.builder` / `SliverList.builder` / `SliverMasonryGrid.count`
in a `CustomScrollView`. Don't nest such grids inside a sized box or a
non-builder list — that breaks lazy mounting even though the `.builder`
name suggests otherwise.

For icon grids set:

```dart
SliverGrid(
  gridDelegate: ...,
  delegate: SliverChildBuilderDelegate(
    (context, i) => _IconCell(...),
    childCount: filtered.length,
    addAutomaticKeepAlives: false,   // icon cells don't need keepalive
    addSemanticIndexes: false,        // 15k semantic indexes are wasted
  ),
)
```

### 3. NEVER wrap big slivers in `SliverLayoutBuilder`

`SliverLayoutBuilder.builder` re-fires on every scroll frame because
`SliverConstraints` (scrollOffset / remainingPaintExtent / cacheOrigin)
change per frame. We measured 600+ cell rebuilds/sec on arcticons (15k
icons) when its `SliverGrid.builder` was wrapped in `SliverLayoutBuilder` —
catastrophic jank.

**Compute `cols` / `cellWidth` / `iconRenderSize` in the OUTER box
`LayoutBuilder`** (which only rebuilds on viewport resize) and pass them
down as props. See `_LoadedBody.build` in
[lib/features/pack/pack_detail_page.dart](lib/features/pack/pack_detail_page.dart)
for the pattern; same in
[lib/features/home/all_packs_page.dart](lib/features/home/all_packs_page.dart).

When you must read box constraints from a sliver context, use
`MediaQuery.sizeOf(context).width` clamped by `AppShellLayout.pageMaxWidth`
(see `_allPacksCols` in `home_page.dart`).

### 4. Hoist `Theme.of(context)` / `AppTheme` lookups out of cell builders

`_IconCell` in `pack_detail_page.dart` does NO `Theme.of`, NO `AppTheme.xDark`
ternaries. The parent (`_LoadedBody.build`) resolves these once per page
rebuild into a `_CellPalette` const record and passes it down. For 15k×60fps
scroll, this matters.

### 5. Render icons via `IconifyThumb` (thin pass-through to `IconifyIcon`)

[`shared/widgets/iconify_thumb.dart`](lib/shared/widgets/iconify_thumb.dart)
is now a thin pass-through to `IconifyIcon` from `iconifyx_core`. Both
fit wide-aspect glyphs (Iconify `logos` pack's Adobe / Google wordmarks)
into their cell via a `BoxFit.contain` scale — `IconifyIcon` does this
inside its `CustomPaint` painter, so wrapping doesn't add an extra layer.
Use `IconifyThumb` from the website's call sites; the wrapper exists
only because every website call expects a `secondaryColor` it can fill
in from its `_CellPalette`. Outside the website, prefer `IconifyIcon`
directly.

API: `IconifyThumb(data, size: X, color: Y, secondaryColor: Z?)`.

**Duotone rendering — automatic.** All three duotone flavours (hint-layer
Phosphor / Solar / ic, paint-order logos / crypto-color / fluent-emoji-
flat, mask-internal lets-icons `*-duotone-line`) are dispatched by
`IconifyIcon` based on `IconifyIconData.kind`. The website's
`IconRecord.toIconifyData()` parses the kind code from the
`icons_index.json` tuple's 4th slot and forwards it to
`IconifyIconData.duo(p, s, kind: ...)`. Call sites just pass an optional
`secondaryColor:` (typically the cell's card / page paper colour) so
paint-order foreground letterforms "knock out" against the
currentColor-filled primary tile. Without it, the foreground falls back
to `IconifyIcon.paintOrderSecondaryFallback` (white).

`_CellPalette.surfaceForKnockout` in `pack_detail_page.dart` is resolved
once per page rebuild (no `Theme.of` per cell) and threaded into every
`IconifyThumb(secondaryColor: palette.surfaceForKnockout)` call. The
sidebar has an explicit `SECONDARY COLOR` swatch row for debugging /
overriding — feeds the same palette field via `_iconSecondaryColor`
state.

### 6. Slider commits on snap, not on drag pixel

Wrap discrete sliders so each onChanged fires ONLY when the snapped value
crosses to the next division — not 60Hz. See `_SizeSliderRow` in
`pack_detail_page.dart`. The Slider's built-in division behavior already
gates this (it only calls `onChanged` when `lerpValue != widget.value`),
so a stateless wrapper with `onChanged: onCommit` is enough.

DON'T set up a stateful "draft value" mirror that calls setState on every
keystroke — that rebuilds the entire grid 60×/sec during a single drag,
producing 16k+ cell rebuilds for a slow drag.

### 7. Deferred-rendering for fling scrolls

`_IconCell.build` checks `Scrollable.recommendDeferredLoadingForContext`
and skips painting the `IconifyThumb` during high-velocity scroll — only
the cell chrome (box + name label) renders. On scroll-end a
`NotificationListener<ScrollEndNotification>` calls `setState` so visible
placeholder cells repaint with their icon.

## Routing patterns (zenrouter)

The app uses zenrouter (`Coordinator` + `RouteUnique`, see
[lib/router/](lib/router/)). Established conventions:

### Layouts

- `AppShellLayout` (top bar + Expanded(buildPath)) wraps every shell route
  via `layout: AppShellLayout`.
- Set `Type? get layout => null` on a route to render at root (covers the
  top bar). `SearchRoute` and the icon-detail sheet take this path.
- The shell stack is defined in `AppCoordinator.shellStack`. A route's
  `layout` getter routes it to the right `NavigationPath`.

### URL state via `RouteQueryParameters`

When a page has filter / query state that should live in the URL, the route
mixes in `RouteQueryParameters` from zenrouter:

```dart
class PackDetailRoute extends AppRoute with RouteQueryParameters {
  PackDetailRoute({required this.prefix, Map<String, String>? initialQueries})
      : queryNotifier = ValueNotifier(initialQueries ?? const {});

  @override
  final ValueNotifier<Map<String, String>> queryNotifier;
  // ...
}
```

In-page code reads via `route.query('q')` or listens via
`route.selectorBuilder<T>(selector: ..., builder: ...)` to scope rebuilds
to only widgets that depend on that slice of state.

Writes go through `route.updateQueries(coordinator, queries: ...)` —
updates both the URL bar and the notifier.

The URL parser in the matching `RouteModule.parseRouteFromUri` receives
`uri.queryParameters` and constructs the route with `initialQueries` so a
direct URL hit / browser refresh restores the exact same state.

### Custom transitions

`StackTransition.custom(builder, pageBuilder)` with a custom `Page<T>` for
non-standard presentation:

- **Icon detail = sheet** ([icon_detail_route.dart](lib/router/routes/shell/icon_detail_route.dart)):
  `StupidSimpleSheetRoute<T>` from `stupid_simple_sheet`. Page's
  `createRoute` returns the sheet. `SheetSnappingConfig.full` default;
  `motion: CupertinoMotion.smooth()`; `originateAboveBottomViewInset: true`.
- **Search = blurred overlay** ([search_route.dart](lib/router/routes/shell/search_route.dart)):
  custom `PageRoute` with `opaque: false`, transparent barrier, and a
  full-frame `BackdropFilter(ImageFilter.blur)` inside `buildPage` to frost
  the underlying route.

### Push semantics: prefer `pushOrMoveToTop`

`appCoordinator.push(SomeRoute())` adds a new entry every call. If a user
mashes ⌘K, that pushes multiple `SearchRoute` instances on top of each
other. Use `pushOrMoveToTop`:

```dart
onTap: () => appCoordinator.pushOrMoveToTop(SearchRoute()),
```

Combined with `RouteUnique` (which our `AppRoute` mixes in), routes are
deduped by `props`.

### Search query persistence

`SearchRoute` keeps `static String lastQuery = ''` updated by a listener on
its `queryNotifier`. New `SearchRoute()` instances (no `initialQueries`)
seed themselves from `lastQuery`. URL→route parsing populates from
`uri.queryParameters`. SearchPage caret is placed at the end of the seeded
text so the user can keep typing.

## Layout / chrome conventions

### `PageContainer` and `PageContainer.slivers`

[lib/router/routes/shell/app_shell_layout.dart](lib/router/routes/shell/app_shell_layout.dart)
defines both. Use one consistently per page:

- `PageContainer(children: [...])` — wraps regular widgets in a single
  `SliverList`. Picks for static pages (home).
- `PageContainer.slivers(slivers: [...], cacheExtent: X)` — pages that
  contribute their own slivers (any lazy `SliverGrid.builder` /
  `SliverMasonryGrid.count`).

It does:

- Material wrap with `scaffoldBackgroundColor`.
- Centered max-width column (`AppShellLayout.pageMaxWidth = 1240`), with
  symmetric horizontal padding `pad = (viewport - 1240) / 2`.
- Appends `SiteFooter` at the bottom (toggleable via `showFooter`).
- Optional `cacheExtent` → forwarded as
  `ScrollCacheExtent.pixels(cacheExtent!)` (Flutter 3.44+ API).

DO NOT duplicate this math in pages. If a page has a sidebar split, do
`Row [sidebar | Expanded(PageContainer.slivers(...))]` — `PageContainer`
runs its centering math inside `Expanded`'s width.

### Pinned title bar via `SliverPersistentHeader`

Both pack list and pack detail pin their title + filter input via
`SliverPersistentHeader(pinned: true, delegate: _PinnedTitleDelegate(...))`.
Delegate has fixed `minExtent == maxExtent` based on the page-wide flag:
`58` for Row form (wide — matches `AppTopBar` height exactly), `96` for
Column form (narrow). The filter `TextField` is `height: 36` with `isDense:
true` and 13-px text so both forms read as a compact chrome row rather
than a second hero band.

`_TitleBar` takes a `useRowLayout: bool` parameter (parent-controlled) so
its layout matches the delegate's reserved extent — its internal
`LayoutBuilder` was removed for this reason.

### Collapsible sidebar on narrow viewports

`shared/widgets/collapsible_section.dart` wraps narrow-mode sidebars so the
user lands on a tidy top instead of a wall of filters. Default
`initiallyExpanded: false`. Header row contains the section title +
trailing chevron (rotated when open). Used in `all_packs_page` (narrow
"CATEGORIES" section) and `pack_detail_page` (narrow "OPTIONS" section).

When wrapping `_CategorySidebar`, pass `showHeading: false` to suppress its
internal heading (the collapsible header already shows it).

## Performance specifics

### Icon font budget

The website depends on ALL ~206 `iconifyx_*` packages (~43.5 MB of TTFs
across ~291 font files). Each pack's font is loaded into CanvasKit on
first reference and **never unloaded** by the Flutter web engine, so
navigating across many packs accumulates WASM heap usage. We've seen
`memory access out of bounds` crashes on web after heavy navigation —
release builds are dramatically smoother than debug.

We do NOT use `google_fonts`. Plus Jakarta Sans + JetBrains Mono are
bundled as static assets in
[assets/fonts/](assets/fonts/) and declared in
[pubspec.yaml](pubspec.yaml) under `flutter.fonts:`. `app_theme.dart`
references them via `fontFamily: 'PlusJakartaSans'` and `'JetBrainsMono'`.

### Frame budget mental model

A scrollable with 15k items + simple per-cell widget tree must build cells
in well under 16ms each (so multiple per frame). We've established:

- Cell mount cost matters more than steady-state paint because cells churn
  during scroll. Mount = constructor + first paint of `TextPainter.layout`
  for a fresh glyph. ~1–2ms on web debug, much faster in release.
- TextPainter glyph layout is the dominant first-paint cost. Once the
  engine has shaped a (font, codepoint, size) tuple, subsequent paints are
  fast — but for 15k unique glyphs in a fresh pack, the engine pays first-
  shape cost as each scrolls past.
- Deferred-loading (see rule §7) skips this cost during fling scrolls.

### Misc

- Cards: hover lift is `AnimatedSlide(offset: Offset(0, hovered ? -2/64 : 0))`
  on `HoverBuilder`'s child (PackTile pattern). Do NOT pass `translateOnHoverY:
  -1` to `HoverBox` — that's `-1 × widget.height` and the card jumps a
  full height upward. `-2/64` ≈ 2 px lift.
- Search palette panel has a `Flexible(fit: FlexFit.loose)` around its body
  `ConstrainedBox(maxHeight: 0.7 × screen)` so short viewports don't
  overflow. Tall viewports still get the 0.7-height cap.
- App top bar's right cluster (search + theme + pub.dev CTA) uses
  `LayoutBuilder` to pick a fixed search width by breakpoint
  (280/200/140) and `Spacer()` to anchor the cluster to the right edge.
  Do NOT use `Flexible` here — it competes with `Spacer` and pushes search
  toward the middle.

## Dependency hygiene

- DON'T add `google_fonts`, `flutter_svg`, `material_symbols`, or other
  large packages without checking. Most things we need exist already.
- DON'T import `iconifyx_core` for widgets if `IconifyThumb` (website
  helper) suffices — we removed the `iconifyx_core` import from most pages
  precisely because of the wide-glyph overflow bug.
- `oref`'s `signal()`/`SignalBuilder` pattern is used inside `HoverBox` /
  `HoverBuilder` for scoped hover state. Avoid `bool _hover` + `setState`
  on parent — invalidates much larger subtrees.

## File ownership

| Path | Hand-written? | Notes |
|---|---|---|
| `lib/main.dart` | YES | bootstrap entry only |
| `lib/bootstrap/*.dart` | YES | catalog + bloc + theme cubit |
| `lib/router/**` | YES | zenrouter coordinator + modules + routes |
| `lib/features/**/*.dart` | YES | page bodies |
| `lib/shared/widgets/*.dart` | YES | reusable across features |
| `lib/theme/*.dart` | YES | colors + textTheme |
| `lib/data/packs.json` | no | emitted by generator's `website_codegen.ts` |
| `lib/data/icons_index.json` | no | emitted by generator's `website_codegen.ts` |
| `assets/fonts/*.ttf` | YES (static UI fonts only) | NOT icon fonts |
| `pubspec.yaml` | mixed | `iconifyx_*` deps are codegen'd; UI deps hand-curated |

If you edit a generated file by hand, your edits will be wiped on the next
`bun run generate`. Edit the generator instead.

## Common operations

```bash
# Run the website locally (debug → slow scroll perf; profile/release for real)
cd packages/iconifyx/website
fvm flutter run -d chrome
fvm flutter run -d chrome --release   # smooth scroll, real perf baseline

# Analyze only the website
fvm flutter analyze lib

# After editing assets/ttfs or pubspec, re-fetch
fvm flutter pub get
```

Always test scroll perf in `--release` before claiming a perf fix works —
debug Flutter Web is ~5–10× slower and amplifies any issue.

## When in doubt

Read the page that already does what you're trying to do. Most patterns
were established once and propagated:

- Big lazy grid → `pack_detail_page.dart`.
- Pinned title bar → `pack_detail_page.dart` or `all_packs_page.dart`.
- Sheet-as-route → `icon_detail_route.dart`.
- Overlay-as-route → `search_route.dart`.
- Collapsible narrow chrome → `all_packs_page.dart` narrow branch.
- Pack card tile → `shared/widgets/pack_tile.dart`.

Don't invent a new flavour. Reuse and extend.
