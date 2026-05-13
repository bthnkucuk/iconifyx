// Tree-shake verification harness.
//
// Uses 3 Lucide icons + 5 Phosphor icons and nothing else. Build with
// `--tree-shake-icons` (default in release mode); after build, list the
// bundled TTF files under `build/macos/.../flutter_assets/packages/iconifyx_*/`
// and confirm each TTF is either:
//   - subset to ~hundreds of bytes (only the referenced glyphs), or
//   - missing entirely (no icon in that font's range is referenced).

import 'package:flutter/material.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_ph/iconifyx_ph.dart';

void main() => runApp(const TwoIconApp());

class TwoIconApp extends StatelessWidget {
  const TwoIconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('3 Lucide + 5 Phosphor tree-shake test')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Lucide (3 icons)'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(LucideIcons.house.data, size: 48),
                  Icon(LucideIcons.search.data, size: 48),
                  Icon(LucideIcons.heart.data, size: 48),
                ],
              ),
              const SizedBox(height: 32),
              const Text('Phosphor (5 icons)'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(PhIcons.house.data, size: 48),
                  Icon(PhIcons.heart.data, size: 48),
                  Icon(PhIcons.user.data, size: 48),
                  Icon(PhIcons.gear.data, size: 48),
                  Icon(PhIcons.shoppingCart.data, size: 48),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
