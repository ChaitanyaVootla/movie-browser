---
paths:
  - "terraform/**/*.tf"
  - "terraform/**/*.sh"
  - "docker-compose.yml"
  - ".github/workflows/**/*.yml"
  - "scripts/deploy-next.sh"
  - "ecosystem.config.cjs"
---

# Infrastructure

## CURRENT HOST: Hetzner `web-2` (since Nov 16 2026) — the EC2 sections below are HISTORY

**web-2** = CX33 (4 vCPU / 8 GB, €9.99/mo), fsn1, `178.105.158.84` / `2a01:4f8:c016:f9af::1`,
`ssh -i ~/.ssh/hetzner_moviebrowser ubuntu@178.105.158.84`. Movie Browser ONLY — kosh
stays on web-1. Postgres data on the LOCAL disk at `/data/postgres` (no volume);
`docker-compose.override.yml` (box-only) sizes it for 8 GB (shared_buffers 1536MB,
mem_limit 3000m, max_connections 60); `.env` NEXT_MAX_MEMORY=3000M / NEXT_HEAP_MB=2304;
`.env.local` BOUNDED_CACHE_MB=15000, ORIGIN_SELF_IPS lists web-2 AND web-1. Crontab:
disk-guard, box-stats, and **`scripts/pg-backup.sh` at 02:30 UTC** (verified pg_dump →
`s3://movie-browser-migration-2025-10-19/backups/pg/web-2-pg-<date>.dump`, newest copy
kept in `~/backups/pg`; first run Nov 16: 2.95 GB in ~2 min). Daily logrotate for PM2 logs.
Measured on cutover day at the same traffic: render p50 ~180 ms / p95 ~400 ms vs
3.5 s / 7 s on web-1 (2 vCPU, swapping).

How it was moved (Nov 16 2026): CX33/CAX21 were sold out in every EU location, so
`scripts/hetzner-claim-server.sh` polled and created web-2 the moment one appeared (~25 min).
DB = `pg_basebackup -D - -Ft -X fetch` inside web-1's container, relayed via the PC
(~10 MB/s), then the user tables (<5 MB) re-copied with `session_replication_role=replica`
just before, and merged with `ON CONFLICT DO NOTHING` just after, the Cloudflare A-record
flip. App tree copied from web-1 (same BUILD_ID), Caddy certs copied from its volume.

**web-1** (below) is kept running for rollback: rollback = point the apex + www A records
back at 2.31.137.169 (its DB is frozen at the cutover) — `cd ~/movie-browser-next && node
~/bin/cf-dns.mjs 2.31.137.169 apply` on either box (reads the Cloudflare token from
.env.local; `~/bin/cf-waf.mjs` edits the WAF self-exemption the same way). The GitHub `beta` secret
`NEXT_EC2_HOST` must point at web-2 for deploys to land there.

## PREVIOUS HOST: Hetzner `web-1` (Nov 15-16 2026)

AWS EC2 was terminated on 2026-11-14: about $200/mo, almost all of it internet egress to bots behind
Cloudflare. Both this app and the separate kosh stocks app (stocks.vootlachaitanya.com,
systemd `kosh-*`, SQLite in `/var/lib/kosh`) now run on ONE Hetzner box:

- **CX23**: 2 vCPU / **4 GB** / 38 GB disk, Falkenstein, `2.31.137.169`, + 4 GB swap.
  Postgres data lives on a 40 GB volume at `/data/postgres`. Firewall `web-fw`: 22 (key-only,
  password + root login disabled), 80, 443.
