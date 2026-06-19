#!/usr/bin/env bash
#
# PM2-independent disk-pressure guard.
#
# WHY (Jun 19 2026 outage): the unbounded image cache filled the disk, which
# crashed next-server AND killed the PM2 daemon. The only cleanup job
# (`isr-cache-prune`) is itself a PM2 process — so once PM2 died, NOTHING
# reclaimed disk and the box stayed down (CloudFront masked it for hours). This
# guard runs from the SYSTEM crontab (not PM2), so it keeps working even when
# the PM2 daemon is dead. It is the last line of defense, not the primary bound
# (cache-handler.cjs caps bounded-isr; prune-isr-cache.js caps ISR + image cache
# every 6h via PM2).
#
# Installed by .github/workflows/deploy-ec2.yml as a crontab entry running every
# 15 minutes. No-ops cheaply when disk is healthy.
#
# Tunables (env): DISK_GUARD_THRESHOLD_PCT (default 88).
set -u

# cron runs with a minimal PATH; node/df/truncate/logger all live in /usr/bin.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

APP_DIR="${APP_DIR:-/home/ubuntu/movie-browser-next}"
THRESHOLD_PCT="${DISK_GUARD_THRESHOLD_PCT:-88}"

used_pct="$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')"
[ -z "${used_pct}" ] && exit 0
[ "${used_pct}" -lt "${THRESHOLD_PCT}" ] && exit 0

logger -t disk-guard "disk ${used_pct}% >= ${THRESHOLD_PCT}% — emergency cleanup"

# 1) Shed PM2 log spam first — a crash-looping process can write GBs of logs
#    (Jun 19: pm2 logs were 2.4GB). truncate keeps the open fd valid.
truncate -s 0 /home/ubuntu/.pm2/logs/*.log 2>/dev/null || true

# 2) Truncate the largest docker container json logs (a disk-full ClickHouse can
#    enter a log storm — see performance.md).
for f in /var/lib/docker/containers/*/*-json.log; do
  [ -f "$f" ] && truncate -s 0 "$f" 2>/dev/null || true
done

# 3) Force-prune the ISR + image caches NOW, independent of PM2. Tight budgets
#    under pressure; the script fast-exits per-target when already under.
if [ -d "${APP_DIR}" ]; then
  cd "${APP_DIR}" || exit 0
  FORCE_RUN=1 ISR_CACHE_BUDGET_MB=1500 IMAGE_CACHE_BUDGET_MB=1000 \
    nice -n 19 node --max-old-space-size=512 scripts/prune-isr-cache.js 2>&1 \
    | logger -t disk-guard || true
fi

used_after="$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')"
logger -t disk-guard "cleanup done — disk now ${used_after}%"
