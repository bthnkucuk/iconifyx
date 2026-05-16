// IconData below is constructed from runtime values supplied via socket —
// same approach the website takes when reconstructing `IconifyIconData`
// from `icons_index.json`. Tree-shake-icons doesn't apply to a test
// isolate, so the const-arg requirement is moot.
// ignore_for_file: non_const_argument_for_const_parameter, avoid_print

// Persistent socket-driven render server (Approach E v2).
//
// Companion to `render_icon_test.dart` (single-shot Approach A). This file
// runs ONE long-lived `testWidgets` that:
//
//   1. Binds a `ServerSocket` on 127.0.0.1 at an OS-picked free port.
//   2. Prints `READY 127.0.0.1:<port>` on stdout so the parent process
//      can dial in.
//   3. Accepts ONE client connection at a time and serves line-delimited
//      JSON render requests on it, writing PNG files via
//      `RepaintBoundary.toImage` and replying with `RENDER_OK <out>
//      <bytes> id=<id>\n` per request.
//   4. Shuts down on `{"shutdown": true}` or when stdout/parent dies.
//
// Why a socket instead of stdin: `flutter test` does NOT pipe the parent
// process's stdin to the test isolate. An earlier draft of this file
// blocked forever on `stdin.transform(...).listen(...)` because the
// orchestrator owns stdin (Observatory commands etc). A 127.0.0.1
// socket bypasses that entirely — `ServerSocket.bind` is unrestricted
// in test isolates, and the parent CLI just opens a TCP `Socket` to
// the printed port.
//
// Protocol (UTF-8 line-delimited JSON):
//
//   request:
//     {"primaryCp": 0xe000, "primaryFamily": "Mdi",
//      "primaryPackage": "iconifyx_mdi", "kind": 0,
//      "size": 256, "color": "0xff000000", "bg": "0x00ffffff",
//      "pixelRatio": 2.0, "out": "/tmp/render-001.png",
//      "id": "r1"}
//
//   optional fields:
//     secondaryCp, secondaryFamily   — when duotone
//     mode                            — "duotone"|"primary-only"|"secondary-only" (default duotone)
//     secondaryColor                  — paint-order override
//
//   responses:
//     RENDER_OK <out> <bytes> id=<id>\n
//     RENDER_ERR <reason> id=<id>\n
//
//   shutdown:
//     {"shutdown": true}              -> server writes SHUTDOWN_OK\n then exits
//
// Stdout markers (one per line; for parent CLI to consume):
//   READY 127.0.0.1:<port>            — server is up; dial in
//   BYE                                — server is exiting
//
// All other stdout lines are diagnostic (flutter test reporter chatter).

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

/// Tracks which `(family, package)` pairs have already been registered
/// via `FontLoader.load()` in this isolate. Loading the same family
/// twice silently appends a second face — harmless but wasteful when
/// the same pack is hit 100x in a row.
final Set<String> _loadedFonts = <String>{};

/// Resolved once at startup — every per-set TTF lives under this root.
late final String _repoRoot;

int _parseIntFlexible(Object? raw, String key) {
  if (raw is int) return raw;
  if (raw is String) {
    final s = raw.trim();
    if (s.startsWith('0x') || s.startsWith('0X')) {
      return int.parse(s.substring(2), radix: 16);
    }
    return int.parse(s);
  }
  throw StateError('field "$key" must be int or hex string; got $raw');
}

int? _parseIntFlexibleOpt(Object? raw, String key) {
  if (raw == null) return null;
  return _parseIntFlexible(raw, key);
}

String? _asStringOpt(Object? raw) {
  if (raw == null) return null;
  if (raw is String) return raw.isEmpty ? null : raw;
  return raw.toString();
}

double _asDouble(Object? raw, double fallback) {
  if (raw == null) return fallback;
  if (raw is num) return raw.toDouble();
  if (raw is String) return double.parse(raw);
  throw StateError('expected double; got $raw');
}

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

/// Load the TTF for `<package>/<family>` and register it under both
/// the package-prefixed lookup key (Flutter's standard package-font
/// resolution) AND the bare family name (some paths use the latter).
/// Cached per-process — repeated calls for the same `(family, package)`
/// pair are no-ops.
Future<void> _ensureFontLoaded(String family, String package) async {
  final cacheKey = '$package/$family';
  if (_loadedFonts.contains(cacheKey)) return;
  final path = '$_repoRoot/packages/$package/assets/fonts/$family.ttf';
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
  _loadedFonts.add(cacheKey);
}

