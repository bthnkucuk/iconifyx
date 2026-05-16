# Flutter 3.44 and `final class IconData`

Flutter is in the middle of a quiet but consequential migration: the
SDK is moving toward marking `IconData` as `final class IconData {
... }`. Once it lands, every Flutter package that **subclasses**
`IconData` to attach extra metadata to icons will stop compiling.

This page explains what's changing, why it matters, and how iconifyx is
already on the correct side of the migration.

## What the Flutter team is changing

Today, `IconData` is a plain class with a public unnamed constructor.
Packages routinely subclass it:

```dart
// Pattern used by font_awesome_flutter, hugeicons_flutter, ...
class IconDataWithMetadata extends IconData {
  const IconDataWithMetadata(
    super.codePoint, {
    super.fontFamily,
    super.fontPackage,
    this.label,
  });
  final String label;
}
```

The intent is harmless — attach a human-readable label to each icon.
The cost is invisible: Flutter's `--tree-shake-icons` const_finder
**only walks `const IconData(...)` literals and records**. It does
NOT step into subclass constructors. Every `IconDataWithMetadata.named`
const therefore looks like opaque user code, the inner `IconData`
codepoint never makes it onto the keep-list, and the entire icon font
ships unsubsetted into your release build.

The Flutter team's planned mitigation is to **disallow subclassing**:

```dart
final class IconData {
  const IconData(int codePoint, { ... });
  // ...
}
```

Once that lands, `class Foo extends IconData` no longer compiles. The
ecosystem is forced to migrate, and apps stop silently shipping
unsubsetted fonts.

The change has already been pinned-and-verified once in this repo: the
historical commit `0d4bf28d` ("Pin Flutter 3.44.0-0.3.pre + verify
final class IconData compatibility") confirms the iconifyx family
builds clean against the pre-release SDK.

## Why iconifyx is unaffected

`IconifyIconData` is **not** a subclass of `IconData`. It is an
**extension type over a record**:

```dart
extension type const IconifyIconData(
  (IconData primary, IconData? secondary, int kindCode) _layers
) {
  const IconifyIconData.solo(IconData icon) : this((icon, null, kindSolo));
  const IconifyIconData.duo(IconData primary, IconData secondary,
                            { int kind = kindHint })
      : this((primary, secondary, kind));
  IconData get primary => _layers.$1;
  // ...
}
```

Two distinct properties of extension types make this safe:

1. **Extension types are not subclasses.** The kernel sees the
   underlying representation (here, a `Record`), not a class
   inheritance chain. Flutter making `IconData` `final` has no effect
   on our wrapper because we never extended `IconData` to begin with —
   we compose it as a record field.

2. **The const_finder walks records.** `--tree-shake-icons` introspects
   record positional fields and finds the inner `IconData` constants.
   Tree-shake works through the wrapper. (See
   [`doc/architecture.md`](architecture.md) for the empirical
   measurements that confirm this.)

So `IconifyIconData` simultaneously gets two things that look mutually
exclusive at first:

- A custom widget API (separate `solo` / `duo` constructors, a
  `kindCode` flag, getters with semantic names).
- Full tree-shake compatibility.

The lever that makes both work is **the const_finder's traversal
behaviour**, which the Flutter team explicitly preserved for records
when they introduced extension types in Dart 3.3.

## What this means for consumers

Nothing. The migration is invisible to anyone using iconifyx through
its normal API:

```dart
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

IconifyIcon(MdiIcons.home, size: 24);
```

When Flutter 3.44 ships and the migration completes, this code works
the same. The same TTFs get tree-shaken the same way. No deprecation
warning, no breaking change, no `// ignore_for_file:` linter overrides.

## What this means for packages that *do* subclass `IconData`

`font_awesome_flutter`, several "Iconify-in-Flutter" attempts that
predate iconifyx, and at least one of the `*_flutter` brand-icon
packages on pub.dev follow the subclass pattern. They will:

- Hit a compile error on Flutter 3.44 once the `final` modifier lands.
- Be obliged to migrate to either a wrapper composition pattern
  (similar to iconifyx) or accept that they ship unsubsetted fonts
  forever and the SDK will stop letting them get away with it.

If you're maintaining one of those packages and looking at how to
migrate, copy the `IconifyIconData` extension type pattern straight
out of [`packages/iconifyx_core/lib/src/icon_data.dart`](https://github.com/bthnkucuk/iconifyx/blob/main/packages/iconifyx_core/lib/src/icon_data.dart).
It's about 30 lines and resolves both the migration and the
tree-shake regression in one go.

## References

- Flutter Issue [#63920](https://github.com/flutter/flutter/issues/63920)
  — const_finder doesn't recurse into wrapper class constructors.
- Dart 3.3 release notes — extension types and their representation
  erasure.
- `test_apps/treeshake_regression/` in this repo — the CI gate that
  enforces the contract.
