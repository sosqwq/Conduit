#!/usr/bin/env bash
# Build and test a disposable installation on a Docker-assigned loopback port.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
root=$PWD

if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'Production verification requires Docker Compose v2 and a running Docker engine.' >&2
  exit 1
fi

project="conduit-verify-$(openssl rand -hex 12)"
run_dir=$(mktemp -d)
compose=(docker compose --project-name "$project" --env-file "$run_dir/.env.production" -f "$root/compose.production.yml")
started=false
cleanup() {
  result=$?
  trap - EXIT
  if [[ $started == true ]]; then
    if (( result != 0 )); then
      "${compose[@]}" ps --all --format '{{.Service}} {{.State}} {{.Health}}' >&2 || true
    fi
    "${compose[@]}" down --volumes --remove-orphans --rmi local || result=1
  fi
  rm -rf -- "$run_dir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Compose gives process variables precedence over --env-file.
unset DATABASE_PASSWORD CONDUIT_JWT_SECRET
export CONDUIT_HTTP_PORT=0 CONDUIT_ALLOWED_ORIGINS=''
(cd "$run_dir" && "$root/scripts/init-production-env.sh")
"${compose[@]}" config --quiet

web_port() {
  local binding
  binding=$("${compose[@]}" port web 8080)
  if [[ ! $binding =~ ^127\.0\.0\.1:([1-9][0-9]*)$ ]]; then
    echo 'Expected the production web service on one IPv4 loopback port.' >&2
    return 1
  fi
  printf '%s\n' "${BASH_REMATCH[1]}"
}

started=true
"${compose[@]}" up -d --build --wait --wait-timeout 180
port=$(web_port)
python3 scripts/check-web-routing.py "http://127.0.0.1:$port"
python3 scripts/check-production-api.py create "$port" "$run_dir/fixture.json"

# Replace all containers. The project volume must retain the article and user.
"${compose[@]}" down
"${compose[@]}" up -d --no-build --wait --wait-timeout 180
port=$(web_port)
python3 scripts/check-production-api.py verify "$port" "$run_dir/fixture.json"
echo 'Production images passed HTTP routing, authentication, article and persistence checks.'
