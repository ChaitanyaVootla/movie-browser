# Perf audit: web-1 (Hetzner CX23, 2 vCPU / 4 GB), 2026-11-16

Measured read-only on prod between 09:25 and 09:45 UTC. Nothing on the box was stopped,
restarted or reconfigured. Branch `claude/perf-audit-0d8252`, not deployed.

## State of the box at the time

| Signal | Value |
|---|---|
| Load average | 13.5–15.8 all day (`sar -q`), on 2 vCPU |
| CPU | `vmstat`: 0% idle, 82–88% user; PSI cpu `some` avg300 87% |
| IO | 17–38 MB/s reads; PSI io `some` avg60 55–61%; Postgres container 1.89 TB read since restart (~32h) |
| Swap | 1.75–1.9 GB used, 300–700 pages/s in AND out (`sar -W`); next-server has 737 MB swapped out |
| Renders | `activeRenders` p50 82 / max 98 (Caddy `unhealthy_request_count` 96); 41,403 `render_slow` (>30s) + 39 `render_deadline_exceeded` in 11.5h |
| Postgres | 11 active / 32 conns; buffer hit ratio 95.9%; 71.8 billion tuples returned since start |

## Findings, ranked by expected impact

### 1. "Similar" ran a whole-catalog scan on ~90% of cold detail renders. FIXED on this branch

`smartDiscover({ similarToId })` (`src/server/db/postgres/smart-discover.ts`) looks up the
source title's embedding. When it is NULL, the old code fell through to
`ORDER BY popularity DESC` over the entire table with a per-row
`EXISTS (ratings … vote_count >= 100)`. Coverage is 121,112 of 1,184,658 movies and 25,618
of 176,807 series, so nearly every cold movie/series render took that path.

- Plan (EXPLAIN only): Parallel Index Scan on `ratings_source_id_idx` over all ~620k TMDB
  rating rows → nested loop into `movies_pkey` → sort. Series: seq scan + sort of 176k rows +
  nested loop.
- `pg_stat_user_indexes` since the restore: `ratings_source_id_idx` read **64.1 billion
  tuples in 103,575 scans**; `movies_pkey` **2.45 billion scans**; `series_pkey` read 2.69
  billion tuples.
- `next-out.log`, last 11.5h: **56,466 calls, p50 8.4s, p90 18.0s, p99 28s, about 572,000
  query-seconds**, which works out to ~14 of them running at any moment. All 215
  `prisma_op_timeout` (30s) events were this query, and so are most `render_slow` pending
  `prisma:$raw.$queryRawUnsafe` entries.
- It also returned the wrong thing: the globally most popular titles, labelled "similar".

Fix: return no rows after the PK lookup when the source has no embedding. The TMDB
recommendations/similar rows that render alongside it fill the module. A test pins it.
**Expected effect:** this removes most of the Postgres CPU and IO, the slow-render queue and
the in-flight heap behind the swap thrash. Verify after deploy with the queries under
"Verify" below.

Also on this branch: the per-render `smart_discover` info line (57k lines / 17 MB per 11.5h)
now logs at debug for similarTo calls.

### 2. popularity-sync ran for 12+ hours (owned by another session, not changed here)

It started at 21:00 UTC and was still on persons at 09:12 UTC: 911,891 movie and 157,380
series rows were updated. It overlapped every other job and the 03:00–07:00 UTC fleet
window. The UPDATE sets only `popularity` (no `updated_at`, no triggers), so the only
indexes that block HOT are `movies_popularity_idx` / `series_popularity_idx`. The GIN, HNSW
and trigram indexes do not block it. The second limit is page space: `fillfactor` is the
default 100, and persons, which has no popularity index, still got only 29% HOT updates
(32,823 of 114,304). A partial popularity index would not help, because any index that
references the column blocks HOT. The taste-recs "popular fallback" depends on the btree.
So the lever is writing fewer rows. Part of the 12h runtime is the box being saturated by
#1. Details are in the shared notes for that session.

### 3. Nightly jobs: one wasteful schedule, one dead backstop. FIXED on this branch

| Job | Measured (from its logs) | Verdict |
|---|---|---|
| `imdb-ratings-sync` 20:00 | 56–146 s; ~3–5k of ~576k ratings updated, diff-only | fine |
| `taste-baseline` 19:00 | **407–464 s** of unniced Postgres aggregation (cast 114–234 s) for ~200 changed keys of ~457k (0.04%) | **now weekly** (Sundays) |
| `sitemap-generator` 22:00 | 96 s, 13 files | fine |
| `episode-drop-notify` 05:00 | 15–40 s, 0 notifications written every day | fine (cheap) |
| `isr-cache-prune` every 6h | walked the empty `.next/server/app` and logged "0 files" every run; the real store (`bounded-isr`, up to 6 GB) was never looked at | **retargeted** |

`isr-cache-prune` now targets `.next/cache/bounded-isr` (`*.json`, budget `BOUNDED_CACHE_MB`).
The 6-hourly run only walks that directory when free disk is below 4 GB (`PRUNE_MIN_FREE_MB`):
the cache handler already bounds it at write time, and stat-ing ~170k files on an IO-bound
box just to confirm that is waste. `disk-guard.sh` and the deploy preflight pass
`ISR_CACHE_BUDGET_MB`, which still forces the walk.

Overlap: none between my jobs. The proposed schedule for 2 vCPU / 4 GB is the current one,
plus weekly taste-baseline and a popularity-sync that finishes inside its hour:

