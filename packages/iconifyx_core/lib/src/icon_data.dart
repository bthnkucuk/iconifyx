import 'package:flutter/widgets.dart';

/// Type-safe wrapper around [IconData] for Iconify icons.
///
/// Defined as a Dart 3.3+ `extension type const`. Extension types are
/// zero-cost at runtime: the compiler erases the wrapper and only the
/// underlying `const IconData(...)` remains in the kernel, so Flutter's
/// `--tree-shake-icons` build flag can still detect every icon reference
/// and subset the font accordingly.
///
/// Use it as:
///
/// ```dart
/// Icon(MdiIcons.home.data, size: 24);
/// ```
extension type const IconifyIconData(IconData data) {
  int get codePoint => data.codePoint;
  String? get fontFamily => data.fontFamily;
  String? get fontPackage => data.fontPackage;
  bool get matchTextDirection => data.matchTextDirection;
}
