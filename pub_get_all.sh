#!/usr/bin/env bash
#
# pub_get_all.sh — run `fvm flutter pub get` for every Flutter package in the
# iconifyx monorepo. Runs N at a time in parallel (default 8).
#
# Usage:
#   ./pub_get_all.sh                   # default 8 parallel
#   PARALLELISM=4 ./pub_get_all.sh     # cap parallelism at 4
#   ./pub_get_all.sh --no-fvm          # use bare `flutter` instead of `fvm flutter`

set -u

cd "$(dirname "$0")"

PARALLELISM="${PARALLELISM:-8}"
FLUTTER="fvm flutter"
for arg in "$@"; do
  case "$arg" in
    --no-fvm) FLUTTER="flutter" ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# //; s/^#//'
      exit 0
      ;;
  esac
done

# Portable replacement for `mapfile -t` (macOS ships bash 3.2 by default).
PUBSPECS=()
while IFS= read -r line; do
  PUBSPECS+=("$line")
done < <(find packages test_apps -maxdepth 4 -name pubspec.yaml \
    -not -path '*/build/*' -not -path '*/.dart_tool/*' \
    -not -path '*/macos/Flutter/*' 2>/dev/null | sort)

TOTAL=${#PUBSPECS[@]}

if [ "$TOTAL" -eq 0 ]; then
  echo "No pubspec.yaml files found under packages/ or test_apps/."
  exit 1
fi

echo "▸ Running '$FLUTTER pub get' for $TOTAL packages (parallelism=$PARALLELISM)…"
echo

LOG_DIR="$(mktemp -d -t iconifyx-pub-get-XXXXXX)"
echo "  logs: $LOG_DIR"
echo

run_one() {
  local pubspec="$1"
  local pkg_dir name log
  pkg_dir=$(dirname "$pubspec")
  name=$(awk -F': *' '/^name:/{print $2; exit}' "$pubspec" | tr -d '"')
  log="$LOG_DIR/${name}.log"
  if (cd "$pkg_dir" && $FLUTTER pub get >"$log" 2>&1); then
    printf '  ✓ %s\n' "$name"
    rm -f "$log"
  else
    printf '  ✗ %s  (see %s)\n' "$name" "$log"
  fi
}
export -f run_one
export LOG_DIR FLUTTER

printf '%s\n' "${PUBSPECS[@]}" \
  | xargs -n1 -P "$PARALLELISM" -I {} bash -c 'run_one "$@"' _ {}

echo
FAIL_COUNT=$(find "$LOG_DIR" -maxdepth 1 -name '*.log' 2>/dev/null | wc -l | tr -d ' ')
if [ "$FAIL_COUNT" = "0" ]; then
  echo "✓ All $TOTAL packages got dependencies."
  rmdir "$LOG_DIR" 2>/dev/null || true
  exit 0
else
  echo "✗ $FAIL_COUNT of $TOTAL packages failed:"
  for log in "$LOG_DIR"/*.log; do
    echo "  - $(basename "${log%.log}")"
  done
  echo
  echo "Logs preserved in: $LOG_DIR"
  exit 1
fi
