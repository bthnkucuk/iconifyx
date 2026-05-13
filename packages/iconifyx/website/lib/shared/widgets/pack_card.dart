import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/icon_catalog.dart';

/// Square card showing a pack: name, icon count, and a 2x2 preview of icons.
/// Modeled on allsvgicons.com's pack cards.
class PackCard extends StatelessWidget {
  const PackCard({
    super.key,
    required this.summary,
    required this.onTap,
  });

  final PackSummary summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final preview = summary.preview.take(4).toList(growable: false);
    return AspectRatio(
      aspectRatio: 1,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  summary.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${_formatCount(summary.iconCount)} icons',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: GridView.count(
                    crossAxisCount: 2,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      for (var i = 0; i < 4; i++)
                        if (i < preview.length)
                          _PreviewIcon(record: preview[i], color: cs.onSurface)
                        else
                          const SizedBox.shrink(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewIcon extends StatelessWidget {
  const _PreviewIcon({required this.record, required this.color});
  final IconRecord record;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Center(
        child: FittedBox(
          fit: BoxFit.contain,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: IconifyIcon(
              record.toIconifyData(),
              size: 28,
              color: color,
            ),
          ),
        ),
      ),
    );
  }
}

String _formatCount(int n) {
  return n.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
}
