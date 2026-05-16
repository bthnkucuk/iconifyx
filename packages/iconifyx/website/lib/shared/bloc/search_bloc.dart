import 'package:bloc_concurrency/bloc_concurrency.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:rxdart/rxdart.dart';

import '../../bootstrap/icon_catalog.dart';

sealed class SearchEvent extends Equatable {
  const SearchEvent();
  @override
  List<Object?> get props => const [];
}

class SearchCatalogReady extends SearchEvent {
  const SearchCatalogReady(this.catalog);
  final IconCatalog catalog;
  @override
  List<Object?> get props => [catalog];
}

class SearchQueryChanged extends SearchEvent {
  const SearchQueryChanged(this.query);
  final String query;
  @override
  List<Object?> get props => [query];
}

sealed class SearchState extends Equatable {
  const SearchState();
  @override
  List<Object?> get props => const [];
}

class SearchWarming extends SearchState {
  const SearchWarming();
}

class SearchEmpty extends SearchState {
  const SearchEmpty();
}

class SearchRunning extends SearchState {
  const SearchRunning(this.query);
  final String query;
  @override
  List<Object?> get props => [query];
}

class SearchResults extends SearchState {
  const SearchResults({
    required this.query,
    required this.groupsByPrefix,
    required this.totalMatches,
    required this.truncated,
  });

  final String query;
  final Map<String, List<IconRecord>> groupsByPrefix;
  final int totalMatches;
  final bool truncated;

  @override
  List<Object?> get props => [query, groupsByPrefix, totalMatches, truncated];
}

const int kMaxSearchResults = 240;
const int kMaxPacksInResults = 12;

EventTransformer<E> _debounceRestartable<E>(Duration d) {
  return (events, mapper) => events.debounceTime(d).switchMap(mapper);
}

class SearchBloc extends Bloc<SearchEvent, SearchState> {
  SearchBloc({IconCatalog? initialCatalog})
      : _catalog = initialCatalog,
        super(initialCatalog == null
            ? const SearchWarming()
            : const SearchEmpty()) {
    on<SearchCatalogReady>((e, emit) {
      _catalog = e.catalog;
      if (state is SearchWarming) emit(const SearchEmpty());
    });
    on<SearchQueryChanged>(
      _onQuery,
      transformer: _debounceRestartable(const Duration(milliseconds: 200)),
    );
  }

  IconCatalog? _catalog;

  Future<void> _onQuery(
    SearchQueryChanged event,
    Emitter<SearchState> emit,
  ) async {
    final q = event.query.trim().toLowerCase();
    if (q.isEmpty) {
      emit(const SearchEmpty());
      return;
    }
    final catalog = _catalog;
    if (catalog == null) {
      emit(const SearchWarming());
      return;
    }
    emit(SearchRunning(q));

    final groups = <String, List<IconRecord>>{};
    int total = 0;
    int captured = 0;
    final icons = catalog.icons;
    // Pull all matching indices via the trigram-accelerated path. Returns
    // every match (no `limit:`) because the bloc needs the total count for
    // the truncation hint — but the trigram intersection narrows the
    // verification loop from 165k → < 1 % of the catalog for typical
    // queries. For `q.length < 3` this falls back to a linear scan inside
    // `IconCatalog.searchIndices`.
    final sw = Stopwatch()..start();
    final hits = catalog.searchIndices(q);
    sw.stop();
    if (q.length >= 3) {
      debugPrint('[trigram] bloc q="$q" · ${hits.length} hits · '
          '${sw.elapsedMicroseconds}µs');
    }
    for (final i in hits) {
      total++;
      if (captured >= kMaxSearchResults) continue;
      final ic = icons[i];
      if (groups.length >= kMaxPacksInResults && !groups.containsKey(ic.prefix)) {
        // Don't open more new pack groups, but keep counting totals.
        continue;
      }
      (groups[ic.prefix] ??= <IconRecord>[]).add(ic);
      captured++;
    }
    if (isClosed) return;
    emit(SearchResults(
      query: q,
      groupsByPrefix: Map<String, List<IconRecord>>.unmodifiable(groups),
      totalMatches: total,
      truncated: total > captured,
    ));
  }
}

// Marker re-export to keep restartable on the surface if we ever swap impl.
// ignore: unused_element
final _kRestartable = restartable<SearchEvent>;
