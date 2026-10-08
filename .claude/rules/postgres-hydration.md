---
paths:
  - "src/server/services/hydration/**/*.ts"
  - "src/server/services/ai-data-service.ts"
  - "src/server/services/enrichment/**/*.ts"
  - "src/server/db/postgres/**/*.ts"
  - "src/server/db/user-data.ts"
  - "prisma/**/*.ts"
---

# PostgreSQL & Hydration Service

## Architecture

PostgreSQL is the **source of truth** for movies/series. Flow (June 2026,
serve-stale-then-refresh — do not regress to blocking on TMDB):

```
Normal visit, PG HAS the row (fresh OR stale) → return PG data IMMEDIATELY
  └─ if stale: deduped+capped background task (TMDB refetch if core stale →
     MongoDB/Lambda enrichment → upsert → progressive AI enrichment);
     SSE streams new ratings/AI; ISR revalidation picks up core fields
Normal visit, TRUE PG MISS → synchronous TMDB fetch (the ONLY blocking case)
  → return TMDB data with empty enriched → persist + enrich in background
forceRefresh / skipLambda (admin, bulk populate) → fully synchronous path
  (TMDB → enrichment → upsert → read back from PG)
```

The render path must NEVER await TMDB/Lambda for an entity that exists in PG —
a TMDB round-trip is ~300-800ms (worse under load) and was the dominant
per-movie latency on the 2-vCPU box. Series episode fetches
(`fetchAllSeasonEpisodes`) also live in the background task: nested episodes
are not part of the render payload (season pages fetch episodes from TMDB
directly). `triggerProgressiveEnrichment()` fires after the background/sync
upsert when enriched data came from Lambda/MongoDB; fire-and-forget, errors
swallowed. Contract is pinned by `src/server/services/hydration/index.test.ts`
(deferred-promise tests fail if the render path ever awaits TMDB on a PG hit).

## Diff-Based Upserts (June 2026 — do not regress to delete+reinsert)

Child-table upserts (credits, images, videos, external_ids, watch_options,
reviews) use **per-row diff reconciliation** (Jun 11 2026): `diffChildRows` in
`sources/postgres/diff-reconcile.ts` computes {toInsert, toUpdate, toDelete}
against the natural key, so an unchanged collection = ZERO writes and a one-row
change = one UPDATE (the old skip-or-full-rewrite bloated tables to 60x live
size and starved autovacuum). Reconciliations are debug-logged
("hydration: child rows changed, reconciling" with per-table counts) — healthy
steady state is near-silence on revisits; a table logging on every visit means
a field is missing from its `isSame` comparator in `shared-upserts.ts` /
`credit-upserts.ts`. When adding a field to a child `createMany`, ADD IT to the
matching `isSame` lambda too, or real changes are silently skipped. Float
fields TMDB jitters (aspectRatio, voteAverage, score) compare via `floatEq3`
(3-decimal tolerance — popularity-sync precedent). The whole-set comparators in
`upsert-diff.ts` are legacy (still used by certifications + junction upserts
only; seasons/episodes and aggregate credits moved to in-place diffs Oct 2026). Helper files split out for the 800-line limit:
`rating-upserts.ts`, `credit-upserts.ts`, `series-junction-upserts.ts`,
`diff-reconcile.ts`.

## Write hygiene: traps fixed Oct 2026 (measure with pg_stat_user_tables)

Measure first: snapshot `pg_stat_user_tables` (`n_tup_ins/upd/del/hot_upd`)
twice ~10 min apart in a `BEGIN READ ONLY` session and diff per minute. Note
that aborted transactions still count their tuples, so a table whose deletes
exceed its inserts on every refresh is often a transaction that keeps rolling
back (or a destructive rewrite). Oct 8 2026 baseline: images 712 upd/min,
episodes 1,619 del/min vs 52 ins/min, persons 122 upd/min, movie_countries
26 del/min vs 15 ins/min.

