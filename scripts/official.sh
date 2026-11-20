#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 scripts/official_verify.py
task=${1:-prepare}
if (($#)); then shift; fi
case "$task" in
  prepare) ;;
  api)
    export HOST=${HOST:-http://127.0.0.1:8080}
    exec bash scripts/official-specs/specs/api/run-api-tests-hurl.sh "$@"
    ;;
  api-stage)
    exec python3 scripts/staged_hurl.py "$@"
    ;;
  e2e)
    export TEST_MODE=spa
    export API_BASE=${API_BASE:-http://127.0.0.1:8080/api}
    export UI_BASE=${UI_BASE:-http://127.0.0.1:5173}
    export NODE_PATH="$PWD/frontend/node_modules${NODE_PATH:+:$NODE_PATH}"
    exec frontend/node_modules/.bin/playwright test --config scripts/official.playwright.config.ts "$@"
    ;;
  *)
    echo "Usage: $0 {prepare|api|api-stage|e2e}" >&2
    exit 2
    ;;
esac
