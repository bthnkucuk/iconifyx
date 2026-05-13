import 'package:flutter/material.dart';
import 'package:oref/oref.dart';

/// A reusable hover-aware tappable container.
///
/// Built on oref's [SignalBuilder] + [signal]: the hover state is held in a
/// signal scoped to ONLY the inner subtree, so hover changes never bubble up
/// to trigger a parent setState/rebuild. This is the fix for the cascading
/// hover-flicker we saw with the bool `_hover + setState + AnimatedContainer`
/// pattern — the previous parent (e.g. the search palette body) would rebuild
/// every sibling row on each enter/exit.
class HoverBox extends StatelessWidget {
  const HoverBox({
    super.key,
    required this.child,
    this.onTap,
    this.bg = Colors.transparent,
    this.hoverBg,
    this.borderColor,
    this.hoverBorderColor,
    this.borderRadius = 0,
    this.padding,
    this.width,
    this.height,
    this.alignment,
    this.duration = const Duration(milliseconds: 120),
    this.cursor = SystemMouseCursors.click,
    this.translateOnHoverY = 0,
  });

  final Widget child;
  final VoidCallback? onTap;

  final Color bg;
  final Color? hoverBg;
  final Color? borderColor;
  final Color? hoverBorderColor;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final double? width;
  final double? height;
  final AlignmentGeometry? alignment;
  final Duration duration;
  final MouseCursor cursor;

  /// Optional small vertical translate applied while hovered (e.g. -1 / -2 px
  /// for "lift" effect on cards).
  final double translateOnHoverY;

  @override
  Widget build(BuildContext context) {
    return SignalBuilder(
      builder: (context) {
        final hover = signal(context, false);
        final hovered = hover();
        final effectiveBg = hovered ? (hoverBg ?? bg) : bg;
        final effectiveBorder = hovered
            ? (hoverBorderColor ?? borderColor)
            : borderColor;
        Widget result = AnimatedContainer(
          duration: duration,
          width: width,
          height: height,
          padding: padding,
          alignment: alignment,
          decoration: BoxDecoration(
            color: effectiveBg,
            borderRadius: BorderRadius.circular(borderRadius),
            border: effectiveBorder == null
                ? null
                : Border.all(color: effectiveBorder),
          ),
          child: child,
        );
        if (translateOnHoverY != 0) {
          result = AnimatedSlide(
            duration: duration,
            offset: Offset(0, hovered ? translateOnHoverY : 0),
            child: result,
          );
        }
        return MouseRegion(
          cursor: cursor,
          onEnter: (_) => hover.set(true),
          onExit: (_) => hover.set(false),
          child: GestureDetector(
            onTap: onTap,
            child: result,
          ),
        );
      },
    );
  }
}

/// Same as [HoverBox] but exposes the hover state to a builder so the child
/// can change foreground colors / decoration too without a parent rebuild.
class HoverBuilder extends StatelessWidget {
  const HoverBuilder({
    super.key,
    required this.builder,
    this.onTap,
    this.cursor = SystemMouseCursors.click,
  });

  final Widget Function(BuildContext context, bool hovered) builder;
  final VoidCallback? onTap;
  final MouseCursor cursor;

  @override
  Widget build(BuildContext context) {
    return SignalBuilder(
      builder: (context) {
        final hover = signal(context, false);
        return MouseRegion(
          cursor: cursor,
          onEnter: (_) => hover.set(true),
          onExit: (_) => hover.set(false),
          child: GestureDetector(
            onTap: onTap,
            child: builder(context, hover()),
          ),
        );
      },
    );
  }
}
