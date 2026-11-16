#!/usr/bin/env bash
# Watch Hetzner Cloud for a sold-out server type and CREATE one the moment it
# can be had, so the capacity is ours. Nothing is migrated: the new box is a
# bare Ubuntu with our SSH key + firewall; moving the app onto it (or deleting
# it and doing an in-place `change-type` on web-1) is a separate decision.
#
# Why: CAX21 / CX33 (4 vCPU / 8 GB, the size web-1 should be) were sold out in
# every EU location on Nov 16 2026, while web-1 (CX23, 2 vCPU / 4 GB) runs
# CPU-saturated. Availability flags can be stale either way, so the create
# call itself is the real test: a capacity error just means "keep waiting".
#
# Uses the active `hcloud` CLI context (no token handling here).
#
#   scripts/hetzner-claim-server.sh                 # defaults below
#   TYPES="cx33 cax21" LOCATION=fsn1 NAME=web-2 INTERVAL=60 scripts/hetzner-claim-server.sh
#
# Exit 0 = a server named $NAME exists (created now or already). Exit 2 = a
# non-capacity create error (bad config/auth) — fix it rather than loop on it.
set -uo pipefail

TYPES="${TYPES:-cx33 cax21}"     # in order of preference
LOCATION="${LOCATION:-fsn1}"     # the Postgres volume `data` lives in fsn1
NAME="${NAME:-web-2}"
SSH_KEY="${SSH_KEY:-hetzner-moviebrowser}"
FIREWALL="${FIREWALL:-web-fw}"
IMAGE="${IMAGE:-ubuntu-24.04}"
INTERVAL="${INTERVAL:-60}"       # seconds between checks (+ jitter)
MAX_HOURS="${MAX_HOURS:-168}"    # give up after a week
LOG="${LOG:-${TMPDIR:-/tmp}/hetzner-claim-server.log}"
LOCK="${LOCK:-${TMPDIR:-/tmp}/hetzner-claim-server.lock}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }

# One watcher at a time (mkdir is atomic everywhere, incl. Git Bash).
if ! mkdir "$LOCK" 2>/dev/null; then
  log "another watcher holds $LOCK — exiting"; exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

server_exists() { hcloud server describe "$NAME" -o json >/dev/null 2>&1; }

# Is $1 marked available in $LOCATION? Prints yes/no/unknown.
available() {
  hcloud server-type describe "$1" -o json 2>/dev/null | python -c "
import sys, json
try:
    t = json.load(sys.stdin)
    print(next(('yes' if l['available'] else 'no') for l in t['locations'] if l['name'] == '$LOCATION'))
except Exception:
    print('unknown')"
}

is_capacity_error() {
  grep -qiE 'resource_unavailable|unavailable|sold out|no capacity|placement_error|server_type.*not available' <<<"$1"
}

deadline=$(( $(date +%s) + MAX_HOURS * 3600 ))
log "watching types=[$TYPES] location=$LOCATION name=$NAME every ~${INTERVAL}s (log $LOG)"
checks=0
while :; do
  if server_exists; then
    log "server $NAME already exists — done"
    hcloud server describe "$NAME" -o format='{{.Name}} {{.ServerType.Name}} {{.Location.Name}} {{.PublicNet.IPv4.IP}} {{.Status}}' | tee -a "$LOG"
    exit 0
  fi

  for t in $TYPES; do
    a=$(available "$t")
    # Try when flagged available, and also every 10th check regardless — the
    # flag lags real capacity in both directions.
    if [ "$a" = "yes" ] || [ $(( checks % 10 )) -eq 0 ]; then
      out=$(hcloud server create --name "$NAME" --type "$t" --location "$LOCATION" \
              --image "$IMAGE" --ssh-key "$SSH_KEY" --firewall "$FIREWALL" \
              --label purpose=web-1-upgrade 2>&1)
      rc=$?
      if [ $rc -eq 0 ]; then
        log "CLAIMED $t in $LOCATION as $NAME"
        printf '%s\n' "$out" | tee -a "$LOG"
        exit 0
      fi
      if server_exists; then   # create raced/timed out but went through
        log "create returned $rc but $NAME exists — claimed"; exit 0
      fi
      if is_capacity_error "$out"; then
        [ "$a" = "yes" ] && log "$t flagged available but create said: $(tr '\n' ' ' <<<"$out" | cut -c1-200)"
      elif grep -qiE 'rate.?limit|429|timeout|temporar|connection|EOF|503|502' <<<"$out"; then
        log "transient error on $t: $(tr '\n' ' ' <<<"$out" | cut -c1-200)"
      else
        log "NON-CAPACITY error creating $t — stopping: $(tr '\n' ' ' <<<"$out" | cut -c1-300)"
        exit 2
      fi
    fi
  done

  checks=$(( checks + 1 ))
  (( checks % 60 == 0 )) && log "still waiting ($checks checks) — $(for t in $TYPES; do printf '%s=%s ' "$t" "$(available "$t")"; done)"
  if [ "$(date +%s)" -ge "$deadline" ]; then log "gave up after ${MAX_HOURS}h"; exit 3; fi
  sleep $(( INTERVAL + RANDOM % 15 ))
done
