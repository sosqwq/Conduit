#!/usr/bin/env bash
# Run the upstream Hurl cases against the packaged server and a test database.
set -euo pipefail
cd "$(dirname "$0")/.."

case_files=()
for name in "$@"; do
  path="scripts/official-specs/specs/api/hurl/$name.hurl"
  if [[ ! $name =~ ^[a-z_]+$ || ! -f $path ]]; then
    echo "Unknown official Hurl case: $name" >&2
    exit 2
  fi
  case_files+=("$path")
done
hurl --version
shopt -s nullglob
jars=(backend/target/*.jar)
if (( ${#jars[@]} != 1 )); then
  echo 'Expected one packaged application in backend/target. Run mvn clean verify first.' >&2
  exit 1
fi

run_dir=$(mktemp -d)
postgres_container=''
server_pid=''
cleanup() {
  result=$?
  if [[ -n $server_pid ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if [[ -n $postgres_container ]]; then
    docker rm -f "$postgres_container" >/dev/null || result=1
  fi
  if (( result != 0 )) && [[ -f "$run_dir/server.log" ]]; then
    tail -n 80 "$run_dir/server.log" >&2
  fi
  rm -rf -- "$run_dir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n ${CONDUIT_TEST_DB_URL:-} ]]; then
  [[ $CONDUIT_TEST_DB_URL == jdbc:postgresql://* ]] || { echo 'Expected a PostgreSQL test JDBC URL' >&2; exit 2; }
  export DATABASE_URL="$CONDUIT_TEST_DB_URL"
  export DATABASE_USERNAME="${CONDUIT_TEST_DB_USERNAME:?Specify the test database username}"
  export DATABASE_PASSWORD="${CONDUIT_TEST_DB_PASSWORD:?Specify the test database password}"
else
  DATABASE_PASSWORD=$(openssl rand -hex 24)
  export DATABASE_PASSWORD DATABASE_USERNAME=conduit
  postgres_container=$(POSTGRES_PASSWORD="$DATABASE_PASSWORD" docker run -d --rm \
    -e POSTGRES_PASSWORD -e POSTGRES_USER=conduit -e POSTGRES_DB=conduit_hurl \
    -p 127.0.0.1::5432 postgres:17-alpine)
  binding=$(docker port "$postgres_container" 5432/tcp)
  export DATABASE_URL="jdbc:postgresql://$binding/conduit_hurl"
  for ((attempt=0; attempt<60; attempt++)); do
    if docker exec "$postgres_container" pg_isready -q -h 127.0.0.1 -U conduit -d conduit_hurl; then break; fi
    sleep 1
  done
  docker exec "$postgres_container" pg_isready -h 127.0.0.1 -U conduit -d conduit_hurl
fi

if [[ -z ${CONDUIT_JWT_SECRET:-} ]]; then
  CONDUIT_JWT_SECRET=$(openssl rand -base64 48)
  export CONDUIT_JWT_SECRET
fi
# Let the server claim its own port. Only query the listener started by this run.
java -jar "${jars[0]}" --server.address=127.0.0.1 --server.port=0 >"$run_dir/server.log" 2>&1 &
server_pid=$!
export no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
for ((attempt=0; attempt<90; attempt++)); do
  kill -0 "$server_pid" 2>/dev/null || { echo 'Backend exited during startup' >&2; exit 1; }
  port=$(sed -nE 's/.*Tomcat started on port ([0-9]+) .*/\1/p' "$run_dir/server.log" | tail -n 1)
  if [[ -n $port ]] && curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null; then
    HOST="http://127.0.0.1:$port" ./scripts/official.sh api "${case_files[@]}"
    exit 0
  fi
  sleep 1
done
echo 'Timed out waiting for the packaged backend and its database' >&2
exit 1
