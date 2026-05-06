#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <migrate-command> [args...]"
  echo "example: MIGRATIONS_DB_URL='postgres://user:pass@127.0.0.1:5544/geoduels?sslmode=disable' $0 up"
  exit 1
fi

DEFAULT_MIGRATIONS_DB_URL="postgres://geoduels:geoduels@127.0.0.1:5432/geoduels?sslmode=disable"
MIGRATIONS_DB_URL="${MIGRATIONS_DB_URL:-$DEFAULT_MIGRATIONS_DB_URL}"

DB_URL_FOR_CONTAINER="$MIGRATIONS_DB_URL"
DB_URL_FOR_CONTAINER="${DB_URL_FOR_CONTAINER//@127.0.0.1/@host.docker.internal}"
DB_URL_FOR_CONTAINER="${DB_URL_FOR_CONTAINER//@localhost/@host.docker.internal}"

exec docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$(pwd)/db/migrations:/migrations:ro" \
  migrate/migrate:v4.18.3 \
  -path=/migrations \
  -database "$DB_URL_FOR_CONTAINER" \
  "$@"