1. **NEVER `tx.x.create(...).catch(() => {})` inside a transaction.** Catching
   the JS error does not undo the Postgres error: the transaction is aborted
   (23505, then 25P02 on every later statement) and the whole title upsert is
   lost, then redone on the next visit. Use `createMany({ skipDuplicates: true })`
   (`INSERT … ON CONFLICT DO NOTHING`, which also WAITS for a racing transaction
   instead of failing). All lookups/junctions go through
   `sources/postgres/lookup-upserts.ts` (`ensureGenres/Keywords/Companies/
   Networks/Persons/Countries/Languages` = one findMany + createMany of the
   missing). Lookups are create-only; countries never rewrite names (that was
   446k no-op `countries` updates). `lookup-upserts.test.ts` has a static guard
   that fails on any `.create({…}).catch(` in these files.
2. **The seasons rewrite (delete-all-seasons → cascade episodes → reinsert) must
   never run on a season SUMMARY.** The core-fresh enriched-only refresh passes
   PG's own seasons (no episodes), hover-card partials pass TMDB details-level
   seasons, and a failed per-season fetch used to send `episodes: []`; all of
   them compared as "changed" and DELETED the episodes. `isSummaryOnly` in
   `series-upsert.ts` now guards it (summary input may only seed a series with
   no seasons). Measured before the fix: 15,641 of 19,667 episode-bearing
   seasons on series refreshed in the last day had no episode rows.
3. **Comparators must ignore TMDB drift that nothing displays.** Image votes
   (`imageVotesEquivalent`: <0.1 average, ≤max(2,10%) count). CORRECTION after
   measuring the deploy: this only took images 712 → 570 UPDATEs/min — vote
   drift was NOT the main driver; trap 5 was.
4. **A TMDB 404 is permanent for a refresh.** `hydration/tmdb-gone.ts` caches
   404'd ids (24h TTL, 10k cap) and the background refresh skips them; before,
   10,622 refresh failures in `next-error.log` were 404s (series 324537: 877),
   each holding one of the 3 refresh slots.
5. **NEVER upsert PG's own read transform back as TMDB core data (the real
   churn engine, fixed Oct 8 2026).** The core-fresh / enriched-stale refresh
   used to hand `getMovieFromPostgres`/`getSeriesFromPostgres` output to the
   full upsert. That transform is LOSSY by design (it builds a UI payload):
   images have no `vote_count` and defaulted `vote_average`/width/height,
   there are no `production_countries`, keywords are capped, etc. Each such
   refresh "corrected" PG to the lossy copy and the next real TMDB refresh
   reverted it: 94,911 of 157,394 images on freshly refreshed movies had
   `vote_count` NULLed (0 of 1.4M elsewhere), movie_countries PRODUCTION rows
   were deleted/re-added (26 del vs 17 ins/min), external ids churned, and
   `tmdbUpdatedAt` was stamped without a TMDB fetch. Now
   `upsert{Movie,Series}ToPostgres(tmdb, enriched, { enrichmentOnly: true })`
   writes only ratings, scraper ids (merge-only, no deletes), deep links and
   scrape stamps; `backgroundRefresh*` sets it whenever its TMDB payload came
   from PG. Rule of thumb: **only a real TMDB response may feed the TMDB child
   tables.** Pinned by `enrichment-only.test.ts` (recording tx). Diagnosis
   recipe that found it: compare a column's NULL/default rate between rows
   refreshed in the last day and older rows — a write path that destroys data
   shows up as a cliff, not a drift.
6. Title rows are written ONCE per refresh: the enrichment/freshness stamps
   (`RowStamps`) ride on the core upsert instead of a second UPDATE.
