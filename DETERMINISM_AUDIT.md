# Determinism audit (§16-A10)

Verifies that the generator emits byte-identical TTFs / Dart / manifests across runs (CLAUDE.md §5 + §33 canonical-metric contract). Output of this report is itself deterministic — same inputs always produce the same markdown.

## Run metadata

- Mode: `regen-twice`
- Snapshot schema version: `1`
- `@iconify/json`: `2.2.472`
- Generator commit (current HEAD): `6db87676d454cbd779fa927ab4b2fb6ed75fa32a`
- Files snapshotted: **746** (296 TTFs, 225 Dart, 225 manifests)
- Baseline commit: `a34929d41eca1ffca185d2b73727500e963dcb3e`
- Baseline `@iconify/json`: `2.2.472`

## Baseline drift

**555** files differ from the committed baseline (554 changed, 1 added, 0 removed).

A non-zero drift is OK in normal development — it just means the baseline is older than HEAD. Bump it via `bun run audit determinism -- --update-baseline` once HEAD is verified known-good (e.g. after a deliberate regen).

### TTF fonts (296)

| Path | Status | Baseline | Current |
|---|---|---|---|
| `packages/iconifyx_academicons/assets/fonts/Academicons.ttf` | changed | `3164eb649df1` | `589f9a6a739a` |
| `packages/iconifyx_akar_icons/assets/fonts/AkarIcons.ttf` | changed | `62a34d8a155a` | `f636e0f22a68` |
| `packages/iconifyx_ant_design/assets/fonts/AntDesign.ttf` | changed | `2a69bafa67bb` | `becb0d9f8a9e` |
| `packages/iconifyx_ant_design/assets/fonts/AntDesignSecondary.ttf` | changed | `fb4185d4b6e0` | `ce6bb8780812` |
| `packages/iconifyx_arcticons/assets/fonts/Arcticons.ttf` | changed | `06af465b0294` | `da4d5466ff21` |
| `packages/iconifyx_arcticons/assets/fonts/ArcticonsSecondary.ttf` | changed | `ab1c158bbd55` | `2462f4735e60` |
| `packages/iconifyx_basil/assets/fonts/Basil.ttf` | changed | `5ab1b06a7dfb` | `171d8b9c6a10` |
| `packages/iconifyx_bi/assets/fonts/Bi.ttf` | changed | `851a07aed29b` | `2f38aa4c63e6` |
| `packages/iconifyx_bi/assets/fonts/BiSecondary.ttf` | changed | `2fd699683f7c` | `b463fa7258c8` |
| `packages/iconifyx_bitcoin_icons/assets/fonts/BitcoinIcons.ttf` | changed | `ebf93c3ccef8` | `8f5ec9dc2289` |
| `packages/iconifyx_bitcoin_icons/assets/fonts/BitcoinIconsSecondary.ttf` | changed | `63963eec8ea6` | `9c7cd829a704` |
| `packages/iconifyx_boxicons/assets/fonts/Boxicons.ttf` | changed | `caf366fe81d8` | `e61f3354d439` |
| `packages/iconifyx_bpmn/assets/fonts/Bpmn.ttf` | changed | `d531733b0efe` | `2aaf4282e6d1` |
| `packages/iconifyx_brandico/assets/fonts/Brandico.ttf` | changed | `26a658aab1af` | `805374072ab9` |
| `packages/iconifyx_bx/assets/fonts/Bx.ttf` | changed | `144565a16185` | `0a5399c0b8d7` |
| `packages/iconifyx_bxl/assets/fonts/Bxl.ttf` | changed | `ce33cce17103` | `fe3fc77a7bf3` |
| `packages/iconifyx_bxs/assets/fonts/Bxs.ttf` | changed | `96b27d1e9b63` | `81cf5935e90b` |
| `packages/iconifyx_bytesize/assets/fonts/Bytesize.ttf` | changed | `777852736d7d` | `d980cadba98a` |
| `packages/iconifyx_carbon/assets/fonts/Carbon.ttf` | changed | `c436faa68bca` | `5578ef012100` |
| `packages/iconifyx_catppuccin/assets/fonts/Catppuccin.ttf` | changed | `c3893f2f3a8d` | `a4927fc58c04` |
| `packages/iconifyx_catppuccin/assets/fonts/CatppuccinSecondary.ttf` | changed | `fa1964d5c08d` | `4cf77a5868c1` |
| `packages/iconifyx_cbi/assets/fonts/Cbi.ttf` | changed | `7ffd546de865` | `a7a3d785e380` |
| `packages/iconifyx_charm/assets/fonts/Charm.ttf` | changed | `e3093005e823` | `b751943983e3` |
| `packages/iconifyx_ci/assets/fonts/Ci.ttf` | changed | `0bc67005bb6b` | `e2b2b9817c5b` |
| `packages/iconifyx_cib/assets/fonts/Cib.ttf` | changed | `f0853c9d063c` | `6e8a2a2a6683` |
| `packages/iconifyx_cif/assets/fonts/Cif.ttf` | changed | `0705b4085366` | `f2228d2a1383` |
| `packages/iconifyx_cif/assets/fonts/CifSecondary.ttf` | changed | `dff7e7ff7f48` | `108205a12a81` |
| `packages/iconifyx_cil/assets/fonts/Cil.ttf` | changed | `1d2f09159b42` | `71a92365056c` |
| `packages/iconifyx_circle_flags/assets/fonts/CircleFlags.ttf` | changed | `54ee1304cd30` | `f49233897e52` |
| `packages/iconifyx_circum/assets/fonts/Circum.ttf` | changed | `091c7abd2ed1` | `8f5982e84b8e` |
| `packages/iconifyx_clarity/assets/fonts/Clarity.ttf` | changed | `9f40e73ea882` | `2eeabdee0fca` |
| `packages/iconifyx_clarity/assets/fonts/ClaritySecondary.ttf` | changed | `77c88d37d7af` | `d2308f38b6b0` |
| `packages/iconifyx_codex/assets/fonts/Codex.ttf` | changed | `2ee10e4765a6` | `d6c1db98de29` |
| `packages/iconifyx_codicon/assets/fonts/Codicon.ttf` | changed | `a204e1039a28` | `a61947635baa` |
| `packages/iconifyx_covid/assets/fonts/Covid.ttf` | changed | `d9998507b1b3` | `ee6410bc568a` |
| `packages/iconifyx_cryptocurrency_color/assets/fonts/CryptocurrencyColor.ttf` | changed | `9de9a49cf399` | `d97c10c52574` |
| `packages/iconifyx_cryptocurrency_color/assets/fonts/CryptocurrencyColorSecondary.ttf` | changed | `8060f71151ee` | `753fe5262524` |
| `packages/iconifyx_cryptocurrency/assets/fonts/Cryptocurrency.ttf` | changed | `4be9e797b512` | `e0dd1be3e558` |
| `packages/iconifyx_cryptocurrency/assets/fonts/CryptocurrencySecondary.ttf` | changed | `2cd9c8f6416b` | `20f9e1ab64f4` |
| `packages/iconifyx_cuida/assets/fonts/Cuida.ttf` | changed | `42f09a192cd1` | `b0381b9dbd52` |
| `packages/iconifyx_cuida/assets/fonts/CuidaSecondary.ttf` | changed | `8b9c800ef9b4` | `b589eb1b49a9` |
| `packages/iconifyx_dashicons/assets/fonts/Dashicons.ttf` | changed | `23e44bd6500c` | `36ec1eb4008b` |
| `packages/iconifyx_devicon_plain/assets/fonts/DeviconPlain.ttf` | changed | `38e3c81bf0bf` | `efe99208f405` |
| `packages/iconifyx_devicon_plain/assets/fonts/DeviconPlainSecondary.ttf` | changed | `0bcc362c5cde` | `d3522877f911` |
| `packages/iconifyx_devicon/assets/fonts/Devicon.ttf` | changed | `8741c8b42e5b` | `9cd7ea6ece28` |
| `packages/iconifyx_devicon/assets/fonts/DeviconSecondary.ttf` | changed | `0cf497155f6d` | `a154f7b95ac5` |
| `packages/iconifyx_dinkie_icons/assets/fonts/DinkieIcons.ttf` | changed | `7b0b1fa909e1` | `ac7fcb084e21` |
| `packages/iconifyx_duo_icons/assets/fonts/DuoIcons.ttf` | changed | `547b12c8a030` | `77abfa0d002c` |
| `packages/iconifyx_duo_icons/assets/fonts/DuoIconsSecondary.ttf` | changed | `6170de64d203` | `413e677b3cb7` |
| `packages/iconifyx_ei/assets/fonts/Ei.ttf` | changed | `20f9e7720faf` | `652f1bd07e81` |
| `packages/iconifyx_ei/assets/fonts/EiSecondary.ttf` | changed | `085defc80290` | `8a3a8ebfe09f` |
| `packages/iconifyx_el/assets/fonts/El.ttf` | changed | `bfb3f674ebb9` | `a676c147d4ed` |
| `packages/iconifyx_emojione_monotone/assets/fonts/EmojioneMonotone.ttf` | changed | `b39bd36d2bc8` | `37d369a35799` |
| `packages/iconifyx_emojione_v1/assets/fonts/EmojioneV1.ttf` | changed | `ed5aa17fcda7` | `609ca45798b3` |
| `packages/iconifyx_emojione_v1/assets/fonts/EmojioneV1Secondary.ttf` | changed | `521fd34aa5b9` | `07da69b100ed` |
| `packages/iconifyx_emojione/assets/fonts/Emojione.ttf` | changed | `a1b280fb408e` | `8ca640cca31c` |
| `packages/iconifyx_emojione/assets/fonts/EmojioneSecondary.ttf` | changed | `0fa5629114b4` | `8c4a83cbc6f5` |
| `packages/iconifyx_entypo_social/assets/fonts/EntypoSocial.ttf` | changed | `0f1988b57f6a` | `08bdad721d96` |
| `packages/iconifyx_entypo/assets/fonts/Entypo.ttf` | changed | `b058476774f2` | `070e1f312c3a` |
| `packages/iconifyx_eos_icons/assets/fonts/EosIcons.ttf` | changed | `e645eb5f802c` | `e1a375fc2645` |
| `packages/iconifyx_ep/assets/fonts/Ep.ttf` | changed | `4b47f52edb3c` | `a571779162a0` |
| `packages/iconifyx_et/assets/fonts/Et.ttf` | changed | `3cef21b8fcba` | `dc65fee5a0bb` |
| `packages/iconifyx_eva/assets/fonts/Eva.ttf` | changed | `b4dcecd3edab` | `6cb231cd7ce8` |
| `packages/iconifyx_f7/assets/fonts/F7.ttf` | changed | `459f5832d723` | `8818f5538fbc` |
| `packages/iconifyx_fa_brands/assets/fonts/FaBrands.ttf` | changed | `2744b20ed70e` | `dd0251a6193d` |
| `packages/iconifyx_fa_regular/assets/fonts/FaRegular.ttf` | changed | `34c6797b681e` | `9ca841eaa781` |
| `packages/iconifyx_fa_solid/assets/fonts/FaSolid.ttf` | changed | `e53d36e66fe7` | `f29e13df21d6` |
| `packages/iconifyx_fa/assets/fonts/Fa.ttf` | changed | `51ac4d17d0ee` | `2f645ef2d50a` |
| `packages/iconifyx_fa6_brands/assets/fonts/Fa6Brands.ttf` | changed | `65178a6a9e54` | `d0d9880563ee` |
| `packages/iconifyx_fa6_regular/assets/fonts/Fa6Regular.ttf` | changed | `00e38220e4f9` | `4bda94979be1` |
| `packages/iconifyx_fa6_solid/assets/fonts/Fa6Solid.ttf` | changed | `45ed5b98d80b` | `2910901e1872` |
| `packages/iconifyx_fa7_brands/assets/fonts/Fa7Brands.ttf` | changed | `2a2ca54592a7` | `57ae33a00dc4` |
| `packages/iconifyx_fa7_regular/assets/fonts/Fa7Regular.ttf` | changed | `4f42a45bd792` | `c7cc97a84621` |
| `packages/iconifyx_fa7_solid/assets/fonts/Fa7Solid.ttf` | changed | `e04bad8880f4` | `dcc43d28b882` |
| `packages/iconifyx_fad/assets/fonts/Fad.ttf` | changed | `f1e68d50c01a` | `748f8a67b888` |
| `packages/iconifyx_famicons/assets/fonts/Famicons.ttf` | changed | `b56890c854e3` | `c790b91b7f23` |
| `packages/iconifyx_fe/assets/fonts/Fe.ttf` | changed | `082347499e9a` | `63bbc5ff1cb6` |
| `packages/iconifyx_feather/assets/fonts/Feather.ttf` | changed | `0554f2ee15b3` | `a978e6b03814` |
| `packages/iconifyx_file_icons/assets/fonts/FileIcons.ttf` | changed | `0b3a8a992773` | `869ff4045b43` |
| `packages/iconifyx_flag/assets/fonts/Flag.ttf` | changed | `7956417afeca` | `f02c6deac7f4` |
| `packages/iconifyx_flag/assets/fonts/FlagSecondary.ttf` | changed | `d06c99fa32c4` | `1a3dbffee0b0` |
| `packages/iconifyx_flagpack/assets/fonts/Flagpack.ttf` | changed | `2889105d9e9b` | `b3128460f72c` |
| `packages/iconifyx_flagpack/assets/fonts/FlagpackSecondary.ttf` | changed | `44b463a794dc` | `28d6a1e03b05` |
| `packages/iconifyx_flat_color_icons/assets/fonts/FlatColorIcons.ttf` | changed | `56453a6f2bee` | `54a2aae0e75f` |
| `packages/iconifyx_flat_color_icons/assets/fonts/FlatColorIconsSecondary.ttf` | changed | `34dd2d12e364` | `54d7ad42c48d` |
| `packages/iconifyx_flat_ui/assets/fonts/FlatUi.ttf` | changed | `f3715712d609` | `6310b7b8fc63` |
| `packages/iconifyx_flat_ui/assets/fonts/FlatUiSecondary.ttf` | changed | `a8021a724853` | `7fbd15f9f07c` |
| `packages/iconifyx_flowbite/assets/fonts/Flowbite.ttf` | changed | `1ae5a7fca5dd` | `2c2938d6bc85` |
| `packages/iconifyx_fluent_color/assets/fonts/FluentColor.ttf` | changed | `5d71ee6f83b8` | `9d38b7cd2dc1` |
| `packages/iconifyx_fluent_emoji_flat/assets/fonts/FluentEmojiFlat.ttf` | changed | `2e1f6ee91735` | `8525f29a0197` |
| `packages/iconifyx_fluent_emoji_flat/assets/fonts/FluentEmojiFlatSecondary.ttf` | changed | `1773c8fc963d` | `3d34a84749da` |
| `packages/iconifyx_fluent_emoji_high_contrast/assets/fonts/FluentEmojiHighContrast.ttf` | changed | `b9e854ea3f0b` | `e3fd1656f847` |
| `packages/iconifyx_fluent_emoji/assets/fonts/FluentEmoji.ttf` | changed | `02c618ca4e2c` | `71b6f1e6134f` |
| `packages/iconifyx_fluent_emoji/assets/fonts/FluentEmojiSecondary.ttf` | changed | `96a84f2efdd2` | `391130094209` |
| `packages/iconifyx_fluent_mdl2/assets/fonts/FluentMdl2.ttf` | changed | `e67151757d2d` | `92d116f45ef2` |
| `packages/iconifyx_fluent/assets/fonts/Fluent.ttf` | changed | `7d0540d82448` | `cb43be482852` |
| `packages/iconifyx_fontelico/assets/fonts/Fontelico.ttf` | changed | `6813f2db2837` | `b7036a72f2b0` |
| `packages/iconifyx_fontisto/assets/fonts/Fontisto.ttf` | changed | `9cb994a73827` | `bc556345afb0` |
| `packages/iconifyx_formkit/assets/fonts/Formkit.ttf` | changed | `1452fe45d771` | `87544e29565d` |
| `packages/iconifyx_foundation/assets/fonts/Foundation.ttf` | changed | `8bedc9a1148c` | `723c5eaa5aa8` |

