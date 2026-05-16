/// iconifyx — category-meta export for "Emoji".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Emoji". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (11): iconifyx_emojione, iconifyx_emojione_monotone, iconifyx_emojione_v1, iconifyx_fluent_emoji_flat, iconifyx_fluent_emoji_high_contrast, iconifyx_fxemoji, iconifyx_noto, iconifyx_noto_v1, iconifyx_openmoji, iconifyx_streamline_emojis, iconifyx_twemoji.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_emojione/iconifyx_emojione.dart';
export 'package:iconifyx_emojione_monotone/iconifyx_emojione_monotone.dart';
export 'package:iconifyx_emojione_v1/iconifyx_emojione_v1.dart';
export 'package:iconifyx_fluent_emoji_flat/iconifyx_fluent_emoji_flat.dart';
export 'package:iconifyx_fluent_emoji_high_contrast/iconifyx_fluent_emoji_high_contrast.dart';
export 'package:iconifyx_fxemoji/iconifyx_fxemoji.dart';
export 'package:iconifyx_noto/iconifyx_noto.dart';
export 'package:iconifyx_noto_v1/iconifyx_noto_v1.dart';
export 'package:iconifyx_openmoji/iconifyx_openmoji.dart';
export 'package:iconifyx_streamline_emojis/iconifyx_streamline_emojis.dart';
export 'package:iconifyx_twemoji/iconifyx_twemoji.dart';
