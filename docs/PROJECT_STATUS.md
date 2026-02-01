# Project Status - Movie Browser

> **Last Updated**: January 18, 2026
> **Current Phase**: Pre-GA (User Data Migration Pending)

## Quick Reference

| System | Status | Notes |
|--------|--------|-------|
| PostgreSQL (Movies/Series) | **Live** | Source of truth for media data |
| MongoDB (Movies/Series) | **Deprecated** | Still used for user data only |
| Lambda Integration | **Live** | Both scrapers connected |
| Analytics (ClickHouse) | **Live** | All dashboards operational |
| Advanced Search | **Live** | Fuzzy + Semantic + Hybrid |
| User Data | **MongoDB** | Migration script ready, awaiting GA |

---

## Completed Work (Jan 2026)

### Infrastructure

| Component | Status | Key Files |
|-----------|--------|-----------|
| PostgreSQL + pgvector | ✅ Complete | `postgres/docker-compose.postgres.yml` |
| Prisma 6.x ORM | ✅ Complete | `prisma/schema.prisma` |
| ClickHouse Analytics | ✅ Complete | `analytics/clickhouse/` |
| Grafana Dashboards | ✅ Complete | `analytics/grafana/` |

### Data Layer

| Feature | Status | Implementation |
|---------|--------|----------------|
| Movies from PostgreSQL | ✅ Live | `src/server/services/hydration/` |
| Series from PostgreSQL | ✅ Live | Same hydration service |
| Staleness checks | ✅ Live | `isPostgresFresh()`, `isPostgresEnrichedFresh()` |
| Lambda enrichment | ✅ Live | `src/server/services/hydration/sources/lambda.ts` |
| Admin force refresh | ✅ Live | `/api/admin/refresh-data` |
| Lambda cost tracking | ✅ Live | ClickHouse `api_calls` table |

### Search

| Feature | Status | Implementation |
|---------|--------|----------------|
| Fuzzy search (pg_trgm) | ✅ Live | Typo tolerance |
| Semantic search (pgvector) | ✅ Live | Embeddings via AWS Bedrock |
| Hybrid search (RRF) | ✅ Live | Reciprocal Rank Fusion |
| AI agent integration | ✅ Live | `smart_discover` tool |
| Trending boost | ✅ Live | 30% boost for trending items (incl. persons) |
| Quality boost | ✅ Live | Rating + vote count signals |
| Recency boost | ✅ Live | Recent content favored for non-title queries |

### Scheduled Jobs (PM2)

| Job | Schedule | Status |
|-----|----------|--------|
| `popularity-sync` | 3 AM UTC | ✅ Configured | Downloads TMDB daily exports, updates popularity |
| `sitemap-generator` | 4 AM UTC | ✅ Configured | Generates sitemaps from TMDB exports |

### Performance & SEO

| Feature | Status | Results |
|---------|--------|---------|
| RSC payload optimization | ✅ Complete | Series -50%, Movie -13%, Person -41% |
| Light DTOs | ✅ Complete | `src/types/client-props.ts` |
| Lazy watch providers | ✅ Complete | On-demand API fetch |
| E2E SEO tests | ✅ Complete | `e2e/seo/` |
| Web Vitals tests | ✅ Complete | `e2e/perf/web-vitals.spec.ts` |
| Error boundaries | ✅ Complete | All detail pages |

### Code Quality (GA Refactoring)

| Task | Status | Before → After |
|------|--------|----------------|
| Split `postgres.ts` | ✅ Complete | 2019 → 6 files (~300-500 each) |
| Split `assistant-floaty.tsx` | ✅ Complete | 1488 → 7 components |
| Split Cursor rules | ✅ Complete | 10,387 → 14 focused files |
| Delete deprecated AI tools | ✅ Complete | discover.ts, similar.ts, semantic-search.ts |
| Zod validation on discover | ✅ Complete | All actions validated |
| Replace `catch (error: any)` | ✅ Complete | Using `unknown` + type guards |

---

## Pending Work

### P0: User Data Migration (GA Blocker)

**Status**: Script ready, awaiting decision to go live

| Task | Status | Notes |
|------|--------|-------|
| Migration script | ✅ Ready | `scripts/migrate-user-data.ts` |
| PostgreSQL schema | ✅ Ready | All user tables exist |
| Switch Auth.js adapter | ⏳ Pending | MongoDBAdapter → PrismaAdapter |
| Switch user API routes | ⏳ Pending | MongoDB → Prisma queries |
| Retire MongoDB | ⏳ Pending | After verification |