7. **Whole-set rewrite comparators are a churn bomb for anything TMDB
   re-jitters — reconcile in place.** Seasons+episodes and series aggregate
   credits were compared as one unit and delete-all+reinserted on ANY
   difference. TMDB's per-episode votes drift on almost every fetch (field diff
   of PG vs live TMDB: Stranger Things 42/42, Silo 24/31 episodes differed only
   in `vote_average`/`vote_count`), and aggregate `total_episode_count`/order
   move whenever an episode airs, so every real refresh of a watched series
   rewrote it wholesale (~120 episode and ~150 credit ins+del per minute; 93% of
   recent credit inserts were whole aggregate sets). Now `season-upserts.ts`
   (`reconcileSeasons`) and the aggregate-credits block use `diffChildRows`:
   UPDATE in place, ids survive, episode votes use the image tolerance. Field
   diff recipe (worked first time): pull the PG rows as JSON via a
   `BEGIN READ ONLY` psql, fetch the same title from TMDB, project both exactly
   like the comparator, and count differing fields per column.

Also: the person-page write-back (`services/person-persist.ts`) is
change-detected (one read, write only changed fields).

## Background Refresh Cap

`backgroundRefreshMovie/Series` are deduped per id AND capped globally at
`MAX_BACKGROUND_REFRESH` concurrent (default 3, env-tunable, 0 disables). Beyond
the cap an item simply stays stale; a later visit retries. Removing this cap let
GA-day crawler traffic queue unbounded in-process Lambda+LLM work (Node 2GB RSS,
19s TTFB). PM2 also has a 1.5GB `max_memory_restart` guardrail on `next`.

**Gotcha — the cap also gates the true-PG-MISS persist, not just stale refreshes**
(the miss path returns TMDB data and persists via `backgroundRefreshMovie/Series`).
So with `MAX_BACKGROUND_REFRESH=0` (the dev guard) a browsed title renders but is
NEVER written to PG. `persistOnMissInDev` (`hydration/index.ts`) closes this in
dev ONLY: on a true miss with `cap===0 && NODE_ENV!=="production"` it fires a
TMDB-only (no enrichment/Lambda/SSE) fire-and-forget upsert so dev visits populate
the local catalog. Prod (cap>0) and tests (cap defaults to 3) never hit it. See
`.claude/rules/social-features.md` local-dev footguns 5–6 (the `countries` FK seed
is the other half: without it the miss-path upsert FK-aborts regardless).

## Bulk Enrichment Migration (completed 2026-06-10)

`scripts/migrate-mongo-enrichment.ts` moved the legacy Mongo corpus into PG
(534k enriched docs → 229k movie + 43k series parents created from cached TMDB
payloads, rest gap-filled; 0 errors). Two modes: parent-missing → full upsert
path with `transformMongoToEnriched`; parent-exists → `createMany skipDuplicates`
+ COALESCE-only freshness stamps (physically cannot overwrite newer data).
**Born-stale policy**: migrated timestamps carry the original doc `updatedAt`, so
the freshness machinery refreshes items on real visits. Created series have
seasons WITHOUT episodes (legacy docs had none nested) — episodes backfill on
first visit. Re-runnable: `--resume` + checkpoint file; source = legacy Mongo or
the S3 archive restored into a temp container.

## Freshness Tracking

| Field | Purpose |
|-------|---------|
| `tmdbUpdatedAt` | When TMDB core data was last fetched |
| `ratingsScrapedAt` | When ratings were last scraped (Lambda) |
| `watchLinksScrapedAt` | When watch links were last scraped |
| `updatedAt` | Prisma auto-updated on any change |

Thresholds (`src/lib/data-freshness.ts`): <14d release → 1d, <30d → 4d, <90d → 7d,
<3y → 30d, **>3y → 90d (`VERY_MATURE`, June 2026 — cuts crawler-driven Lambda
scrapes ~50-65%)**.

## Modular Structure

`src/server/services/hydration/sources/postgres/`:

- `types.ts` - Interfaces (PrismaTx, PostgresMovieData, etc.)
- `queries.ts` - Read operations (fetchMovieFromPostgres)
- `movie-upsert.ts` - Movie write operations
- `series-upsert.ts` - Series write operations
- `shared-upserts.ts` - Shared upserts (genres, credits, ratings)
- `error-utils.ts` - Type-safe error handling
- `index.ts` - Re-exports

## Type-Safe Error Handling

