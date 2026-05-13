import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/pack_card.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        return switch (state) {
          BootstrapInitial() ||
          BootstrapLoadingPacks() =>
            const _LoadingHome(),
          BootstrapFailed(error: final err) => _ErrorHome(error: err),
          BootstrapPacksReady(packs: final packs) =>
            _ReadyHome(packs: packs),
        };
      },
    );
  }
}

class _LoadingHome extends StatelessWidget {
  const _LoadingHome();

  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class _ErrorHome extends StatelessWidget {
  const _ErrorHome({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 16),
            Text('Failed to load icon catalog: $error'),
          ],
        ),
      ),
    );
  }
}

class _ReadyHome extends StatelessWidget {
  const _ReadyHome({required this.packs});

  final PackIndex packs;

  @override
  Widget build(BuildContext context) {
    final coordinator = appCoordinator;
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final crossAxisCount = w >= 1400
            ? 5
            : w >= 1100
                ? 4
                : w >= 800
                    ? 3
                    : w >= 500
                        ? 2
                        : 1;
        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(28, 28, 28, 12),
              sliver: SliverToBoxAdapter(
                child: _HomeHeader(packs: packs),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(28, 4, 28, 32),
              sliver: SliverMasonryGrid.count(
                crossAxisCount: crossAxisCount,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childCount: packs.packs.length,
                itemBuilder: (context, i) {
                  final summary = packs.packs[i];
                  return PackCard(
                    summary: summary,
                    onTap: () => coordinator
                        .navigate(PackDetailRoute(prefix: summary.prefix)),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.packs});

  final PackIndex packs;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Every Iconify pack, in Flutter.',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          '${_format(packs.totalIcons)} icons across ${packs.packs.length} packs · @iconify/json v${packs.iconifyJsonVersion}',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: cs.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 18),
      ],
    );
  }
}

String _format(int n) =>
    n.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