class _RenderRequest {
  _RenderRequest({
    required this.primaryCp,
    required this.primaryFamily,
    required this.primaryPackage,
    this.secondaryCp,
    this.secondaryFamily,
    required this.kind,
    required this.mode,
    required this.size,
    required this.color,
    required this.bg,
    this.secondaryColor,
    required this.pixelRatio,
    required this.out,
    this.id,
  });

  final int primaryCp;
  final String primaryFamily;
  final String primaryPackage;
  final int? secondaryCp;
  final String? secondaryFamily;
  final int kind; // 0 solo, 1 hint, 2 paintOrder, 3 maskInternal
  final String mode; // duotone | primary-only | secondary-only
  final int size;
  final int color;
  final int bg;
  final int? secondaryColor;
  final double pixelRatio;
  final String out;
  final String? id;

  static _RenderRequest fromJson(Map<String, Object?> j) {
    return _RenderRequest(
      primaryCp: _parseIntFlexible(j['primaryCp'], 'primaryCp'),
      primaryFamily: j['primaryFamily']! as String,
      primaryPackage: j['primaryPackage']! as String,
      secondaryCp: _parseIntFlexibleOpt(j['secondaryCp'], 'secondaryCp'),
      secondaryFamily: _asStringOpt(j['secondaryFamily']),
      kind: _parseIntFlexibleOpt(j['kind'], 'kind') ?? 0,
      mode: _asStringOpt(j['mode']) ?? 'duotone',
      size: _parseIntFlexibleOpt(j['size'], 'size') ?? 256,
      color: _parseIntFlexibleOpt(j['color'], 'color') ?? 0xff000000,
      bg: _parseIntFlexibleOpt(j['bg'], 'bg') ?? 0x00ffffff,
      secondaryColor:
          _parseIntFlexibleOpt(j['secondaryColor'], 'secondaryColor'),
      pixelRatio: _asDouble(j['pixelRatio'], 2.0),
      out: j['out']! as String,
      id: _asStringOpt(j['id']),
    );
  }
}

Widget _buildBody(_RenderRequest req) {
  // Reconstruct IconData(s) — same approach as the website's
  // IconRecord.toIconifyData() (see CLAUDE.md §1).
  final primaryData = IconData(
    req.primaryCp,
    fontFamily: req.primaryFamily,
    fontPackage: req.primaryPackage,
  );
  IconData? secondaryData;
  if (req.secondaryCp != null && req.secondaryFamily != null) {
    secondaryData = IconData(
      req.secondaryCp!,
      fontFamily: req.secondaryFamily,
      fontPackage: req.primaryPackage,
    );
  }
  final iconifyData = secondaryData == null
      ? IconifyIconData.solo(primaryData)
      : IconifyIconData.duo(primaryData, secondaryData, kind: req.kind);

  final color = Color(req.color);
  final Color? secondaryColor =
      req.secondaryColor == null ? null : Color(req.secondaryColor!);
  switch (req.mode) {
    case 'primary-only':
      return Icon(primaryData, size: req.size.toDouble(), color: color);
    case 'secondary-only':
      if (secondaryData == null) {
        throw StateError(
            'secondary-only mode requested but icon has no secondary layer');
      }
      return Icon(secondaryData, size: req.size.toDouble(), color: color);
    case 'duotone':
    default:
      return IconifyIcon(
        iconifyData,
        size: req.size.toDouble(),
        color: color,
        secondaryColor: secondaryColor,
      );
  }
}

/// Render one request and write its PNG. Returns the number of bytes
/// written. Caller is responsible for emitting RENDER_OK / RENDER_ERR.
Future<int> _renderOne(WidgetTester tester, _RenderRequest req) async {
  // Load fonts (cached per-process).
  await tester.runAsync(() async {
    await _ensureFontLoaded(req.primaryFamily, req.primaryPackage);
    if (req.secondaryFamily != null) {
      await _ensureFontLoaded(req.secondaryFamily!, req.primaryPackage);
    }
  });

  final body = _buildBody(req);
  final repaintKey = GlobalKey();

  // Per-request viewport — the boundary captures exactly `size × size`
  // logical pixels. `tester.view.reset*` after the render so back-to-back
  // requests with different sizes don't leak state.
  tester.view.physicalSize = Size(req.size.toDouble(), req.size.toDouble());
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: RepaintBoundary(
        key: repaintKey,
        child: ColoredBox(
          color: Color(req.bg),
          child: SizedBox.expand(
            child: Center(child: body),
          ),
        ),
      ),
    ),
  );
  // One extra pump to ensure the font is shaped + the icon laid out
  // against now-registered glyphs.
  await tester.pump();

  late int writtenBytes;
  // toImage + writeAsBytes MUST live inside runAsync — see render_icon_test.dart
  // landmine #1 (the fake_async clock blocks dart:io microtasks).
  await tester.runAsync(() async {
    final boundary = repaintKey.currentContext!.findRenderObject()!
        as RenderRepaintBoundary;
    final ui.Image image = await boundary.toImage(pixelRatio: req.pixelRatio);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    if (byteData == null) {
      throw StateError('toByteData returned null');
    }
    final pngBytes = byteData.buffer.asUint8List();
    final outFile = File(req.out);
    await outFile.parent.create(recursive: true);
    await outFile.writeAsBytes(pngBytes, flush: true);
    writtenBytes = pngBytes.length;
  });

  // Clear the widget tree so the next request starts clean.
  await tester.pumpWidget(const SizedBox.shrink());
  tester.view.resetPhysicalSize();
  tester.view.resetDevicePixelRatio();

  return writtenBytes;
}

