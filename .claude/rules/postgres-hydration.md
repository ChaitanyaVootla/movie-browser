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

PostgreSQL is the **source of truth** for movies/series. Flow:

```
Check PG → TMDB API if stale → MongoDB enrichment → Upsert to PG → Progressive AI enrichment (fire-and-forget) → Return PG data
```

After the PG upsert, if the data was freshly fetched (from Lambda or MongoDB — not the PG fast path), `triggerProgressiveEnrichment()` fires in the background. This is a fire-and-forget call: errors are logged and swallowed, never blocking the response. See `src/server/services/hydration/index.ts` lines 142-146 (movies) and 274-278 (series).

## Diff-Based Upserts (June 2026 — do not regress to delete+reinsert)

Every child-table upsert (seasons+episodes, credits, images, videos, external_ids,
watch_options, reviews, certifications, junctions) compares a canonical projection
of existing vs incoming rows (`sources/postgres/upsert-diff.ts`) and **skips the
delete+reinsert when identical** — the common case. Rewrites are debug-logged
("hydration: child rows changed, rewriting"). The old always-rewrite pattern
bloated tables to 60x live size and starved autovacuum. When adding a field to a
`createMany`, ADD IT to the matching comparator in `upsert-diff.ts` too, or real
changes will be silently skipped. Helper files split out for the 800-line limit:
`rating-upserts.ts`, `series-junction-upserts.ts`.

## Background Refresh Cap

`backgroundRefreshMovie/Series` are deduped per id AND capped globally at
`MAX_BACKGROUND_REFRESH` concurrent (default 3, env-tunable, 0 disables). Beyond
the cap an item simply stays stale; a later visit retries. Removing this cap let
GA-day crawler traffic queue unbounded in-process Lambda+LLM work (Node 2GB RSS,
19s TTFB). PM2 also has a 1.5GB `max_memory_restart` guardrail on `next`.

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
