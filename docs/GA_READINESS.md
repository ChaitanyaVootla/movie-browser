# GA Readiness Tracker

## Status: In Progress

### Completed

| # | Task | Files Changed | Notes |
|---|------|--------------|-------|
| 1 | Bedrock Kimi K2.5 in ap-south-1 | `bedrock.ts`, `provider.ts` | Model: `moonshotai.kimi-k2.5`, region: `ap-south-1` (Mumbai). Bedrock now default provider. |
| 2 | Switch to Cohere Embed v4 | `cohere-generator.ts`, `embeddings/index.ts` | Model: `global.cohere.embed-v4:0` (cross-region from ap-south-1). 1024 dims via `output_dimension`. Titan generator deleted. |
| 3 | Add memo() to MovieCard | `movie-card.tsx` | Wrapped with `React.memo` — renders in grids/carousels. |
| 4 | Reduce TMDB page fetches | `trending.ts` | Upcoming + NowPlaying now fetch 1 page (20 items) instead of 2. Saves 2 TMDB calls per homepage load. |
| 5 | Increase TanStack Query staleTime | `query-provider.tsx` | Bumped from 60s to 5 minutes. Movie data changes slowly. |
| 6 | Fix NavBar scroll persistence | `nav-bar.tsx` | `useEffect` now depends on `pathname` — resets `isScrolled` on navigation. |
| 7 | Add lightbox image error fallback | `image-gallery.tsx` | `onError` handler falls back from `/original` to `/w780` quality. |
| 8 | Memoize ParticleBurst particles | `action-animations.tsx` | `Array.from()` wrapped in `useMemo(…, [particleCount])`. |
| 9 | User data dual-mode (MongoDB <> Prisma) | See section below | All user data routes, AI tools, auth, and admin now switchable via `USER_DATA_SOURCE` env var. |
| 10 | Standalone EC2 via Terraform | `terraform/*.tf`, `terraform/user-data.sh` | t4g.large (8GB ARM) in ap-south-2. Reuses existing SSH key. Bedrock IAM on instance profile. |
| 11 | Docker Compose for PG + ClickHouse | `docker-compose.yml` | PostgreSQL 17 (pgvector, pg_trgm) + ClickHouse. Production-tuned memory (PG 1GB, CH 1GB cap). |
| 12 | GitHub Actions CI/CD | `.github/workflows/deploy-ec2.yml` | Push to master -> typecheck + lint -> build -> deploy to EC2. Secrets: `NEXT_EC2_*` prefix. |
| 13 | AWS credentials via instance profile | `bedrock.ts`, `cohere-generator.ts` | Omit `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` on EC2 — SDK auto-resolves from instance metadata. Set only for local dev. |
| 14 | Fix Cohere Embed v4 dimensions | `cohere-generator.ts` | Added `output_dimension: 1024` to all requests. Default is 1536 — was causing dimension mismatch with `vector(1024)` column. Fixed `truncate` values to `RIGHT` (was `END`). |
| 15 | Update template.env | `template.env` | All env vars: AI_PROVIDER, Kimi K2.5, Cohere, ClickHouse, USER_DATA_SOURCE, remote MongoDB, instance profile notes. |
| 16 | Memory budget optimization | `docker-compose.yml`, `ecosystem.config.cjs`, ClickHouse config | PG shared_buffers=1GB, ClickHouse capped to 1GB, sitemap heap 2GB->1GB. Total headroom ~3.4GB on 8GB instance. |

### MongoDB -> PostgreSQL User Data: Ready to Switch

**Status**: Dual-mode implemented. Set `USER_DATA_SOURCE=postgres` to switch.

#### Architecture

All user data operations route through `src/server/db/user-data.ts`, which delegates to either:
- `src/server/db/mongo/user-queries.ts` (current default — MongoDB on remote legacy EC2)
- `src/server/db/postgres/user-queries.ts` (GA target — PostgreSQL via Prisma, local on new EC2)

The `USER_DATA_SOURCE` env var controls the switch. Default is `mongodb` (omitted = mongodb).

#### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/server/db/user-data.ts` | 147 | Feature flag, shared types, conditional re-exports |
| `src/server/db/postgres/user-queries.ts` | 674 | All Prisma user data queries (21 functions) |
| `src/server/db/mongo/user-queries.ts` | 531 | MongoDB queries extracted from routes (21 functions) |

