import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'icon_catalog.dart';

sealed class BootstrapEvent {
  const BootstrapEvent();
}

class BootstrapStarted extends BootstrapEvent {
  const BootstrapStarted();
}

sealed class BootstrapState extends Equatable {
  const BootstrapState();
  @override
  List<Object?> get props => const [];
}

class BootstrapInitial extends BootstrapState {
  const BootstrapInitial();
}

class BootstrapLoadingPacks extends BootstrapState {
  const BootstrapLoadingPacks();
}

class BootstrapPacksReady extends BootstrapState {
  const BootstrapPacksReady(this.packs);
  final PackIndex packs;
  @override
  List<Object?> get props => [packs];
}

class BootstrapCatalogReady extends BootstrapPacksReady {
  const BootstrapCatalogReady(super.packs, this.catalog);
  final IconCatalog catalog;
  @override
  List<Object?> get props => [packs, catalog];
}

class BootstrapFailed extends BootstrapState {
  const BootstrapFailed(this.error);
  final Object error;
  @override
  List<Object?> get props => [error];
}

class BootstrapBloc extends Bloc<BootstrapEvent, BootstrapState> {
  BootstrapBloc() : super(const BootstrapInitial()) {
    on<BootstrapStarted>(_onStarted);
  }

  Future<void> _onStarted(
    BootstrapStarted event,
    Emitter<BootstrapState> emit,
  ) async {
    emit(const BootstrapLoadingPacks());
    try {
      final packs = await PackIndex.load();
      if (isClosed) return;
      emit(BootstrapPacksReady(packs));
      final catalog = await IconCatalog.load(packs.byPrefix);
      if (isClosed) return;
      emit(BootstrapCatalogReady(packs, catalog));
    } catch (err) {
      if (isClosed) return;
      emit(BootstrapFailed(err));
    }
  }
}