…196 more — see `tools/generator/.cache/sha_baseline.json` for full hashes.

### Generated Dart (34)

| Path | Status | Baseline | Current |
|---|---|---|---|
| `packages/iconifyx_circle_flags/lib/src/sets/circle_flags.dart` | changed | `4df73e6ecd5c` | `ab837568ab07` |
| `packages/iconifyx_codicon/lib/src/sets/codicon.dart` | changed | `52aa4cfc99c5` | `a2807b0cfc75` |
| `packages/iconifyx_cryptocurrency_color/lib/src/sets/cryptocurrency_color.dart` | changed | `dffa92565a8e` | `b16cf93f20fb` |
| `packages/iconifyx_devicon_plain/lib/src/sets/devicon_plain.dart` | changed | `8e86db18c2d5` | `606833f740e5` |
| `packages/iconifyx_devicon/lib/src/sets/devicon.dart` | changed | `800c0739b46d` | `9d4b5af8cbca` |
| `packages/iconifyx_emojione_v1/lib/src/sets/emojione_v1.dart` | changed | `060eb11f1e7f` | `5069f4555275` |
| `packages/iconifyx_eos_icons/lib/src/sets/eos_icons.dart` | changed | `36e379358ea4` | `93a53916c27c` |
| `packages/iconifyx_flag/lib/src/sets/flag.dart` | changed | `091aaf9e322f` | `f9d63f3d4650` |
| `packages/iconifyx_flagpack/lib/src/sets/flagpack.dart` | changed | `cf3563501451` | `e4e8d532e74a` |
| `packages/iconifyx_flat_ui/lib/src/sets/flat_ui.dart` | changed | `d4f59e047d64` | `ccfda2d5e26e` |
| `packages/iconifyx_flowbite/lib/src/sets/flowbite.dart` | changed | `99c28772f453` | `c12a4c319d39` |
| `packages/iconifyx_fluent_emoji/lib/src/sets/fluent_emoji.dart` | changed | `a62d686c1a98` | `3b0b5ad744da` |
| `packages/iconifyx_gcp/lib/src/sets/gcp.dart` | changed | `97f66a9d2d48` | `b3f151549d20` |
| `packages/iconifyx_glyphs_poly/lib/src/sets/glyphs_poly.dart` | changed | `515dd87a4d8e` | `148be7fd4d21` |
| `packages/iconifyx_glyphs/lib/src/sets/glyphs.dart` | changed | `c643447502c1` | `bb18987b0f6c` |
| `packages/iconifyx_icon_park_outline/lib/src/sets/icon_park_outline.dart` | changed | `d86b1074b0ee` | `6475b520a20f` |
| `packages/iconifyx_icon_park/lib/src/sets/icon_park.dart` | changed | `b108c1856e5e` | `322c58a97aec` |
| `packages/iconifyx_logos/lib/src/sets/logos.dart` | changed | `bbf004084035` | `0d4f8e8916a6` |
| `packages/iconifyx_material_icon_theme/lib/src/sets/material_icon_theme.dart` | changed | `c128a0062cc2` | `241537e88a3a` |
| `packages/iconifyx_meteocons/lib/src/sets/meteocons.dart` | changed | `c8868ebd9c90` | `56663f81227c` |
| `packages/iconifyx_noto_v1/lib/src/sets/noto_v1.dart` | changed | `c067c0021675` | `3f43c14b3be8` |
| `packages/iconifyx_openmoji/lib/src/sets/openmoji.dart` | changed | `9f7f61eebbf7` | `96b881724d37` |
| `packages/iconifyx_oui/lib/src/sets/oui.dart` | changed | `b01bb94158a3` | `89b60cca1a61` |
| `packages/iconifyx_qlementine_icons/lib/src/sets/qlementine_icons.dart` | changed | `9e6178ca9e4d` | `26ba3dba2586` |
| `packages/iconifyx_radix_icons/lib/src/sets/radix_icons.dart` | changed | `e4648fbd953e` | `6a13d4df5460` |
| `packages/iconifyx_skill_icons/lib/src/sets/skill_icons.dart` | changed | `61368e50e981` | `b913e914c482` |
| `packages/iconifyx_streamline_color/lib/src/sets/streamline_color.dart` | changed | `81f38b1393a9` | `99bf1b02a30b` |
| `packages/iconifyx_streamline_cyber_color/lib/src/sets/streamline_cyber_color.dart` | changed | `13ee249fbbe8` | `a37774e2d2fa` |
| `packages/iconifyx_streamline_plump_color/lib/src/sets/streamline_plump_color.dart` | changed | `0839663209a9` | `a48c0dca8fe4` |
| `packages/iconifyx_streamline_ultimate_color/lib/src/sets/streamline_ultimate_color.dart` | changed | `4834fdf480ba` | `72f64be70423` |
| `packages/iconifyx_svg_spinners/lib/src/sets/svg_spinners.dart` | changed | `65e40b957644` | `73a6c28935cc` |
| `packages/iconifyx_token_branded/lib/src/sets/token_branded.dart` | changed | `037799b90f20` | `e071c30725e2` |
| `packages/iconifyx_twemoji/lib/src/sets/twemoji.dart` | changed | `7b485bd6fabe` | `148ca958e9c7` |
| `packages/iconifyx_vscode_icons/lib/src/sets/vscode_icons.dart` | changed | `e0dfc13b3e3d` | `dbb6e2f2b943` |

