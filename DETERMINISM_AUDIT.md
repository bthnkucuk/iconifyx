# Determinism audit (§16-A10)

Verifies that the generator emits byte-identical TTFs / Dart / manifests across runs (CLAUDE.md §5 + §33 canonical-metric contract). Output of this report is itself deterministic — same inputs always produce the same markdown.

## Run metadata

- Mode: `snapshot`
- Snapshot schema version: `1`
- `@iconify/json`: `2.2.472`
- Generator commit (current HEAD): `2c75f10cd167387663bd38e6321dcb04c112e504`
- Files snapshotted: **745** (295 TTFs, 225 Dart, 225 manifests)
- Baseline commit: `a34929d41eca1ffca185d2b73727500e963dcb3e`
- Baseline `@iconify/json`: `2.2.472`

## Baseline drift

_No drift — every committed artefact matches the baseline SHA._

## How this audit works

- **Snapshot:** SHA256 every committed generated artefact under `packages/iconifyx_*/assets/fonts/*.ttf`, `packages/iconifyx_*/lib/src/sets/*.dart`, and `tools/generator/manifests/*.json`.
- **Baseline:** `docs/audit/sha_baseline.json` (committed). Comparing HEAD against it shows what drifted since the baseline was taken.
- **Empirical (`--regen-twice`):** snapshot, run `bun run generate`, snapshot again, diff. Catches non-determinism that an offline diff can't see.
- **Promote (`--update-baseline`):** writes the current snapshot into `docs/audit/sha_baseline.json`. Use after a deliberate regen on a green pipeline.
