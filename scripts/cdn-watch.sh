#!/usr/bin/env bash
# CDN cost watch — is the scraper fleet structural, and what is CloudFront costing?
#
# WHY THIS EXISTS (Aug 2026): CloudFront billed $0.00 from Feb–May 2026 because it
# only served images (5–6.3M req/mo, inside the 10M/mo Always-Free tier). Once HTML
# moved behind the CDN on Jun 11 it went to $20–31/mo, and when a residential-proxy
# scraper fleet arrived on Jul 28 daily requests stepped 1.28M → 3.25M overnight and
# the run-rate went to ~$65–105/mo. The whole bill is REQUEST COUNT — data transfer
# is ~$0.05/mo. So the only number that matters is requests/day.
#
# The decision this feeds: whether to migrate the apex to Cloudflare (unmetered
# requests). See `.claude/rules/cdn.md` → Cost, and the migration research.
#
# NOTE: this is a PULL script, deliberately not a daemon. CloudWatch retains daily
# metrics for 455 days and ClickHouse keeps page_views, so the history accrues
# whether or not anything is polling — a continuous logger would add no information.
# Just run it when you want the verdict.
#
# Usage:
#   ./scripts/cdn-watch.sh            # full report (CloudFront + origin/ClickHouse)
#   ./scripts/cdn-watch.sh --cf-only  # skip the SSH/ClickHouse section
#
# Requires: AWS creds in .env.local (project IAM user `moviebrowser`, acct
# 620733889764 — NOT a machine SSO profile), python3, and for the origin section
# the EC2 key at ./movie-browser-ec2-key.pem.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MAIN_DIST="E12R1ZNQNG3LK5"   # apex + www (HTML) — 98% of billed requests
IMG_DIST="E300L33VF15D5T"    # image.themoviebrowser.com (S3-backed) — LIVE, keep
EC2_IP="16.112.156.196"
FREE_TIER_REQ=10000000       # CloudFront Always-Free: 10M requests/month
# Blended $/10k HTTPS requests, derived from actual Aug-2026 usage types
# (AP/EU/IN/ME $0.0120, US $0.0100) weighted to our fleet's geo mix.
RATE_PER_10K=0.0113
# Sustained requests/day above which the fleet counts as structural and the
# Cloudflare migration pays for itself in weeks rather than months.
THRESHOLD_PER_DAY=2000000

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found (needs AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)." >&2
  exit 1
fi
set -a; . ./.env.local >/dev/null 2>&1; set +a
# A machine SSO profile points at a DIFFERENT AWS account — always clear it.
unset AWS_PROFILE AWS_DEFAULT_PROFILE

ACCT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ "$ACCT" != "620733889764" ]; then
  echo "ERROR: wrong AWS account ($ACCT) — expected 620733889764." >&2
  exit 1
fi

TODAY=$(date -u +%Y-%m-%d)
MONTH_START=$(date -u +%Y-%m-01)
FROM=$(date -u -v-14d +%Y-%m-%d 2>/dev/null || date -u -d "14 days ago" +%Y-%m-%d)

echo "=============================================================="
echo " CDN WATCH — $TODAY (UTC)"
echo "=============================================================="

requests_for() {  # $1=distribution id, $2=start date
  aws cloudwatch get-metric-statistics --namespace AWS/CloudFront \
    --metric-name Requests \
    --dimensions Name=DistributionId,Value="$1" Name=Region,Value=Global \
    --start-time "${2}T00:00:00" --end-time "${TODAY}T23:59:59" \
    --period 86400 --statistics Sum --region us-east-1 --output json 2>/dev/null
}

echo
echo "--- Requests/day, main distribution (last 14d) ---"
requests_for "$MAIN_DIST" "$FROM" | python3 -c '
import json, sys
d = json.load(sys.stdin)
pts = sorted(d.get("Datapoints", []), key=lambda x: x["Timestamp"])
for p in pts:
    n = p["Sum"]
    print("  %s  %11s  %s" % (p["Timestamp"][:10], format(n, ",.0f"), "#" * int(n / 80000)))
