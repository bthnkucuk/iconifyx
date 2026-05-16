import 'package:flutter/material.dart';

import '../../bootstrap/docs_loader.dart';
import '../../router/routes/shell/app_shell_layout.dart';
import '../../shared/widgets/markdown_body.dart';
import '../../shared/widgets/site_footer.dart';
import '../../theme/app_theme.dart';

/// `/changelog` — renders the iconifyx meta package's CHANGELOG.md
/// directly, with the same theming applied as `/docs/...`. Horizontal
/// padding matches `PackDetailPage`'s content column (28 px inside the
/// 1240-wide centred page column) so the body lines up with the rest of
/// the site instead of touching the page chrome.
class ChangelogPage extends StatefulWidget {
  const ChangelogPage({super.key});

  @override
  State<ChangelogPage> createState() => _ChangelogPageState();
}

class _ChangelogPageState extends State<ChangelogPage> {
  late final Future<String> _changelogFuture = DocsLoader.loadChangelog();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final tt = Theme.of(context).textTheme;
    final scaffoldBg = Theme.of(context).scaffoldBackgroundColor;

    return Material(
      color: scaffoldBg,
      child: LayoutBuilder(
        builder: (context, c) {
          final pad = ((c.maxWidth - AppShellLayout.pageMaxWidth) / 2)
              .clamp(0.0, double.infinity);
          // 28 px inner horizontal inset matches `_PinnedTitleDelegate` and
          // `PackDetailPage`'s breadcrumb / grid columns. Beyond a 760-px
          // body cap so prose stays readable on wide viewports.
          final contentMax =
              (c.maxWidth - 2 * pad - 56) < 760 ? double.infinity : 760.0;
          return CustomScrollView(
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(pad + 28, 36, pad + 28, 16),
                sliver: SliverToBoxAdapter(
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
                        style: (tt.headlineLarge ?? const TextStyle())
                            .copyWith(
                          color: ink,
                          fontSize: 36,
                          height: 1.08,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Notable changes to the iconifyx package family. '
                        'Sourced from `packages/iconifyx/CHANGELOG.md`.',
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
              SliverPadding(
                padding: EdgeInsets.fromLTRB(pad + 28, 16, pad + 28, 32),
                sliver: SliverToBoxAdapter(
                  child: Align(
                    alignment: Alignment.topLeft,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: contentMax),
                      child: FutureBuilder<String>(
                        future: _changelogFuture,
                        builder: (context, snap) {
                          if (snap.connectionState !=
                              ConnectionState.done) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 64),
                              child: Center(
                                child: SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ),
                            );
                          }
                          if (snap.hasError || !snap.hasData) {
                            return Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 48),
                              child: Text(
                                'Could not load the changelog.\n'
                                '${snap.error ?? ''}',
                                style:
                                    Theme.of(context).textTheme.titleMedium,
                              ),
                            );
                          }
                          return MarkdownBody(snap.data!);
                        },
                      ),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: pad),
                sliver: const SliverToBoxAdapter(child: SiteFooter()),
              ),
            ],
          );
        },
      ),
    );
  }
}
