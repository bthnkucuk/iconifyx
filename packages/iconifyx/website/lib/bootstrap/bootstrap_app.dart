import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../router/coordinator.dart';
import '../theme/app_theme.dart';
import '../theme/theme_cubit.dart';
import 'bootstrap_bloc.dart';

class BootstrapApp extends StatefulWidget {
  const BootstrapApp({super.key});

  @override
  State<BootstrapApp> createState() => _BootstrapAppState();
}

class _BootstrapAppState extends State<BootstrapApp> {
  late final Future<ThemeCubit> _themeCubitFuture;
  late final BootstrapBloc _bootstrapBloc;

  @override
  void initState() {
    super.initState();
    _themeCubitFuture = ThemeCubit.create();
    _bootstrapBloc = BootstrapBloc()..add(const BootstrapStarted());
  }

  @override
  void dispose() {
    _bootstrapBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ThemeCubit>(
      future: _themeCubitFuture,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return MaterialApp(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            home: const _BootScreen(),
          );
        }
        return MultiBlocProvider(
          providers: [
            BlocProvider<ThemeCubit>.value(value: snapshot.data!),
            BlocProvider<BootstrapBloc>.value(value: _bootstrapBloc),
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

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
