import 'package:flutter/material.dart';
import 'package:zentoast/zentoast.dart';

import '../../theme/app_theme.dart';

/// Sonner-style toast facade for the iconifyx website.
///
/// Wraps [zentoast]'s headless `Toast(...)` API in a small, opinionated
/// helper that:
///
/// - Renders cards using [AppTheme] surface / onSurface / outline tokens
///   (so the toast tracks light / dark mode automatically).
/// - Picks an accent colour from the variant (`success` → mint, `error`
///   → error red, `warning` → coral, `info` → sky, `general` → muted).
/// - Optionally shows a title + body, plus an inline action button.
///
/// Replaces every `ScaffoldMessenger.showSnackBar(...)` call in the
/// website. zentoast's `ToastViewer` is mounted globally in
/// `BootstrapApp.build` — `BuildContext` simply needs to be below that
/// (every widget in the app is).
///
/// The shell of the card matches the "sonner-like" pattern from the
/// zentoast example: white / surface background, 12-px corner radius,
/// soft drop shadow, hairline border, dense padding, optional left-side
/// accent stripe. Enter / exit physics (snappy-spring + drag-to-dismiss
/// + hover-expand) ship with the package's `ToastViewer`.
class AppToast {
  AppToast._();

  /// Default visible duration when the caller doesn't override.
  static const Duration _defaultDuration = Duration(seconds: 4);

  /// Quick success — no title, single-line message.
  static void success(
    BuildContext context, {
    required String message,
    String? title,
    Duration? duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    _show(
      context,
      variant: _ToastVariant.success,
      title: title,
      message: message,
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  /// Warning — used for the memory-probe banner.
  static void warning(
    BuildContext context, {
    required String message,
    String? title,
    Duration? duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    _show(
      context,
      variant: _ToastVariant.warning,
      title: title,
      message: message,
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  /// Informational — used when the operation succeeded but isn't really
  /// success-flavoured (e.g. "URL copied" — we don't celebrate it).
  static void info(
    BuildContext context, {
    required String message,
    String? title,
    Duration? duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    _show(
      context,
      variant: _ToastVariant.info,
      title: title,
      message: message,
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  /// Failure — used when an operation explicitly failed.
  static void error(
    BuildContext context, {
    required String message,
    String? title,
    Duration? duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    _show(
      context,
      variant: _ToastVariant.error,
      title: title,
      message: message,
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  static void _show(
    BuildContext context, {
    required _ToastVariant variant,
    required String message,
    String? title,
    Duration? duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    // The card's intrinsic height adapts to title / body / action, but
    // zentoast lays its stack using a fixed `height`; we approximate from
    // the present content. Empirically: 56 single-line, 80 with title or
    // action, 96 with both.
    final hasTitle = title != null && title.isNotEmpty;
    final hasAction = actionLabel != null && onAction != null;
    final estimatedHeight = (hasTitle && hasAction)
        ? 92.0
        : (hasTitle || hasAction)
            ? 80.0
            : 60.0;

    final toast = Toast(
      height: estimatedHeight,
      category: variant.zentoastCategory,
      builder: (t) => _SonnerCard(
        toast: t,
        variant: variant,
        title: title,
        message: message,
        actionLabel: actionLabel,
        onAction: onAction,
      ),
    );
    toast.show(context);

    // zentoast doesn't expose per-toast duration; the viewer's `delay` is
    // global. For longer-than-default durations (memory warning is 10s),
    // we manually schedule a hide on top of the viewer's timer — whichever
    // fires first wins. For shorter, we trust the viewer.
    final viewerDelay = _defaultDuration;
    final target = duration ?? viewerDelay;
    if (target > viewerDelay) {
      Future<void>.delayed(target, () {
        if (context.mounted) toast.hide(context);
      });
    }
  }
}

enum _ToastVariant {
  success,
  warning,
  info,
  error;

  ToastCategory get zentoastCategory => switch (this) {
        _ToastVariant.success => ToastCategory.success,
        _ToastVariant.warning => ToastCategory.warning,
        _ToastVariant.info => ToastCategory.general,
        _ToastVariant.error => ToastCategory.error,
      };
}

class _SonnerCard extends StatelessWidget {
  const _SonnerCard({
    required this.toast,
    required this.variant,
    required this.message,
    this.title,
    this.actionLabel,
    this.onAction,
  });

  final Toast toast;
  final _ToastVariant variant;
  final String? title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppTheme.cardDark : AppTheme.card;
    final foreground = isDark ? AppTheme.inkDark : AppTheme.ink;
    final muted = isDark ? AppTheme.mutedDark : AppTheme.muted;
    final outline = isDark ? AppTheme.ruleDark : AppTheme.rule;
    final accent = _accentFor(variant);

    final hasTitle = title != null && title!.isNotEmpty;
    final hasAction =
        actionLabel != null && actionLabel!.isNotEmpty && onAction != null;

    return Material(
      type: MaterialType.transparency,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: outline),
          boxShadow: [
            BoxShadow(
              color: isDark
                  ? const Color(0x66000000)
                  : const Color(0x1A0E1320),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Left accent stripe — sonner uses a coloured edge to mark
              // the variant without dyeing the entire card.
              Container(width: 3, color: accent),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      _VariantIcon(variant: variant, color: accent),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (hasTitle)
                              Text(
                                title!,
                                style: TextStyle(
                                  fontFamily: 'PlusJakartaSans',
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: foreground,
                                  height: 1.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            if (hasTitle) const SizedBox(height: 2),
                            Text(
                              message,
                              style: TextStyle(
                                fontFamily: 'PlusJakartaSans',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w500,
                                color: hasTitle ? muted : foreground,
                                height: 1.35,
                              ),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      if (hasAction) ...[
                        const SizedBox(width: 10),
                        _ActionButton(
                          label: actionLabel!,
                          color: accent,
                          onTap: () {
                            onAction!.call();
                            toast.hide(context);
                          },
                        ),
                      ],
                      const SizedBox(width: 4),
                      _CloseButton(
                        color: muted,
                        onTap: () => toast.hide(context),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _accentFor(_ToastVariant variant) => switch (variant) {
        _ToastVariant.success => AppTheme.mint,
        _ToastVariant.warning => AppTheme.coral,
        _ToastVariant.info => AppTheme.sky,
        _ToastVariant.error => const Color(0xFFE53935),
      };
}

class _VariantIcon extends StatelessWidget {
  const _VariantIcon({required this.variant, required this.color});

  final _ToastVariant variant;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final iconData = switch (variant) {
      _ToastVariant.success => Icons.check_circle_rounded,
      _ToastVariant.warning => Icons.warning_amber_rounded,
      _ToastVariant.info => Icons.info_outline_rounded,
      _ToastVariant.error => Icons.error_outline_rounded,
    };
    return Icon(iconData, size: 18, color: color);
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'PlusJakartaSans',
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: color,
            letterSpacing: 0.1,
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.color, required this.onTap});

  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Icon(Icons.close_rounded, size: 14, color: color),
      ),
    );
  }
}
