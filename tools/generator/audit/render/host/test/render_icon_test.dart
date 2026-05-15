// IconData below is constructed from runtime values supplied via env
// vars — same approach the website takes when reconstructing
// `IconifyIconData` from `icons_index.json`. Tree-shake-icons doesn't
// apply to a test isolate, so the const-arg requirement is moot.
// ignore_for_file: non_const_argument_for_const_parameter

// Programmatic icon render harness.
//
// Driven by environment variables (set from the Bun CLI in
// `render-icon.ts`). Builds an `IconifyIconData` at runtime — bypassing
// the per-pack const lookup so we don't have to import all 225 set
// packages — and rasterizes it to a PNG via `RepaintBoundary.toImage`
// inside a headless `flutter_test` isolate.
//
// Why `flutter_test` and not a real app: the test isolate has full Skia +
// font loading, but does NOT require a display server, screen capture
// permission, or accessibility entitlements. Fonts declared in the
// per-set packages' pubspecs auto-load via `AssetManifest` exactly as
// they would in a normal Flutter run.
//
// Env vars (all required unless noted; ints in decimal, hex prefixed with
// 0x; bool as 'true'/'false'):
//
//   ICON_PRIMARY_CP        primary codepoint
//   ICON_PRIMARY_FAMILY    primary font family (e.g. "Solar")
//   ICON_PRIMARY_PACKAGE   primary font package (e.g. "iconifyx_solar")
//   ICON_SECONDARY_CP      secondary codepoint (optional; only when duotone)
//   ICON_SECONDARY_FAMILY  secondary font family (optional)
//   ICON_KIND              0 solo | 1 hint | 2 paintOrder | 3 maskInternal
//   RENDER_MODE            duotone | primary-only | secondary-only
//   RENDER_SIZE            int (logical px, the icon's box size)
//   RENDER_COLOR           int (0xAARRGGBB), color of primary glyph
//   RENDER_BG              int (0xAARRGGBB), background fill colour
//   RENDER_SECONDARY_COLOR int (0xAARRGGBB) override (optional)
//   RENDER_PIXEL_RATIO     double (default 2.0)
//   RENDER_OUT             absolute path to write the PNG

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

int _envInt(String key) {
  final raw = Platform.environment[key];
  if (raw == null || raw.isEmpty) {
    throw StateError('missing env var: $key');
  }
  return _parseInt(raw, key);
}

int? _envIntOpt(String key) {
  final raw = Platform.environment[key];
  if (raw == null || raw.isEmpty) return null;
  return _parseInt(raw, key);
}

String _envStr(String key) {
  final raw = Platform.environment[key];
  if (raw == null || raw.isEmpty) {
    throw StateError('missing env var: $key');
  }
  return raw;
}

String? _envStrOpt(String key) {
  final raw = Platform.environment[key];
  if (raw == null || raw.isEmpty) return null;
  return raw;
}

double _envDouble(String key, double fallback) {
  final raw = Platform.environment[key];
  if (raw == null || raw.isEmpty) return fallback;
  return double.parse(raw);
}

int _parseInt(String raw, String key) {
  if (raw.startsWith('0x') || raw.startsWith('0X')) {
    return int.parse(raw.substring(2), radix: 16);
  }
  return int.parse(raw);
}

void main() {
  // No goldens — we render directly. Use `flutter_test` only for its font
  // bootstrap + Skia binding.
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('render-icon-harness', (tester) async {
    final primaryCp = _envInt('ICON_PRIMARY_CP');
    final primaryFamily = _envStr('ICON_PRIMARY_FAMILY');
    final primaryPackage = _envStr('ICON_PRIMARY_PACKAGE');
    final secondaryCp = _envIntOpt('ICON_SECONDARY_CP');
    final secondaryFamily = _envStrOpt('ICON_SECONDARY_FAMILY');
    final kindCode = _envIntOpt('ICON_KIND') ?? 0;

    final mode = _envStrOpt('RENDER_MODE') ?? 'duotone';
    final size = _envIntOpt('RENDER_SIZE') ?? 256;
    final colorArgb = _envIntOpt('RENDER_COLOR') ?? 0xFF000000;
    final bgArgb = _envIntOpt('RENDER_BG') ?? 0x00FFFFFF;
    final secondaryArgb = _envIntOpt('RENDER_SECONDARY_COLOR');
    final pixelRatio = _envDouble('RENDER_PIXEL_RATIO', 2.0);
    final outPath = _envStr('RENDER_OUT');

    // Reconstruct the IconData(s) — same approach as the website's
    // IconRecord.toIconifyData() (see CLAUDE.md §1).
    final primaryData = IconData(
      primaryCp,
      fontFamily: primaryFamily,
      fontPackage: primaryPackage,
    );
    IconData? secondaryData;
    if (secondaryCp != null && secondaryFamily != null) {
      secondaryData = IconData(
        secondaryCp,
        fontFamily: secondaryFamily,
        fontPackage: primaryPackage,
      );
    }

    final IconifyIconData iconifyData = secondaryData == null
        ? IconifyIconData.solo(primaryData)
        : IconifyIconData.duo(primaryData, secondaryData, kind: kindCode);

    final Widget body;
    final color = Color(colorArgb);
    final Color? secondaryColor =
        secondaryArgb == null ? null : Color(secondaryArgb);
    switch (mode) {
      case 'primary-only':
        body = Icon(primaryData, size: size.toDouble(), color: color);
        break;
      case 'secondary-only':
        if (secondaryData == null) {
          throw StateError('secondary-only mode requested but icon has no '
              'secondary layer');
        }
        body = Icon(secondaryData, size: size.toDouble(), color: color);
        break;
      case 'duotone':
      default:
        body = IconifyIcon(
          iconifyData,
          size: size.toDouble(),
          color: color,
          secondaryColor: secondaryColor,
        );
        break;
    }

    final repaintKey = GlobalKey();

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: ColoredBox(
          color: Color(bgArgb),
          child: RepaintBoundary(
            key: repaintKey,
            child: SizedBox(
              width: size.toDouble(),
              height: size.toDouble(),
              child: Center(child: body),
            ),
          ),
        ),
      ),
    );

    // Pump until idle so font load + glyph shape finish before snapshot.
    // `flutter_test` provides `loadFontsFromPubspec`-style auto-loading
    // via the asset bundle, but the first paint after a brand-new font
    // load occasionally falls back to a glyph-not-found square. Two
    // extra frames + a runAsync drain handles every observed case.
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();

    Uint8List? pngBytes;
    await tester.runAsync(() async {
      final RenderRepaintBoundary boundary = repaintKey.currentContext!
          .findRenderObject()! as RenderRepaintBoundary;
      final ui.Image image = await boundary.toImage(pixelRatio: pixelRatio);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      pngBytes = byteData!.buffer.asUint8List();
      image.dispose();
    });

    if (pngBytes == null) {
      throw StateError('render produced no PNG bytes');
    }

    final outFile = File(outPath);
    await outFile.parent.create(recursive: true);
    await outFile.writeAsBytes(pngBytes!, flush: true);
    // Surface success on stdout for the Bun CLI to pick up.
    // ignore: avoid_print
    print('RENDER_OK ${outFile.path} ${pngBytes!.length}');
  });
}
