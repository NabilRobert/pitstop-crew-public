#!/usr/bin/env bash
# Builds the demo's database seed: restores the private backup into a
# throwaway container, runs clean.sql, and dumps the result to
# deploy/demo/seed/pitstop-demo.dump (git-ignored). The live database is
# never touched.
#
#   deploy/demo/build-seed.sh [path/to/backup.dump]
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="${1:-backups/pitstop-2026-10-26.dump}"
OUT=deploy/demo/seed/pitstop-demo.dump
IMAGE="postgres:16@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97"
NAME="pitstop-seed-$$"
[ -f "$SRC" ] || { echo "error: no backup at $SRC" >&2; exit 2; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=seed -e POSTGRES_DB=pitstop \
  -v "$PWD/$SRC:/backup.dump:ro" -v "$PWD/deploy/demo/clean.sql:/clean.sql:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d pitstop -q 2>/dev/null && break; sleep 1; done
sleep 1
docker exec "$NAME" pg_restore -U postgres -d pitstop --no-owner --no-privileges --exit-on-error /backup.dump
echo "cleaning:"
docker exec "$NAME" psql -U postgres -d pitstop -X -v ON_ERROR_STOP=1 -f /clean.sql | sed 's/^/  /'
mkdir -p "$(dirname "$OUT")"
docker exec "$NAME" pg_dump -U postgres -d pitstop --format=custom --no-owner --no-privileges > "$OUT"
chmod 600 "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
