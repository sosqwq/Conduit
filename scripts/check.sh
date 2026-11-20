#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/check_snippets.py
bash scripts/official.sh prepare
CONDUIT_JWT_SECRET=$(openssl rand -base64 48)
export CONDUIT_JWT_SECRET
mvn -B -ntp -f backend/pom.xml clean verify
./scripts/check-api.sh --milestone m5