#### Files Modified (16 total)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `Account`, `Session`, `VerificationToken` models + `emailVerified` on User |
| `src/lib/user-id.ts` | Added `usePostgresUserData` flag + Prisma userId resolver (cached) |
| `src/lib/auth.ts` | Dual adapter: `MongoDBAdapter` <> `PrismaAdapter`, dual `getOrCreateGoogleUser` |
| `src/app/api/user/library/route.ts` | -> `getLibraryData()` |
| `src/app/api/user/watchlist/route.ts` | -> service for watchlist + movie/series details |
| `src/app/api/user/watched/route.ts` | -> service for watched + movie details |
| `src/app/api/user/ratings/route.ts` | -> service for ratings + movie/series details |
| `src/app/api/user/rating/route.ts` | -> `upsertRating()` / `deleteRating()` |
| `src/app/api/user/recents/route.ts` | -> `getRecentItems()` / `upsertRecentItem()` |
| `src/app/api/user/continueWatching/route.ts` | -> service for continue watching CRUD |
| `src/app/api/user/movie/[movieId]/watchlist/route.ts` | -> `addMovieToWatchlist()` / `removeMovieFromWatchlist()` |
| `src/app/api/user/movie/[movieId]/watched/route.ts` | -> `markMovieWatched()` / `unmarkMovieWatched()` |
| `src/app/api/user/series/[seriesId]/watchlist/route.ts` | -> `addSeriesToWatchlist()` / `removeSeriesFromWatchlist()` |
| `src/app/api/admin/users/route.ts` | -> `getAdminUsersWithActivity()` |
| `src/server/ai/tools/details.ts` | -> `getUserItemStatus()` from service |
| `src/server/ai/tools/smart-discover.ts` | -> `getUserExclusions()` from service |

#### Package Added

- `@auth/prisma-adapter` — required for Prisma auth adapter mode

### GA Switch Procedure

```bash
# 1. Push schema (creates Account, Session, VerificationToken tables)
yarn db:push

# 2. Run user data migration
npx tsx scripts/migrate-user-data.ts --verbose

# 3. Set env var and restart
echo 'USER_DATA_SOURCE=postgres' >> .env.local
# Restart the app — all user data now flows through Prisma
pm2 restart all
```

### Post-Switch Cleanup (delete after verifying Postgres mode works)

**Files to delete:**
```
src/server/db/mongo/user-queries.ts      # MongoDB user query wrapper
src/server/db/index.ts                   # MongoDB connection (connectDB)
src/server/db/models/user-library.ts     # Mongoose user models
src/server/db/models/movie.ts            # Mongoose movie model
src/server/db/models/series.ts           # Mongoose series model
src/server/db/cached-queries.ts          # MongoDB cached queries (see note below)
src/server/services/hydration/sources/mongo.ts  # MongoDB hydration source
```

**Code to simplify:**
- `src/server/db/user-data.ts` — remove mongo import, import Prisma directly
- `src/lib/user-id.ts` — remove MongoDB userId path
- `src/lib/auth.ts` — remove MongoDBAdapter, getMongoClient, MongoDB code paths

**Packages to remove:**
```bash
yarn remove mongoose mongodb @auth/mongodb-adapter
```

**Env vars to remove:** `MONGO_IP`, `MONGO_PASS`, `MONGO_PORT`, `MONGODB_URI`

### Remaining Non-User-Data MongoDB Dependency

`src/server/db/cached-queries.ts` fetches movie/series enrichment data (`googleData`, `external_data`) from MongoDB. This is **media data**, not user data, and is consumed by:
- `src/server/actions/trending.ts`
- `src/server/actions/movie.ts`
- `src/server/actions/series.ts`
- `src/server/actions/hover-card.ts`
- `src/server/utils/media-data.ts`

This data is already being populated into PostgreSQL via the hydration service. The hydration source (`mongo.ts`) has its own `MONGODB_ENABLED` flag. Once bulk population is complete, these queries can switch to Prisma equivalents fetching from `ratings` and `watch_options` tables.

### Data Population Strategy

**Current**: ~5k movies, ~2k series in PostgreSQL. **Target**: 100k+ movies, 212k series for launch.

