# Performance: Diagnosing, Fixing & Testing

How to make this app fast and **prove** it. Distilled from a June 2026 perf pass
that took beta from a 10× CPU-oversubscribed box (home TTFB 2.1s, movie page 10.4s,
search hanging) to home ~0.6s / movie ~1s / search ~150ms.

## Golden rule: measure first, on beta, with real numbers

Never guess. The code path is usually fast (a Postgres query is ~90ms); slowness
is almost always **CPU contention** on the shared box, a **blocking call on the
render path**, or a **missing index**. Distinguish them before fixing.

### Measure server render time (TTFB / streamed response)
Playwright from the **project dir** (so `@playwright/test` resolves), headless:
```js
import { chromium } from '@playwright/test';
const p = await (await chromium.launch()).newPage();
await p.goto(url, { waitUntil: 'domcontentloaded' });
const n = await p.evaluate(() => { const x = performance.getEntriesByType('navigation')[0];
  return { ttfb: Math.round(x.responseStart - x.requestStart), resp: Math.round(x.responseEnd - x.requestStart) }; });
```
- `ttfb` = server time to first byte (shell). `resp` = full streamed response (incl. Suspense content). For a streaming page a fast `ttfb` + slow `resp` means a slow Suspense boundary, not slow TTFB.
- Compare beta vs the legacy site (`themoviebrowser.com`) for a baseline.

