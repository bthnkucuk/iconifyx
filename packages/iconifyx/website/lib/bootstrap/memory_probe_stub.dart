import 'memory_probe.dart' show MemorySample;

/// Non-web stub. Mobile / desktop hosts have no `performance.memory`
/// equivalent reachable from Dart, and the website never runs there in
/// production — but `flutter test` and IDE analysis do, so we return
/// `null` to make `MemoryProbe` a no-op rather than a compile error.
Future<MemorySample?> sampleMemoryBytes() async => null;

/// Stub. No hostname concept off-web.
String? currentHostname() => null;

/// Stub. No page-reload concept off-web.
void reloadPage() {}
