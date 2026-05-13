import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/icon_catalog.dart';

sealed class PackEvent extends Equatable {
  const PackEvent();
  @override
  List<Object?> get props => const [];
}

class PackOpened extends PackEvent {
  const PackOpened(this.prefix);
  final String prefix;
  @override
  List<Object?> get props => [prefix];
}

class PackFilterChanged extends PackEvent {
  const PackFilterChanged(this.filter);
  final String filter;
  @override
  List<Object?> get props => [filter];
}

sealed class PackState extends Equatable {
  const PackState();
  @override
  List<Object?> get props => const [];
}

class PackInitial extends PackState {
  const PackInitial();
}

class PackMissing extends PackState {
  const PackMissing(this.prefix);
  final String prefix;
  @override
  List<Object?> get props => [prefix];
}

class PackReady extends PackState {
  const PackReady({
    required this.prefix,
    required this.summary,
    required this.icons,
    required this.filter,
    required this.filtered,
  });

  final String prefix;
  final PackSummary summary;
  final List<IconRecord> icons;
  final String filter;
  final List<IconRecord> filtered;

  @override
  List<Object?> get props => [prefix, filter, filtered.length];
}

class PackBloc extends Bloc<PackEvent, PackState> {
  PackBloc({required IconCatalog catalog, required PackIndex packs})
      : _catalog = catalog,
        _packs = packs,
        super(const PackInitial()) {
    on<PackOpened>(_onOpened);
    on<PackFilterChanged>(_onFilterChanged);
  }

  final IconCatalog _catalog;
  final PackIndex _packs;

  void _onOpened(PackOpened event, Emitter<PackState> emit) {
    final icons = _catalog.byPrefix[event.prefix];
    final summary = _packs.byPrefix[event.prefix];
    if (icons == null || summary == null) {
      emit(PackMissing(event.prefix));
      return;
    }
    emit(PackReady(
      prefix: event.prefix,
      summary: summary,
      icons: icons,
      filter: '',
      filtered: icons,
    ));
  }

  void _onFilterChanged(PackFilterChanged event, Emitter<PackState> emit) {
    final s = state;
    if (s is! PackReady) return;
    final filter = event.filter.toLowerCase();
    final filtered = filter.isEmpty
        ? s.icons
        : s.icons.where((r) => r.name.toLowerCase().contains(filter)).toList(
              growable: false,
            );
    emit(PackReady(
      prefix: s.prefix,
      summary: s.summary,
      icons: s.icons,
      filter: filter,
      filtered: filtered,
    ));
  }
}
