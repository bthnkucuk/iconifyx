import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/bootstrap_bloc.dart';
import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/category_route.dart';
import '../../router/routes/shell/home_route.dart';

class AppSidebar extends StatelessWidget {
  const AppSidebar({super.key});

  @override
  Widget build(BuildContext context) {
    final coordinator = appCoordinator;
    return BlocBuilder<BootstrapBloc, BootstrapState>(
      builder: (context, state) {
        final packs = state is BootstrapPacksReady ? state.packs : null;
        return Container(
          color: Theme.of(context).colorScheme.surface,
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              _SidebarTile(
                icon: Icons.home_outlined,
                label: 'Home',
                onTap: () => coordinator.navigate(HomeRoute()),
              ),
              const _SidebarHeader('Browse'),
              if (packs == null)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: LinearProgressIndicator(),
                )
              else
                ..._categoryTiles(packs, coordinator),
              const SizedBox(height: 16),
              const _SidebarHeader('About'),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: Text(
                  packs == null
                      ? '—'
                      : '${packs.totalIcons.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} icons across ${packs.packs.length} packs',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _categoryTiles(PackIndex packs, AppCoordinator coordinator) {
    return [
      for (final cat in packs.categories)
        _SidebarTile(
          icon: Icons.folder_outlined,
          label: '${cat.name} (${cat.packPrefixes.length})',
          onTap: () => coordinator.navigate(CategoryRoute(slug: cat.slug)),
        ),
    ];
  }
}

class _SidebarHeader extends StatelessWidget {
  const _SidebarHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 1,
            ),
      ),
    );
  }
}

class _SidebarTile extends StatelessWidget {
  const _SidebarTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, size: 20),
      title: Text(label, style: Theme.of(context).textTheme.bodyMedium),
      dense: true,
      onTap: onTap,
    );
  }
}