#### Infrastructure Topology

```
NEW EC2 (ap-south-2)               OLD EC2 (ap-south-2)
┌──────────────────────┐           ┌──────────────────┐
│  PostgreSQL (local)  │◄──────────│  populate script │
│  ClickHouse (local)  │  PG write │  MongoDB (local) │
│  Next.js (PM2)       │           │  Nuxt (legacy)   │
└──────────────────────┘           └──────────────────┘
```

**Key insight**: Run the bulk populate script from the OLD EC2 (where MongoDB is local ~1ms) and point `DATABASE_URL` at the NEW EC2's PostgreSQL. This avoids remote MongoDB latency during bulk reads.

```bash
# From OLD EC2 (where MongoDB lives):
ssh -i movie-browser-ec2-key.pem ubuntu@OLD_EC2_IP

# Point at new EC2's PostgreSQL (temporarily open port 5433 or use SSH tunnel)
DATABASE_URL="postgresql://moviebrowser:PASS@NEW_EC2_IP:5433/moviebrowser" \
  yarn populate --all --skip-existing
```

#### Phase 1: Priority Seed (pre-GA, ~3 days)

| Step | Command | Duration | Cost |
|------|---------|----------|------|
| Top 100k movies | `yarn populate --movies=100000 --skip-existing` | ~22hrs | ~$1 (EC2 only) |
| All 212k series | `yarn populate --series=300000 --skip-existing` | ~4 days | ~$2 (EC2 only) |

Run from OLD EC2 with `DATABASE_URL` pointing at new PG. TMDB exports sorted by popularity — first 100k covers 99%+ of traffic.

#### Phase 2: Long Tail (~10 days, post-GA)

```bash
# Remaining ~1M movies, TMDB-only (no MongoDB needed for niche titles)
yarn populate --all --skip-existing --fast
```

`--fast` mode uses concurrency=10 (TMDB-only, no MongoDB). Niche titles get Lambda-enriched on-demand when users visit them.

#### Phase 3: Embeddings (after population)

```bash
# Regenerate ALL embeddings with Cohere Embed v4 (replaces old Titan vectors)
npx tsx scripts/generate-cohere-embeddings.ts --type both --xlarge --force
```

At 25 concurrent Bedrock calls, ~7k items takes a few minutes. Scale up after bulk population.

#### Cost Summary

| Phase | Duration | Cost |
|-------|----------|------|
| Phase 1: Priority seed (100k movies + 212k series) | ~5 days | ~$3 |
| Phase 2: Long tail (~1M movies, TMDB-only) | ~10 days | ~$3 |
| Phase 3: Cohere embeddings | ~30 min per 7k items | ~$5 Bedrock |
| **Total** | ~15 days | **~$11** |

**Do NOT use `--with-lambda` for bulk** — that would turn an $11 job into $1,000+.

#### Fallbacks

| Risk | Mitigation |
|------|------------|
| Unpopulated title visited | On-demand hydration (~800ms, transparent) |
| Niche search returns empty | Fuzzy search falls back to TMDB API |
| MongoDB down before full population | `--fast` mode (TMDB only) still works; ratings degrade gracefully |
| Script fails mid-run | `.populate-progress.json` + `--retry-failed` for resumption |

### On-Demand Hydration (Post-Population)

Once bulk population is done, daily traffic mostly hits the PG fast path:

| Scenario | % of traffic | Lambda calls | Duration |
|----------|-------------|--------------|----------|
| PG fresh (cache hit) | ~80% | 0 | <10ms |
| PG stale, MongoDB fresh | ~15% | 0 | ~300ms |
| Both stale (Lambda) | ~5% | 2 parallel | ~5-10s |
| **Estimated daily (500 page views)** | | ~50 Lambda calls | **~$0.10/day** |

Freshness thresholds (from `src/lib/data-freshness.ts`):

| Content Age | Refresh Interval |
|-------------|-----------------|
| < 14 days | Daily |
| 14-30 days | Every 4 days |
| 30-90 days | Weekly |
| > 90 days | Monthly |

### Remaining — Needs Triage/Implementation

