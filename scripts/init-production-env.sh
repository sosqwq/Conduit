#!/usr/bin/env bash
# Run from the deployment directory. Existing database and signing credentials are retained.
set -euo pipefail
umask 077
if [[ -f .env.production ]]; then
  echo 'Using existing .env.production.'
  exit 0
fi
staged=$(mktemp .env.production.tmp.XXXXXXXX)
trap 'rm -f -- "$staged"' EXIT
password=$(openssl rand -hex 32)
signing_key=$(openssl rand -base64 48)
printf 'DATABASE_PASSWORD=%s\nCONDUIT_JWT_SECRET=%s\n' "$password" "$signing_key" > "$staged"
if ln "$staged" .env.production 2>/dev/null; then
  echo 'Created .env.production.'
elif [[ -f .env.production ]]; then
  echo 'Using existing .env.production.'
else
  echo 'Could not create .env.production in the current directory.' >&2
  exit 1
fi
