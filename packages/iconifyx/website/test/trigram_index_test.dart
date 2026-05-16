// Smoke tests for the trigram bitmap search index.
//
// Run with: fvm flutter test test/trigram_index_test.dart

import 'package:flutter_test/flutter_test.dart';

import 'package:iconifyx_website/bootstrap/trigram_index.dart';

void main() {
  group('TrigramIndex', () {
    test('candidates() matches every name containing the query', () {
      final names = <String>[
        'home',
        'home-outline',
        'house',
        'account-circle',
        'magnify',
        'search',
        'menu',
        'menu-open',
        'login',
        'logout',
        'cog-outline',
        'star',
        'star-outline',
        'star-half',
      ];
      final idx = TrigramIndex.build(names);

      Set<int> linear(String q) {
        final out = <int>{};
        for (var i = 0; i < names.length; i++) {
          if (names[i].contains(q)) out.add(i);
        }
        return out;
      }

      for (final q in [
        'home',
        'out',
        'menu',
        'cog',
        'star',
        'lin',
        'gnif', // matches "magnify"
        'account-c',
        'log',
      ]) {
        final got = idx.candidates(q);
        expect(got, isNotNull, reason: 'q="$q" >=3 chars returns non-null');
        // Verify by running the verification step (contains) and comparing
        // to the linear scan.
        final verified = <int>{};
        for (final i in got!) {
          if (names[i].contains(q)) verified.add(i);
        }
        expect(verified, equals(linear(q)), reason: 'q="$q"');
      }
    });

    test('queries shorter than 3 chars return null', () {
      final idx = TrigramIndex.build(['hello', 'world']);
      expect(idx.candidates(''), isNull);
      expect(idx.candidates('h'), isNull);
      expect(idx.candidates('he'), isNull);
      expect(idx.candidates('hel'), isNotNull);
    });

    test('missing trigram returns empty candidate set', () {
      final idx = TrigramIndex.build(['hello', 'world']);
      final c = idx.candidates('xyz');
      expect(c, isNotNull);
      expect(c!.length, equals(0));
    });

    test('candidate list is ascending', () {
      final names =
          List.generate(2000, (i) => 'icon-${i.toString().padLeft(4, '0')}');
      final idx = TrigramIndex.build(names);
      final got = idx.candidates('ico');
      expect(got, isNotNull);
      for (var k = 1; k < got!.length; k++) {
        expect(got[k] > got[k - 1], isTrue);
      }
    });

    test('handles digits and dashes', () {
      final names = ['1234-square', 'arrow-up-down', 'arrow-down-up', 'a1b2c3'];
      final idx = TrigramIndex.build(names);
      Set<int> linear(String q) =>
          {for (var i = 0; i < names.length; i++) if (names[i].contains(q)) i};
      for (final q in ['arrow', '-up', '-do', '1b2', '234']) {
        final got = idx.candidates(q)!;
        final verified = <int>{};
        for (final i in got) {
          if (names[i].contains(q)) verified.add(i);
        }
        expect(verified, equals(linear(q)), reason: 'q="$q"');
      }
    });

    test('estimatedBytes is positive when there are postings', () {
      final idx = TrigramIndex.build(['hello-world', 'foo-bar-baz']);
      expect(idx.estimatedBytes, greaterThan(0));
    });
  });
}
