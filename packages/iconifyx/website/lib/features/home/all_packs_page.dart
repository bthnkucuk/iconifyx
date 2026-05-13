import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../shared/widgets/hover_box.dart';
import '../../shared/widgets/pack_card.dart';
import '../../theme/app_theme.dart';

/// All packs listing — every iconifyx_* pack, no search box, no filter.
class AllPacksPage extends StatelessWidget {
  const AllPacksPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        if (state is! BootstrapPacksReady) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.coral));
        }
        final packs = state.packs;
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
        return PageContainer(
          children: [
            // Breadcrumb.
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
              child: Row(
                children: [
                  _CrumbLink(label: 'iconifyx', onTap: () => appCoordinator.navigate(HomeRoute())),
                  Text(' / ', style: AppTheme.mono(size: 12, color: muted)),
                  Text('packs',
                      style: AppTheme.mono(
                          size: 12, color: muted, weight: FontWeight.w600)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 16, 28, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text('All packs', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${packs.packs.length} packs · ${_fmt(packs.totalIcons)} icons',
                      style: AppTheme.mono(size: 11, color: muted),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
              child: LayoutBuilder(
                builder: (context, c) {
                  final w = c.maxWidth;
                  final cols = w >= 1500
                      ? 5
                      : w >= 1180
                          ? 4
                          : w >= 860
                              ? 3
                              : w >= 540
                                  ? 2
                                  : 1;
                  return MasonryGridView.count(
                    crossAxisCount: cols,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 18,
                    crossAxisSpacing: 18,
                    itemCount: packs.packs.length,
                    itemBuilder: (context, i) {
                      final summary = packs.packs[i];
                      return PackCard(
                        summary: summary,
                        onTap: () => appCoordinator
                            .navigate(PackDetailRoute(prefix: summary.prefix)),
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

String _fmt(int n) => n.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
