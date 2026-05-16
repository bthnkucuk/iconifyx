import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:zentoast/zentoast.dart';

import '../router/coordinator.dart';
import '../shared/toast/app_toast.dart';
import '../theme/app_theme.dart';
import '../theme/theme_cubit.dart';
import 'bootstrap_bloc.dart';
import 'font_loader_service.dart';
import 'memory_probe.dart';
import 'selection_state.dart';

@JS('globalThis')
external JSObject get _globalThis;

class BootstrapApp extends StatefulWidget {
  const BootstrapApp({super.key});

  @override
  State<BootstrapApp> createState() => _BootstrapAppState();
}

class _BootstrapAppState extends State<BootstrapApp> {
  late final Future<_PrefsBundle> _prefsBundleFuture;
  late final BootstrapBloc _bootstrapBloc;
  late final MemoryProbe _memoryProbe;

  @override
  void initState() {
    super.initState();
    _prefsBundleFuture = _PrefsBundle.load();
    _bootstrapBloc = BootstrapBloc()..add(const BootstrapStarted());
    _memoryProbe = MemoryProbe(
      onThresholdCrossed: _onMemoryThresholdCrossed,
    )..start();
    // Keep the probe's visit-count signal in sync with the FontLoaderService
    // so we can fire a refresh hint even when no heap-measurement API is
    // available (Safari / Firefox without COOP/COEP).
    appCoordinator.routerDelegate.addListener(_onRouteChanged);
  }

  @override
  void dispose() {
    appCoordinator.routerDelegate.removeListener(_onRouteChanged);
    _memoryProbe.stop();
    _bootstrapBloc.close();
    super.dispose();
  }

  void _onRouteChanged() {
    _memoryProbe.noteVisit(FontLoaderService.instance.loadedPackCount);
  }

  void _onMemoryThresholdCrossed() {
    // The probe ticks on a periodic Timer, so we don't have a widget
    // context. zenrouter exposes the live NavigatorState; its context is
    // mounted below the ToastProvider (root of `main.dart`), so it's a
    // valid surface for `Toast(...).show(context)`.
    final navigatorContext =
        appCoordinator.routerDelegate.navigatorKey.currentContext;
    if (navigatorContext == null) return;
    AppToast.warning(
      navigatorContext,
      title: 'High memory usage',
      message:
          'Memory usage is high after browsing many packs. Refresh the page to reclaim memory.',
      duration: const Duration(seconds: 10),
      actionLabel: 'Refresh',
      onAction: _reloadPage,
    );
  }

  void _reloadPage() {
    // Web-only — reload the document. On native targets this is a no-op
    // (the memory probe itself only fires on web, see
    // `memory_probe_web.dart`, so the action button should only ever be
    // tapped on a web build anyway).
    if (!kIsWeb) return;
    try {
      final location =
          _globalThis.getProperty<JSObject?>('location'.toJS);
      location?.callMethod<JSAny?>('reload'.toJS);
    } catch (_) {
      // Either `location` is missing (weird embedding) or `reload`
      // failed — degrading silently is safer than crashing the toast.
    }
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
              // Mount the zentoast viewer in the MaterialApp `builder` so
              // it sits above every route (including sheet routes) but
              // still inherits Directionality / MediaQuery / theme from
              // MaterialApp. visibleCount: 3 → older toasts collapse and
              // fade behind the newest; delay: 4s default auto-dismiss
              // (callers can override via AppToast.*(duration:)).
              builder: (context, child) {
                return ToastThemeProvider(
                  data: const ToastTheme(
                    viewerPadding: EdgeInsets.fromLTRB(16, 16, 16, 24),
                    gap: 10,
                  ),
                  child: Stack(
                    children: [
                      if (child != null) Positioned.fill(child: child),
                      // ToastViewer's internal Align shrinks the viewer
                      // to its toast stack, so it only intercepts pointer
                      // events inside its own card area (drag-to-dismiss,
                      // hover-expand). The rest of the screen passes
                      // through to the routes below.
                      const Positioned.fill(
                        child: SafeArea(
                          child: ToastViewer(
                            alignment: Alignment.bottomRight,
                            delay: Duration(seconds: 4),
                            visibleCount: 3,
                            width: 380,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
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
