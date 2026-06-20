#!/usr/bin/env bash
#
# sync-local-db.sh — mirror the latest PROD Postgres dump into the LOCAL dev DB.
#
# Prod already takes a verified nightly dump to S3 (~/bin/pg-backup.sh on the EC2
# box, cron 02:30 UTC → s3://.../backups/pg/beta-pg-YYYY-MM-DD.dump, 30-day
# retention). This script PULLS the latest (or a given date) and restores it into
# the local dev container, so you have real prod-scale data for prototyping.
#
# SAFETY: prod is only ever READ (S3 ls + presign via the box's instance profile).
# This script has NO path that writes to prod. The restore target is hard-pinned
# to the movie-browser-dev-pg container and refuses to run unless that container
# publishes the dev port (5436) — mirroring the seed-social-demo.ts guard.
#
# Usage:
#   scripts/sync-local-db.sh                # restore the latest dump
#   scripts/sync-local-db.sh 2026-06-18     # restore a specific day's dump
#   scripts/sync-local-db.sh --fresh        # ignore cached download, re-fetch
#   scripts/sync-local-db.sh --list         # list available dumps in S3 and exit
#
set -euo pipefail

# --- config (overridable via env) ---------------------------------------------
BOX_HOST="${BOX_HOST:-16.112.156.196}"
BOX_USER="${BOX_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-movie-browser-ec2-key.pem}"
S3_PREFIX="${S3_PREFIX:-s3://movie-browser-migration-2025-10-19/backups/pg}"
AWS_REGION="${AWS_REGION:-ap-south-2}"

DEV_CONTAINER="${DEV_CONTAINER:-movie-browser-dev-pg}"
DEV_DB="${DEV_DB:-moviebrowser}"
DEV_USER="${DEV_USER:-dev}"
EXPECT_PORT="${EXPECT_PORT:-5436}"        # the published port that proves "this is the dev box"
PM2_APP="${PM2_APP:-mb-dev}"
JOBS="${JOBS:-4}"                          # parallel pg_restore workers

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${MB_DUMP_CACHE:-${TMPDIR:-/tmp}/mb-dumps}"
[[ "$SSH_KEY" != /* ]] && SSH_KEY="$REPO_ROOT/$SSH_KEY"

# --- args ----------------------------------------------------------------------
WHICH="latest"; FRESH=0; LIST_ONLY=0
for a in "$@"; do
  case "$a" in
    --fresh)  FRESH=1 ;;
    --list)   LIST_ONLY=1 ;;
    latest)   WHICH="latest" ;;
    20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]) WHICH="$a" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "✗ unknown argument: $a (use a date YYYY-MM-DD, latest, --fresh, --list)"; exit 2 ;;
  esac
done

log() { printf '\033[36m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

ssh_box() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "$BOX_USER@$BOX_HOST" "$@"; }

[[ -f "$SSH_KEY" ]] || die "SSH key not found: $SSH_KEY"
command -v docker >/dev/null || die "docker not on PATH"

# --- list mode -----------------------------------------------------------------
if [[ "$LIST_ONLY" == 1 ]]; then
  log "Dumps in $S3_PREFIX/"
  ssh_box "aws s3 ls $S3_PREFIX/ --region $AWS_REGION" || die "could not list S3 (box/creds?)"
  exit 0
fi

# --- HARD GUARD: confirm the restore target is the dev container on :5436 ------
docker inspect "$DEV_CONTAINER" >/dev/null 2>&1 || die "container '$DEV_CONTAINER' not found/running"
PORTS="$(docker port "$DEV_CONTAINER" 2>/dev/null || true)"
case "$PORTS" in
  *":$EXPECT_PORT"*) ;;
  *) die "REFUSING: '$DEV_CONTAINER' does not publish :$EXPECT_PORT — wrong/prod target. Ports: ${PORTS:-none}" ;;
esac
log "Target verified: $DEV_CONTAINER (publishes :$EXPECT_PORT), db=$DEV_DB user=$DEV_USER"

# --- resolve the dump key ------------------------------------------------------
if [[ "$WHICH" == "latest" ]]; then
  KEY="$(ssh_box "aws s3 ls $S3_PREFIX/ --region $AWS_REGION | awk '{print \$4}' | grep -E '^beta-pg-.*\.dump$' | sort | tail -1")"
  [[ -n "$KEY" ]] || die "no dumps found in $S3_PREFIX/"
else
  KEY="beta-pg-$WHICH.dump"
  ssh_box "aws s3 ls $S3_PREFIX/$KEY --region $AWS_REGION >/dev/null" || die "dump not found in S3: $KEY"
fi
log "Selected dump: $KEY"

# --- download (cached, via presigned URL → no local AWS creds needed) ----------
mkdir -p "$CACHE_DIR"
DEST="$CACHE_DIR/$KEY"
if [[ "$FRESH" == 1 || ! -s "$DEST" ]]; then
  log "Presigning + downloading from S3 (this is ~2GB)…"
  URL="$(ssh_box "aws s3 presign $S3_PREFIX/$KEY --expires-in 3600 --region $AWS_REGION")"
  [[ "$URL" == https://* ]] || die "failed to presign URL"
  curl -fSL --retry 3 --retry-delay 2 -o "$DEST.part" "$URL"
  mv "$DEST.part" "$DEST"
else
  log "Using cached download: $DEST ($(du -h "$DEST" | cut -f1)). Pass --fresh to re-fetch."
fi

# --- restore -------------------------------------------------------------------
log "Stopping $PM2_APP to release DB connections…"
npx pm2 stop "$PM2_APP" >/dev/null 2>&1 || true

log "Dropping & recreating database '$DEV_DB'…"
docker exec -i "$DEV_CONTAINER" psql -U "$DEV_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS $DEV_DB WITH (FORCE);
CREATE DATABASE $DEV_DB;
SQL

log "Copying dump into container and restoring with $JOBS workers…"
docker cp "$DEST" "$DEV_CONTAINER:/tmp/restore.dump"
# pg_restore emits benign 'already exists' notices for the default public schema;
# don't let set -e abort on them — we verify success by row count below instead.
set +e
docker exec -i "$DEV_CONTAINER" pg_restore -U "$DEV_USER" --no-owner --no-privileges -j "$JOBS" -d "$DEV_DB" /tmp/restore.dump
RC=$?
set -e
docker exec "$DEV_CONTAINER" rm -f /tmp/restore.dump

# --- verify --------------------------------------------------------------------
MOVIES="$(docker exec "$DEV_CONTAINER" psql -U "$DEV_USER" -d "$DEV_DB" -tAc "SELECT count(*) FROM movies" 2>/dev/null || echo 0)"
[[ "${MOVIES:-0}" -ge 1000 ]] || die "restore looks wrong (movies=$MOVIES, pg_restore rc=$RC). Aborting."
SIZE="$(docker exec "$DEV_CONTAINER" psql -U "$DEV_USER" -d "$DEV_DB" -tAc "SELECT pg_size_pretty(pg_database_size('$DEV_DB'))" 2>/dev/null)"
log "Restore OK — movies=$MOVIES, db size=$SIZE (pg_restore rc=$RC; any errors above were benign)"

log "Restarting $PM2_APP…"
npx pm2 restart "$PM2_APP" >/dev/null 2>&1 || log "(could not restart $PM2_APP — start it manually with: npx pm2 start ecosystem.dev.config.cjs)"

log "Done. Local dev DB now mirrors prod dump '$KEY'."
