import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// Placeholder squircle [i] brand mark, drawn with a CustomPainter so it
/// stays sharp at any size. The user is going to drop in the real SVG —
/// once that lands, swap this for a `flutter_svg` SvgPicture and delete the
/// painter below.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 30, this.body, this.dot});

  final double size;

  /// Override the body (squircle) color. Defaults to coral.
  final Color? body;

  /// Override the i-dot color. Defaults to sky.
  final Color? dot;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _BrandMarkPainter(
          body: body ?? AppTheme.coral,
          stem: AppTheme.paper,
          dot: dot ?? AppTheme.sky,
        ),
      ),
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  _BrandMarkPainter({
    required this.body,
    required this.stem,
    required this.dot,
  });

  final Color body;
  final Color stem;
  final Color dot;

  // Spec coordinates are in a 64×64 viewBox. We scale to whatever size the
  // widget is laid out at.
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 64;
    canvas.scale(s);

    // Coral squircle body: superellipse-like rounded rect.
    final bodyPath = _squirclePath(0, 0, 64, 64, 18);
    canvas.drawPath(bodyPath, Paint()..color = body);

    // Lowercase 'i' stem: rounded rect 10×22 at (27, 28), corner 5.
    final stemRect =
        RRect.fromRectAndRadius(const Rect.fromLTWH(27, 28, 10, 22), const Radius.circular(5));
    canvas.drawRRect(stemRect, Paint()..color = stem);

    // Sky-blue dot of the i: circle at (32, 18), r 5.5.
    canvas.drawCircle(const Offset(32, 18), 5.5, Paint()..color = dot);
  }

  /// Approximation of the spec path
  /// `M32 2C10 2 2 10 2 32s8 30 30 30 30-8 30-30S54 2 32 2Z`
  /// — a superellipse-style squircle. We use a 12-point Bezier-driven RRect
  /// because Flutter's RRect is just a rounded rect, which doesn't have the
  /// continuous corner curvature of an Apple/iOS-style squircle.
  Path _squirclePath(double x, double y, double w, double h, double corner) {
    final p = Path();
    final cx = corner; // shorthand
    // Top edge
    p.moveTo(x + cx, y);
    p.lineTo(x + w - cx, y);
    p.cubicTo(x + w - cx / 2, y, x + w, y + cx / 2, x + w, y + cx);
    p.lineTo(x + w, y + h - cx);
    p.cubicTo(x + w, y + h - cx / 2, x + w - cx / 2, y + h, x + w - cx, y + h);
    p.lineTo(x + cx, y + h);
    p.cubicTo(x + cx / 2, y + h, x, y + h - cx / 2, x, y + h - cx);
    p.lineTo(x, y + cx);
    p.cubicTo(x, y + cx / 2, x + cx / 2, y, x + cx, y);
    p.close();
    return p;
  }

  @override
  bool shouldRepaint(covariant _BrandMarkPainter old) =>
      body != old.body || stem != old.stem || dot != old.dot;
}

/// Wordmark — "iconi**fyx**" with the `fyx` suffix in coral.
class BrandWordmark extends StatelessWidget {
  const BrandWordmark({super.key, this.fontSize = 18});

  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w800,
          letterSpacing: fontSize * -0.02,
          color: Theme.of(context).colorScheme.onSurface,
          fontFamily: Theme.of(context).textTheme.titleLarge?.fontFamily,
        ),
        children: const [
          TextSpan(text: 'iconi'),
          TextSpan(text: 'fyx', style: TextStyle(color: AppTheme.coral)),
        ],
      ),
    );
  }
}
