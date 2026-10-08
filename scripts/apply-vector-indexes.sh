#!/usr/bin/env bash
#
# apply-vector-indexes.sh — build the pgvector HNSW indexes (postgres/init/03-vector-indexes.sql)
# on the box, DEFERRED and in the background, hash-gated.
#
# Launched detached by the deploy (step [7.5]). Why deferred: every deploy starts
# with an empty ISR namespace (cold window, ~5-10 min of 0% idle CPU). An HNSW
# build pins one core for minutes, so it waits out the cold window first.
# Why background: the build takes minutes; holding the deploy's SSH session
# open for it buys nothing and a dropped connection would kill psql mid-build
# (leaving an INVALID index — which 03-vector-indexes.sql cleans up on re-run).
#
#   VECTOR_INDEX_DELAY=900   seconds to wait before starting (default 900)
#   FORCE_RUN=1              ignore the hash gate
#
# Gate: md5(03-vector-indexes.sql) vs .last-vector-hash. The hash is written
# ONLY after both indexes are verified VALID, so a failed/interrupted build
# retries on the next deploy. Expression indexes survive `prisma db push`
# (verified), so the schema hash is deliberately NOT part of the gate — a
# schema deploy must not trigger a multi-minute rebuild.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SQL=postgres/init/03-vector-indexes.sql
HASH_FILE=.last-vector-hash
DELAY="${VECTOR_INDEX_DELAY:-900}"
LOCK=/tmp/apply-vector-indexes.lock

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -u +%FT%TZ) another vector-index build is running — exiting"
  exit 0
fi

HASH=$(md5sum "$SQL" | cut -d' ' -f1)
if [ "${FORCE_RUN:-}" != "1" ] && [ "$HASH" = "$(cat "$HASH_FILE" 2>/dev/null)" ]; then
  echo "$(date -u +%FT%TZ) vector index sql unchanged -> skip"
  exit 0
fi

echo "$(date -u +%FT%TZ) vector index sql changed -> building in ${DELAY}s (past the deploy cold window)"
sleep "$DELAY"

echo "$(date -u +%FT%TZ) load before: $(cut -d' ' -f1-3 /proc/loadavg)  mem: $(free -m | awk '/Mem:/{print $7"MB avail"}')"
START=$(date +%s)
docker compose exec -T postgres psql -U moviebrowser -d moviebrowser -v ON_ERROR_STOP=1 < "$SQL"
RC=$?
END=$(date +%s)
echo "$(date -u +%FT%TZ) psql rc=$RC after $((END - START))s"

VALID=$(docker compose exec -T postgres psql -U moviebrowser -d moviebrowser -tAc \
  "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indisvalid AND c.relname IN ('idx_movies_embedding_hnsw_hv','idx_series_embedding_hnsw_hv')" </dev/null | tr -d '[:space:]')
docker compose exec -T postgres psql -U moviebrowser -d moviebrowser -tAc \
  "SELECT c.relname, pg_size_pretty(pg_relation_size(c.oid)), i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname LIKE 'idx_%_embedding_hnsw_hv'" </dev/null

if [ "$RC" -eq 0 ] && [ "$VALID" = "2" ]; then
  echo "$HASH" > "$HASH_FILE"
  echo "$(date -u +%FT%TZ) OK — both HNSW indexes valid; hash recorded"
else
  echo "$(date -u +%FT%TZ) FAILED (rc=$RC valid=$VALID) — hash NOT recorded; next deploy retries"
  exit 1
fi
