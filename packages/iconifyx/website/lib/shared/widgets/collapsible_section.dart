import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'hover_box.dart';

/// Header row with a label + chevron on the trailing edge that toggles the
/// visibility of [child]. Used to collapse the filter sidebars on narrow
/// viewports so the icon grid stays the focus on mobile.
///
/// Defaults to [initiallyExpanded] = false so mobile users land on a tidy
/// top of page instead of a long block of controls.
class CollapsibleSection extends StatefulWidget {
  const CollapsibleSection({
    super.key,
    required this.title,
    required this.child,
    this.initiallyExpanded = false,
  });

  final String title;
  final Widget child;
  final bool initiallyExpanded;

  @override
  State<CollapsibleSection> createState() => _CollapsibleSectionState();
}

class _CollapsibleSectionState extends State<CollapsibleSection>
    with SingleTickerProviderStateMixin {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: rule),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          HoverBox(
            onTap: () => setState(() => _expanded = !_expanded),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            borderRadius: 0,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: AppTheme.mono(
                      size: 11,
                      color: muted,
                      weight: FontWeight.w700,
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
                AnimatedRotation(
                  duration: const Duration(milliseconds: 160),
                  turns: _expanded ? 0.5 : 0,
                  child: Icon(Icons.expand_more, size: 18, color: ink),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _expanded
                ? Padding(
                    padding:
                        const EdgeInsets.fromLTRB(8, 4, 8, 12),
                    child: widget.child,
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}