| UTC | Job |
|---|---|
| 00/06/12/18 | isr-cache-prune (seconds) |
| 05:00 | episode-drop-notify (<1 min) |
| 19:00 Sun | taste-baseline (~8 min) |
| 20:00 | imdb-ratings-sync (1–3 min) |
| 21:00 | popularity-sync (must fit before 22:00) |
| 22:00 | sitemap-generator (~2 min) |

### 4. Box config: recommendations (not applied; each one needs your OK)

Memory under load: next-server 1.5 GB RSS + 0.74 GB swapped, Postgres ~0.7 GB + 512 MB
shared_buffers (shmem), Caddy 160 MB, kosh ~30 MB resident, page cache ~1.2 GB. PM2's
`max_memory_restart 1700M` counts RSS only, so the swapped part is invisible to it.

1. **Ship #1 first, then re-measure** with the new metrics before tuning anything else.
   Most of the swap is in-flight render heap (performance.md §14).
2. **Caddy `unhealthy_request_count` 96 → 48** once `render_stats.maxActive` shows the
   post-fix steady state. 96 concurrent renders cannot all fit in a 1280 MB heap on
   2 vCPU. Queueing them in Caddy is cheaper than swapping them in Node.
3. **Postgres**: keep `shared_buffers=512MB` and `mem_limit 1400m`. Set
   `effective_cache_size=1GB` (1.5 GB overstates the ~1.2 GB page cache shared with Node)
   and `jit=off` (OLTP workload; JIT only adds compile time). `max_connections 40` is fine
   (Prisma pool `connection_limit=10`).
4. **Enable `pg_stat_statements`** (needs a Postgres restart, a few seconds): add
   `-c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.max=2000
   -c pg_stat_statements.track=top -c track_io_timing=on` to the box's
   `docker-compose.override.yml`, recreate the container, then
   `CREATE EXTENSION pg_stat_statements;`. Overhead is ~1–2%. It gives per-query total
   time, which is exactly the number #1 had to be reconstructed from logs.
5. `BOUNDED_CACHE_MB=6000`: keep. Root has 9.8 GB free; raising it risks disk.
   `NEXT_HEAP_MB=1280`: keep until #1 has been measured.
6. Swap 4 GB, `swappiness=10`: fine. Swapping is a symptom of #1, not a setting problem.

### 5. Index hygiene (proposal only)

Since the restore (~32h, bot-heavy traffic), these are zero or near-zero scans on
write-heavy tables: `credits_movie_id_credit_id_key` (0 scans, 629 MB),
`credits_series_id_credit_id_key` (1, 525 MB), `idx_movies_fts` (0, 195 MB),
`idx_persons_fts` (0, 166 MB), `persons_name_idx` (1, 141 MB),
`watch_options_provider_id_idx` (0, 74 MB), `videos_view_count_idx` (0),
`movies_release_date_idx` (0). The FTS ones serve submitted searches (`fts-search.ts`),
and the credit ones are Prisma `@@unique`s. 32 hours is too short a window to drop
anything. Re-check after a week of `pg_stat_user_indexes`. Note that none of them block
popularity HOT updates (see #2).

### 6. Things found in passing (not fixed here)

- **The web-1 user crontab is empty**: `~/bin/pg-backup.sh`, `disk-metric.sh` and
  `scripts/disk-guard.sh` are not scheduled since the move, so there are no nightly PG
  dumps and no disk guard. `kosh-backup.service` is also `failed`.
- `sitemap-generator` logs a `MODULE_TYPELESS_PACKAGE_JSON` reparse warning every run
  (cosmetic).

## Metrics added (how to read them: performance.md "Metrics")

- `job_run_summary`: one line per cron run (duration, job CPU, peak RSS, rows written by
  kind) in the job's log and in `~/metrics/job-runs-YYYY-MM.jsonl`. Wired into imdb,
  taste-baseline, sitemap, episode-drop and isr-prune. popularity-sync can opt in with
  `startJobRun("popularity-sync")` from `scripts/lib/job-run.cjs`.
- `render_stats`: one line per minute from next-server (renders/min, ok/error/deadline/slow,
  p50/p95/max, peak in-flight, event-loop delay, RSS/heap, load) in `next-out.log` and
  `~/metrics/render-stats-*.jsonl`.
- `scripts/box-stats.sh`: a 5-minute box + Postgres sampler to `~/metrics/box-*.jsonl`.
  It needs a system crontab line (prod change, your call). It was validated on web-1 into
  a temp dir that was deleted afterwards.
- `node scripts/metrics-report.cjs [--hours N] [--json]` summarises all three, hourly.

## Verify after deploy

```
# Fallback gone: these should stop growing (snapshot, wait 10 min, diff)
SELECT idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE indexrelname IN ('ratings_source_id_idx','movies_pkey');
# Render queue drains
tail -c 3000000 ~/.pm2/logs/next-out.log | grep -c '"render_slow"'
tail -c 300000 ~/.pm2/logs/next-out.log | grep '"render_stats"' | tail -5
```

## Validation done locally

- New and updated unit tests pass: smart-discover (10), prune-isr-cache (11), job-run (5),
  metrics-report (4), render-stats (2), render-deadline (12).
- `tsc --noEmit` reports no errors in any touched file. ESLint is clean on touched files.
  This worktree has no `node_modules` of its own: resolution falls back to the main
  checkout's, which lacks several packages and has a stale Prisma client. As a result the
  full `yarn typecheck` / `vitest run` show ~600 type errors and 21 suites failing on
  missing modules (`web-push`, `@tiptap/react`, `serwist`, …) in files this branch does not
  touch. Re-run both in a properly installed checkout (e.g. `C:\dev\mb-prod-build`) before
  deploying.
