import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

// Plus Jakarta Sans + JetBrains Mono are bundled as static assets (see the
// `flutter.fonts` block in pubspec.yaml). Earlier we were pulling them at
// runtime via google_fonts; on web that path racked up WASM allocations on
// top of the ~43 MB of bundled icon TTFs and crashed CanvasKit. Static
// assets are loaded once into the engine, no network, no exceptions.
const String _sansFamily = 'PlusJakartaSans';
const String _monoFamily = 'JetBrainsMono';

/// Design tokens from the iconfyx handoff. Source of truth is
/// `design_handoff_iconfyx_site/iconfyx_Site.html`'s `:root` block.
class AppTheme {
  AppTheme._();

  // ─── Light palette ────────────────────────────────────────────────────────
  static const coral = Color(0xFFFF6A3D);
  // Translucent coral overlay. Renders ~ #FFE9DF on paper/card backgrounds
  // (the spec's literal value), but animates cleanly through low-alpha
  // midpoints when hovering — opaque #FFE9DF lerped from Colors.transparent
  // passes through visible grayish-pink mids in light theme.
  static const coralSoft = Color(0x29FF6A3D);
  static const sky = Color(0xFF4DA3FF);
  static const mint = Color(0xFF18C29C);
  static const plum = Color(0xFF7C5CFF);
  static const sun = Color(0xFFFFC23D);

  static const ink = Color(0xFF0E1320);
  static const ink2 = Color(0xFF2A3041);
  static const muted = Color(0xFF6B7185);
  static const paper = Color(0xFFFAF6F0);
  static const paper2 = Color(0xFFF1ECE3);
  static const card = Color(0xFFFFFFFF);
  static const rule = Color(0x1A0E1320); // rgba(14,19,32,.10)
  static const rule2 = Color(0x0D0E1320); // rgba(14,19,32,.05)

  // ─── Dark palette ─────────────────────────────────────────────────────────
  static const inkDark = Color(0xFFF4F1EA);
  static const ink2Dark = Color(0xFFD7D2C8);
  static const mutedDark = Color(0xFF8A8E9C);
  static const paperDark = Color(0xFF0B0E16);
  static const paper2Dark = Color(0xFF11151F);
  static const cardDark = Color(0xFF161B27);
  static const ruleDark = Color(0x14FFFFFF); // rgba(255,255,255,.08)
  static const rule2Dark = Color(0x0AFFFFFF);
  static const coralSoftDark = Color(0x24FF6A3D); // rgba(255,106,61,.14)

  static ThemeData light() => _theme(
        brightness: Brightness.light,
        ink: ink,
        ink2: ink2,
        muted: muted,
        paper: paper,
        paper2: paper2,
        card: card,
        rule: rule,
        rule2: rule2,
        coralSoftToken: coralSoft,
      );

  static ThemeData dark() => _theme(
        brightness: Brightness.dark,
        ink: inkDark,
        ink2: ink2Dark,
        muted: mutedDark,
        paper: paperDark,
        paper2: paper2Dark,
        card: cardDark,
        rule: ruleDark,
        rule2: rule2Dark,
        coralSoftToken: coralSoftDark,
      );

