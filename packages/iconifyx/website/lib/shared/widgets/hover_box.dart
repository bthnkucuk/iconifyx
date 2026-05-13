import 'package:flutter/material.dart';
import 'package:oref/oref.dart';

/// A reusable hover-aware tappable container.
///
/// Uses oref signals + SignalBuilder, but with a subtle layout choice that
/// matters in practice:
///
///   MouseRegion(...)        <-- created ONCE; stable across hover changes
///     -> GestureDetector
///       -> SignalBuilder(builder: (ctx) { ... reads signal ... })
///
/// If `MouseRegion` lived INSIDE the SignalBuilder, every hover change would
/// rebuild MouseRegion → Flutter briefly drops cursor tracking → onExit/onEnter
/// flap → opaque hover-bg blink visible in light theme (invisible in dark
/// because coralSoftDark is translucent). With MouseRegion in the outer scope
/// and only the styled child reactive, hover changes touch nothing but the
/// `AnimatedContainer`'s decoration.
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
  final double translateOnHoverY;

  @override
  Widget build(BuildContext context) {
    // Signal lives at the outer build scope so it survives both the inner
    // SignalBuilder rebuild AND any parent rebuilds.
    final hover = signal(context, false);
    return MouseRegion(
      cursor: cursor,
      onEnter: (_) => hover.set(true),
      onExit: (_) => hover.set(false),
      child: GestureDetector(
        onTap: onTap,
        child: SignalBuilder(
          builder: (innerCtx) {
            final hovered = hover();
            final effectiveBg = hovered ? (hoverBg ?? bg) : bg;
            final effectiveBorder =
                hovered ? (hoverBorderColor ?? borderColor) : borderColor;
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
            return result;
          },
        ),
      ),
    );
  }
}

/// Same as [HoverBox] but exposes the hover state to a builder so the child
/// can drive its own decoration / foreground colors. MouseRegion is in the
/// outer scope so cursor tracking is stable — only the inner `SignalBuilder`
/// rebuilds on hover changes.
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
    final hover = signal(context, false);
    return MouseRegion(
      cursor: cursor,
      onEnter: (_) => hover.set(true),
      onExit: (_) => hover.set(false),
      child: GestureDetector(
        onTap: onTap,
        child: SignalBuilder(
          builder: (innerCtx) => builder(innerCtx, hover()),
        ),
      ),
    );
  }
}
