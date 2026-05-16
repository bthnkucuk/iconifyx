/// iconifyx — category-meta export for "Logos".
///
/// Re-exports every per-set package whose Iconify `info.category` is
/// "Logos". Importing this single library pulls in every member
/// pack's icons (and font assets) at once.
///
/// For minimum bundle size, depend on just the specific
/// `iconifyx_<prefix>` packages your app actually uses. This meta
/// package is a convenience for consumers who want the whole category.
///
/// Members (15): iconifyx_arcticons, iconifyx_brandico, iconifyx_bxl, iconifyx_cbi, iconifyx_cib, iconifyx_cryptocurrency, iconifyx_cryptocurrency_color, iconifyx_entypo_social, iconifyx_fa7_brands, iconifyx_logos, iconifyx_nonicons, iconifyx_simple_icons, iconifyx_streamline_logos, iconifyx_token, iconifyx_token_branded.
library;

export 'package:iconifyx_core/iconifyx_core.dart';

export 'package:iconifyx_arcticons/iconifyx_arcticons.dart';
export 'package:iconifyx_brandico/iconifyx_brandico.dart';
export 'package:iconifyx_bxl/iconifyx_bxl.dart';
export 'package:iconifyx_cbi/iconifyx_cbi.dart';
export 'package:iconifyx_cib/iconifyx_cib.dart';
export 'package:iconifyx_cryptocurrency/iconifyx_cryptocurrency.dart';
export 'package:iconifyx_cryptocurrency_color/iconifyx_cryptocurrency_color.dart';
export 'package:iconifyx_entypo_social/iconifyx_entypo_social.dart';
export 'package:iconifyx_fa7_brands/iconifyx_fa7_brands.dart';
export 'package:iconifyx_logos/iconifyx_logos.dart';
export 'package:iconifyx_nonicons/iconifyx_nonicons.dart';
export 'package:iconifyx_simple_icons/iconifyx_simple_icons.dart';
export 'package:iconifyx_streamline_logos/iconifyx_streamline_logos.dart';
export 'package:iconifyx_token/iconifyx_token.dart';
export 'package:iconifyx_token_branded/iconifyx_token_branded.dart';
