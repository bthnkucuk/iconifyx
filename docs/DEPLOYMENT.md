# Website deployment

The iconifyx website (`packages/iconifyx/website`) is built and published to
GitHub Pages by [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml).
This document covers one-time setup, the renderer / routing / base-href
decisions, the custom-domain matrix, and the rollback procedure.

Implementation tracks [RESEARCH_PLAN.md §21](RESEARCH_PLAN.md#21--github-pages-deployment-plan).

## What the workflow does

On every push to `main` that touches the website, a per-set package, the
`.fvmrc` pin, or the workflow file itself:

1. Checks out the repo (no submodules, no LFS).
2. Installs the Flutter version pinned in `.fvmrc` via `subosito/flutter-action@v2`
   (currently `3.44.0-0.3.pre`).
3. Caches `~/.pub-cache`, keyed on the website's `pubspec.lock`.
4. Runs `flutter pub get` and `flutter analyze lib --no-fatal-infos`.
5. Builds `build/web` in release mode (`flutter build web --release
   --base-href "/icons/" --no-source-maps --no-tree-shake-icons`).
6. Guards the bundle size at < 250 MB (current build is ~163 MB → leaves
   ~50 % headroom).
7. Uploads the `build/web` directory as a Pages artifact.
8. A second `deploy` job calls `actions/deploy-pages@v4` to publish.

The whole pipeline takes ~6–10 min cold, ~3–5 min with the pub cache warm.

## Renderer + routing decisions

Locked in by §21; revisit only if performance changes warrant it.

- **Renderer: CanvasKit.** Flutter 3.44 removed `--web-renderer`; CanvasKit
  is the default for `flutter build web` (the alternative is `--wasm`).
  The site renders 15 k cells per pack via `IconifyIcon`'s `CustomPaint`
  + `TextPainter` path — the legacy HTML renderer would catastrophically
  regress that path even if it still existed.
- **Routing: hash.** `lib/main.dart` does **not** call
  `setUrlStrategy(PathUrlStrategy())`. URLs look like `/#/pack/mdi`,
  which Pages serves without any 404.html SPA fallback dance.
- **Base href: `/icons/`** — the default `https://<user>.github.io/icons/`
  Pages URL. Switching to a custom domain or user-Pages site: see the
  matrix below.

## Build flag notes (Flutter 3.44+)

The §21 spec was written against an older Flutter; two flags were dropped
upstream and one is required by this site's runtime:

| Flag in §21 spec | Status in 3.44 | What we use |
|---|---|---|
| `--web-renderer canvaskit` | removed (CanvasKit is default) | (omitted) |
| `--pwa-strategy none` | removed | (omitted — emitted SW is never registered from `web/index.html`) |
| `--source-maps=false` | renamed | `--no-source-maps` |
| (not in spec) | required by site | `--no-tree-shake-icons` |

The tree-shake disable is unavoidable: `IconRecord.toIconifyData()` in
[`lib/bootstrap/icon_catalog.dart`](../packages/iconifyx/website/lib/bootstrap/icon_catalog.dart)
reconstructs `IconifyIconData` from a JSON tuple at runtime to keep the
website from compile-time-blowing on ~338 k const fields, which trips
`--tree-shake-icons`'s "non-constant invocation of IconData" guard.

This disable is **website-only**. Per-app tree-shake for downstream
consumers stays intact — it's empirically guarded by
[`.github/workflows/treeshake-regression.yml`](../.github/workflows/treeshake-regression.yml).

## One-time GitHub Pages setup

After the workflow lands on `main` you must do this once per repo:

1. **Repo → Settings → Pages → Source**: pick **"GitHub Actions"** (NOT
   "Deploy from branch"). This is the only mode that picks up the
   artifact uploaded by `actions/upload-pages-artifact@v3`.
2. **Settings → Pages → Enabled** — confirm Pages is on for the repo.
3. (First push only) The first run takes a couple of minutes after Pages
   enablement before `https://<user>.github.io/icons/` resolves; subsequent
   deploys propagate in ~30 s.

You can verify the deployment after a green run on the Actions tab:
`gh run view --log <run-id>` ends with a `page_url` line.

## Custom domain matrix

| Scenario | URL | `--base-href` | `web/CNAME` |
|---|---|---|---|
| Default (project Pages) | `https://<user>.github.io/icons/` | `"/icons/"` | omit |
| User Pages (rename repo to `<user>.github.io`) | `https://<user>.github.io/` | `"/"` | omit |
| Custom apex / sub-domain | `https://iconifyx.dev/` | `"/"` | `iconifyx.dev` |

To switch, edit the `--base-href` value in `.github/workflows/deploy-web.yml`
and, if applicable, add a `web/CNAME` file containing the domain (one line,
no scheme).

Because routing is hash-based, the base-href is the only mount-path-coupled
config; no zenrouter changes are needed when moving paths.

## Day-2 perf migrations (deferred)

The workflow ships **everything from Pages on day 1**. The day-2 roadmap
that §21 / §11 / §12 lay out is independent of this workflow:

- Move `packs.json` (204 KB) to jsDelivr — §12.
- Shard `icons_index.json` (9.3 MB) + emit `names.bin` — §11.
- Lazy `FontLoader` per pack to bound CanvasKit heap growth — §9
  (shipped: `lib/bootstrap/font_loader_service.dart` + memory probe).

None of these require a workflow change; they're code edits in the
website that surface via the same `paths:` trigger.

## COOP/COEP for memory probe

[`MemoryProbe`](../packages/iconifyx/website/lib/bootstrap/memory_probe.dart)
prefers the W3C `performance.measureUserAgentSpecificMemory()` API — it's
the only browser primitive that includes CanvasKit's WASM heap (where
the unbounded per-pack-font growth covered in [RESEARCH_PLAN §9](RESEARCH_PLAN.md#9--website-performance)
actually lives) in its byte count.

That API is gated behind **cross-origin isolation**, which means the
server must emit two response headers on every document and bootstrap
script:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages does **not** let us configure response headers — it serves
static files with a fixed set. Effects on the probe today:

| Environment | Heap API in use | Accuracy |
|---|---|---|
| `<user>.github.io/icons/` (Pages) | `performance.memory.usedJSHeapSize` (legacy, Chromium-only) | Underestimate — excludes CanvasKit WASM heap |
| Safari / Firefox on Pages | none — falls back to visit-count signal | Coarse but bounded |
| Self-hosted with COOP/COEP headers | `measureUserAgentSpecificMemory()` | Accurate (full origin heap) |

`web/index.html` does ship `<meta http-equiv>` versions of both headers
as a forward-compat hook — environments that honour document-level
COOP/COEP will light up the accurate API automatically the moment we
move off Pages or in front of a CDN that respects them.

Follow-up options if the visit-count fallback proves too noisy in
practice:

1. Move static hosting to **Cloudflare Pages** / **Vercel** / a custom
   `_headers` provider that lets us set both headers at the origin.
2. Inject the headers via a **service worker** — see
   [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)
   for a turn-key drop-in. Requires registering a SW from
   `web/index.html` and accepting a one-reload latency on the first
   visit (the SW intercepts the second navigation onward).
3. Drop the heap probe entirely and rely on the visit-count signal
   plus an explicit "Refresh page" button in the top bar.

## Rollback procedure

GitHub Pages has no point-in-time restore. Three layered options:

### 1. Re-deploy a known-good SHA (fastest)

```bash
gh workflow run "Deploy website to GitHub Pages" --ref <good-sha>
```

Takes ~2 min back to that SHA's output. Requires the `workflow_dispatch`
trigger that this workflow declares.

### 2. Pin to a release branch

Edit the workflow to trigger on `branches: [release]`, then cherry-pick
stable commits onto `release`. Useful if `main` is shaky for a stretch.

### 3. Unpublish

Repo → Settings → Pages → **Unpublish site**. Removes the public URL
until you re-enable. Use as a last resort.

Deploy artifacts are retained 90 days in the Actions tab if you need to
download a specific build manually.

## Local sanity-check before pushing

The same commands the workflow runs:

```bash
cd packages/iconifyx/website
fvm flutter pub get
fvm flutter build web --release --base-href "/icons/" --no-source-maps --no-tree-shake-icons
du -sm build/web              # expect ~163 MB, must be < 250
ls build/web                  # index.html, flutter.js, main.dart.js, canvaskit/, assets/
grep '<base href' build/web/index.html   # expect "/icons/"
```

If `du` jumps significantly, investigate before pushing — the workflow's
250 MB guard exits non-zero and blocks the deploy.

## File ownership

| Path | Hand-written? |
|---|---|
| `.github/workflows/deploy-web.yml` | YES |
| `docs/DEPLOYMENT.md` (this file) | YES |
| `packages/iconifyx/website/build/web/**` | no (build output, gitignored) |
| `packages/iconifyx/website/web/index.html` | YES (`$FLUTTER_BASE_HREF` placeholder is load-bearing) |
| `packages/iconifyx/website/web/CNAME` | YES (only when custom domain is chosen) |
