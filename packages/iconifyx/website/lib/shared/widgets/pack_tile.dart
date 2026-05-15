import 'package:flutter/material.dart';

import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../theme/app_theme.dart';
import 'hover_box.dart';
import 'iconify_thumb.dart';

/// Theme-resolved colour bundle for [PackTile]. Resolved ONCE by the parent
/// (`_AllPacksGridSliver`, `_FeaturedPacksSection`) so each tile's build
/// path skips the 6× `Theme.of(context)` ternary cascade. For 206 packs in
/// the masonry sliver this saves repeated InheritedWidget walks on hover /
/// scroll. See website/CLAUDE.md §4 and RESEARCH_PLAN.md §23 #5.
class PackTilePalette {
  const PackTilePalette({
    required this.card,
    required this.rule,
    required this.paper2,
    required this.ink2,
    required this.muted,
    required this.coralSoft,
    required this.titleStyle,
  });

  final Color card;
  final Color rule;
  final Color paper2;
  final Color ink2;
  final Color muted;
  final Color coralSoft;
  final TextStyle? titleStyle;

  /// Resolves a palette from the current `Theme` / `AppTheme`. Cheap, but
  /// call sites should still hoist this out of any builder that runs more
  /// than once per parent rebuild.
  factory PackTilePalette.of(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return PackTilePalette(
      card: isDark ? AppTheme.cardDark : AppTheme.card,
      rule: isDark ? AppTheme.ruleDark : AppTheme.rule,
      paper2: isDark ? AppTheme.paper2Dark : AppTheme.paper2,
      ink2: isDark ? AppTheme.ink2Dark : AppTheme.ink2,
      muted: isDark ? AppTheme.mutedDark : AppTheme.muted,
      coralSoft: isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft,
      titleStyle: theme.textTheme.titleMedium,
    );
  }
}

/// Card used in the all-packs masonry and the home page's featured-packs row.
/// Square-ish, 4-icon preview at the top, name + meta + count pill below.
/// Hover lifts the card 2px and outlines in coral.
class PackTile extends StatelessWidget {
  const PackTile({super.key, required this.summary, this.palette});
  final PackSummary summary;

  /// Pre-resolved theme palette. When `null` the tile resolves it from
  /// `Theme.of(context)` itself — fine for one-off renders, but high-
  /// volume call sites (masonry sliver, featured grid) should pass a
  /// palette they computed once.
  final PackTilePalette? palette;

  @override
  Widget build(BuildContext context) {
    final p = palette ?? PackTilePalette.of(context);

    final samples = [...summary.preview.take(4)];
    while (samples.length < 4 && summary.preview.isNotEmpty) {
      samples.add(summary.preview.first);
    }

    return HoverBuilder(
      onTap: () =>
          appCoordinator.navigate(PackDetailRoute(prefix: summary.prefix)),
      builder: (ctx, hovered) => AnimatedSlide(
        duration: const Duration(milliseconds: 150),
        offset: Offset(0, hovered ? -2 / 64 : 0),
        child: Container(
          decoration: BoxDecoration(
            color: p.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: hovered ? AppTheme.coral : p.rule),
            boxShadow: hovered
                ? const [
                    BoxShadow(
                      color: Color(0x140E1320),
                      blurRadius: 30,
                      offset: Offset(0, 12),
                    ),
                  ]
                : null,
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  for (var i = 0; i < 4; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: AspectRatio(
                        aspectRatio: 1,
                        child: i < samples.length
                            ? _SampleCell(
                                record: samples[i],
                                bg: i == 0 ? p.coralSoft : p.paper2,
                                color: i == 0 ? AppTheme.coral : p.ink2,
                              )
                            : _EmptyCell(bg: p.paper2),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(summary.name,
                            style: p.titleStyle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(
                          '${summary.category} · ${summary.license}',
                          style: TextStyle(fontSize: 12, color: p.muted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: p.paper2,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(_fmt(summary.iconCount),
                        style: AppTheme.mono(size: 11, color: p.ink2)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SampleCell extends StatelessWidget {
  const _SampleCell(
      {required this.record, required this.bg, required this.color});
  final IconRecord record;
  final Color bg;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Center(
        child: IconifyThumb(record.toIconifyData(), size: 20, color: color),
      ),
    );
  }
}

class _EmptyCell extends StatelessWidget {
  const _EmptyCell({required this.bg});
  final Color bg;
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
    );
  }
}

String _fmt(int n) => n.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
