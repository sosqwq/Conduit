#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/check_snippets.py
./scripts/official.sh prepare
(
  cd frontend
  npm ci --no-audit --no-fund
  npm run typecheck
  npm run lint
  npm test
  npm run build
  if [[ ${CI:-} == true ]]; then
    node_modules/.bin/playwright install --with-deps --only-shell chromium
  elif ! node --input-type=module -e 'import { chromium } from "playwright"; await (await chromium.launch()).close()' >/dev/null 2>&1; then
    node_modules/.bin/playwright install --only-shell chromium
  fi
)
CONDUIT_JWT_SECRET=$(openssl rand -base64 48)
export CONDUIT_JWT_SECRET
mvn -B -ntp -f backend/pom.xml clean verify
./scripts/check-api.sh --milestone m6
