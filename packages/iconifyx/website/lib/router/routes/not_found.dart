import 'package:flutter/material.dart';

import '../coordinator.dart';
import '../route.dart';
import 'shell/app_shell_layout.dart';
import 'shell/home_route.dart';

class NotFoundRoute extends AppRoute {
  NotFoundRoute({required this.uri});

  final Uri uri;

  @override
  Type get layout => AppShellLayout;

  @override
  List<Object?> get props => [uri];

  @override
  Uri toUri() => Uri.parse('/not-found');

  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.travel_explore, size: 56),
            const SizedBox(height: 16),
            Text(
              'Couldn\'t find ${uri.path}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => coordinator.replace(HomeRoute()),
              child: const Text('Back to home'),
            ),
          ],
        ),
      ),
    );
  }
}
