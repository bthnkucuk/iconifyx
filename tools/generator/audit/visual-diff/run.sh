#!/usr/bin/env bash
# visual-diff convenience wrapper.
#
# Wraps `bun run cli.ts` so visual-diff can be invoked from anywhere in the
# repo (the underlying Bun CLI expects to be launched from
# tools/generator/). Forwards every argument verbatim.
#
# Usage:
#   tools/generator/audit/visual-diff/run.sh solar:add-circle-bold-duotone
#   tools/generator/audit/visual-diff/run.sh solar:add-circle-bold-duotone --skip-flutter
#   tools/generator/audit/visual-diff/run.sh ph:acorn-duotone --size 512
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$GEN_DIR"
exec bun run audit/visual-diff/cli.ts "$@"
