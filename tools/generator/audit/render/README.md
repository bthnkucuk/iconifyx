# `render-icon` — programmatic Flutter icon → PNG harness

A reliable, headless way to turn `(pack, iconName, mode, size)` into a PNG
file. Built so we can stop hand-screencapturing the example app every time
we want to debug an icon rendering bug (Solar alignment, FA paint-order
foreground regression, …), and so §4 visual-regression goldens + §26
visual-diff Phase 1 have a foundation to build on.

## Quickstart

```bash
cd tools/generator

# Solo icon
bun run render-icon mdi:home --size 256 --color 0xff0066ff --out /tmp/mdi.png

# Hint-layer duotone (Phosphor, Solar, ic …)
bun run render-icon solar:add-circle-bold-duotone --size 256 \
  --mode duotone --out /tmp/solar.png

# Paint-order duotone (logos, crypto-color, fluent-emoji-flat …) — pass a
# light --bg + a dark --color, and the foreground letterform will knock out
# in white (paintOrderSecondaryFallback) by default.
bun run render-icon logos:adobe-after-effects --size 256 \
  --bg 0xffffffff --out /tmp/logos.png

# Show only the primary layer (debugging which half of a duotone is wrong)
bun run render-icon solar:add-circle-bold-duotone --size 256 \
  --mode primary-only --out /tmp/primary.png
bun run render-icon solar:add-circle-bold-duotone --size 256 \
  --mode secondary-only --out /tmp/secondary.png
```

## Flags

| Flag                  | Default      | Notes                                                  |
| --------------------- | ------------ | ------------------------------------------------------ |
| `--size N`            | 256          | logical pixels, icon's box size                        |
| `--mode M`            | `duotone`    | `duotone` / `primary-only` / `secondary-only`          |
| `--color 0xAARRGGBB`  | `0xff000000` | primary layer colour                                   |
| `--bg 0xAARRGGBB`     | `0x00ffffff` | background fill (default: transparent)                 |
| `--secondary-color X` | (auto)       | override paint-order secondary colour                  |
| `--pixel-ratio N`     | 2            | output PNG device-pixel-ratio                          |
| `--out PATH`          | **required** | absolute or repo-relative output path                  |
| `--verbose`           | off          | stream `fvm flutter test` output                       |

The icon reference is the Iconify name (`prefix:name`), not the Dart
identifier — e.g. `solar:add-circle-bold-duotone`, not
`addCircleBoldDuotone`.

## Architecture (Approach A: `flutter test`)

We evaluated five approaches (see the prompt at §approach) and picked
**Approach A — `flutter test` in a headless isolate**. Reasoning in one
paragraph:

`flutter_test` runs entirely in a Dart test isolate with full Skia binding
and pubspec-driven font loading, but does NOT need a display server,
screencapture permission, or accessibility entitlements. We deliberately
do not use `matchesGoldenFile` + `--update-goldens` — that path stages PNG
output through a goldens directory with a fixed filename. Instead the
test calls `RepaintBoundary.toImage` directly and writes the PNG to a
path supplied via env var, which is faster and gives us a clean
success-marker protocol (`RENDER_OK <path> <bytes>` on stdout) to detect
silent failures. Approach B (`integration_test`) needs a real device or
web driver; Approach C (pure-Dart) hits the dart:ui-needs-engine-binding
wall; Approach D (vm-service-driven `flutter run`) is fragile;
Approach E (persistent stdin process) is a v2 optimisation we'll add if
we need sub-2s repeated calls.

### Flow

1. **Bun CLI** (`render-icon.ts`) parses `prefix:name` + flags, looks up
   the icon in `tools/generator/manifests/<prefix>.json` to find:
   - primary codepoint + fontFamily
   - duotone flag + duotoneKind (`hint` / `paintOrder` / `maskInternal`)
   - per-set package name (`iconifyx_<prefix>`)
2. **Pubspec rewrite + pub-get caching.** Edits the host's `pubspec.yaml`
   inside the `RENDER_HOST_DEPS_START` / `…_END` fence so it depends on
   only `iconifyx_core` + the requested per-set package (preserving the
   §32 per-set tree-shake invariant — the harness never depends on the
   `iconifyx` meta package). Skips `flutter pub get` if the pack hasn't
   changed since last run (`.deps.cache`).
3. **Run `fvm flutter test test/render_icon_test.dart`** with env vars
   describing the icon + render params. The test:
   - Reconstructs `IconifyIconData` at runtime (mirroring the website's
     `IconRecord.toIconifyData()` — see CLAUDE.md §1).
   - Paints the icon into a `RepaintBoundary` of the requested size.
   - `pumpAndSettle` + an extra `runAsync` drain so font load + glyph
     shape finish before snapshot.
   - `RepaintBoundary.toImage(pixelRatio:)` + `Image.toByteData(png)` +
     `File.writeAsBytes` to a staging path inside the host.
   - Prints `RENDER_OK <path> <bytes>` on stdout.