  static ThemeData _theme({
    required Brightness brightness,
    required Color ink,
    required Color ink2,
    required Color muted,
    required Color paper,
    required Color paper2,
    required Color card,
    required Color rule,
    required Color rule2,
    required Color coralSoftToken,
  }) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: coral,
      onPrimary: Colors.white,
      secondary: sky,
      onSecondary: Colors.white,
      error: const Color(0xFFE53935),
      onError: Colors.white,
      surface: card,
      onSurface: ink,
      surfaceContainerLowest: paper,
      surfaceContainerLow: card,
      surfaceContainer: paper2,
      surfaceContainerHigh: paper2,
      surfaceContainerHighest: paper2,
      surfaceTint: Colors.transparent,
      onSurfaceVariant: muted,
      outline: rule,
      outlineVariant: rule,
    );

    final body = ThemeData(brightness: brightness).textTheme.apply(
          fontFamily: _sansFamily,
        );

    TextStyle jakarta({
      required double size,
      required FontWeight weight,
      Color? color,
      double? letterSpacing,
      double? height,
    }) =>
        TextStyle(
          fontFamily: _sansFamily,
          fontSize: size,
          fontWeight: weight,
          color: color ?? ink,
          letterSpacing: letterSpacing,
          height: height,
        );

    final textTheme = body.copyWith(
      displayLarge: jakarta(
        size: 64,
        weight: FontWeight.w800,
        letterSpacing: -2.88, // -0.045em @ 64px
        height: 1.02,
      ),
      headlineLarge: jakarta(
        size: 48,
        weight: FontWeight.w800,
        letterSpacing: -2.16,
        height: 1.04,
      ),
      headlineMedium: jakarta(
        size: 28,
        weight: FontWeight.w700,
        letterSpacing: -0.7,
        height: 1.15,
      ),
      headlineSmall: jakarta(
        size: 24,
        weight: FontWeight.w700,
        letterSpacing: -0.48,
      ),
      titleLarge:
          jakarta(size: 18, weight: FontWeight.w700, letterSpacing: -0.36),
      titleMedium:
          jakarta(size: 15, weight: FontWeight.w700, letterSpacing: -0.15),
      titleSmall: jakarta(size: 13, weight: FontWeight.w600),
      bodyLarge:
          jakarta(size: 18, weight: FontWeight.w400, color: muted, height: 1.5),
      bodyMedium:
          jakarta(size: 14, weight: FontWeight.w400, color: ink, height: 1.45),
      bodySmall: jakarta(size: 13, weight: FontWeight.w400, color: muted),
      labelLarge: jakarta(size: 14, weight: FontWeight.w500, color: ink2),
      labelMedium: jakarta(size: 13, weight: FontWeight.w500, color: ink2),
      labelSmall: jakarta(
          size: 11, weight: FontWeight.w700, color: muted, letterSpacing: 1.1),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: paper,
      canvasColor: paper,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      visualDensity: VisualDensity.standard,
      splashFactory: NoSplash.splashFactory,
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      hoverColor: paper2,
      focusColor: Colors.transparent,
      dividerColor: rule,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: paper,
        foregroundColor: ink,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleMedium,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: card,
        surfaceTintColor: Colors.transparent,
        shadowColor: const Color(0x140E1320),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: rule),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        isDense: true,
        fillColor: card,
        hintStyle: textTheme.bodyMedium?.copyWith(color: muted),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: rule),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: rule),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: coral, width: 1.2),
        ),
      ),
      dividerTheme: DividerThemeData(color: rule, thickness: 1, space: 1),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          overlayColor: WidgetStatePropertyAll(paper2),
          foregroundColor: WidgetStatePropertyAll(ink2),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          overlayColor: WidgetStatePropertyAll(paper2),
          foregroundColor: const WidgetStatePropertyAll(coral),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          textStyle: WidgetStatePropertyAll(
              textTheme.labelLarge?.copyWith(color: coral)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          backgroundColor: const WidgetStatePropertyAll(coral),
          foregroundColor: const WidgetStatePropertyAll(Colors.white),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: ink,
          borderRadius: BorderRadius.circular(6),
        ),
        textStyle: TextStyle(
          fontFamily: _monoFamily,
          color: paper,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        waitDuration: const Duration(milliseconds: 200),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: coral,
        thumbColor: coral,
        inactiveTrackColor: rule,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: muted,
        textColor: ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        horizontalTitleGap: 12,
        minLeadingWidth: 24,
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.fuchsia: FadeUpwardsPageTransitionsBuilder(),
        },
      ),
    );
  }

  // Helper text styles outside the TextTheme cubby — for cases the spec
  // calls JetBrains Mono explicitly (code blocks, mono labels, count pills).
  static TextStyle mono({
    double size = 12,
    FontWeight weight = FontWeight.w500,
    Color? color,
    double letterSpacing = 0,
    double height = 1.4,
  }) =>
      TextStyle(
        fontFamily: _monoFamily,
        fontSize: size,
        fontWeight: weight,
        color: color,
        letterSpacing: letterSpacing,
        height: height,
      );
}
