import 'package:flutter/foundation.dart';

/// Metadata describing the license and authorship of an Iconify icon set.
///
/// Each generated `iconifyx_*` per-set package exposes an `iconSetLicense`
/// const of this type so applications can programmatically display
/// attributions.
@immutable
class IconSetLicense {
  final String prefix;
  final String name;
  final String? author;
  final String? authorUrl;
  final String licenseTitle;
  final String? licenseSpdx;
  final String? licenseUrl;
  final String? sourceUrl;
  final int iconCount;

  const IconSetLicense({
    required this.prefix,
    required this.name,
    this.author,
    this.authorUrl,
    required this.licenseTitle,
    this.licenseSpdx,
    this.licenseUrl,
    this.sourceUrl,
    required this.iconCount,
  });
}
