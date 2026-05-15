import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A single icon reference held by the selection tray.
///
/// `(prefix, name)` is the canonical Iconify identity — every site lookup
/// path goes back through these two strings. We store them flat (not the
/// fully-resolved [IconRecord]) so the persisted set survives an upgrade
/// that re-issues codepoints or renames a font: the next page render
/// looks the records up by `(prefix, name)` against the live catalog.
class IconRef extends Equatable {
  const IconRef({required this.prefix, required this.name});

  final String prefix;
  final String name;

  @override
  List<Object?> get props => [prefix, name];

  String encode() => '$prefix/$name';

  static IconRef? tryDecode(String raw) {
    final i = raw.indexOf('/');
    if (i <= 0 || i >= raw.length - 1) return null;
    return IconRef(prefix: raw.substring(0, i), name: raw.substring(i + 1));
  }
}

/// Immutable snapshot of the selection tray.
class SelectionState extends Equatable {
  const SelectionState(this.refs);

  final Set<IconRef> refs;

  bool contains(IconRef ref) => refs.contains(ref);
  bool get isEmpty => refs.isEmpty;
  bool get isNotEmpty => refs.isNotEmpty;
  int get length => refs.length;

  @override
  List<Object?> get props => [refs];

  static const empty = SelectionState(<IconRef>{});
}

/// Holds the user's "selection tray" — a `Set<IconRef>` of icons the user
/// is collecting for bulk export (copy-import-block, generate-pubspec,
/// print-sheet, ... — see §10 in `docs/RESEARCH_PLAN.md`).
///
/// Persists to `localStorage` (via `shared_preferences` on web). State
/// survives page reload. The set is intentionally unbounded — a user
/// gathering a UI palette typically picks 30–80 icons; we don't impose
/// an arbitrary cap.
///
/// This cubit is the FOUNDATION layer: it owns the data + persistence
/// only. UI affordances (cell long-press, "Add" button in the icon
/// detail sheet, the bottom tray with bulk-export actions) live in
/// `shared/widgets/selection_tray.dart` and the pages themselves.
class SelectionCubit extends Cubit<SelectionState> {
  SelectionCubit(this._prefs, SelectionState initial) : super(initial);

  final SharedPreferences _prefs;

  static const _key = 'iconifyx_selection_v1';

  /// Loads any previously-persisted selection from localStorage and
  /// constructs a fresh cubit. Always succeeds: malformed entries are
  /// silently dropped (forward-compatible with future encoding changes).
  static Future<SelectionCubit> create() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const <String>[];
    final refs = <IconRef>{};
    for (final entry in raw) {
      final ref = IconRef.tryDecode(entry);
      if (ref != null) refs.add(ref);
    }
    return SelectionCubit(prefs, SelectionState(refs));
  }

  Future<void> add(IconRef ref) async {
    if (state.refs.contains(ref)) return;
    final next = {...state.refs, ref};
    emit(SelectionState(next));
    await _persist(next);
  }

  Future<void> remove(IconRef ref) async {
    if (!state.refs.contains(ref)) return;
    final next = {...state.refs}..remove(ref);
    emit(SelectionState(next));
    await _persist(next);
  }

  /// Toggles membership. Returns `true` if the ref is now selected,
  /// `false` if it was removed.
  Future<bool> toggle(IconRef ref) async {
    if (state.refs.contains(ref)) {
      await remove(ref);
      return false;
    }
    await add(ref);
    return true;
  }

  Future<void> clear() async {
    if (state.refs.isEmpty) return;
    emit(SelectionState.empty);
    await _prefs.remove(_key);
  }

  Future<void> _persist(Set<IconRef> refs) async {
    if (refs.isEmpty) {
      await _prefs.remove(_key);
      return;
    }
    await _prefs.setStringList(
      _key,
      refs.map((r) => r.encode()).toList(growable: false),
    );
  }
}
