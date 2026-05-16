/// iconifyx — category-meta export for "Flags / Maps".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Flags / Maps". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (7): iconifyx_cif, iconifyx_circle_flags, iconifyx_flag, iconifyx_flagpack, iconifyx_geo, iconifyx_gis, iconifyx_map.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_cif/iconifyx_cif.dart';
export 'package:iconifyx_circle_flags/iconifyx_circle_flags.dart';
export 'package:iconifyx_flag/iconifyx_flag.dart';
export 'package:iconifyx_flagpack/iconifyx_flagpack.dart';
export 'package:iconifyx_geo/iconifyx_geo.dart';
export 'package:iconifyx_gis/iconifyx_gis.dart';
export 'package:iconifyx_map/iconifyx_map.dart';
