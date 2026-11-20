#!/usr/bin/env bash
# Run browsers against the production bundle and the backend started by check-api.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${HOST:?Use scripts/check-api.sh --e2e or pass the local backend origin in HOST}"
export CONDUIT_API_TARGET="$HOST"
export API_BASE="$HOST/api"

if [[ ! -s frontend/dist/index.html ]]; then
  echo 'Missing production bundle. Build it with npm --prefix frontend run build.' >&2
  exit 1
fi
run_dir=$(mktemp -d)
preview_pid=''
cleanup() {
  result=$?
  if [[ -n $preview_pid ]]; then
    kill "$preview_pid" 2>/dev/null || true
    wait "$preview_pid" 2>/dev/null || true
  fi
  if (( result != 0 )) && [[ -f "$run_dir/preview.log" ]]; then tail -30 "$run_dir/preview.log" >&2; fi
  rm -rf -- "$run_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

python3 scripts/seed-e2e.py "$API_BASE"
(
  cd frontend
  exec node --input-type=module - "$run_dir/origin" <<'JS'
import { writeFileSync } from 'node:fs';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
writeFileSync(process.argv[2], 'http://127.0.0.1:' + server.httpServer.address().port);
JS
) >"$run_dir/preview.log" 2>&1 &
preview_pid=$!
for ((attempt=0; attempt<60; attempt++)); do
  kill -0 "$preview_pid" 2>/dev/null || { echo 'Vite preview exited during startup' >&2; exit 1; }
  if [[ -s "$run_dir/origin" ]]; then break; fi
  sleep 1
done
UI_BASE=$(cat "$run_dir/origin")
export UI_BASE
# This must reach Spring through the preview's same-origin /api proxy.
curl --noproxy '*' -fsS --max-time 5 -H "Origin: $UI_BASE" "$UI_BASE/api/health" | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("status") != "UP")'

export NODE_PATH="$PWD/frontend/node_modules${NODE_PATH:+:$NODE_PATH}"
if [[ ${1:-} == --milestone ]]; then
  scripts/e2e-cases.sh "$2" >"$run_dir/cases"
  mapfile -t cases <"$run_dir/cases"
  ./scripts/official.sh e2e "${cases[@]}"
  frontend/node_modules/.bin/playwright test --config scripts/app.playwright.config.ts
else
  ./scripts/official.sh e2e "$@"
fi