- `docker-compose.override.yml` **exists only on the box** (not in git, not in the deploy tar):
  Postgres → `/data/postgres`, `shared_buffers=512MB`, `mem_limit 1400m`, `shm_size 512m`
  (HNSW index builds fail at Docker's 64 MB default /dev/shm), port bound to 127.0.0.1;
  **ClickHouse parked** under compose profile `analytics` (no RAM for it) → the app logs
  `clickhouse_insert_error` lines, which is expected. Its last full dump is in
  `s3://movie-browser-migration-2025-10-19/final-2026-11-14/`.
- Box `.env` sets `NEXT_MAX_MEMORY=1700M` / `NEXT_HEAP_MB=1280` (read by `ecosystem.config.cjs`);
  `.env.local` has `BOUNDED_CACHE_MB=6000` and an `AWS_ACCESS_KEY_ID`/`SECRET` (no instance
  profile here, so Bedrock + Lambda need explicit keys).
- **Never `next build` on the box.** It needs more than 4 GB, and the kernel OOM-kills it. CI builds it.
- Turbopack's `.next/node_modules/<pkg>-<hash>` externals are symlinks relative to the BUILD
  checkout's folder name; the deploy re-points dangling ones at the box's `node_modules`
  (missing them = `Failed to load external module pino-<hash>` 500s everywhere).
- **Edge bot rules (Cloudflare WAF custom rules, set 2026-11-15 via API):** (1) hosting ASNs
  (= `BLOCKED_HOSTING_ASNS`) → managed_challenge, (2) bare-origin referer
  `https://themoviebrowser.com` (no slash) → block. Both exempt the session cookie +
  `cf.client.bot`; (1) also exempts web-1's IPs. Hetzner AS24940 is on the list and web-1
  self-fetches through Cloudflare, so `proxy.ts` exempts `ORIGIN_SELF_IPS` (box `.env.local`).
  Caddy's `@dcfleet` reads `CloudFront-Viewer-ASN`, which Cloudflare never sends → inert.
- Every deploy starts the ISR tier COLD (`cache-handler.cjs` namespaces by BUILD_ID on
  purpose) → 0% idle, slow cache-miss pages for several minutes on 2 vCPU. `.cache/` (L2
  TMDB data) and Postgres survive deploys; Cloudflare's edge copies (s-maxage 1h) carry
  popular pages through it.
- GitHub secrets `NEXT_EC2_HOST` / `NEXT_EC2_SSH_PRIVATE_KEY` (names kept) now point at web-1.
- DNS: themoviebrowser.com apex + `www` are PROXIED by Cloudflare → web-1; `origin.`/`beta.`
  DELETED (and their Caddy vhosts). stocks.vootlachaitanya.com is an A record in Route 53.

## CloudFront CDN (since Jun 11 2026) — see `.claude/rules/cdn.md`

CloudFront (`E12R1ZNQNG3LK5`) fronts the apex; the EC2 is now the ORIGIN
(`origin.themoviebrowser.com` → EIP, Caddy serves it as a 2nd vhost). All CDN
config + footguns live in `.claude/rules/cdn.md`. TF: `terraform/cloudfront.tf`
+ `providers.tf` (us-east-1 alias for the ACM cert) + `cloudfront-cookie-normalize.js`.

**Gotchas that bit during the cutover:**
- **SG rule limit (60) blocks the CloudFront prefix-list lockdown**: a managed
  prefix-list reference counts as ~its-max-entries (~55) rules, so adding
  `com.amazonaws.global.cloudfront.origin-facing` to the SG fails
  `RulesPerSecurityGroupLimitExceeded`. Origin lockdown stays UNRESOLVED — needs an
  SG-quota increase or the Caddy `X-Origin-Verify` secret gate (which needs box
  `.env` access). Don't retry the prefix-list approach on this SG.
- **`terraform apply` SG drift**: manual `aws ec2 (authorize|revoke)-security-group-ingress`
  during the incident left the http/https rules diverged from TF → full `apply`
  errors on the SG rules. Use `-target=` for CloudFront/IAM applies until the SG
  drift is reconciled (re-import or align the `aws_vpc_security_group_ingress_rule`
  http/https resources).
- ACM cert for CloudFront MUST be in us-east-1 (the `aws.us_east_1` provider alias).

## EC2 Instances

### Beta (current active deployment)
- **Instance**: `m8g.large` (2 vCPU / 8GB ARM Graviton4, **non-burstable** — migrated 2026-06-19 from `t4g.large` to end CPU-credit throttling; in-place stop/start via `terraform apply -target=aws_instance.main`). Root volume 120GB gp3 (grown from 80GB same day). No CPU credits on m-class → the old `--cpu-credits unlimited` + `beta-cpu-surplus-credit-burn` alarm are now no-ops. **To change type/size again:** edit `terraform.tfvars` → baseline-plan → `terraform apply -target=aws_instance.main` (`unset AWS_PROFILE`, `source ../.env.local`, `export TF_VAR_origin_verify_secret=<X-Origin-Verify from CloudFront E12R1ZNQNG3LK5>`; `-target` dodges the SG ingress drift). After a volume bump grow the ext4 FS online: `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`. **On any stop/start:** PM2 (`pm2-ubuntu.service`) + Postgres/Caddy (`unless-stopped`) auto-start, but **ClickHouse is `restart:no`** → run `sudo docker start analytics-clickhouse`.
- **EIP**: `16.112.156.196` → `beta.themoviebrowser.com`
- **Terraform**: `terraform/` with state at `s3://movie-browser-terraform-state/beta/terraform.tfstate`
- **Project name**: `movie-browser-beta` (all AWS resources use this prefix)
- **SSH**: `ssh -i movie-browser-ec2-key.pem ubuntu@16.112.156.196`

### Production (legacy Nuxt + MongoDB)
- **EIP**: `98.130.30.197` → `themoviebrowser.com`
- **Terraform state**: `s3://movie-browser-terraform-state/production/terraform.tfstate`
- **Project name**: `movie-browser` (original resources)
- **Do NOT touch**: Changing `backend.tf` key back to `production/` would target this instance

### Terraform Usage
- **SSH Key**: Reuses existing `movie-browser-ec2-key` (not generated by TF)
- **State**: S3 backend with DynamoDB locking. Beta and production use separate state keys.
- **tfvars**: `terraform/terraform.tfvars` (gitignored) — has `project_name`, `postgres_password`, `lambda_function_name`
- **AWS creds**: Use project-specific IAM user `moviebrowser` (account `620733889764`), never default machine creds

## Docker Compose Services

Root `docker-compose.yml` runs on EC2:
- **PostgreSQL 17** (`pgvector/pgvector:pg17`) — port 5433, 1GB shared_buffers
- **ClickHouse** (`clickhouse/clickhouse-server:25.12`) — port 8123 localhost only, 2.5GB server cap, 3GB Docker limit
- **Caddy** (`caddy:2-alpine`) — HTTPS reverse proxy, `network_mode: host`, auto Let's Encrypt. Config in `Caddyfile`.

Docker Compose reads `.env` on EC2 for `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `DATABASE_URL`.

**Single-file bind-mount gotcha (cost the GA cutover ~20 min):** `Caddyfile` is
bind-mounted as a single file. The deploy's `tar -xzf` replaces it with a NEW
inode, so the running container keeps reading the OLD content forever — `caddy
reload` inside the container happily re-applies the stale file and logs nothing
wrong. After any Caddyfile change shipped via deploy, `docker compose up -d
--force-recreate caddy` is REQUIRED (seconds of TLS downtime; also resets ACME
retry backoff). Symptom: `wget localhost:2019/config/` inside the container
shows hosts that don't match the file on disk.

PG init: only `postgres/init/01-extensions.sql` runs on container start (extensions + shadow DB).
Search indexes (`02-search-indexes.sql`) must run **after** `yarn db:push` creates tables.

**First deploy also requires**: `yarn db:seed` (via `npx tsx prisma/seed.ts`) to populate countries, languages, and genres reference tables.

## CI/CD

GitHub Actions (`.github/workflows/deploy-ec2.yml`):
- **Trigger**: Push to `next` branch (beta) or manual dispatch
- **Environment**: `beta` (GitHub environment with secrets)
- **Concurrency**: `deploy-beta`
- **Pipeline**:
  1. `corepack enable` + Typecheck + lint (CI gate)
  2. Build Next.js (bakes `NEXT_PUBLIC_*` + auth secrets + dummy env placeholders for module evaluation)
  3. Tar: `.next`, **`node_modules`** (built on the runner — shipped so the box does NO install), `public`, `docker-compose.yml`, `Caddyfile`, `cache-handler.cjs`, `.yarnrc.yml`, `prisma`, init scripts, `scripts`

     **THE TAR DOES NOT INCLUDE `src/` — and that silently kills `tsx` cron jobs
     (found Aug 17 2026).** The app itself is fine (it runs the compiled `.next`),
     but every PM2 cron runs `npx tsx scripts/<x>.ts`, and those scripts import
     `../src/...` at RUNTIME. The box still has a `src/` tree left over from an
     older deploy method, **frozen at 2026-06-10** (verified: `src/` mtime
     2026-06-10 while `.next`/`scripts` were rewritten by the same day's deploy),
     so a cron script only works by accident — when the module it needs happens to
     predate the freeze. Confirmed casualty: `episode-drop-notify` dies every day at
     05:00 UTC with `Cannot find module '../src/server/services/notifications/notify'`
     (`MODULE_NOT_FOUND`), so EPISODE_DROP notifications have **never fired in
     prod**. `sync-popularity.ts` survives only because `src/server/db/postgres`
     is older than the freeze. Nine service dirs are missing from the box:
     `cue, discussion, export, import, moderation, notifications, indexnow.ts,
     media-exists.ts, user-location-refresh.ts`. **Fix = add `src` to the tar list**
     (source only, small). Until then, treat "the cron is scheduled" as no evidence
     it runs — check `pm2 logs <job> --nostream` for `MODULE_NOT_FOUND`. Failures are
     invisible: PM2 reports the job as `waiting restart`, not errored, and nothing
     alerts.
  4. Preflight (abort if EC2 disk <2GB / mem <1.5GB free; restart a bloated next first) → SCP → extract (NO `yarn install` — node_modules is in the tar; the on-box install OOM-froze the box Jun 11) → `docker compose up -d` (Postgres only blocking) → **gated** `prisma db push` + FTS (skip unless schema/SQL hash changed) → `pm2 startOrReload` → revalidate prerendered pages (`POST /api/revalidate`). → **[7.5] pgvector HNSW build, detached + deferred** (`scripts/apply-vector-indexes.sh`: no-op unless `postgres/init/03-vector-indexes.sql`'s md5 ≠ `.last-vector-hash`; sleeps 900s past the cold window, builds CONCURRENTLY with 1 worker / 512MB, writes the hash only when both indexes are valid; log `logs/vector-index.log`; see performance.md item 19). **NO CloudFront `/*` invalidation on deploy** (the workflow explicitly does NOT do it — verified Jun 20 2026; a `/*` purge cold-strips the whole edge during the cold restart → re-fill stampede + lost stale-if-error = real outage, Jun 11. Build-skew is tolerated: edge HTML revalidates within s-maxage, occasional "Server Action not found" self-heals on reload. Invalidate a SPECIFIC path only if it must be fresh now.). Failure mode is safe: `set -e` before the PM2 reload means a broken deploy leaves the old process serving. Deploys are **serialized** by the `concurrency: deploy-beta` group (`cancel-in-progress:false` → a 2nd push queues until the 1st finishes; verified they do NOT execute concurrently). See `.claude/rules/cdn.md` for the build-skew rationale.

**Build-time env vars**: The build step needs dummy `MONGO_IP`, `MONGO_PASS`, `DATABASE_URL`, `TMDB_API_KEY` because Next.js page data collection evaluates server modules at build time. Real values are in EC2 `.env.local`.

**Yarn 4**: Project uses Yarn 4.9.2 via corepack. CI runs `corepack enable` before yarn. EC2 deploy runs `sudo corepack enable`.

Secrets use `NEXT_EC2_*` prefix to avoid collision with legacy Nuxt secrets.

**Every PM2 cron script must load `.env.local` itself (Oct 12 2026).** PM2 hands a
cron job ONLY its ecosystem `env` block (`NODE_ENV`, `CRON_HOUR_UTC`); `DATABASE_URL`
and every secret live in the box's `.env.local`. The existing jobs call
`config({ path: ".env.local" })` from `dotenv` at the top; `refresh-taste-baseline.ts`
did not, so the `taste-baseline` job died `Environment variable not found: DATABASE_URL`
at 19:00 UTC on Oct 10 AND Oct 11 while PM2 kept showing it `waiting restart` (not
errored) and nothing alerted. Prod taste vectors stayed in RAW space (no catalog mean)
the whole time. A new cron is not working until you have read its
`logs/<job>-out.log` from the first real run.

## AWS IAM (Instance Profile)

Beta EC2 role (`movie-browser-beta-ec2-role`) provides:
- `bedrock:InvokeModel` — Kimi K2.5 (ap-south-1) + Cohere Embed v4 (global inference profile)
- `lambda:InvokeFunction` — `movie-ratings-scraper-beta` + `puppeteer-node14`
- S3 backup bucket access
- CloudWatch agent

**Important**: App code (`bedrock.ts`, `cohere-generator.ts`) omits AWS credentials on EC2 — the SDK auto-resolves from instance metadata. Only set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` for local dev.

## Lambda

Beta uses its own Lambda: `movie-ratings-scraper-beta` (separate from production `movie-ratings-scraper`).
Configurable via `LAMBDA_FUNCTION_NAME` env var in `.env.local` (defaults to `movie-ratings-scraper` if unset).
Since 2026-10-08 it is the browserless v2 scraper (arm64/256MB/30s, no Chromium layer) and the
ONLY scraper called — `puppeteer-node14` (Google panel) is dead (0 ratings in 16k calls) and no
longer invoked; its IAM grant can be dropped. Full reference: `.claude/rules/enrichment-scraper.md`.

## MongoDB (Temporary)

Remote MongoDB on legacy EC2 (`98.130.30.197`). Connected via `MONGO_IP` env var in `.env.local`.
Controlled by `USER_DATA_SOURCE` env var (`mongodb` default, `postgres` at GA).
Will be fully severed post-GA.

## Backups & Alerting (set up 2026-06-10, CLI-managed — NOT in Terraform)

| What | Where | Schedule | Retention |
|------|-------|----------|-----------|
| PG logical dump (beta) | `~/bin/pg-backup.sh` → `s3://movie-browser-migration-2025-10-19/backups/pg/` | cron 02:30 UTC | 30d (S3 lifecycle) |
| ClickHouse logical dump (beta) | `~/bin/clickhouse-backup.sh` → `.../backups/clickhouse/` | cron 04:00 UTC (`nice -n 19`) | 30d (S3 lifecycle) |
| MongoDB dump (legacy, ALL user data) | `~/bin/mongo-backup.sh` on `98.130.30.197` → `.../backups/mongo/` | cron 02:00 UTC | dead (legacy box terminated) |

- **EBS snapshots RETIRED 2026-07-16** (cost cut). All snapshots deleted, DLM policy
  `policy-0bbc1c9e1ae3d88e9` set to **DISABLED** (not deleted — re-enable to resume).
  Rationale: EBS snapshots cost ~$21/mo to protect a 120GB volume that is ~90%
  regenerable (ISR/image cache, node_modules, `.next`); the only irreplaceable data
  (Postgres + ClickHouse) is now BOTH dumped nightly to S3, and the box is
  Terraform-rebuildable. Trade-off accepted: DR is now rebuild-from-Terraform +
  restore-from-S3 (~1-2h) instead of a fast snapshot restore. Box config/secrets are
  NOT in S3 (a config stash was rejected as credential-leak) — they reconstruct from
  the deploy pipeline's GitHub `NEXT_EC2_*` secrets + Terraform.
- ClickHouse dump: `SHOW CREATE` + per-table `FORMAT Native` gzip → tar → S3. Excludes
  MV `.inner_id.*` storage (MVs rebuild from base tables). GOTCHA baked in: `docker exec`
  is called WITHOUT `-i` and table lists are read via `mapfile` first — `docker exec -i`
  inside a `while read` loop swallows the loop's stdin (same stdin-swallow class as the
  deploy pipeline). `page_views` (~1.1GB) needs `--max_execution_time=0 --receive_timeout=3600`
  or it trips the 30s default (Code 159).
- PG script TOC-verifies the dump (`pg_restore --list`) **before** uploading. Logs: `~/logs/*.log` on each box.
- **Alerting**: SNS topic `movie-browser-alerts` (ap-south-2) → email. CloudWatch alarms:
  `{beta,prod}-status-check-failed`, `beta-cpu-surplus-credit-burn` (CPU pegged again),
  `{beta,prod}-disk-above-80pct` (fed by `~/bin/disk-metric.sh` cron, every 5 min, namespace
  `MovieBrowser` — both June 2026 outages were disk-fill).
- Both EC2 instances have **termination protection** enabled; disable via
  `aws ec2 modify-instance-attribute --no-disable-api-termination` before any teardown (GA).
- Beta has a **2GB swapfile** (`/swapfile`, swappiness 10) and Prisma pool params
  `connection_limit=10&pool_timeout=20` appended to `DATABASE_URL` in both EC2 env files.
- Hot churn tables have per-table autovacuum overrides (`scale_factor=0.05`, `cost_delay=0`) —
  set via `ALTER TABLE`, survive `prisma db push`.

## Local PostgreSQL Access (SSH Tunnel)

```bash
ssh -i movie-browser-ec2-key.pem -L 5433:localhost:5433 ubuntu@16.112.156.196 -N
# Then: DATABASE_URL=postgresql://moviebrowser:PASS@localhost:5433/moviebrowser yarn db:studio
```

## Memory Budget (8GB instance)

| Process | Max |
|---------|-----|
| OS + Docker | ~500MB |
| Next.js (PM2) | 600MB |
| PostgreSQL | ~1.5GB |
| ClickHouse | 2.5GB server cap, 3GB Docker limit, 1GB/query |
| PM2 cron jobs | 1GB peak |
| Headroom | ~2.9GB |

## ClickHouse Schema

Schema in `analytics/clickhouse/init/001-schema.sql` — runs on `docker compose up` (fresh init).

Key tables:
- `page_views` — Traffic (90-day TTL)
- `user_actions` — Watchlist, ratings, clicks, search, filters (90-day TTL)
- `ai_usage` — LLM invocations with tokens + USD cost (365-day TTL)
- `api_calls` — External API calls: TMDB, Lambda, embedding (90-day TTL). Has `tokens UInt32` column and `service` enum including `'embedding'`
- `errors`, `system_metrics`, `sessions`, `performance`

Materialized views: `daily_stats`, `hourly_ai_costs`, `content_performance`, `hourly_api_quotas`.

No migrations — schema SQL is authoritative. Re-deploy recreates containers. Pre-GA data loss is acceptable.

## PM2 Jobs (web-1, measured Nov 2026 — every run writes a `job_run_summary`, see performance.md "Metrics")

| Job | Schedule (UTC) | Measured run | Writes/run |
|-----|----------|------------|------------|
| `next` | Always | — | `NEXT_MAX_MEMORY` 1700M RSS cap, heap 1280 MB on web-1 |
| `episode-drop-notify` | daily 05:00 | 15-40 s | 0 notifications so far (no trackers) |
| `isr-cache-prune` | every 6h (00/06/12/18) | seconds | 0 unless disk < 4 GB free (bounded-isr backstop) |
| `taste-baseline` | **Sundays** 19:00 (weekly since Nov 16 2026) | 7-8 min, unniced PG aggregation | ~200 of ~457k keys |
| `imdb-ratings-sync` | daily 20:00 | 1-2.5 min | ~3-5k of ~576k ratings (diff-only) |
| `popularity-sync` | daily 21:00 | **12h+ on Nov 15-16** (box saturated) | ~75% of movies / ~90% of series (being fixed) |
| `sitemap-generator` | daily 22:00 | ~96 s | 13 files |

No two jobs overlap EXCEPT popularity-sync, whose 12h run on Nov 15-16 overlapped every
other job and the 03:00-07:00 fleet window; fixing its write volume is the schedule fix.
The user crontab on web-1 was EMPTY on Nov 16 2026: `~/bin/pg-backup.sh`,
`disk-metric.sh` and `scripts/disk-guard.sh` were not scheduled after the move.

## Memory Budget (web-1, 4 GB + 4 GB swap, measured Nov 16 2026 under load)

| Process | Observed | Cap |
|---------|----------|-----|
| next-server | 1.5 GB RSS **+ 0.74 GB in swap** | PM2 `max_memory_restart` 1700M (RSS only — swap is invisible to it), heap 1280 MB |
| Postgres (container) | ~0.7 GB (+ 512 MB shared_buffers as shmem) | `mem_limit 1400m` |
| Caddy | ~160 MB | none |
| kosh (api + web) | ~30 MB resident (mostly swapped) | systemd |
| cron job (tsx) | 200-900 MB | per-job `max_memory_restart` |
| page cache | ~1.2 GB | — |

Heap tracks IN-FLIGHT renders (§14), so the lever is fewer slow renders (§22), then a lower
Caddy `unhealthy_request_count` — not a bigger heap.
