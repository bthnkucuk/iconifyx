import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/pack_card.dart';

class CategoryPage extends StatelessWidget {
  const CategoryPage({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapPacksReady) {
          return const Center(child: CircularProgressIndicator());
        }
        final packs = state.packs;
        final cat = packs.categories.firstWhere(
          (c) => c.slug == slug,
          orElse: () => CategoryEntry(slug: slug, name: slug, packPrefixes: const []),
        );
        final members = [
          for (final p in cat.packPrefixes)
            if (packs.byPrefix[p] != null) packs.byPrefix[p]!,
        ];
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          cat.name,
                          style: Theme.of(context)
                              .textTheme
                              .headlineMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${members.length} packs',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                        const SizedBox(height: 18),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(28, 4, 28, 32),
                  sliver: SliverMasonryGrid.count(
                    crossAxisCount: crossAxisCount,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childCount: members.length,
                    itemBuilder: (context, i) {
                      final summary = members[i];
                      return PackCard(
                        summary: summary,
                        onTap: () => coordinator.navigate(
                          PackDetailRoute(prefix: summary.prefix),
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
    );
  }
}
