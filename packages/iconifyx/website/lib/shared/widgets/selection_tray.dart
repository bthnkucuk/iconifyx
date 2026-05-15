import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../bootstrap/selection_state.dart';
import '../../theme/app_theme.dart';
import 'hover_box.dart';

/// Sticky bottom "selection tray" surfaced whenever
/// [SelectionCubit]'s set is non-empty.
///
/// **Scope (FOUNDATION)**: count + Clear. Bulk-export actions ("Copy
/// import block", "Generate pubspec snippet", "Print sheet") are
/// intentionally NOT implemented in this commit — see §10 in
/// `docs/RESEARCH_PLAN.md`. A follow-up agent / day adds those.
///
/// **Placement**: mount inside the shell column so it overlays the
/// page content rather than competing with `Expanded(buildPath)` for
/// vertical space. `[AppShellOverlayTray]` wraps the page body in a
/// `Stack` for that.
class SelectionTray extends StatelessWidget {
  const SelectionTray({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SelectionCubit, SelectionState>(
      buildWhen: (prev, next) =>
          prev.isEmpty != next.isEmpty || prev.length != next.length,
      builder: (context, state) {
        if (state.isEmpty) return const SizedBox.shrink();
        return Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: const _TrayCard(),
            ),
          ),
        );
      },
    );
  }
}

class _TrayCard extends StatelessWidget {
  const _TrayCard();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = isDark ? AppTheme.cardDark : AppTheme.card;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    return Material(
      color: card,
      elevation: 12,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: rule),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.coral,
                borderRadius: BorderRadius.circular(999),
              ),
              child: BlocBuilder<SelectionCubit, SelectionState>(
                builder: (context, state) => Text(
                  '${state.length}',
                  style: AppTheme.mono(
                    size: 12,
                    weight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: BlocBuilder<SelectionCubit, SelectionState>(
                builder: (context, state) => Text(
                  state.length == 1
                      ? '1 icon selected'
                      : '${state.length} icons selected',
                  style: TextStyle(
                    color: ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            // Placeholder strip for future bulk-export actions. We render a
            // disabled stub so the layout is honest about what's coming —
            // and so adding the real buttons doesn't reshuffle widths in
            // a noisy way.
            Text(
              'EXPORT · COMING SOON',
              style: AppTheme.mono(
                size: 10,
                weight: FontWeight.w700,
                color: muted,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: 10),
            HoverBox(
              onTap: () => context.read<SelectionCubit>().clear(),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              borderRadius: 8,
              borderColor: rule,
              hoverBorderColor: AppTheme.coral,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.close_rounded, size: 14, color: ink),
                  const SizedBox(width: 4),
                  Text(
                    'Clear',
                    style: TextStyle(
                      color: ink,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A bookmark-style toggle for adding / removing an icon from the
/// selection tray. Used by `_IconCell` (long-press / right-click) and
/// the icon detail sheet (explicit button).
class SelectionToggleButton extends StatelessWidget {
  const SelectionToggleButton({
    super.key,
    required this.iconRef,
    this.size = 36,
    this.showLabel = false,
    this.label,
  });

  final IconRef iconRef;
  final double size;
  final bool showLabel;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final rule = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final ink2 = isDark ? AppTheme.ink2Dark : AppTheme.ink2;
    return BlocBuilder<SelectionCubit, SelectionState>(
      buildWhen: (prev, next) =>
          prev.contains(iconRef) != next.contains(iconRef),
      builder: (context, state) {
        final selected = state.contains(iconRef);
        final color = selected ? AppTheme.coral : ink2;
        final tooltipMsg = selected
            ? 'Remove from selection'
            : 'Add to selection';
        return Tooltip(
          message: tooltipMsg,
          child: HoverBox(
            onTap: () => context.read<SelectionCubit>().toggle(iconRef),
            padding: showLabel
                ? const EdgeInsets.symmetric(horizontal: 12, vertical: 8)
                : EdgeInsets.zero,
            width: showLabel ? null : size,
            height: showLabel ? null : size,
            borderRadius: showLabel ? 10 : 8,
            borderColor: rule,
            hoverBorderColor: AppTheme.coral,
            alignment: Alignment.center,
            child: showLabel
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        selected
                            ? Icons.bookmark_rounded
                            : Icons.bookmark_outline_rounded,
                        size: 16,
                        color: color,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        label ?? (selected ? 'In selection' : 'Add to selection'),
                        style: TextStyle(
                          color: color,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  )
                : Icon(
                    selected
                        ? Icons.bookmark_rounded
                        : Icons.bookmark_outline_rounded,
                    size: size * 0.55,
                    color: color,
                  ),
          ),
        );
      },
    );
  }
}
