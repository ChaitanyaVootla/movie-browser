#!/usr/bin/env bash
# Emergency recovery for the frozen origin box (Jun 11 2026).
# Force stop/start via AWS, then hold `next` down while PG/CH settle, then bring
# next up controlled (cold start on a WARM CF edge holds ~500MB — proven earlier
# today; the freeze happens when next cold-starts UNDER concurrent deploy load).
# Run via the `!` prefix:  ! bash scripts/recover-origin.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Project AWS creds (account 620733889764). The operator's shell can read .env.local.
set -a; . ./.env.local; set +a
unset AWS_PROFILE 2>/dev/null || true
: "${AWS_ACCESS_KEY_ID:=${NEXT_EC2_AWS_ACCESS_KEY_ID:-}}"
: "${AWS_SECRET_ACCESS_KEY:=${NEXT_EC2_AWS_SECRET_ACCESS_KEY:-}}"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
REGION=ap-south-2
KEY=movie-browser-ec2-key.pem
EIP=16.112.156.196

echo "account: $(aws sts get-caller-identity --query Account --output text)"
IID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=ip-address,Values=$EIP" \
  --query "Reservations[].Instances[].InstanceId" --output text)
echo "instance: $IID"

echo "force-stopping..."
aws ec2 stop-instances --force --region "$REGION" --instance-ids "$IID" >/dev/null
aws ec2 wait instance-stopped --region "$REGION" --instance-ids "$IID"
echo "stopped. starting..."
aws ec2 start-instances --region "$REGION" --instance-ids "$IID" >/dev/null
aws ec2 wait instance-running --region "$REGION" --instance-ids "$IID"
echo "running. holding next down while services settle..."

# Hold next down: pm2 resurrects it on boot; stop it repeatedly until SSH is
# reliably up, so it doesn't cold-start under the returning crawler herd.
for i in $(seq 1 12); do
  ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@"$EIP" \
    'pm2 stop next >/dev/null 2>&1; echo held' 2>/dev/null && break || echo "boot wait $i"
  sleep 10
done
# keep holding ~60s for PG/CH/Caddy to fully settle
for i in $(seq 1 6); do
  ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@"$EIP" \
    'pm2 stop next >/dev/null 2>&1; free -m|awk "/Mem:/{print \"free \"\$7\"MB\"}"' 2>/dev/null || true
  sleep 10
done

echo "starting next (controlled)..."
ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=12 ubuntu@"$EIP" \
  'cd ~/movie-browser-next && pm2 start next >/dev/null 2>&1; pm2 save >/dev/null 2>&1; sleep 12; P=$(pgrep -f next-server|head -1); ps -o rss= -p $P|awk "{print \"next rss \"int(\$1/1024)\"MB\"}"; curl -o /dev/null -sS -w "local %{http_code} %{time_starttransfer}s\n" --max-time 20 http://localhost:3002/'
echo "DONE — origin restarted and next is up."
