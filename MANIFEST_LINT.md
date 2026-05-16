# Manifest + codegen lint

Generated 2026-05-16; `@iconify/json` ^2.2.300. Three checks: A1 (manifest internal consistency), A2 (Dart codegen ↔ TTF reverse reconciliation), A3 (identifier rename detection across regens). Output is deterministic — same manifests + Dart + TTFs → byte-identical report.

## Summary

- Packs scanned: **225**
- A1 violations: **0 icon/font-level issues across 0 packs**
- A2 violations: **0 orphan consts across 0 packs**
- A3 renames detected: **0 icons across 0 packs** (vs previous git HEAD)

Detail per pack: [`docs/audit/manifest-lint/<prefix>.json`](docs/audit/manifest-lint/). Markdown caps each section at the top 100 rows for readability.

## A1 violations — manifest internal consistency

_No A1 violations — every manifest is internally consistent._

## A2 violations — Dart codegen ↔ TTF reverse reconciliation

_No A2 violations — every emitted `IconData(0xNNNN, …)` in generated Dart resolves to a non-empty glyph in the declared TTF._

## A3 renames (across last regen)

_No identifier renames detected — every non-deprecated icon preserved its Dart identifier vs. HEAD._

## Per-pack detail

Click through for the full per-pack breakdown (every flagged row).

| Pack | A1 | A2 | A3 | Detail |
|---|---:|---:|---:|---|
