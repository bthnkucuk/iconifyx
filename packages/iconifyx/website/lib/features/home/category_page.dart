import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/pack_card.dart';
import '../../theme/app_theme.dart';

class CategoryPage extends StatelessWidget {
  const CategoryPage({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapPacksReady) {
          return const Center(
              child: CircularProgressIndicator(color: AppTheme.coral));
        }
        final packs = state.packs;
        final cat = packs.categories.firstWhere(
          (c) => c.slug == slug,
          orElse: () =>
              CategoryEntry(slug: slug, name: slug, packPrefixes: const []),
        );
        final members = [
          for (final p in cat.packPrefixes)
            if (packs.byPrefix[p] != null) packs.byPrefix[p]!,
        ];
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
        return PageContainer.slivers(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
                child: Row(
                  children: [
                    _CrumbLink(
                        label: 'iconifyx',
                        onTap: () => appCoordinator.navigate(HomeRoute())),
                    Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                    _CrumbLink(
                        label: 'categories',
                        onTap: () => appCoordinator.navigate(HomeRoute())),
                    Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                    Text(cat.slug,
                        style: AppTheme.mono(
                            size: 12,
                            color: muted,
                            weight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 16, 28, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cat.name,
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    Text(
                      '${members.length} packs in this category',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 16)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(28, 4, 28, 40),
              sliver: SliverLayoutBuilder(
                builder: (context, constraints) {
                  final w = constraints.crossAxisExtent;
                  final cols = w >= 1400
                      ? 5
                      : w >= 1100
                          ? 4
                          : w >= 800
                              ? 3
                              : w >= 500
                                  ? 2
                                  : 1;
                  return SliverGrid.builder(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      mainAxisSpacing: 14,
                      crossAxisSpacing: 14,
                      childAspectRatio: 1,
                    ),
                    itemCount: members.length,
                    itemBuilder: (context, i) {
                      final summary = members[i];
                      return PackCard(
                        summary: summary,
                        onTap: () => appCoordinator.navigate(
                          PackDetailRoute(prefix: summary.prefix),
                        ),
                      );
                    },
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

class _CrumbLink extends StatelessWidget {
  const _CrumbLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return HoverBuilder(
      onTap: onTap,
      builder: (ctx, hovered) => Text(
        label,
        style: AppTheme.mono(
          size: 12,
          color: hovered ? AppTheme.coral : muted,
        ),
      ),
    );
  }
}