```typescript
import { isPrismaError, getErrorMessage } from "./error-utils";

try {
  await prisma.movie.upsert({ ... });
} catch (error: unknown) {
  if (isPrismaError(error) && error.code === "P2002") {
    // Unique constraint violation
    console.log("Duplicate entry, skipping");
    return;
  }
  throw error;
}
```

## Batch Operations

Use `createMany` with `skipDuplicates` instead of loops:

```typescript
// GOOD - Single batch operation
await tx.genre.createMany({
  data: genres.map(g => ({ tmdbId: g.id, name: g.name })),
  skipDuplicates: true,
});

// BAD - N+1 queries
for (const genre of genres) {
  await tx.genre.upsert({ ... });
}
```

## Transaction Timeouts

- Movies: 30s timeout
- Series: 60s timeout (more data)

Keep transactions focused. If a transaction is too large, consider breaking it into smaller batches.

## Series Data Coverage

Series upsert now includes:
- Production companies → `series_companies` junction
- Spoken languages → `series_languages` junction
- Origin countries → `series_countries` junction
- `tmdbUpdatedAt` timestamp

## Testing Hydration

```typescript
// Test hydration functions directly
await hydrateMovie(550, { forceRefresh: true });
await hydrateSeries(1396, { forceRefresh: true });
```

## AI Enrichment Data

AI summaries are stored in PostgreSQL `ai_data` table (not file-based).

### Service: `ai-data-service.ts`

```typescript
import { getAIData, upsertAIData } from "@/server/services/ai-data-service";

// Fetch - NO CACHING (direct DB ~5ms)
const summary = await getAIData(tmdbId, "movie"); // or "series"

// Upsert after AI summarization
await upsertAIData(tmdbId, "movie", summaryData);
```

### Why No Caching?

Next.js dev mode uses multiple workers with isolated L1 memory caches. Cache invalidation in one worker doesn't affect others, causing stale data. PostgreSQL queries are fast enough (~5ms) that caching provides no meaningful benefit.

### Schema Fields

```typescript
interface AISummary {
  hook: string;           // One-liner for above overview
  quickTake: string[];    // Labels for quick decision
  themes: string[];       // Thematic elements
  mood: { pacing, intensity, tone, emotional };
  aiQuestions: string[];  // Fun questions for AI chat
  watchContext: string[]; // "Best For" - viewing contexts
  contentWarnings: string[]; // "Heads Up" - content advisory
  generatedAt: string;
  modelId: string;
}
```

### Enrichment Commands

```bash
yarn enrich <tmdb_id>         # Movie content enrichment
yarn enrich:series <tmdb_id>  # Series content enrichment
yarn summarize <tmdb_id>      # AI summarization → PostgreSQL
yarn summarize <id> --force   # Regenerate existing summary
```

### Progressive Enrichment (Automatic)

AI enrichment fires automatically when a page visit triggers a hydration refresh. No manual intervention needed.

**Trigger**: `hydrateMovie()` / `hydrateSeries()` calls `triggerProgressiveEnrichment()` as fire-and-forget after PG upsert, only when `enrichedSource` is `"lambda"` or `"mongodb"` (i.e., fresh data was just fetched — not the PG fast path).

**Pipeline** (`src/server/services/enrichment/progressive.ts`):
1. Check if AI data exists and overview unchanged → skip if so
2. Generate TMDB-only embedding if none exists
3. Build AI input from TMDB data (~150 tokens)
4. Call Kimi K2.5 via Bedrock Flex tier (50% off standard pricing)
5. Parse and validate all 9 insight categories
6. Store in `ai_data` + `ai_insights` tables
7. Regenerate embedding with AI themes/mood/hook included

**Dedup**: In-memory Map prevents duplicate LLM calls for concurrent visitors to the same page. Second caller awaits the first caller's Promise.

**Concurrency**: `p-limit(5)` caps concurrent Bedrock calls across all enrichments.

**Cost**: ~$210-250 for full 184K catalog (pop >= 1 non-adult items) via Flex pricing + tighter prompt (~500 output tokens).

