#!/usr/bin/env bash
# Nightly PostgreSQL backup -> S3, for the Hetzner box (web-2 since Nov 2026).
#
# Hetzner has no instance profile, so the AWS keys come from the app's own
# .env.local (the `moviebrowser` IAM user). They are exported into this
# process only; nothing is printed.
#
# Dump with pg_dump -Fc into a host file, verify its TOC with pg_restore
# --list BEFORE uploading, then upload. Keeps the newest dump on local disk too
# (fast restore when the box is fine but the DB is not). S3 lifecycle on the
# backups/ prefix expires objects after 30 days.
#
# Cron (installed by hand on the box, the deploy keeps unrelated lines):
#   30 2 * * * /home/ubuntu/movie-browser-next/scripts/pg-backup.sh
set -euo pipefail

APP=/home/ubuntu/movie-browser-next
BUCKET_PREFIX="${PG_BACKUP_S3_PREFIX:-s3://movie-browser-migration-2025-10-19/backups/pg}"
REGION="${PG_BACKUP_S3_REGION:-ap-south-2}"
LOCAL_DIR=/home/ubuntu/backups/pg
LOG=/home/ubuntu/logs/pg-backup.log
TS=$(date -u +%Y-%m-%d)
HOST=$(hostname -s)
FILE="$LOCAL_DIR/${HOST}-pg-${TS}.dump"
DEST="$BUCKET_PREFIX/${HOST}-pg-${TS}.dump"

mkdir -p "$LOCAL_DIR" "$(dirname "$LOG")"
log() { echo "[$(date -u '+%F %T')] $*" >> "$LOG"; }

load_aws_keys() {
  local k v
  while IFS='=' read -r k v; do
    case "$k" in
      AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)
        v="${v%\"}"; v="${v#\"}"; export "$k=$v" ;;
    esac
  done < "$APP/.env.local"
  [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]
}

# NB: not `{ ...; } || handler` — bash ignores `set -e` inside a list that is
# the left side of `||`, so a failed pg_dump would still upload. ERR trap it is.
trap 'log "FAILED (line $LINENO)"; rm -f "$FILE.partial"; exit 1' ERR

log "dump start"
load_aws_keys || { log "FAILED: no AWS keys in .env.local"; exit 1; }
nice -n 19 ionice -c3 docker exec movie-browser-postgres \
  pg_dump -U moviebrowser -Fc -Z1 moviebrowser > "$FILE.partial" 2>> "$LOG"
docker exec -i movie-browser-postgres pg_restore --list < "$FILE.partial" > /dev/null 2>> "$LOG"
mv "$FILE.partial" "$FILE"
SIZE=$(stat -c%s "$FILE")
log "dump verified ($SIZE bytes), uploading"
nice -n 19 aws s3 cp "$FILE" "$DEST" --region "$REGION" --only-show-errors 2>> "$LOG"
# keep only the newest local dump
find "$LOCAL_DIR" -name '*-pg-*.dump' ! -name "$(basename "$FILE")" -delete
log "OK -> $DEST"