### Measure a server action's real latency (ground truth)
Capture the POST to the page route (server actions POST to the current URL with a
`next-action` header — there is **no `/api/...` request**, which is why "no search
API call" is expected, not a bug):
```js
p.on('requestfinished', r => { if (r.method()==='POST' && new URL(r.url()).pathname==='/') {
  const t = r.timing(); console.log(r.headers()['next-action']?.slice(0,8), Math.round(t.responseEnd - t.requestStart)); } });
```
If the DB query is 90ms but the POST is 1–4s, it's **server CPU contention**, not the query.

### Measure the box itself (SSH)
```
ssh -i movie-browser-ec2-key.pem -o StrictHostKeyChecking=no ubuntu@16.112.156.196 \
  'uptime; top -bn1 | grep "%Cpu"; ps aux --sort=-%cpu | head -6'
```
- `%Cpu(s) ... 0.0 id` = CPU-saturated. High `wa` = disk I/O bound. Load avg ≫ vCPU count = oversubscribed (beta = **2 vCPUs**).
- Beta shares 2 cores across Postgres + ClickHouse + Next (PM2) + background enrichment. CPU is the scarce resource.

### Playwright measurement gotchas (these burned hours)
- Run the script from `/Users/chaitanya/dev/movie-browser` (not `/tmp`) or `@playwright/test` won't resolve. The `clickhouse/...` and chromium images are already pulled locally.
- **`src/proxy.ts` 429s headless Chromium — including against local dev.** Headless
  Chrome sends `sec-ch-ua: "HeadlessChrome"`, which the scraper shed blocks, so pages
  render empty (no nav, no AI floaty) with a 429 console error. Spoof BOTH a real
  Chrome `userAgent` AND `extraHTTPHeaders: { "sec-ch-ua": '"Chromium";v="136", "Google
  Chrome";v="136", "Not.A/Brand";v="99"', "sec-ch-ua-mobile", "sec-ch-ua-platform" }`
  on the browser context before debugging "missing" UI.
- The search dialog's "Search all for X" is an **always-present `cmdk-item`** — don't treat `items>=1` as "results loaded"; wait for a `[cmdk-group-heading]` (Movies/Series/Results).
- Results from a **previous query persist** while a new one loads → open a fresh dialog per query, or you'll measure stale state.
- Per-keystroke typing fires many debounced actions that queue; use `fill()` for a single clean action when measuring server time.

## High-impact fixes (in rough ROI order)

1. **ISR-cache user-agnostic pages — the FULL recipe (every item is load-bearing;
   June 2026: each one was independently missing and each alone kept ISR dead).**
   Detail pages (`movie`/`series`/`person`) are user-agnostic (user state hydrates
   client-side; ratings stream via SSE), so they're ISR-cacheable. ALL of:
   1. `export const revalidate = 3600` (movie/series) / `86400` (person).
   2. **`export async function generateStaticParams() { return []; }` — REQUIRED.**
      A dynamic route WITHOUT generateStaticParams is rendered per-request no
      matter what `revalidate` says (it won't appear in
      `.next/prerender-manifest.json` `dynamicRoutes`, and no route-cache entries
      are ever written). Empty array = prerender nothing, cache on demand.
   3. **No dynamic APIs anywhere in the render tree** — page, layout, AND every
      server function the render calls. Burned us thrice: `<ServerPageTracker />`
      awaiting `headers()` in `app/layout.tsx` (tracking now lives in
      `src/proxy.ts`); `await searchParams` for the `__e2e_error` E2E hook (now
      gated behind `NODE_ENV !== "production"`); `getCountryCode()` (→ `headers()`)
      inside hydration/actions (render paths use `SSR_RENDER_COUNTRY = "IN"`;
      clients correct via `/api/geo` + watch-providers API).
   4. **No explicit `cache: "no-store"` on fetches in the render path.** Next 15+
      default fetch is already uncached but route-static; an EXPLICIT no-store
      additionally opts the route out (tmdb.ts had one "to avoid double caching").
   - **Status codes: resolved in the PROXY since Jun 11 2026** (movie/series).
     A route with `loading.tsx` streams a 200 before `generateMetadata` can
     throw — tested: `htmlLimitedBots: /.*/` does NOT change that (garbage ID
     returned 200 with skeleton markup). So 404/308 live pre-render in
     `src/proxy.ts` via `src/server/proxy/media-resolver.ts`: in-process LRU
     (100k ids → canonical slug or NOT_FOUND sentinel, negatives cached) →
     indexed PG PK lookup → 2s-capped TMDB existence check (new releases not
     yet in PG) → fail OPEN on any error. 404s rewrite to
     `src/app/media-not-found/page.tsx` (loading-less route that `notFound()`s
     pre-flush). This makes `loading.tsx` on movie/series SAFE (instant nav
     skeletons) — but do NOT add `loading.tsx` to any other status-throwing
     route (person) without the same proxy authority. The pages keep their
     `generateMetadata` throws as nearly-dead fallbacks for proxy-bypassing
     requests. Two middleware gotchas (each cost a build cycle): a RELATIVE
     `Location` header from the proxy throws `ERR_INVALID_URL` → 500 (Next
     requires absolute), and `req.nextUrl.origin` reflects the server's
     internal address, not the request (`-p 3111` reported `localhost:3000`)
     — build redirect origins from `X-Forwarded-Proto`/`Host` headers.
   - **Verify after deploy:** repeat `curl` of the same detail URL must drop to
     ~ms; route-cache files appear under `.next/server/app/movie/<id>/...html`;
     `curl -o /dev/null -w '%{http_code}'` on a garbage ID = 404, wrong slug = 308.
   - **Verify locally before pushing:** `lsof -ti :3111` first — a half-killed
     old `next-server` (pkill pattern "next start" does NOT match it) serves
     stale code and silently invalidates the whole test matrix.
   - **ISR disk cache: bounded by `cache-handler.cjs` since Jun 11 2026** (LRU
     at write time, `BOUNDED_CACHE_MB`=4GB, stored in `.next/cache/bounded-isr`,
     7 unit tests in `src/lib/cache-handler.test.ts`). Background: Next's
     DEFAULT cache never evicts by size — Jun 10 it grew to **41GB** under bot
     crawl, disk hit ENOSPC, next-server SIGABRT'd, prod flapped for hours.
     The handler MUST ship in the deploy tar (next.config references it at
     runtime; missing file = 500 on every request — burned us once).
     Backstops: `isr-cache-prune` PM2 job every 6h + deploy preflight refuses
     <2GB free disk. Diagnosis signature for disk-full: load ≫ vCPUs at mid
     CPU%, `pm2 logs` ENOSPC, `df -h` 100%. `pm2 flush` buys ~1GB instantly.
     **Disk-full aftermath checklist (each bit us on Jun 10):** (1) ClickHouse's
     log file breaks → infinite "Cannot log message / File access error" storm
     → dockerd+CH burn ~1.7 cores shoveling json logs (48MB/min rotation) —
     `docker restart analytics-clickhouse` fixes it; (2) a half-killed
     next-server can squat port 3002 → PM2 crash-loops on EADDRINUSE —
     `sudo fuser -k 3002/tcp`; (3) a deploy whose scp/tar failed mid-way leaves
     `.next` corrupt — redeploy, don't debug it.
2. **Never block the render path on a scrape/LLM/Lambda.** Detail-page hydration returns PG/TMDB immediately and refreshes ratings in a **deduped background task**; the SSE enrich endpoint streams them in. See `.claude/rules/postgres-hydration.md`. A synchronous Lambda scrape added seconds per first/stale visit.
3. **Cap ClickHouse CPU** (it ate 1.5 of 2 cores). `docker-compose.yml`: `cpus: "0.9"` + low `cpu_shares`, and `concurrent_threads_soft_limit_num` in `analytics/clickhouse/config/config.xml`. **GOTCHA:** do NOT set `background_pool_size` low — `background_pool_size * background_merges_mutations_concurrency_ratio` must be ≥ `number_of_free_entries_in_pool_to_execute_mutation` (default 20) or ClickHouse exits 36 in a crash loop. **Always validate CH config in a throwaway local container before deploying** (see Testing below). A mounted `config.d` edit does NOT recreate the container — but DON'T force-recreate every deploy either (re-merging the part backlog spikes CPU for minutes; recreate once, manually, when config changes).
4. **ClickHouse system logs are disabled — keep them that way.** June 2026: the
   `system.*` introspection logs (never TTL'd by default) silently grew to **22.5GB
   (trace_log alone 18GB) vs ~130MB of real analytics data**. Their background merges
   couldn't fit the memory cap → cgroup OOM-kill **crash loop for 9 days** (387 kernel
   kills, "Up N seconds" forever, admin dashboard down, ~1 core burned). All
   `<X_log remove="1"/>` entries now in `analytics/clickhouse/config/config.xml`; also
   `max_server_memory_usage` = 2.2GB because CH's tracker under-counts RSS by ~0.5GB
   (allocator/thread stacks) and must stay below the 3GB Docker `mem_limit` or the
   kernel kills it instead of queries failing gracefully. If a log table is ever
   re-enabled for debugging, give it a `<ttl>` and re-disable after. Diagnosis
   signature: `dmesg | grep "Killed process"` + err.log `MEMORY_LIMIT_EXCEEDED` inside
   `MergeTask::execute` naming `system.*` parts. Safe cleanup with server stopped:
   delete the `store/<uuid>` target of `data/system/<table>` symlink + the symlink +
   `metadata/system/<table>.sql` (system logs hold no app data).
5. **Every FK with `onDelete: Cascade` needs an index on the referencing column.**
   June 2026: `images.season_id`/`images.episode_id` had no index, so each cascaded
   row from `DELETE FROM seasons WHERE series_id=$1` (series re-hydration) seq-scanned
   the bloated 600MB images table → **42-minute DELETEs** at 30% CPU, all day, every
   day (a top-2 driver of the box's chronic 100% CPU + ~$45/mo t4g surplus credits).
   With indexes: worst series (21k episodes) deletes in 2.7s. Audit query: see the FK
   `has_leading_index` query pattern (pg_constraint × pg_index). Known remaining
   unindexed FKs (acceptable — only hit on rare `series` row deletes, not hydration):
   `watchlist/user_ratings/recent_items/continue_watching.series_id`.
6. **Hydration delete+reinsert churn bloats PG and starves autovacuum.** Upserts
   rewrite all child rows (credits/images/watch_options/episodes…) on every freshness
   refresh; at crawler scale this produced 387k deletes on an 8k-row table,
   `autovacuum_count=0` (never completed), and 5GB/2.9GB tables holding ~50MB of live
   data. If bloat reappears (`n_dead_tup ≫ n_live_tup`, table size ≫ live rows):
   manual `VACUUM (ANALYZE)` with `SET vacuum_cost_delay=0`. Durable fix (open, see
   memory): diff-based upserts instead of delete+reinsert.
7. **Parallelize independent server fetches.** A page that does `await getA(); await Promise.all([getB, getC])` where B/C don't need A should start B/C as in-flight promises before awaiting A.
8. **Search/trigram specifics** — see `.claude/rules/search-system.md`. Trigram indexes MUST live in `prisma/schema.prisma` (`@@index(type: Gin, ops: raw("gin_trgm_ops"))`) or `prisma db push` drops them as drift. Trigram is pathological for common multi-word queries ("the matrix" → 9s); use FTS (`to_tsvector`) for those, trigram only as a typo fallback. Enforce a 0.3 `%` threshold floor on the large (movies/persons) tables.

9. **PM2 cron jobs: guard, nice, schedule, and threshold writes.** `pm2 start`
   (= every deploy) runs `cron_restart` jobs ONCE immediately — both heavy jobs
   used to launch at peak and 502 the box (GA day). Scripts now exit unless
   `getUTCHours() === CRON_HOUR_UTC` (`FORCE_RUN=1` to override); jobs run under
   `nice -n 19` at 21:00/22:00 UTC. **Why a "simple popularity upsert" pegged
   the CPU:** popularity is an indexed(desc) column on wide rows, and TMDB
   re-jitters the float daily for ~every title — exact-equality diffing rewrote
   the whole 807k-row table nightly (MVCC row copy + index churn + WAL per
   row). Fixed with a significance threshold (skip < max(0.05, 5%)), 3-decimal
   rounding, 250ms inter-batch pauses, and streaming the export parse (was
   3.7GB RSS buffering the decompressed dump).
10. **Scraper fleet = the load, not the users.** Post-GA, ~87% of requests were
   two scraper classes (ClickHouse: `missing_client_hints` + `stale_chrome`,
   ~7k req/10min vs ~650 human). `src/proxy.ts` 429s them pre-render (plus
   webdriver/headless hints and `Accept: text/markdown` LLM scrapers). When the
   box melts under "organic" traffic, FIRST check
   `page_views GROUP BY bot_type` for the last 10 min. NOTE (corrected Jun 11):
   deploys do NOT wipe the ISR cache — the deploy tar extracts OVER `.next`,
   so cache entries persist across deploys (this false assumption hid the
   41GB cache growth). Cold-render windows happen only after a cache purge
   or revalidate expiry, not every deploy.
11. **Don't run parallel Playwright audits against prod.** Jun 10 2026: four
   concurrent visual-audit agents scroll-loading ~80 pages (incl. uncached sparse
   titles and garbage IDs → cold renders + enrichment triggers) on top of the
   crawler baseline tipped the 2-vCPU box into timeouts (monitor DOWN ~1 min,
   self-recovered). Sequence audit agents or point them at a local `next start`
   build; reserve prod for single-page spot checks. Same incident's traffic mix:
   ByteSpider (`bytedance`) was the top *served* (not 429'd) crawler at ~315
   req/min — first throttle/block candidate in `src/proxy.ts` if the box is hot.

12. **Node RSS climbs unbounded while the V8 heap stays flat → glibc malloc
   arena fragmentation, NOT a JS leak.** Jun 11 2026: prod RSS grew to 4.8-6GB
   and kernel-froze the box repeatedly. Two heap snapshots diffed (kill -USR2,
   `--heapsnapshot-signal=SIGUSR2` in NODE_OPTIONS): **RSS +757MB but JS heap
   only +30MB** between them — the growth was native/external, not JavaScript.
   Cause: the ISR `cache-handler.cjs` gzip/gunzips on every cache op; under
   crawler load that churns large Buffers, and glibc's default malloc arenas
   (8 × nCPU) retain freed chunks instead of returning them to the OS. Fix:
   **`MALLOC_ARENA_MAX=2`** in the PM2 `env` (ecosystem.config.cjs). Verified:
   RSS plateaued ~1GB (oscillating 980-1080, memory returning to OS) over 35min
   vs the old unbounded climb. Diagnosis signature: `ps rss` ≫ heap snapshot
   total; RSS grows while `process.memoryUsage().heapUsed` is flat; app does
   heavy zlib/Buffer work. Don't chase it in JS — it's the allocator. (Heap
   caps like `--max-old-space-size` do NOT bound this; it's external memory.)
   `MALLOC_ARENA_MAX` must be a real process env var — PM2 `--update-env` reads
   the ecosystem `env` block, NOT arbitrary shell vars.

## Testing a fix

- **App perf:** re-run the Playwright TTFB / POST-timing scripts above against beta after deploy; compare before/after. Confirm load average dropped via SSH.
- **ClickHouse config:** validate locally before shipping —
  ```
  docker run -d --name ch-test --cpus 0.9 -v <cfg>:/etc/clickhouse-server/config.d:ro clickhouse/clickhouse-server:25.12
  docker logs ch-test            # must NOT exit 36 / crash-loop
  docker exec ch-test clickhouse-client --query "SELECT getServerSetting('concurrent_threads_soft_limit_num')"
  docker exec ch-test clickhouse-client --query "SELECT count() FROM numbers(200000000)"  # large query still completes
  ```
- **EXPLAIN before trusting an index:** `docker exec movie-browser-postgres psql ... -c "EXPLAIN ANALYZE <query>"` — confirm Bitmap Index Scan, not Seq Scan, and check the actual row/time.
- **Always verify on beta, not assumptions** (see `superpowers:verification-before-completion`).

## Deploy pipeline gotchas (cost real time — see `.github/workflows/deploy-ec2.yml`)

- `docker compose exec` reads stdin **even with `-T`**. Inside the deploy's `ssh <<'EOF'` heredoc it will **swallow the rest of the script** (steps after it silently don't run, deploy still exits 0 → "successful" deploys that never restarted PM2). Always `</dev/null` on in-heredoc `docker compose exec/ps`.
- Don't `docker compose up --wait` on ClickHouse — it fails the whole deploy when CH is unhealthy, but the **app only needs Postgres**. Wait on `pg_isready` instead.
- **git push stalls on HTTP/2** from this environment — `git config http.version HTTP/1.1` (already set). If a push hangs with no output, that's it.

## Don't over-trust audit/agent suggestions — temper with context
- Don't `dynamic(..., { ssr:false })` the hero/LCP element (kills LCP + SEO).
- Don't remove `unoptimized` from images — Next's optimizer runs `sharp` on the CPU-starved EC2, making it worse. CDN already serves WebP.
- An `h632` profile image is correct for 2× retina (256px container) — not "2.6× oversize"; audits often assume 1× DPR.

See also: `.claude/rules/infrastructure.md` (memory/CPU budget), `.claude/rules/postgres-hydration.md`, `.claude/rules/search-system.md`, `.claude/rules/analytics-system.md`.
