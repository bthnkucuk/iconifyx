import 'package:flutter/material.dart';
import 'package:oref/oref.dart';

/// A reusable hover-aware tappable container.
///
/// **Background colors snap (no lerp).** This is the fix for the "gray flash"
/// the user reported on light theme — animating an `AnimatedContainer.color`
/// from `Colors.transparent` to an opaque color (e.g. `paper2 = #F1ECE3`)
/// makes Flutter interpolate through translucent midstates that on white
/// backgrounds render as muddy gray-tan. The "fade-through-midstate" was
/// visible in light because the start (transparent) and end (opaque) differ
/// strongly; in dark it was invisible because dark hover bgs are themselves
/// translucent overlays so the midstates are also low-alpha.
///
/// Transforms (translateOnHoverY for card lifts) still animate via
/// [AnimatedSlide] — there's no color-midstate issue for spatial movement.
///
/// MouseRegion lives in the outer build scope (not inside SignalBuilder) so
/// cursor tracking is stable; only the inner `SignalBuilder` rebuilds on
/// hover changes.
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
    this.duration = const Duration(milliseconds: 150),
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

  /// Only applied to transform (lift). Background/border snap instantly.
  final Duration duration;
  final MouseCursor cursor;
  final double translateOnHoverY;

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
          builder: (innerCtx) {
            final hovered = hover();
            final effectiveBg = hovered ? (hoverBg ?? bg) : bg;
            final effectiveBorder =
                hovered ? (hoverBorderColor ?? borderColor) : borderColor;
            Widget result = Container(
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
/// outer scope so cursor tracking is stable; the inner `SignalBuilder` is the
/// only subtree that rebuilds on hover changes.
///
/// Callers that need bg color changes should NOT use an `AnimatedContainer`
/// inside the builder (that re-introduces the lerp-through-midstates flicker)
/// — use a plain `Container` with the conditional decoration. Use
/// `AnimatedSlide` / `Transform.translate` for spatial animation.
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
