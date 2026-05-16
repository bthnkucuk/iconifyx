import 'package:flutter/material.dart';

import '../../bootstrap/docs_loader.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../shared/widgets/markdown_body.dart';
import '../../theme/app_theme.dart';

/// `/changelog` — renders the iconifyx meta package's CHANGELOG.md
/// directly, with the same theming applied as `/docs/...`.
class ChangelogPage extends StatefulWidget {
  const ChangelogPage({super.key});

  @override
  State<ChangelogPage> createState() => _ChangelogPageState();
}

class _ChangelogPageState extends State<ChangelogPage> {
  late final Future<String> _changelogFuture;

  @override
  void initState() {
    super.initState();
    _changelogFuture = DocsLoader.loadChangelog();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final tt = Theme.of(context).textTheme;

    return PageContainer.slivers(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(0, 36, 0, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CHANGELOG',
                  style: AppTheme.mono(
                    size: 11,
                    color: muted,
                    weight: FontWeight.w700,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Release history',
                  style: (tt.headlineLarge ?? const TextStyle()).copyWith(
                    color: ink,
                    fontSize: 36,
                    height: 1.08,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Notable changes to the iconifyx package family. Sourced from '
                  '`packages/iconifyx/CHANGELOG.md`.',
                  style: (tt.bodyMedium ?? const TextStyle()).copyWith(
                    color: muted,
                    height: 1.55,
                  ),
                ),
                const SizedBox(height: 20),
                Divider(
                  color: isDark ? AppTheme.ruleDark : AppTheme.rule,
                  height: 1,
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: LayoutBuilder(
            builder: (context, c) {
              final contentMax = c.maxWidth < 760 ? c.maxWidth : 760.0;
              return Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 64),
                child: Align(
                  alignment: Alignment.topLeft,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: contentMax),
                    child: FutureBuilder<String>(
                      future: _changelogFuture,
                      builder: (context, snap) {
                        if (snap.connectionState != ConnectionState.done) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 64),
                            child: Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          );
                        }
                        if (snap.hasError || !snap.hasData) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 48),
                            child: Text(
                              'Could not load the changelog.\n'
                              '${snap.error ?? ''}',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          );
                        }
                        return MarkdownBody(snap.data!);
                      },
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
