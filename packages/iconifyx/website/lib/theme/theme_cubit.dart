import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeCubit extends Cubit<ThemeMode> {
  ThemeCubit(this._prefs, ThemeMode initial) : super(initial);

  final SharedPreferences _prefs;

  static const _key = 'iconifyx_theme_mode';

  static Future<ThemeCubit> create() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    final initial = switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    return ThemeCubit(prefs, initial);
  }

  Future<void> setMode(ThemeMode mode) async {
    emit(mode);
    await _prefs.setString(_key, switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    });
  }

  Future<void> toggle() async {
    final next = switch (state) {
      ThemeMode.dark => ThemeMode.light,
      ThemeMode.light => ThemeMode.dark,
      ThemeMode.system => ThemeMode.dark,
    };
    await setMode(next);
  }
}