**To Execute**:
```bash
# 1. Run migration
npx tsx scripts/migrate-user-data.ts

# 2. Update Auth.js config
# 3. Update user API routes
# 4. Test thoroughly
# 5. Remove MongoDB dependency
```

### P1: Background Auto-Refresh (Nice to Have)

Currently: Admin can force refresh individual items.
Enhancement: Auto-queue Lambda refresh when user hits stale data.

**Not blocking GA** - current staleness logic works, just requires admin intervention for stale data.

### P2: Schema Cleanup (Deferred)

The DATA_ENRICHMENT_PLAN proposed consolidating Movie*/Series* tables into unified polymorphic tables.

**Decision**: Keep separate tables.
- TMDB treats movies and series separately
- Current schema mirrors TMDB structure well
- Video table already unified (only exception)
- Consolidation adds complexity without clear benefit

---

## Documentation Status

| Document | Status | Action Needed |
|----------|--------|---------------|
| `PROJECT_STATUS.md` | ✅ Current | This file |
| `USER_DATA_MIGRATION.md` | ✅ Current | Ready to execute |
| `POSTGRESQL_MIGRATION_PLAN.md` | ⚠️ Outdated header | Update status to "Complete" |
| `GA_REFACTORING_PLAN.md` | ⚠️ Outdated | Mark all as complete |
| `DATA_ENRICHMENT_PLAN.md` | ⚠️ Very Outdated | Major update needed |
| `ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md` | ✅ Current | All phases complete |
| `ANALYTICS_MONITORING_PLAN.md` | ✅ Current | All phases complete |
| `ADMIN_DASHBOARD_IMPROVEMENTS.md` | ✅ Current | Tracking ongoing work |
| `CACHING_IMPLEMENTATION.md` | ✅ Current | Complete |
| `CLAUDE.md` | ✅ Current | Project memory |

---

## Key Architecture Decisions

### Why Keep Movie/Series Tables Separate
1. TMDB API separates them (different endpoints, different fields)
2. Series have seasons/episodes, movies don't
3. Certifications differ (movie has releaseType, series doesn't)
4. No query benefit from unification (already indexed by type)

### Why Video Table is Unified
1. Identical structure for both media types
2. Already implemented with polymorphic `movieId`/`seriesId`
3. Enables shared video engagement tracking

### Why No Background Refresh Queue
1. Volume is low (<500 refreshes/day)
2. Simple Promise.all() works fine
3. No need for Redis/BullMQ complexity
4. Admin manual refresh is sufficient for now

---

## Environment Flags

```bash
# Data Sources
USE_HYDRATION_SERVICE=true    # PostgreSQL as source (default: true)
ENABLE_MONGODB_ENRICHMENT=true # Still fetch from MongoDB (will be false post-GA)

# Features
USE_POSTGRES_DATA=true        # Redundant, kept for compatibility

# Lambda (already configured)
# Lambdas are called automatically when data is stale
```

---

## Next Steps (Recommended Order)

1. **Run user data migration** - Execute the ready script
2. **Switch Auth.js to PrismaAdapter** - One config change
3. **Update user API routes** - ~10 files to change
4. **Test user features thoroughly** - Watchlist, ratings, continue watching
5. **Remove MongoDB dependency** - Clean up imports
6. **Update documentation** - Mark migration plans as complete
7. **Consider GA launch** - All blockers resolved

---

## Files Reference

### Core Hydration Service
```
src/server/services/hydration/
├── index.ts              # Main hydration logic
├── integration.ts        # Movie/Series type transformation
├── types.ts              # Shared types
└── sources/
    ├── tmdb.ts           # TMDB API fetcher
    ├── mongo.ts          # MongoDB enrichment (deprecated soon)
    ├── lambda.ts         # Lambda scrapers (live)
    └── postgres/         # PostgreSQL operations
        ├── queries.ts
        ├── movie-upsert.ts
        ├── series-upsert.ts
        ├── shared-upserts.ts
        ├── types.ts
        └── error-utils.ts
```

### Migration & Maintenance Scripts
```
scripts/
├── migrate-user-data.ts  # Ready to run
├── populate-postgres.ts  # Already used for media data
└── sync-popularity.ts    # Daily job - TMDB exports → popularity updates
```
