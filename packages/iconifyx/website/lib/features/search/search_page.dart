import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/icon_detail_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/bloc/search_bloc.dart';
import '../../shared/widgets/icon_tile.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.initialQuery});

  final String initialQuery;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final TextEditingController _controller;
  late final SearchBloc _bloc;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
    final bootstrap = context.read<BootstrapBloc>().state;
    final catalog =
        bootstrap is BootstrapCatalogReady ? bootstrap.catalog : null;
    _bloc = SearchBloc(initialCatalog: catalog);
    if (widget.initialQuery.isNotEmpty) {
      _bloc.add(SearchQueryChanged(widget.initialQuery));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _bloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _bloc,
      child: BlocListener<BootstrapBloc, BootstrapState>(
        listener: (context, state) {
          if (state is BootstrapCatalogReady) {
            _bloc.add(SearchCatalogReady(state.catalog));
            if (_controller.text.trim().isNotEmpty) {
              _bloc.add(SearchQueryChanged(_controller.text));
            }
          }
        },
        child: _SearchBody(controller: _controller),
      ),
    );
  }
}

class _SearchBody extends StatelessWidget {
  const _SearchBody({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Search icons',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'Type to search across every icon…',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (v) =>
                context.read<SearchBloc>().add(SearchQueryChanged(v)),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: BlocBuilder<SearchBloc, SearchState>(
              builder: (context, state) {
                return switch (state) {
                  SearchWarming() => Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CircularProgressIndicator(),
                            const SizedBox(height: 16),
                            Text(
                              'Indexing $_kHumanCount icons…',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                    ),
                  SearchEmpty() => _EmptyState(color: cs.onSurfaceVariant),
                  SearchRunning() =>
                    const Center(child: CircularProgressIndicator()),
                  SearchResults(:final groupsByPrefix, :final totalMatches, :final truncated, :final query) =>
                    _Results(
                      query: query,
                      groups: groupsByPrefix,
                      total: totalMatches,
                      truncated: truncated,
                    ),
                };
              },
            ),
          ),
        ],
      ),
    );
  }
}

const _kHumanCount = '300,000+';

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off, size: 48, color: color),
          const SizedBox(height: 12),
          Text('Type to search across every icon',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({
    required this.query,
    required this.groups,
    required this.total,
    required this.truncated,
  });

  final String query;
  final Map<String, List<IconRecord>> groups;
  final int total;
  final bool truncated;

  @override
  Widget build(BuildContext context) {
    final coordinator = appCoordinator;
    final cs = Theme.of(context).colorScheme;
    final bootstrap = context.read<BootstrapBloc>().state;
    final packs = bootstrap is BootstrapPacksReady ? bootstrap.packs : null;

    if (groups.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off, size: 48, color: cs.onSurfaceVariant),
            const SizedBox(height: 12),
            Text('No icons matched "$query"',
                style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      );
    }

    final entries = groups.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              truncated
                  ? '$total matches (showing the first ${_countMatches(groups)})'
                  : '$total matches',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: cs.onSurfaceVariant),
            ),
          ),
        ),
        for (final entry in entries) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      packs?.byPrefix[entry.key]?.name ?? entry.key,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => coordinator.navigate(
                      PackDetailRoute(prefix: entry.key),
                    ),
                    child: Text('Open ${entry.key}'),
                  ),
                ],
              ),
            ),
          ),
          SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 130,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 1,
            ),
            itemCount: entry.value.length,
            itemBuilder: (context, i) {
              final ic = entry.value[i];
              return IconTile.withName(
                key: ValueKey('${ic.prefix}/${ic.name}/${ic.codepoint}'),
                icon: ic,
                onTap: () => coordinator.push(
                  IconDetailRoute(prefix: ic.prefix, name: ic.name),
                ),
              );
            },
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ],
    );
  }
}

int _countMatches(Map<String, List<IconRecord>> groups) {
  var total = 0;
  for (final list in groups.values) {
    total += list.length;
  }
  return total;
}
