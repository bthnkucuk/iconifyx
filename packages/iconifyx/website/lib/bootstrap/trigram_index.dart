import 'dart:typed_data';

/// 3-gram (trigram) substring search index over a list of pre-lowercased
/// icon names. Drives `SearchPage` / `SearchBloc` away from the O(N) linear
/// scan over ~165k entries per keystroke (release ~30-80 ms) to a
/// posting-list intersection over the few trigrams in the query
/// (release < 16 ms p95).
///
/// Design (per `docs/RESEARCH_PLAN.md` §9 #6):
///
/// - For every icon's lower-cased name, every contiguous 3-byte window is
///   extracted (e.g. "home" → "hom", "ome"). Non-ASCII chars are kept as
///   their lower UTF-16 byte — fine because almost every icon name is
///   `[a-z0-9-_]` and the rare exception will simply land in its own
///   bucket without changing correctness (final substring verify catches
///   any mismatch).
/// - Each trigram maps to a sorted `Uint32List` of icon indices that
///   contain it (a "posting list"). Sorted because index intersection is
///   a two-pointer/galloping merge against an ascending stream.
/// - On query: pull every distinct trigram out of `q`, fetch each
///   posting list, intersect them in ascending size order, then verify
///   the survivors with a real `contains(q)` against the original lower
///   name (handles overlap between adjacent trigrams that match the same
///   substring twice and any rare non-ASCII bucket collisions).
/// - Queries shorter than 3 chars fall back to the existing linear scan
///   in the caller — there are only ~26² = 676 single/double-letter
///   prefixes; the result set is small enough that the linear scan stays
///   fast.
///
/// Memory: posting lists store one `Uint32List` entry per
/// (trigram, icon-index) pair, sorted-deduped within a name. Empirically
/// ~13 distinct trigrams per icon name → ~2.1 M postings → ~8.4 MB
/// stored as `Uint32List`. Index headers (`Map<int, Uint32List>`) cost
/// roughly the same again in pointer + bucket overhead. The boot-time
/// log line `[trigram] index built …` reports actual bytes.
class TrigramIndex {
  TrigramIndex._(
    this._postings,
    this.iconCount,
    this.estimatedBytes,
  );

  /// Trigram key → sorted ascending list of icon indices containing it.
  final Map<int, Uint32List> _postings;

  /// Total number of icons covered by the index — must match
  /// `IconCatalog.icons.length`.
  final int iconCount;

  /// Approximate retained-bytes estimate for boot-time logging. Counts the
  /// `Uint32List` payload bytes plus a flat per-key overhead; ignores Map
  /// implementation overhead (small, constant).
  final int estimatedBytes;

  /// Build the index from a pre-lowercased name list.
  ///
  /// Phase 1: scan every name, collect `(trigram, iconIndex)` tuples into
  /// per-trigram growable `Uint32List`-backed buckets sized via a single
  /// counting pass (avoids growable-list realloc churn for ~2 M entries).
  ///
  /// Phase 2: collapse each bucket into a sorted dedup'd `Uint32List`.
  /// Within a single icon name, multiple windows can yield the same
  /// trigram (`"common-common"` would emit "com" twice) but we only need
  /// the icon index once per posting list.
  static TrigramIndex build(List<String> lowerNames) {
    final n = lowerNames.length;

    // Phase 1a — counting pass. For every (name, trigram) pair we increment
    // a count. Dedup within a name happens here too: a single name only
    // contributes once per trigram (we track "last-seen-in-name" via an
    // Int32List sized to all possible trigrams = 256³ = 16M slots is too
    // big; instead use a per-name `Set<int>` which stays small (~20 elems
    // per icon).
    final counts = <int, int>{};
    final perIconTrigrams = List<Uint32List>.filled(n, _emptyU32, growable: false);
    for (var i = 0; i < n; i++) {
      final s = lowerNames[i];
      final trigrams = _extractTrigrams(s);
      perIconTrigrams[i] = trigrams;
      for (final tg in trigrams) {
        counts[tg] = (counts[tg] ?? 0) + 1;
      }
    }

    // Phase 1b — allocate exact-size posting buckets up front. We track a
    // per-bucket write cursor in `writeOffsets`.
    final postings = <int, Uint32List>{};
    final writeOffsets = <int, int>{};
    counts.forEach((tg, c) {
      postings[tg] = Uint32List(c);
      writeOffsets[tg] = 0;
    });

    // Phase 1c — fill buckets. Because we iterate `i` ascending and append
    // to each posting in source order, the bucket is already sorted
    // ascending → no sort needed afterwards.
    for (var i = 0; i < n; i++) {
      final trigrams = perIconTrigrams[i];
      for (final tg in trigrams) {
        final off = writeOffsets[tg]!;
        postings[tg]![off] = i;
        writeOffsets[tg] = off + 1;
      }
    }

    // Phase 2 — estimate retained bytes. Each `Uint32List` payload is
    // 4 × length; per-bucket overhead (map slot + length field) ≈ 24 B.
    var bytes = 0;
    postings.forEach((_, list) {
      bytes += list.lengthInBytes;
      bytes += 24;
    });

    return TrigramIndex._(
      Map<int, Uint32List>.unmodifiable(postings),
      n,
      bytes,
    );
  }

