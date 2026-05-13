import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../shared/bloc/pack_bloc.dart';
import '../../shared/widgets/icon_tile.dart';

class PackDetailPage extends StatelessWidget {
  const PackDetailPage({super.key, required this.prefix});

  final String prefix;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is BootstrapPacksReady) {
          final summary = state.packs.byPrefix[prefix];
          if (summary == null) {
            return _PackMissing(prefix: prefix);
          }
          if (state is BootstrapCatalogReady) {
            return BlocProvider(
              key: ValueKey(prefix),
              create: (_) => PackBloc(
                catalog: state.catalog,
                packs: state.packs,
              )..add(PackOpened(prefix)),
              child: _PackBody(prefix: prefix),
            );
          }
          return _PackLoadingCatalog(summary: summary);
        }
        return const Center(child: CircularProgressIndicator());
      },
    );
  }
}

class _PackLoadingCatalog extends StatelessWidget {
  const _PackLoadingCatalog({required this.summary});
  final PackSummary summary;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(28, 24, 28, 12),
          sliver: SliverToBoxAdapter(
            child: _PackHeader(summary: summary, totalCount: summary.iconCount),
          ),
        ),
        const SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: EdgeInsets.all(64),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      ],
    );
  }
}

class _PackBody extends StatelessWidget {
  const _PackBody({required this.prefix});
  final String prefix;

  @override
  Widget build(BuildContext context) {
    final coordinator = appCoordinator;
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: BlocBuilder<PackBloc, PackState>(
        builder: (context, state) {
          if (state is PackMissing) return _PackMissing(prefix: state.prefix);
          if (state is! PackReady) {
            return const Center(child: CircularProgressIndicator());
          }
          return LayoutBuilder(
            builder: (context, constraints) {
              final w = constraints.maxWidth;
              final tile = w >= 1600
                  ? 80.0
                  : w >= 1200
                      ? 72.0
                      : 64.0;
              final crossAxisCount = (w / tile).floor().clamp(4, 24);
              return CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(28, 24, 28, 8),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              TextButton.icon(
                                icon: const Icon(Icons.arrow_back, size: 18),
                                label: const Text('All packs'),
                                onPressed: () =>
                                    coordinator.navigate(HomeRoute()),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          _PackHeader(
                            summary: state.summary,
                            totalCount: state.icons.length,
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            decoration: const InputDecoration(
                              hintText: 'Filter inside this pack',
                              prefixIcon: Icon(Icons.filter_list, size: 18),
                            ),
                            onChanged: (q) => context
                                .read<PackBloc>()
                                .add(PackFilterChanged(q)),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            state.filter.isEmpty
                                ? '${_format(state.icons.length)} icons'
                                : '${_format(state.filtered.length)} of ${_format(state.icons.length)}',
                            style:
                                Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                    ),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(28, 0, 28, 32),
                    sliver: SliverGrid.builder(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        mainAxisSpacing: 6,
                        crossAxisSpacing: 6,
                      ),
                      itemCount: state.filtered.length,
                      itemBuilder: (context, i) {
                        final ic = state.filtered[i];
                        return IconTile.iconOnly(
                          key: ValueKey(
                              '${ic.prefix}/${ic.name}/${ic.codepoint}'),
                          icon: ic,
                          onTap: () => coordinator.push(
                            IconDetailRoute(prefix: ic.prefix, name: ic.name),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _PackHeader extends StatelessWidget {
  const _PackHeader({required this.summary, required this.totalCount});

  final PackSummary summary;
  final int totalCount;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          summary.name,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            _meta(context, '${_format(totalCount)} icons'),
            _meta(context, summary.license),
            if (summary.author != null) _meta(context, summary.author!),
            _meta(context, summary.packageName, color: cs.primary, mono: true),
            if (summary.duotoneCount > 0)
              _meta(context, '${summary.duotoneCount} duotone'),
          ],
        ),
      ],
    );
  }

  Widget _meta(BuildContext context, String value,
      {Color? color, bool mono = false}) {
    return Text(
      value,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: color ?? Theme.of(context).colorScheme.onSurfaceVariant,
            fontFamily: mono ? 'monospace' : null,
          ),
    );
  }
}

class _PackMissing extends StatelessWidget {
  const _PackMissing({required this.prefix});
  final String prefix;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.report_outlined, size: 48),
            const SizedBox(height: 16),
            Text('Pack "$prefix" not found'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => appCoordinator.navigate(HomeRoute()),
              child: const Text('Back to home'),
            ),
          ],
        ),
      ),
    );
  }
}

String _format(int n) => n
    .toString()
    .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
