import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../router/coordinator.dart';
import '../theme/app_theme.dart';
import '../theme/theme_cubit.dart';
import 'bootstrap_bloc.dart';
import 'selection_state.dart';

class BootstrapApp extends StatefulWidget {
  const BootstrapApp({super.key});

  @override
  State<BootstrapApp> createState() => _BootstrapAppState();
}

class _BootstrapAppState extends State<BootstrapApp> {
  late final Future<_PrefsBundle> _prefsBundleFuture;
  late final BootstrapBloc _bootstrapBloc;

  @override
  void initState() {
    super.initState();
    _prefsBundleFuture = _PrefsBundle.load();
    _bootstrapBloc = BootstrapBloc()..add(const BootstrapStarted());
  }

  @override
  void dispose() {
    _bootstrapBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_PrefsBundle>(
      future: _prefsBundleFuture,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return MaterialApp(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            home: const _BootScreen(),
          );
        }
        final bundle = snapshot.data!;
        return MultiBlocProvider(
          providers: [
            BlocProvider<ThemeCubit>.value(value: bundle.theme),
            BlocProvider<BootstrapBloc>.value(value: _bootstrapBloc),
            BlocProvider<SelectionCubit>.value(value: bundle.selection),
          ],
          child: BlocBuilder<ThemeCubit, ThemeMode>(
            builder: (context, mode) => MaterialApp.router(
              title: 'iconifyx — every Iconify pack, in Flutter',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: mode,
              routerConfig: appCoordinator,
            ),
          ),
        );
      },
    );
  }
}

/// Bundles together the eagerly-loaded preferences cubits so the app
/// awaits both in parallel before mounting `MaterialApp.router`. This
/// guarantees the SelectionCubit's persisted set is available the
/// moment the first `_IconCell` mounts — no flash of empty selection.
class _PrefsBundle {
  const _PrefsBundle({required this.theme, required this.selection});

  final ThemeCubit theme;
  final SelectionCubit selection;

  static Future<_PrefsBundle> load() async {
    final results = await Future.wait([
      ThemeCubit.create(),
      SelectionCubit.create(),
    ]);
    return _PrefsBundle(
      theme: results[0] as ThemeCubit,
      selection: results[1] as SelectionCubit,
    );
  }
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
