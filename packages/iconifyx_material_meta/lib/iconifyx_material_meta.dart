/// iconifyx — category-meta export for "Material".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Material". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (6): iconifyx_ic, iconifyx_line_md, iconifyx_material_symbols, iconifyx_material_symbols_light, iconifyx_mdi, iconifyx_mdi_light.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_ic/iconifyx_ic.dart';
export 'package:iconifyx_line_md/iconifyx_line_md.dart';
export 'package:iconifyx_material_symbols/iconifyx_material_symbols.dart';
export 'package:iconifyx_material_symbols_light/iconifyx_material_symbols_light.dart';
export 'package:iconifyx_mdi/iconifyx_mdi.dart';
export 'package:iconifyx_mdi_light/iconifyx_mdi_light.dart';
