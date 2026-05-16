/// iconifyx — category-meta export for "Programming".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Programming". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (10): iconifyx_catppuccin, iconifyx_codicon, iconifyx_devicon, iconifyx_devicon_plain, iconifyx_file_icons, iconifyx_gcp, iconifyx_material_icon_theme, iconifyx_skill_icons, iconifyx_unjs, iconifyx_vscode_icons.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_catppuccin/iconifyx_catppuccin.dart';
export 'package:iconifyx_codicon/iconifyx_codicon.dart';
export 'package:iconifyx_devicon/iconifyx_devicon.dart';
export 'package:iconifyx_devicon_plain/iconifyx_devicon_plain.dart';
export 'package:iconifyx_file_icons/iconifyx_file_icons.dart';
export 'package:iconifyx_gcp/iconifyx_gcp.dart';
export 'package:iconifyx_material_icon_theme/iconifyx_material_icon_theme.dart';
export 'package:iconifyx_skill_icons/iconifyx_skill_icons.dart';
export 'package:iconifyx_unjs/iconifyx_unjs.dart';
export 'package:iconifyx_vscode_icons/iconifyx_vscode_icons.dart';