if pts:
    recent = [p["Sum"] for p in pts[-7:]]
    print("\n  7-day mean: %s req/day" % format(sum(recent) / len(recent), ",.0f"))
'

echo
echo "--- Month to date + projection ---"
# Two separate CloudWatch payloads → two temp files. Do NOT try to feed both
# through one stdin alongside a heredoc: `<<'PY'` and `<<<` on the same command
# collide and the delimiter lands inside the Python source.
TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT
requests_for "$MAIN_DIST" "$MONTH_START" > "$TMPD/main.json"
requests_for "$IMG_DIST" "$MONTH_START" > "$TMPD/img.json"

python3 - "$MONTH_START" "$TODAY" "$FREE_TIER_REQ" "$RATE_PER_10K" "$THRESHOLD_PER_DAY" "$TMPD" <<'PY'
import json, sys, datetime
month_start, today, free_tier, rate, threshold, tmpd = (
    sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), sys.argv[6])

def total(path):
    try:
        with open(path) as f:
            return sum(p["Sum"] for p in json.load(f).get("Datapoints", []))
    except Exception:
        return 0.0

main, img = total(tmpd + "/main.json"), total(tmpd + "/img.json")
d0 = datetime.date.fromisoformat(month_start)
d1 = datetime.date.fromisoformat(today)
days = max((d1 - d0).days, 1)
import calendar
dim = calendar.monthrange(d0.year, d0.month)[1]
proj = (main + img) / days * dim
billable = max(0.0, proj - free_tier)
cost = billable / 10000 * rate

print("  main distro MTD   : %14s req (%s days)" % (format(main, ",.0f"), days))
print("  image distro MTD  : %14s req" % format(img, ",.0f"))
print("  projected month   : %14s req" % format(proj, ",.0f"))
print("  free tier         : %14s req" % format(free_tier, ",.0f"))
print("  projected cost    : $%.2f  (requests only; data transfer is ~$0.05/mo)" % cost)
print()
per_day = main / days
if per_day >= threshold:
    print("  VERDICT: fleet looks STRUCTURAL (%s req/day >= %s threshold)." % (format(per_day, ",.0f"), format(threshold, ",.0f")))
    print("           CloudFront is a ~$%.0f/mo tax on it. Migration pays back fast." % cost)
else:
    print("  VERDICT: below the %s/day threshold (%s req/day)." % (format(threshold, ",.0f"), format(per_day, ",.0f")))
    print("           Fleet may be receding. NOTE: even a clean baseline of")
    print("           0.6-1.3M req/day is 19-38M/mo = 2-4x over the free tier,")
    print("           so CloudFront never returns to $0 while HTML flows through it.")
PY

if [ "${1:-}" = "--cf-only" ]; then exit 0; fi
if [ ! -f movie-browser-ec2-key.pem ]; then
  echo; echo "  (skipping origin section — movie-browser-ec2-key.pem not found)"
  exit 0
fi

echo
echo "--- Origin-reaching traffic + shed (ClickHouse, last 7d) ---"
ssh -i movie-browser-ec2-key.pem -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
  ubuntu@"$EC2_IP" 'docker exec analytics-clickhouse clickhouse-client --query "
    SELECT toDate(timestamp) AS day,
           count()                                       AS origin_reqs,
           countIf(bot_type = '"'"'forged_referer'"'"')   AS shed_forged,
           countIf(is_bot = 0)                           AS unlabelled,
           countIf(bot_type = '"'"'googlebot'"'"')        AS googlebot
    FROM analytics.page_views
    WHERE timestamp > now() - INTERVAL 7 DAY
    GROUP BY day ORDER BY day DESC FORMAT PrettyCompact"' </dev/null 2>&1 | sed 's/^/  /'

echo
echo "  Reading it: shed_forged is the fleet we already block at the origin."
echo "  A rising 'unlabelled' with flat shed_forged = the fleet ADAPTING (it began"
echo "  dropping the Referer entirely on Aug 12) — that variant cannot be caught by"
echo "  the referer invariant, by design, because referer-less must stay served for"
echo "  Googlebot. Cross-check cohorts by user_agent + country before concluding."
