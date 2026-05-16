// Larger-scale microbench. Generates ~165 k synthetic icon names from a
// small word vocabulary so the trigram distribution roughly matches the
// real catalog, builds the index, and measures intersection latency for
// a handful of representative queries.
//
// Run with:
//   fvm flutter test test/trigram_bench_test.dart
//
// This runs in the Dart-VM-on-host (the same VM the website is compiled
// through for `flutter run`); it is NOT a release-mode WASM benchmark,
// but the relative latency between linear scan and trigram is
// representative — both run in the same VM, so the comparison is fair.

import 'package:flutter_test/flutter_test.dart';

import 'package:iconifyx_website/bootstrap/trigram_index.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('165k synthetic catalog: trigram beats linear scan by 10×+',
      () {
    final names = _generateCatalog(165000);

    final buildSw = Stopwatch()..start();
    final idx = TrigramIndex.build(names);
    buildSw.stop();
    // ignore: avoid_print
    print(
        '[bench] build ${names.length} names · ${buildSw.elapsedMilliseconds} ms '
        '· ${(idx.estimatedBytes / 1024 / 1024).toStringAsFixed(2)} MB');

    int linear(String q) {
      var c = 0;
      for (var i = 0; i < names.length; i++) {
        if (names[i].contains(q)) c++;
      }
      return c;
    }

    int trigram(String q) {
      final cs = idx.candidates(q)!;
      var c = 0;
      for (var k = 0; k < cs.length; k++) {
        if (names[cs[k]].contains(q)) c++;
      }
      return c;
    }

    for (final q in [
      'home',
      'user',
      'search',
      'menu',
      'arrow',
      'circle',
      'outline',
      'square',
      'phone',
      'check',
    ]) {
      // warm-up
      linear(q);
      trigram(q);

      final lsw = Stopwatch()..start();
      final lc = linear(q);
      lsw.stop();

      final tsw = Stopwatch()..start();
      final tc = trigram(q);
      tsw.stop();

      // ignore: avoid_print
      print('[bench] q="$q" · linear=${lsw.elapsedMicroseconds}µs ($lc) · '
          'trigram=${tsw.elapsedMicroseconds}µs ($tc)');
      expect(tc, equals(lc), reason: 'parity for q="$q"');
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
}

// Plausible icon-name vocabulary. Mixed prefixes / suffixes / numerics
// approximate the real distribution well enough for benchmark purposes.
const _words = <String>[
  'home', 'user', 'circle', 'square', 'star', 'heart', 'check', 'cross',
  'plus', 'minus', 'arrow', 'chevron', 'menu', 'search', 'settings',
  'phone', 'mail', 'bell', 'cart', 'lock', 'unlock', 'eye', 'eye-off',
  'pencil', 'edit', 'trash', 'download', 'upload', 'share', 'link',
  'calendar', 'clock', 'sun', 'moon', 'cloud', 'rain', 'snow', 'fire',
  'globe', 'map', 'pin', 'location', 'compass', 'flag', 'tag', 'price',
  'cash', 'wallet', 'card', 'bank', 'chart', 'graph', 'pie', 'bar',
  'document', 'file', 'folder', 'image', 'photo', 'video', 'music',
  'play', 'pause', 'stop', 'forward', 'backward', 'volume', 'mic',
  'shield', 'key', 'gear', 'cog', 'wrench', 'hammer', 'tool', 'bug',
  'truck', 'car', 'bike', 'plane', 'ship', 'train', 'bus', 'rocket',
];

const _suffixes = <String>[
  '', '-outline', '-bold', '-thin', '-light', '-regular', '-solid',
  '-fill', '-duotone', '-line', '-broken', '-twotone', '-up', '-down',
  '-left', '-right', '-alt', '-2', '-3',
];

List<String> _generateCatalog(int n) {
  // Deterministic seed → reproducible bench numbers.
  final rng = _LCG(0xCAFEBABE);
  return List<String>.generate(n, (i) {
    final w1 = _words[rng.next() % _words.length];
    final w2 = _words[rng.next() % _words.length];
    final s = _suffixes[rng.next() % _suffixes.length];
    if ((rng.next() & 7) == 0) {
      return '$w1-$w2$s';
    }
    return '$w1$s';
  });
}

class _LCG {
  _LCG(this._state);
  int _state;
  int next() {
    _state = (_state * 1664525 + 1013904223) & 0x7fffffff;
    return _state;
  }
}
