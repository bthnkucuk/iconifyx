import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

import '../../bootstrap/icon_catalog.dart';

/// Square icon tile in two variants:
///   - [IconTile.iconOnly] for dense pack grids (just the glyph)
///   - [IconTile.withName] for search results / preview cards (glyph + name)
class IconTile extends StatelessWidget {
  const IconTile.iconOnly({
    super.key,
    required this.icon,
    this.onTap,
    this.iconSize = 28,
  })  : showName = false;

  const IconTile.withName({
    super.key,
    required this.icon,
    this.onTap,
    this.iconSize = 32,
  })  : showName = true;

  final IconRecord icon;
  final VoidCallback? onTap;
  final double iconSize;
  final bool showName;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Tooltip(
            message: showName ? '' : icon.name,
            waitDuration: const Duration(milliseconds: 400),
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Expanded(
                    flex: showName ? 3 : 1,
                    child: FittedBox(
                      fit: BoxFit.contain,
                      child: IconifyIcon(
                        icon.toIconifyData(),
                        size: iconSize,
                        color: cs.onSurface,
                      ),
                    ),
                  ),
                  if (showName) ...[
                    const SizedBox(height: 6),
                    Flexible(
                      flex: 1,
                      child: Text(
                        icon.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: cs.onSurfaceVariant,
                              fontSize: 11,
                            ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