| # | Task | Priority | Effort | Notes |
|---|------|----------|--------|-------|
| 17 | Add rate limiting to API routes | **High** | Medium | No rate limiting on any endpoint. Consider `@upstash/ratelimit`. |
| 18 | Slim down watchlist API payload | Medium | Low | Returns full movie objects. Return minimal fields for 30-50% reduction. |
| 19 | Add composite database indexes | Medium | Low | Missing: `credits(creditType)` partial index. |
| 20 | Fix trailer modal redundant YouTube fetch | Medium | Low | Modal re-fetches stats already in carousel. Use TanStack Query cache key matching. |
| 21 | Fix IdleCircle keyboard accessibility | Low | Low | `motion.button` with manual `onKeyDown` — use native `<button>` wrapped in motion. |
| 22 | Regenerate embeddings with Cohere | **High** | Low | Existing Titan vectors incompatible with Cohere query vectors. Run `--force`. |
| 23 | Open PG port for bulk populate (temporary) | **High** | Low | Add SG rule or use SSH tunnel so old EC2 can write to new PG. Remove after. |

### Bedrock Setup Notes

**AI Agent (Kimi K2.5)**:
- Model ID: `moonshotai.kimi-k2.5`
- Region: `ap-south-1` (Mumbai) — closest to Hyderabad EC2
- Provider default switched from OpenRouter to Bedrock
- Set `AI_PROVIDER=openrouter` to fall back to OpenRouter if needed
- Enable model access in [Bedrock Console](https://ap-south-1.console.aws.amazon.com/bedrock/home?region=ap-south-1#/modelaccess)

**Embeddings (Cohere Embed v4)**:
- Model ID: `global.cohere.embed-v4:0` (global cross-region inference profile)
- Region: `ap-south-1` — requests auto-route to nearest Cohere-available region
- Dimensions: **1024 via `output_dimension` parameter** (default is 1536!)
- Truncation: `RIGHT` (not `END` — Bedrock uses different values than Cohere API)
- Input types: `search_document` for corpus, `search_query` for user queries
- Titan generator deleted — Cohere is the only embedding provider
- **Existing Titan embeddings must be regenerated** — different vector spaces are incompatible

**AWS Credentials**:
- On EC2: **Omit** `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — instance profile provides Bedrock + Lambda access
- Locally: Set them in `.env.local` for development
- Instance profile has: `bedrock:InvokeModel`, `lambda:InvokeFunction`, S3 backup, CloudWatch

**Environment Variables** (`.env.local`):
```bash
# AI Provider (default: bedrock)
AI_PROVIDER=bedrock

# AWS Credentials — OMIT on EC2 (instance profile), set for local dev only
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...

# Bedrock (optional overrides)
BEDROCK_REGION=ap-south-1
BEDROCK_MODEL_ID=moonshotai.kimi-k2.5

# Cohere Embed (optional override)
COHERE_EMBED_MODEL_ID=global.cohere.embed-v4:0

# User Data Source (default: mongodb, set to postgres at GA)
USER_DATA_SOURCE=mongodb
```

### Infrastructure

**New EC2** (standalone, managed by `terraform/`):
- Instance: `t4g.large` (8GB ARM Graviton) in `ap-south-2` (Hyderabad)
- Volume: 80GB gp3 encrypted
- SSH key: reuses existing `movie-browser-ec2-key`
- Services: PostgreSQL + ClickHouse (Docker Compose), Next.js (PM2)
- MongoDB: **NOT local** — connects to remote legacy EC2 via `MONGO_IP`
- Estimated cost: ~$64/mo infra + ~$3/mo Lambda + ~$5-30/mo Bedrock

**CI/CD** (`.github/workflows/deploy-ec2.yml`):
- Trigger: push to `master` or manual dispatch
- Pipeline: typecheck + lint -> build (bakes `NEXT_PUBLIC_*`) -> deploy to EC2
- Deploy: SCP tar -> `docker compose up -d` -> `prisma db push` -> PM2 restart
- Secrets: `NEXT_EC2_SSH_PRIVATE_KEY`, `NEXT_EC2_HOST`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SITE_URL`

### Sources
- [Kimi K2.5 — Bedrock Model Card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k2-5.html)
- [Cohere Embed v4 — Bedrock Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html)
- [Cross-Region Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)
- [Auth.js Prisma Adapter](https://authjs.dev/getting-started/adapters/prisma)