/// Handle one TCP client. Reads line-delimited JSON requests, writes
/// `RENDER_OK` / `RENDER_ERR` per request. Returns when the client
/// disconnects or sends `{"shutdown": true}`. If shutdown was requested
/// the outer loop exits.
Future<bool> _handleClient(WidgetTester tester, Socket client) async {
  client.setOption(SocketOption.tcpNoDelay, true);
  var shutdownRequested = false;
  // `Socket` is `Stream<Uint8List>`; `utf8.decoder` wants
  // `Stream<List<int>>`, so cast through that type before the chain.
  final lineStream = client
      .cast<List<int>>()
      .transform(utf8.decoder)
      .transform(const LineSplitter());

  // Each request is processed sequentially. We DON'T parallelise inside
  // a single client because WidgetTester is single-threaded; rendering
  // two icons at once would step on each other's view + repaintKey.
  await for (final line in lineStream) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) continue;
    Map<String, Object?> j;
    try {
      j = jsonDecode(trimmed) as Map<String, Object?>;
    } catch (e) {
      client.write(
        'RENDER_ERR bad_json:${e.toString().replaceAll('\n', ' ')}\n',
      );
      continue;
    }
    if (j['shutdown'] == true) {
      client.write('SHUTDOWN_OK\n');
      await client.flush();
      shutdownRequested = true;
      break;
    }
    String? id;
    try {
      final req = _RenderRequest.fromJson(j);
      id = req.id;
      final bytes = await _renderOne(tester, req);
      final idSuffix = id != null ? ' id=$id' : '';
      client.write('RENDER_OK ${req.out} $bytes$idSuffix\n');
    } catch (e, st) {
      final msg = e.toString().replaceAll('\n', ' ');
      final idSuffix = id != null ? ' id=$id' : '';
      client.write('RENDER_ERR $msg$idSuffix\n');
      // Stderr for debugging without polluting the wire protocol.
      stderr.writeln('render-server: $e\n$st');
    }
    await client.flush();
  }
  try {
    await client.close();
  } catch (_) {
    // Best effort.
  }
  return shutdownRequested;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  _repoRoot = _findRepoRoot();

  // The whole server lives inside ONE long-running testWidgets so the
  // tester + binding + font cache persist for every request.
  testWidgets('render-server', (tester) async {
    final completer = Completer<void>();
    ServerSocket? server;
    StreamSubscription<Socket>? sub;
    await tester.runAsync(() async {
      // 127.0.0.1 only: server is process-local, never reachable from
      // off-host. Port 0 means "let the OS pick a free one".
      server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      // Print READY line on stdout for the parent CLI to dial in.
      print('READY 127.0.0.1:${server!.port}');
      sub = server!.listen((client) async {
        // Pause incoming-client listener while this client is being
        // served. We only ever expect one client at a time (the parent
        // CLI), and serial processing is forced by the single
        // WidgetTester anyway.
        sub!.pause();
        try {
          final shutdown = await _handleClient(tester, client);
          if (shutdown) {
            if (!completer.isCompleted) completer.complete();
            return;
          }
        } catch (e, st) {
          stderr.writeln('render-server: client handler threw: $e\n$st');
        } finally {
          if (!completer.isCompleted) {
            sub!.resume();
          }
        }
      }, onError: (Object e) {
        stderr.writeln('render-server: accept error: $e');
        if (!completer.isCompleted) completer.complete();
      });
    });
    await completer.future;
    await sub?.cancel();
    try {
      await server?.close();
    } catch (_) {}
    print('BYE');
  }, timeout: Timeout.none);
}
