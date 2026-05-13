import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../router/coordinator.dart';
import '../../router/routes/shell/home_route.dart';
import '../../router/routes/shell/search_route.dart';
import '../../theme/theme_cubit.dart';

class AppTopBar extends StatelessWidget {
  const AppTopBar({super.key, required this.showMenuButton});

  final bool showMenuButton;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final coordinator = appCoordinator;
    return Material(
      color: cs.surface,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Container(
          height: 64,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: cs.outlineVariant, width: 1),
            ),
          ),
          child: Row(
            children: [
              if (showMenuButton)
                Builder(
                  builder: (ctx) => IconButton(
                    icon: const Icon(Icons.menu),
                    onPressed: () => Scaffold.of(ctx).openDrawer(),
                  ),
                ),
              if (!showMenuButton) const SizedBox(width: 4),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => coordinator.navigate(HomeRoute()),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(
                    children: [
                      Icon(Icons.bolt, color: cs.primary, size: 22),
                      const SizedBox(width: 8),
                      Text(
                        'iconifyx',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(child: _SearchField(coordinator: coordinator)),
              const SizedBox(width: 12),
              IconButton(
                tooltip: 'Toggle theme',
                icon: BlocBuilder<ThemeCubit, ThemeMode>(
                  builder: (ctx, mode) => Icon(
                    mode == ThemeMode.dark
                        ? Icons.light_mode
                        : Icons.dark_mode,
                  ),
                ),
                onPressed: () => context.read<ThemeCubit>().toggle(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchField extends StatefulWidget {
  const _SearchField({required this.coordinator});

  final AppCoordinator coordinator;

  @override
  State<_SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<_SearchField> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 720),
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        textInputAction: TextInputAction.search,
        onSubmitted: (value) {
          widget.coordinator.navigate(SearchRoute(query: value.trim()));
        },
        onChanged: (value) {
          final q = value.trim();
          if (q.isEmpty) return;
          widget.coordinator.navigate(SearchRoute(query: q));
        },
        decoration: const InputDecoration(
          hintText: 'Search 300,000+ icons across 215 packs…',
          prefixIcon: Icon(Icons.search, size: 20),
        ),
      ),
    );
  }
}
