#!/usr/bin/env bash
# Rebuilds docs/evidence/ from a database snapshot: restores the dump into a
# throwaway Postgres container, runs every query in evidence/queries/ and
# writes one CSV per query. Nothing touches a live database.
#
#   evidence/run.sh [path/to/dump]      (default: backups/pitstop-2026-10-26.dump)
#
# Dates are bucketed in UTC+7 (Asia/Jakarta), the account's time zone.
set -euo pipefail

cd "$(dirname "$0")/.."
DUMP="${1:-backups/pitstop-2026-10-26.dump}"
OUT=docs/evidence
# postgres:16, pinned (the snapshot came from a 16.14 server).
IMAGE="postgres:16@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97"
NAME="pitstop-evidence-$$"

[ -f "$DUMP" ] || { echo "error: no dump at $DUMP" >&2; exit 2; }
if command -v sha256sum >/dev/null; then SHA=$(sha256sum "$DUMP" | cut -d' ' -f1); else SHA=$(shasum -a 256 "$DUMP" | cut -d' ' -f1); fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=evidence -e POSTGRES_DB=pitstop \
  -v "$PWD/$DUMP:/snapshot.dump:ro" -v "$PWD/evidence/queries:/queries:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d pitstop -q 2>/dev/null && break
  sleep 1
done
sleep 1
docker exec "$NAME" pg_restore -U postgres -d pitstop --no-owner --no-privileges --exit-on-error /snapshot.dump

mkdir -p "$OUT"
rm -f "$OUT"/*.csv
for q in evidence/queries/*.sql; do
  name=$(basename "$q" .sql)
  docker exec -e PGTZ=Asia/Jakarta "$NAME" \
    psql -U postgres -d pitstop -X -q --csv -v ON_ERROR_STOP=1 -f "/queries/$name.sql" > "$OUT/$name.csv"
  echo "  $name.csv ($(($(wc -l < "$OUT/$name.csv") - 1)) rows)"
done

printf 'snapshot: %s\nsha256: %s\ntime_zone: Asia/Jakarta (UTC+7)\n' "$(basename "$DUMP")" "$SHA" > "$OUT/SNAPSHOT"
echo "wrote $OUT/ from $(basename "$DUMP") (sha256 ${SHA:0:12}…)"