  /// Extract every distinct contiguous 3-byte trigram from [s], packed as
  /// `(b0 << 16) | (b1 << 8) | b2` where each byte is the lower 8 bits of
  /// a UTF-16 code unit. Returns a `Uint32List` (cache-friendly, dedup'd).
  static Uint32List _extractTrigrams(String s) {
    final len = s.length;
    if (len < 3) return _emptyU32;
    // Use a small set to dedup repeats within the name. For ~20-trigram
    // names a `Set<int>` is comfortably fastest in JS-compiled Dart.
    final seen = <int>{};
    for (var k = 0; k + 3 <= len; k++) {
      // codeUnitAt + bitwise AND with 0xff folds 16-bit code units into
      // 1-byte slots, matching the query-side extraction below.
      final c0 = s.codeUnitAt(k) & 0xff;
      final c1 = s.codeUnitAt(k + 1) & 0xff;
      final c2 = s.codeUnitAt(k + 2) & 0xff;
      seen.add((c0 << 16) | (c1 << 8) | c2);
    }
    if (seen.isEmpty) return _emptyU32;
    final out = Uint32List(seen.length);
    var i = 0;
    for (final t in seen) {
      out[i++] = t;
    }
    return out;
  }

  /// All distinct trigrams in [q] (lowercased) packed the same way.
  static List<int> _queryTrigrams(String q) {
    final len = q.length;
    if (len < 3) return const <int>[];
    final seen = <int>{};
    for (var k = 0; k + 3 <= len; k++) {
      final c0 = q.codeUnitAt(k) & 0xff;
      final c1 = q.codeUnitAt(k + 1) & 0xff;
      final c2 = q.codeUnitAt(k + 2) & 0xff;
      seen.add((c0 << 16) | (c1 << 8) | c2);
    }
    return seen.toList(growable: false);
  }

  /// Candidate icon indices matching ALL trigrams in [q]. Caller must
  /// still verify the survivors with `name.contains(q)` because:
  ///
  ///  - Overlapping trigrams in `q` may collide with shorter substrings
  ///    in a name (e.g. `q = "abcab"` shares `"abc"` and `"bca"` with
  ///    `"abcab"` AND with `"abcXbca"`).
  ///  - Non-ASCII byte folding (rare) could match the wrong glyph.
  ///
  /// Returns `null` when [q] has fewer than 3 chars — caller must fall
  /// through to a linear scan.
  Uint32List? candidates(String q) {
    if (q.length < 3) return null;
    final tgs = _queryTrigrams(q);
    if (tgs.isEmpty) return _emptyU32;

    // Fetch all posting lists. A missing trigram means zero matches
    // anywhere — short-circuit.
    final lists = <Uint32List>[];
    for (final tg in tgs) {
      final list = _postings[tg];
      if (list == null) return _emptyU32;
      lists.add(list);
    }
    // Intersect smallest-first so the running result shrinks fastest.
    lists.sort((a, b) => a.length - b.length);
    Uint32List acc = lists.first;
    for (var i = 1; i < lists.length; i++) {
      acc = _intersectSorted(acc, lists[i]);
      if (acc.isEmpty) return acc;
    }
    return acc;
  }

  /// Two-pointer intersection over ascending-sorted `Uint32List`s. Returns
  /// a fresh `Uint32List` containing only the common indices, in order.
  static Uint32List _intersectSorted(Uint32List a, Uint32List b) {
    final out = Uint32List(a.length < b.length ? a.length : b.length);
    var i = 0;
    var j = 0;
    var k = 0;
    while (i < a.length && j < b.length) {
      final ai = a[i];
      final bj = b[j];
      if (ai == bj) {
        out[k++] = ai;
        i++;
        j++;
      } else if (ai < bj) {
        i++;
      } else {
        j++;
      }
    }
    if (k == out.length) return out;
    return Uint32List.sublistView(out, 0, k);
  }
}

final Uint32List _emptyU32 = Uint32List(0);