4. **CLI verifies + copies.** The Bun wrapper watches stdout for
   `RENDER_OK`, sanity-checks the staging file size (>100 B — guards
   against empty / corrupt PNGs that would silently slip through), then
   copies it to `--out`. If `RENDER_OK` never appears, we error with
   the captured stdout/stderr so the user can see what flutter_test
   actually said.

### Why this is reliable

- **No display server, no race conditions.** `flutter test` lives entirely
  inside a Dart isolate; there's no async app shutdown that could race
  with `File.writeAsBytes`. Tests exit only after `testWidgets` returns,
  and the success marker confirms the write actually happened.
- **Per-pack-only dependencies.** The rewritten pubspec means the
  rendered icon comes from the same font assets a real consumer would
  load — we're not bypassing the per-set bundling.
- **No display state to flake.** No window, no screenshot APIs, no
  hardware decoder — pure Skia + raw bytes.

### Three landmines we hit and pinned down

These are the bugs that turned this from a 90-min sketch into a
half-day hunt. Captured here so the next person doesn't pay them again:

1. **`File.writeAsBytes` MUST live inside `tester.runAsync(...)`** — same
   for `RepaintBoundary.toImage` and `Image.toByteData`. Outside
   runAsync the test isolate's fake_async clock holds dart:io
   microtasks, so the bytes get computed but the write hangs forever
   until flutter_test SIGTERMs the tester (~3 min of looking like
   "still running"). Confirmed by stage-printing each `await`: the
   final `await File.writeAsBytes` was the one that hung.
2. **`flutter test` runs with `--use-test-fonts --disable-asset-fonts`**
   by default, so dep-declared fonts in per-set packages' pubspecs
   never load. We sidestep by reading TTFs off disk via `dart:io File`
   inside the test and registering them with `FontLoader`. We register
   both the bare family AND the engine's package-prefixed lookup key
   (`packages/<pkg>/<family>`) because `TextStyle(fontFamily, package:)`
   resolves to the prefixed form.
3. **The viewport is 800×600 by default** — without resizing it, the
   `RepaintBoundary` captures the full viewport (not just the icon)
   and you get a 1600×1200 PNG with the icon centred in a sea of
   background. Setting `tester.view.physicalSize = Size(size, size)`
   + `devicePixelRatio = 1.0` makes the boundary exactly `size × size`,
   then `toImage(pixelRatio: N)` scales as expected.

### Canonical test file + concurrent-agent safety

`render-icon.ts` syncs the canonical `render_icon_test.dart`
(next to the CLI) into `host/test/` on every invocation. The harness
gets used in parallel by multiple agents and CI jobs, and external
tools have been seen to revert the host's test file to an older
version that omits the runAsync fix (landmine #1) — every render
after that point would hang for ~3 minutes. Re-syncing from the
canonical source on every call costs nothing and removes the failure
mode.

### What it does NOT do (v1)

- **No raw-SVG mode.** The prompt mentioned `raw-svg` as a bonus
  (rasterize the upstream Iconify SVG via resvg for comparison). Not
  shipped in v1 — easy to add as a separate code path that bypasses the
  flutter test entirely.

## Approach E (`render-server`) — persistent process, ~25 ms/icon

Single-shot `render-icon` pays a ~5-10 s `flutter test` bootstrap per
call. For bulk workloads (visual-diff Phase 2 corpus run over 340k
icons; golden refresh; etc.) this is fatal — even a 1 % sample is
hours. `render-server.ts` boots ONE `flutter test` process that
listens on a 127.0.0.1 TCP port and serves line-delimited JSON
render requests; per-icon cost drops to **~25 ms (mean) / ~140 ms
(p95)** after the one-time ~2 s bootstrap.

### Why TCP instead of stdin

The obvious design — pipe JSON into the test process's stdin — does
not work. `flutter test` owns the test isolate's stdin fd (used for
Observatory commands when `--start-paused`) and does NOT proxy the
parent process's stdin through. A 127.0.0.1 socket bypasses the
orchestrator entirely. `ServerSocket.bind` is unrestricted in test
isolates, and the loopback hop adds <1 ms.

### Bench

```bash
cd tools/generator
bun run render-server --bench 100              # 100 random icons, mixed packs
bun run render-server --bench 100 --prefix mdi # 100 random mdi icons
bun run render-server --bench 5 --seed 42 --keep  # debugging: leave PNGs in tmp/bench/
```

Last numbers (M-series, mixed packs, 100 icons):

```
bootstrap:      2734 ms
wall (render):  2585 ms
first request:  138 ms (cold font load for that pack)
mean / icon:    25.8 ms
p50 / p95 / max:23 / 40 / 138 ms
target met:     YES (<600 ms/icon)
```

### Programmatic use

```ts
import { RenderServer } from './render-server.ts';

const server = await RenderServer.start();
try {
  await server.render({
    prefix: 'mdi',
    name: 'home',
    size: 256,
    out: '/tmp/mdi-home.png',
    color: 0xff0066ff,
    bg: 0x00ffffff,
  });
} finally {
  await server.close();
}
```

