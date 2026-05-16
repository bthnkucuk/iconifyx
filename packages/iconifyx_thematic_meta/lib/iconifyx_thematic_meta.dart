/// iconifyx — category-meta export for "Thematic".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Thematic". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (8): iconifyx_academicons, iconifyx_covid, iconifyx_fad, iconifyx_game_icons, iconifyx_healthicons, iconifyx_medical_icon, iconifyx_meteocons, iconifyx_wi.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_academicons/iconifyx_academicons.dart';
export 'package:iconifyx_covid/iconifyx_covid.dart';
export 'package:iconifyx_fad/iconifyx_fad.dart';
export 'package:iconifyx_game_icons/iconifyx_game_icons.dart';
export 'package:iconifyx_healthicons/iconifyx_healthicons.dart';
export 'package:iconifyx_medical_icon/iconifyx_medical_icon.dart';
export 'package:iconifyx_meteocons/iconifyx_meteocons.dart';
export 'package:iconifyx_wi/iconifyx_wi.dart';
