---
paths:
  - "src/server/services/hydration/**/*.ts"
  - "src/server/db/postgres/**/*.ts"
  - "prisma/**/*.ts"
---

# PostgreSQL & Hydration Service

## Architecture

PostgreSQL is the **source of truth** for movies/series. Flow:

```
Check PG → TMDB API if stale → MongoDB enrichment → Upsert to PG → Return PG data
```

## Freshness Tracking

| Field | Purpose |
|-------|---------|
| `tmdbUpdatedAt` | When TMDB core data was last fetched |
| `ratingsScrapedAt` | When ratings were last scraped (Lambda) |
| `watchLinksScrapedAt` | When watch links were last scraped |
| `updatedAt` | Prisma auto-updated on any change |

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

```bash
# Test with specific IDs
npx tsx scripts/verify/test-hydration-complete.ts

# Or use the hydration functions directly
await hydrateMovie(550, { forceRefresh: true });
await hydrateSeries(1396, { forceRefresh: true });
```
