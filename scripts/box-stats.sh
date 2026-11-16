#!/usr/bin/env bash
#
# Box + Postgres sampler: appends ONE JSON line every run to
# ~/metrics/box-YYYY-MM-DD.jsonl. Reader: `node scripts/metrics-report.cjs`.
#
# WHY (Nov 16 2026): web-1 (2 vCPU / 4 GB) ran at load 13-15 with 300-700
# swap pages/s for a day; the questions "since when, and what was Postgres
# doing" needed an SSH session at the right moment. sysstat (`sar -q/-r/-W`,
# 10-min, already installed) covers the OS side; this adds what sar cannot see
# (PSI, next-server RSS, Postgres connections/IO/commit counters) in a format
# the report script reads alongside job-runs and render-stats.
#
# Cost per run: a few /proc reads + ONE `docker exec psql` running catalog-view
# selects (pg_stat_activity / pg_stat_database: no table scans), ~50 ms CPU.
#
# Install (system crontab, NOT PM2 — must keep sampling when PM2 is the problem):
#   ( crontab -l 2>/dev/null; echo '*/5 * * * * /home/ubuntu/movie-browser-next/scripts/box-stats.sh >/dev/null 2>&1' ) | crontab -
# Counters (xact_commit, blks_read, pswpin, ...) are cumulative; the report
# script turns them into per-second rates between consecutive samples.
set -u
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

OUT_DIR="${JOB_METRICS_DIR:-$HOME/metrics}"
PG_CONTAINER="${PG_CONTAINER:-movie-browser-postgres}"
mkdir -p "$OUT_DIR" || exit 0

num() { [ -n "${1:-}" ] && echo "$1" || echo null; }
psi() { awk -v k="$2" '$1=="some"{for(i=2;i<=NF;i++){split($i,a,"=");if(a[1]==k)print a[2]}}' "/proc/pressure/$1" 2>/dev/null; }
meminfo() { awk -v k="$1:" '$1==k{print int($2/1024)}' /proc/meminfo; }
vmstat_counter() { awk -v k="$1" '$1==k{print $2}' /proc/vmstat; }
free_mb() { df --output=avail -m "$1" 2>/dev/null | tail -1 | tr -dc '0-9'; }

read -r load1 load5 load15 _ < /proc/loadavg
# Two next-servers share web-1 (this app + kosh, stocks.vootlachaitanya.com), so match
# the process NAME (not -f, which also hits shells mentioning it) AND our app's cwd.
APP_DIR="${APP_DIR:-/home/ubuntu/movie-browser-next}"
next_pid=""
for pid in $(pgrep next-server); do
  if [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$APP_DIR" ]; then next_pid="$pid"; break; fi
done
next_rss_mb=""
[ -n "$next_pid" ] && next_rss_mb="$(awk '/^VmRSS:/{print int($2/1024)}' "/proc/$next_pid/status" 2>/dev/null)"
next_swap_mb=""
[ -n "$next_pid" ] && next_swap_mb="$(awk '/^VmSwap:/{print int($2/1024)}' "/proc/$next_pid/status" 2>/dev/null)"

# One round trip; every value comes from cumulative stats views (cheap).
pg_json="$(docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -c "
  SELECT json_build_object(
    '\''conns'\'', (SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\''),
    '\''active'\'', (SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\'' AND state = '\''active'\''),
    '\''waitingIo'\'', (SELECT count(*) FROM pg_stat_activity WHERE state = '\''active'\'' AND wait_event_type = '\''IO'\''),
    '\''waitingLock'\'', (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = '\''Lock'\''),
    '\''longestActiveS'\'', (SELECT COALESCE(round(extract(epoch FROM max(now() - query_start))), 0) FROM pg_stat_activity WHERE state = '\''active'\'' AND backend_type = '\''client backend'\''),
    '\''xactCommit'\'', d.xact_commit, '\''blksRead'\'', d.blks_read, '\''blksHit'\'', d.blks_hit,
    '\''tupReturned'\'', d.tup_returned, '\''tupUpdated'\'', d.tup_updated, '\''tempBytes'\'', d.temp_bytes,
    '\''deadlocks'\'', d.deadlocks)
  FROM pg_stat_database d WHERE d.datname = current_database()"' </dev/null 2>/dev/null)"
[ -z "$pg_json" ] && pg_json=null

printf '{"time":"%s","load1":%s,"load5":%s,"load15":%s,"memAvailMb":%s,"swapUsedMb":%s,"pswpin":%s,"pswpout":%s,"psiCpu60":%s,"psiMem60":%s,"psiIo60":%s,"rootFreeMb":%s,"dataFreeMb":%s,"nextRssMb":%s,"nextSwapMb":%s,"pg":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$load1" "$load5" "$load15" \
  "$(num "$(meminfo MemAvailable)")" \
  "$(num "$(( $(meminfo SwapTotal) - $(meminfo SwapFree) ))")" \
  "$(num "$(vmstat_counter pswpin)")" "$(num "$(vmstat_counter pswpout)")" \
  "$(num "$(psi cpu avg60)")" "$(num "$(psi memory avg60)")" "$(num "$(psi io avg60)")" \
  "$(num "$(free_mb /)")" "$(num "$(free_mb /data)")" \
  "$(num "$next_rss_mb")" "$(num "$next_swap_mb")" "$pg_json" \
  >> "$OUT_DIR/box-$(date -u +%Y-%m-%d).jsonl"

# Retention: 30 days of daily files (~100 KB/day).
find "$OUT_DIR" -maxdepth 1 -name 'box-*.jsonl' -mtime +30 -delete 2>/dev/null
find "$OUT_DIR" -maxdepth 1 -name 'render-stats-*.jsonl' -mtime +30 -delete 2>/dev/null
exit 0
