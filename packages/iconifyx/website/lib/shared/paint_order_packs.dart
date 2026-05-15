/// Iconify packs whose icons are split into duotone via the **two-color
/// paint-order** path in `tools/generator/src/svg_preprocess.ts:
/// trySplitTwoColorBody`. For these packs the secondary layer is the
/// meaningful FOREGROUND (a letterform, brand mark, contrast accent),
/// not a translucent hint. Default `secondaryOpacity = 0.4` makes the
/// foreground half-disappear; consumers should render at `1.0` with a
/// contrasting `secondaryColor` (the page surface colour usually works
/// — that "carves out" the foreground from the background tile).
///
/// Mask-internal duotone packs (lets-icons `*-duotone-line`) intentionally
/// look like hint-layer duotones and stay at 0.4 — NOT in this list.
///
/// Keep alphabetical for diffability. The set is intentionally explicit
/// rather than derived from a generator flag because packs sometimes mix
/// styles per-icon and `trySplitTwoColorBody`'s heuristic is broader than
/// "this pack always wants paint-order rendering".
const Set<String> paintOrderDuotonePacks = {
  'cif',
  'cryptocurrency-color',
  'devicon',
  'emojione',
  'emojione-v1',
  'flag',
  'flagpack',
  'fluent-emoji',
  'fluent-emoji-flat',
  'fluent-emoji-high-contrast',
  'flat-color-icons',
  'flat-ui',
  'fxemoji',
  'gcp',
  'glyphs',
  'logos',
  'material-icon-theme',
  'noto',
  'noto-v1',
  'openmoji',
  'skill-icons',
  'streamline-color',
  'streamline-cyber-color',
  'streamline-flex-color',
  'streamline-freehand-color',
  'streamline-kameleon-color',
  'streamline-plump-color',
  'streamline-sharp-color',
  'streamline-stickies-color',
  'streamline-ultimate-color',
  'token',
  'token-branded',
  'twemoji',
  'vscode-icons',
};

bool isPaintOrderDuotonePack(String prefix) =>
    paintOrderDuotonePacks.contains(prefix);
