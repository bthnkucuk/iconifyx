import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:iconifyx_website/bootstrap/cdn_config.dart';

void main() {
  group('CdnManifest', () {
    test('parses jsDelivr defaults', () {
      final m = CdnManifest.fromJson({
        'schemaVersion': 1,
        'version': 'v1',
        'iconifyJsonVersion': '2.2.472',
        'baseUrl':
            'https://cdn.jsdelivr.net/gh/Bthn/icons@iconify-2.2.472/packages/iconifyx/website/lib/cdn',
        'packsPath': 'packs/v1/packs.json',
        'iconsIndexPath': 'icons-index/v1',
        'iconsIndexManifestPath': 'icons-index/v1/index.json',
      });
      expect(m.packsJsonUrl, endsWith('/packs/v1/packs.json'));
      expect(m.iconsIndexManifestUrl, endsWith('/icons-index/v1/index.json'));
      expect(m.shardUrl('mdi'), endsWith('/icons-index/v1/mdi.json'));
    });

    test('joins URLs without double-slashing', () {
      final m = CdnManifest.fromJson({
        'baseUrl': 'http://localhost:8765/cdn/',
        'packsPath': '/packs/v1/packs.json',
        'iconsIndexPath': '/icons-index/v1',
        'iconsIndexManifestPath': '/icons-index/v1/index.json',
      });
      expect(m.packsJsonUrl, 'http://localhost:8765/cdn/packs/v1/packs.json');
      expect(m.shardUrl('ph'), 'http://localhost:8765/cdn/icons-index/v1/ph.json');
    });

    test('falls back to defaults when fields are missing', () {
      final m = CdnManifest.fromJson({'baseUrl': 'http://x/cdn'});
      expect(m.schemaVersion, 1);
      expect(m.version, 'v1');
      expect(m.packsPath, 'packs/v1/packs.json');
      expect(m.iconsIndexPath, 'icons-index/v1');
      expect(m.iconsIndexManifestPath, 'icons-index/v1/index.json');
    });
  });

  group('CdnHttpClient', () {
    test('returns body on 200', () async {
      final mock = MockClient((req) async {
        return http.Response('ok-body', 200);
      });
      final client = CdnHttpClient(client: mock);
      final body = await client.getString('http://x/file.json');
      expect(body, 'ok-body');
      client.close();
    });

    test('throws CdnFetchException on non-200', () async {
      final mock = MockClient((req) async {
        return http.Response('nope', 404);
      });
      final client = CdnHttpClient(client: mock);
      try {
        await client.getString('http://x/file.json');
        fail('expected throw');
      } on CdnFetchException catch (e) {
        expect(e.statusCode, 404);
        expect(e.url, 'http://x/file.json');
      }
      client.close();
    });

    test('throws CdnFetchException on transport error', () async {
      final mock = MockClient((req) async {
        throw const _FakeSocketException('boom');
      });
      final client = CdnHttpClient(client: mock);
      try {
        await client.getString('http://x/file.json');
        fail('expected throw');
      } on CdnFetchException catch (e) {
        expect(e.message, contains('transport error'));
      }
      client.close();
    });

    test('UTF-8 decodes non-ASCII bodies', () async {
      final mock = MockClient((req) async {
        return http.Response.bytes(
          Uint8List.fromList([0xc3, 0xa9]), // "é"
          200,
        );
      });
      final client = CdnHttpClient(client: mock);
      final body = await client.getString('http://x/file.json');
      expect(body, 'é');
      client.close();
    });
  });
}

class _FakeSocketException implements Exception {
  const _FakeSocketException(this.message);
  final String message;
  @override
  String toString() => 'SocketException: $message';
}
