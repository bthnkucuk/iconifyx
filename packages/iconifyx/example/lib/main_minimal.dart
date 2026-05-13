// Minimal entry point that references a single icon. Built with
// `--tree-shake-icons`, the font containing MdiIcons.home should shrink to
// a few hundred bytes; the other mdi split fonts retain source size because
// no icons in them are referenced.
//
// For the cleaner bundle-size verification (single-icon-package isolation),
// see test_apps/two_icon_test/ at the repo root.

import 'package:flutter/material.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';

void main() => runApp(const _MinimalApp());

class _MinimalApp extends StatelessWidget {
  const _MinimalApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Icon(MdiIcons.home.data, size: 64),
        ),
      ),
    );
  }
}