The `out` path is absolute; the server's Dart side writes directly
to it via `dart:io File`. Use `RenderServer.start({ verbose: true })`
to stream the underlying `flutter test` output for debugging.

### Wired into visual-diff `--corpus`

```bash
# Sample 200 icons (uniform across packs), reproducible
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus --sample 200 --seed 12345

# Whole pack
bun run tools/generator/audit/visual-diff/cli.ts \
  --corpus --prefix mdi --sample 0
```

Produces `docs/audit/visual-diff/corpus/`:
- `rows.jsonl` — one JSON row per icon with verdict + metrics
- `summary.json` — totals + status/reason counts
- `CORPUS_REPORT.md` — human-readable summary + first-30 `different` examples
- `<prefix>__<name>/` — per-icon report dir (PNGs pruned when status=same)

### Architecture notes

- **One server serves every pack.** TTFs are loaded off disk via
  `FontLoader` from `dart:io File` reads, not from the pubspec's
  asset bundler. The host pubspec only needs `iconifyx_core`; per-set
  TTFs are reachable by their absolute path. First request per pack
  pays ~30 ms FontLoader cost; subsequent requests for the same pack
  are free.
- **Sequential rendering.** `WidgetTester` is single-threaded; the
  protocol serialises requests. Parallelism = run multiple servers
  (each on its own port). For 25 ms/icon a single server already
  delivers ~40 icons/s — enough for the 340k corpus in ~2.4 h, or
  the 5 % stratified sample (~17k) in ~7 min.
- **Per-icon request fields:** `primaryCp`, `primaryFamily`,
  `primaryPackage`, `secondaryCp?`, `secondaryFamily?`, `kind`,
  `mode?`, `size?`, `color?`, `bg?`, `secondaryColor?`,
  `pixelRatio?`, `out`, `id?`. The `id` is round-tripped so the
  client can correlate out-of-order responses (the server is FIFO
  in practice, but the protocol allows for it).
- **Cleanup.** `await server.close()` sends `{"shutdown": true}`,
  waits up to 5 s for the child to exit, then SIGTERMs. On process
  crash the orphaned `flutter test` exits when the socket closes.

### Files

```
tools/generator/audit/render/
├── render-icon.ts                 # single-shot Approach A (was)
├── render_icon_test.dart          # canonical single-shot test
├── render-server.ts               # NEW persistent Approach E (Bun CLI + RenderServer class)
├── render_server_test.dart        # NEW canonical server test (auto-synced into host/test/)
└── host/test/                     # both tests live here, kept in sync each call
```

## Constraints satisfied

- **All 225 packs.** Lookup is manifest-driven; nothing is hardcoded to
  mdi/solar/ph. Any `prefix:name` listed in `tools/generator/manifests/*.json`
  works.
- **All four icon flavours.** Solo, hint-layer duotone, paint-order
  duotone, mask-internal duotone — `IconifyIconData.duo(p, s, kind:)` is
  called with the right kind code from the manifest, and `IconifyIcon`
  dispatches the same way it does in a real app.
- **Correct alpha background.** Default `--bg 0x00ffffff` is fully
  transparent; the test wraps the icon in a `ColoredBox` that respects
  the requested alpha.
- **Actionable errors.** Missing manifest, deprecated icon, asking for
  `--mode secondary-only` on a solo icon, missing `RENDER_OK` marker, or
  a corrupt staging PNG all produce a clear top-level error message.

## File layout

```
tools/generator/audit/render/
├── render-icon.ts                 # Bun CLI wrapper (entry point)
├── render_icon_test.dart          # CANONICAL Dart test (auto-synced into host/test/)
├── refresh-samples.ts             # regenerate docs/audit/render-samples/*.png
├── README.md                      # this file
└── host/                          # Flutter test project (single, shared)
    ├── pubspec.yaml               # rewritten per-call (RENDER_HOST_DEPS_START fence)
    ├── lib/render_host.dart       # placeholder so pub get is happy
    ├── test/render_icon_test.dart # synced from ../render_icon_test.dart
    └── tmp/                       # staging output dir (PNG lands here first)
```

## Sample outputs

Five baseline samples are committed at `docs/audit/render-samples/`:

- `mdi-home.png` — simple solo
- `ph-acorn-duotone.png` — hint duotone (Phosphor)
- `solar-add-circle-bold-duotone.png` — hint duotone (the alignment-bug case)
- `logos-adobe-after-effects.png` — paint-order duotone (wide wordmark)
- `lets-icons-alarmclock-duotone-line.png` — mask-internal duotone

Regenerate them via:

```bash
bun run tools/generator/audit/render/refresh-samples.ts
```

## Adding more icons / tests

Just pass them on the command line; no codegen step needed.

```bash
bun run render-icon ph:heartDuotone --size 128 --out /tmp/h.png
bun run render-icon material-symbols:home --size 256 --out /tmp/m.png
```

The Iconify name comes straight from each pack's manifest under
`tools/generator/manifests/<prefix>.json`, key `icons.<name>`. Dart
identifiers (`PhIcons.acornDuotone`) are not used here — we look up via
the canonical Iconify name only.