### Manifests (225)

| Path | Status | Baseline | Current |
|---|---|---|---|
| `tools/generator/manifests/academicons.json` | changed | `be4c53eaf038` | `f03ec499f56f` |
| `tools/generator/manifests/akar-icons.json` | changed | `2142d769621a` | `0ade6fb2f7a9` |
| `tools/generator/manifests/ant-design.json` | changed | `128ffd399409` | `307da8718178` |
| `tools/generator/manifests/arcticons.json` | changed | `ff4f5fa0653b` | `dfc6c9ff0d3c` |
| `tools/generator/manifests/basil.json` | changed | `8c65c1862fce` | `2e3d4477e20f` |
| `tools/generator/manifests/bi.json` | changed | `cd02e014f893` | `8f77c0cb21e5` |
| `tools/generator/manifests/bitcoin-icons.json` | changed | `b9630723bb2d` | `9a2b4bed18c8` |
| `tools/generator/manifests/boxicons.json` | changed | `8d4f9c96b406` | `ab4af89ab674` |
| `tools/generator/manifests/bpmn.json` | changed | `97234b4893bb` | `f94898c1a043` |
| `tools/generator/manifests/brandico.json` | changed | `b0951c714676` | `7fef833b29a5` |
| `tools/generator/manifests/bx.json` | changed | `81819e990c9f` | `9b36ebcec0a2` |
| `tools/generator/manifests/bxl.json` | changed | `c799a3a711a1` | `137b730e00cd` |
| `tools/generator/manifests/bxs.json` | changed | `2097bb507817` | `8ea85b0492bc` |
| `tools/generator/manifests/bytesize.json` | changed | `cca6ccd02689` | `894dc4cc9065` |
| `tools/generator/manifests/carbon.json` | changed | `68d20a40fd0a` | `23c3e6d6b9a7` |
| `tools/generator/manifests/catppuccin.json` | changed | `68a8251a9905` | `5082fe24c813` |
| `tools/generator/manifests/cbi.json` | changed | `41a5b521483a` | `d73dc92e5670` |
| `tools/generator/manifests/charm.json` | changed | `2d78b27fb32f` | `63b9e0ab58f0` |
| `tools/generator/manifests/ci.json` | changed | `8b0f8c1cfb3d` | `a49c9391ec6e` |
| `tools/generator/manifests/cib.json` | changed | `46dbeb990353` | `2a0c04cf16bb` |
| `tools/generator/manifests/cif.json` | changed | `4f90a8f4526c` | `ec8c26f6b833` |
| `tools/generator/manifests/cil.json` | changed | `8b7c3dfe7211` | `c0b42d340489` |
| `tools/generator/manifests/circle-flags.json` | changed | `811358c9c68b` | `5b97f7d3a59d` |
| `tools/generator/manifests/circum.json` | changed | `c78bc054bd5b` | `ae5c13c50487` |
| `tools/generator/manifests/clarity.json` | changed | `4a5520c2c0f4` | `59325d1112bc` |
| `tools/generator/manifests/codex.json` | changed | `e659bd70255c` | `c445fe32c394` |
| `tools/generator/manifests/codicon.json` | changed | `57c1d4ca36fa` | `0634d26d30fd` |
| `tools/generator/manifests/covid.json` | changed | `8ba85652a8fb` | `7935577777b6` |
| `tools/generator/manifests/cryptocurrency-color.json` | changed | `6295267707da` | `90fd40cc5ee1` |
| `tools/generator/manifests/cryptocurrency.json` | changed | `99c1617b3281` | `5cf08f85319b` |
| `tools/generator/manifests/cuida.json` | changed | `35f56d3b431c` | `c624594eafce` |
| `tools/generator/manifests/dashicons.json` | changed | `7725f0d9b440` | `915a723e7f00` |
| `tools/generator/manifests/devicon-plain.json` | changed | `bb2b5874ce7f` | `ee27baf9a9f0` |
| `tools/generator/manifests/devicon.json` | changed | `5673a6864572` | `5a950810503d` |
| `tools/generator/manifests/dinkie-icons.json` | changed | `4614e9e64f72` | `c20cf72a0dcb` |
| `tools/generator/manifests/duo-icons.json` | changed | `d3ae6642d7f6` | `1d58905662c3` |
| `tools/generator/manifests/ei.json` | changed | `f8bba3ffdf3d` | `7a6388627cad` |
| `tools/generator/manifests/el.json` | changed | `8f01e311abb6` | `992f824767e3` |
| `tools/generator/manifests/emojione-monotone.json` | changed | `809666948132` | `a46fcd9c30d4` |
| `tools/generator/manifests/emojione-v1.json` | changed | `0fddab24bb38` | `f568337ba7a7` |
| `tools/generator/manifests/emojione.json` | changed | `9de053ed9eab` | `18db6f9daa93` |
| `tools/generator/manifests/entypo-social.json` | changed | `bd7bf33dde04` | `9cc1c3260b8f` |
| `tools/generator/manifests/entypo.json` | changed | `413c53b8da20` | `bee8ea58b0d6` |
| `tools/generator/manifests/eos-icons.json` | changed | `e5688da5f54f` | `95bec2452c10` |
| `tools/generator/manifests/ep.json` | changed | `d089a0d82e81` | `97747a0bf74d` |
| `tools/generator/manifests/et.json` | changed | `c46241a56c00` | `757e3919e0c0` |
| `tools/generator/manifests/eva.json` | changed | `a415c4d97c97` | `ddebcac57f6a` |
| `tools/generator/manifests/f7.json` | changed | `9a2f7d9dd41f` | `cbd0c0f92bb0` |
| `tools/generator/manifests/fa-brands.json` | changed | `8a48366650e5` | `65efad2a857a` |
| `tools/generator/manifests/fa-regular.json` | changed | `7b95415517a4` | `8a851a45c03b` |
| `tools/generator/manifests/fa-solid.json` | changed | `864975a991be` | `b0bb377a4159` |
| `tools/generator/manifests/fa.json` | changed | `916bd41c53fa` | `0cc9ce5b5e0c` |
| `tools/generator/manifests/fa6-brands.json` | changed | `85be9e7337d7` | `47cbaf85ec0e` |
| `tools/generator/manifests/fa6-regular.json` | changed | `b1f0ae398b40` | `c29996ed52ff` |
| `tools/generator/manifests/fa6-solid.json` | changed | `2480f0658834` | `7c73d35e1b6f` |
| `tools/generator/manifests/fa7-brands.json` | changed | `27715db0fa10` | `0d5578a3a488` |
| `tools/generator/manifests/fa7-regular.json` | changed | `ba6ee7f0b1b8` | `02c361014115` |
| `tools/generator/manifests/fa7-solid.json` | changed | `b396e53e6609` | `1af278fd3be0` |
| `tools/generator/manifests/fad.json` | changed | `eaeed85b25f7` | `15775cdee772` |
| `tools/generator/manifests/famicons.json` | changed | `42aa3b6bf68b` | `1547b31813bf` |
| `tools/generator/manifests/fe.json` | changed | `c26de2cd7848` | `a434bcfc2762` |
| `tools/generator/manifests/feather.json` | changed | `9d2f847a3c76` | `b63cdb331ac6` |
| `tools/generator/manifests/file-icons.json` | changed | `16faa97fdf79` | `c4ed898ac047` |
| `tools/generator/manifests/flag.json` | changed | `178bf42afffb` | `0038d648f42b` |
| `tools/generator/manifests/flagpack.json` | changed | `499509e1aa54` | `ccd740f69476` |
| `tools/generator/manifests/flat-color-icons.json` | changed | `0d3e9b63c9a0` | `059695ca3c60` |
| `tools/generator/manifests/flat-ui.json` | changed | `fced8dca8e4a` | `7f265abb3548` |
| `tools/generator/manifests/flowbite.json` | changed | `5b19e7f919c7` | `75551d8a9e18` |
| `tools/generator/manifests/fluent-color.json` | changed | `2fd9c7ab5306` | `f1811f12a1c2` |
| `tools/generator/manifests/fluent-emoji-flat.json` | changed | `1fbb994ceb4b` | `4606d8547e38` |
| `tools/generator/manifests/fluent-emoji-high-contrast.json` | changed | `2e2d5301bf50` | `ad6f2804c169` |
| `tools/generator/manifests/fluent-emoji.json` | changed | `cab101b272f0` | `486d8a6ac38c` |
| `tools/generator/manifests/fluent-mdl2.json` | changed | `dee9af0a62ff` | `ff1e99776eb1` |
| `tools/generator/manifests/fluent.json` | changed | `bf133d83b22e` | `0d8ce864c5ac` |
| `tools/generator/manifests/fontelico.json` | changed | `af0e81d927f0` | `a7219175ecaf` |
| `tools/generator/manifests/fontisto.json` | changed | `69cd14921c72` | `bcf6f0905e6e` |
| `tools/generator/manifests/formkit.json` | changed | `6778390b004c` | `15d3fbc38ec2` |
| `tools/generator/manifests/foundation.json` | changed | `081075f69b57` | `a7e3dd162e02` |
| `tools/generator/manifests/fxemoji.json` | changed | `35d6578df456` | `f43e889ecff7` |
| `tools/generator/manifests/gala.json` | changed | `7674d88d26ac` | `47734d725383` |
| `tools/generator/manifests/game-icons.json` | changed | `65775332ea07` | `db65cde4ade9` |
| `tools/generator/manifests/garden.json` | changed | `4ff7ba3e6a10` | `be2507c29170` |
| `tools/generator/manifests/gcp.json` | changed | `36e6cd26eeaa` | `9c89cf583b1d` |
| `tools/generator/manifests/geo.json` | changed | `098bff541bbf` | `4b073cf03090` |
| `tools/generator/manifests/gg.json` | changed | `b5353bcd866b` | `e9eab1e3f5d5` |
| `tools/generator/manifests/gis.json` | changed | `c5cbbe00928b` | `5078750320e3` |
| `tools/generator/manifests/glyphs-poly.json` | changed | `689d3816adc9` | `4fd0345f9eae` |
| `tools/generator/manifests/glyphs.json` | changed | `13bb3924e708` | `ad2cbccab721` |
| `tools/generator/manifests/gravity-ui.json` | changed | `f61952e4fd30` | `d48d6680c94d` |
| `tools/generator/manifests/gridicons.json` | changed | `b5f4b7ed0040` | `e00496d9ca05` |
| `tools/generator/manifests/grommet-icons.json` | changed | `c5a538c8487f` | `212d21cc1f6e` |
| `tools/generator/manifests/guidance.json` | changed | `056b7300ce76` | `e8f85528e73f` |
| `tools/generator/manifests/healthicons.json` | changed | `3ab5ffe4ab21` | `a9777b6d7281` |
| `tools/generator/manifests/heroicons-outline.json` | changed | `2e982cc49ca4` | `4f2f37341bda` |
| `tools/generator/manifests/heroicons-solid.json` | changed | `10211bd2fa87` | `900339b9ae50` |
| `tools/generator/manifests/heroicons.json` | changed | `53a80b3bcc8f` | `f8f4c84ddd91` |
| `tools/generator/manifests/hugeicons.json` | changed | `99778196cdc8` | `ca96e5cb1f30` |
| `tools/generator/manifests/humbleicons.json` | changed | `6e301bc1264d` | `d9350b6930ad` |
| `tools/generator/manifests/ic.json` | changed | `e421f8df57da` | `c15d0e82f052` |
| `tools/generator/manifests/icomoon-free.json` | changed | `9cbe813a0213` | `882613881c2b` |