**SSE Updates**: `GET /api/[mediaType]/[id]/enrich` polls PG for state changes (ratings, AI data) and streams updates to the client via `useEnrichmentStream` hook. Detail pages render live updates (ratings swap in-place, AI sections fade in).

## Popularity Sync Job

Daily cron job (`scripts/sync-popularity.ts`) downloads TMDB daily exports and updates popularity scores.

### Features

- Multi-day fallback (7-day lookback for missing files)
- Batch SQL updates for performance (~1000 items/batch)
- Supports selective sync by media type
- Dry-run mode for preview

### Commands

```bash
yarn popularity:sync              # All types (movies, series, persons)
yarn popularity:sync --type=movie # Movies only
yarn popularity:sync --dry-run    # Preview without updating
```

### Person ID Note

Persons table uses internal `id` + separate `tmdb_id`. Popularity lookup uses `tmdbId`:

```typescript
const newPopularity = popularityMap.get(person.tmdbId);
```

See `ecosystem.config.cjs` for PM2 cron schedule (3 AM UTC daily).

## Bulk Population (GA Migration)

### Script: `scripts/populate-postgres.ts`

Batch-populates PostgreSQL from TMDB + MongoDB. Does NOT call Lambda by default.

### Data Sources

```
TMDB API → core data (title, overview, credits, genres, etc.)
     ↓
MongoDB → enrichment (IMDb/RT/Google ratings, scraped watch links)
     ↓
PostgreSQL → final storage
```

**Critical**: MongoDB contains expensive Lambda-sourced data. Always use `--skip-lambda` (default) to preserve MongoDB enrichment.

### TMDB Export Counts (Jan 2026)

| Content | Total | Notes |
|---------|-------|-------|
| Movies | ~1.15M | Non-adult only |
| Series | ~212k | Non-adult only |

Files: `data/tmdb-dump/movie_ids_latest.json`, `series_ids_latest.json`

### Commands

```bash
# Test (20 movies, 10 series)
yarn populate --test

# Medium batch (200 movies, 100 series)
yarn populate --medium --skip-existing

# All movies (sorted by popularity)
yarn populate --all --skip-existing

# Specific IDs
yarn populate --ids=550,278,238 --series-ids=1396,1399

# Retry previously failed items
yarn populate --retry-failed

# Disable auto-retry at end
yarn populate --medium --no-auto-retry
```

### Performance (concurrency=3, TMDB+MongoDB)

| Metric | Value |
|--------|-------|
| Rate | ~1.28 items/s |
| Per item | ~780ms |
| Network | Major bottleneck |

### ETA for Full Population

| Content | Time |
|---------|------|
| 1.15M Movies | ~10 days |
| 212k Series | ~4 days |
| **Total** | **~14 days** |

### Recommended: Run on EC2

Run populate script directly on EC2 (where MongoDB lives) to eliminate network latency:

```bash
# SSH to EC2
ssh -i ./movie-browser-ec2-key.pem ubuntu@98.130.30.197

# Run in tmux/screen for persistence
tmux new -s populate

# Phase 1: Top 100k movies (~22 hours)
nohup yarn populate --movies=100000 --skip-existing > populate-p1.log 2>&1 &

# Phase 2: All movies (~9 days)
nohup yarn populate --all --skip-existing > populate-movies.log 2>&1 &

# Phase 3: All series (~4 days, can run in parallel)
nohup yarn populate --series=300000 --skip-existing > populate-series.log 2>&1 &

# Check progress
tail -f populate-movies.log
```

### Failure Handling

- Auto-retry: Failed items retried at end with concurrency=1
- Progress saved: Failed IDs in `.populate-progress.json`
- Manual retry: `yarn populate --retry-failed`

### Bug Fix (Jan 2026)

Fixed: Stale MongoDB data was being discarded. Now uses stale data when `skipLambda=true`:
```
[Hydration] movie X: MongoDB stale but using it anyway (skipLambda=true)
```
File: `src/server/services/hydration/index.ts:530-541`
