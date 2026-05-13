import 'package:flutter/material.dart';

import '../../bootstrap/icon_catalog.dart';
import '../../router/coordinator.dart';
import '../../router/routes/shell/pack_detail_route.dart';
import '../../theme/app_theme.dart';
import 'hover_box.dart';
import 'iconify_thumb.dart';

/// Card used in the all-packs masonry and the home page's featured-packs row.
/// Square-ish, 4-icon preview at the top, name + meta + count pill below.
/// Hover lifts the card 2px and outlines in coral.
class PackTile extends StatelessWidget {
  const PackTile({super.key, required this.summary});
  final PackSummary summary;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final paper2 = isDark ? AppTheme.paper2Dark : AppTheme.paper2;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final coralSoft = isDark ? AppTheme.coralSoftDark : AppTheme.coralSoft;

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
            color: card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: hovered ? AppTheme.coral : rule),
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
                                bg: i == 0 ? coralSoft : paper2,
                                color: i == 0 ? AppTheme.coral : ink2,
                              )
                            : _EmptyCell(bg: paper2),
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
                            style: Theme.of(context).textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(
                          '${summary.category} · ${summary.license}',
                          style: TextStyle(fontSize: 12, color: muted),
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
                      color: paper2,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(_fmt(summary.iconCount),
                        style: AppTheme.mono(size: 11, color: ink2)),
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