…125 more — see `tools/generator/.cache/sha_baseline.json` for full hashes.


## Empirical regen-twice check

- Scope: smoke subset **`fontelico`** (use `--full` for the full corpus regen-twice).

**FAIL** — 1 files drifted between two consecutive regens. This is a real non-determinism bug; investigate `svg2ttf({ ts: 0 })`, Python venv ordering, or any newly introduced timestamp/UUID in the codegen path.

### TTF drift (1)

| Path | Status | Baseline | Current |
|---|---|---|---|
| `packages/iconifyx_fontelico/assets/fonts/Fontelico.ttf` | changed | `8a7961882e29` | `b7036a72f2b0` |


## How this audit works

- **Snapshot:** SHA256 every committed generated artefact under `packages/iconifyx_*/assets/fonts/*.ttf`, `packages/iconifyx_*/lib/src/sets/*.dart`, and `tools/generator/manifests/*.json`.
- **Baseline:** `docs/audit/sha_baseline.json` (committed). Comparing HEAD against it shows what drifted since the baseline was taken.
- **Empirical (`--regen-twice`):** snapshot, run `bun run generate`, snapshot again, diff. Catches non-determinism that an offline diff can't see.
- **Promote (`--update-baseline`):** writes the current snapshot into `docs/audit/sha_baseline.json`. Use after a deliberate regen on a green pipeline.
