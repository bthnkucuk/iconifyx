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
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
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

/// Locate the iconifyx repo root by walking up from the test file's
/// directory until we find a `packages/iconifyx_core/` dir. Test cwd
/// can be anywhere — `flutter test` runs us in the host dir — so we
/// have to discover the repo root dynamically.
String _findRepoRoot() {
  var dir = Directory.current.absolute;
  for (var i = 0; i < 12; i++) {
    final candidate = Directory('${dir.path}/packages/iconifyx_core');
    if (candidate.existsSync()) return dir.path;
    final parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError(
    'could not locate repo root (no packages/iconifyx_core/ ancestor '
    'of ${Directory.current.path})',
  );
}

/// Load the TTF for `<package>/<family>` and register it under the
/// engine's package-prefixed lookup key (`packages/<package>/<family>`).
///
/// This matches Flutter's standard package-font resolution: when a
/// `TextStyle(fontFamily: 'Mdi', package: 'iconifyx_mdi')` paints, the
/// engine looks up the family as `packages/iconifyx_mdi/Mdi`. Without
/// the package prefix the glyph falls back to FlutterTest and renders
/// as a hollow square. We register both keys for safety in case some
/// path uses the bare family.
Future<void> _loadFont(String repoRoot, String family, String package) async {
  final path = '$repoRoot/packages/$package/assets/fonts/$family.ttf';
  final file = File(path);
  if (!await file.exists()) {
    throw StateError(
      'font asset not found on disk: $path — has the per-set package '
      'been generated? Run `bun run generate -- --set ${package.replaceFirst('iconifyx_', '').replaceAll('_', '-')}`.',
    );
  }
  final bytes = await file.readAsBytes();
  final data = bytes.buffer.asByteData();
  for (final key in <String>['packages/$package/$family', family]) {
    final loader = FontLoader(key);
    loader.addFont(Future.value(data));
    await loader.load();
  }
}

void main() {
  // No goldens — we render directly. Use `flutter_test` only for its
  // Skia binding; fonts are loaded explicitly via FontLoader because
  // `flutter test`'s asset bundler does not auto-pickup fonts declared
  // in dep pubspecs (the dep paths are package-relative, not
  // packages/<pkg>/-prefixed). Reading the TTF straight off disk via
  // dart:io File is the most robust path — no dependence on host
  // pubspec asset declarations and works for every per-set package.
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

    // Load fonts off-disk before laying out any text. flutter_test's
    // asset bundler doesn't pick up dep-declared fonts reliably, so
    // we sidestep it entirely.
    final repoRoot = _findRepoRoot();
    await tester.runAsync(() async {
      await _loadFont(repoRoot, primaryFamily, primaryPackage);
      if (secondaryFamily != null) {
        await _loadFont(repoRoot, secondaryFamily, primaryPackage);
      }
    });

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

    // Resize the test viewport so the RepaintBoundary captures exactly
    // `size × size` logical pixels (the output PNG is then scaled by
    // `pixelRatio` inside toImage). Without this, the boundary spans
    // the default 800×600 viewport and toImage returns a sea of
    // background with the icon centred in the middle.
    tester.view.physicalSize = Size(size.toDouble(), size.toDouble());
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: RepaintBoundary(
          key: repaintKey,
          child: ColoredBox(
            color: Color(bgArgb),
            child: SizedBox.expand(
              child: Center(child: body),
            ),
          ),
        ),
      ),
    );

    // One extra pump after pumpWidget gives the engine a frame to
    // shape the icon glyph against the now-registered font.
    await tester.pump();

    // EVERYTHING async-y past this point lives inside runAsync — that
    // includes `boundary.toImage` (needs real engine ticks, not the
    // fake_async clock) AND `File.writeAsBytes` (dart:io File operations
    // also block when scheduled in fake_async-land; the test process
    // hangs forever waiting for a microtask that never fires). Symptom
    // without runAsync: STAGE prints get as far as the PNG byte
    // conversion, then the writeAsBytes call hangs ~3 minutes until
    // flutter_test SIGTERMs the tester subprocess.
    int? writtenBytes;
    await tester.runAsync(() async {
      final RenderRepaintBoundary boundary = repaintKey.currentContext!
          .findRenderObject()! as RenderRepaintBoundary;
      final ui.Image image = await boundary.toImage(pixelRatio: pixelRatio);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (byteData == null) {
        throw StateError('toByteData returned null');
      }
      final pngBytes = byteData.buffer.asUint8List();
      final outFile = File(outPath);
      await outFile.parent.create(recursive: true);
      await outFile.writeAsBytes(pngBytes, flush: true);
      writtenBytes = pngBytes.length;
      // Surface success on stdout for the Bun CLI to pick up.
      // ignore: avoid_print
      print('RENDER_OK $outPath $writtenBytes');
    });

    if (writtenBytes == null) {
      throw StateError('render produced no PNG bytes');
    }
  });
}
