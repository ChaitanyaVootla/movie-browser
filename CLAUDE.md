# Movie Browser

AI-first movie/TV discovery platform built with Next.js 15, React 19, TypeScript. Maintained by AI agents with human oversight.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI Agent**: LangGraph.js + MemorySaver checkpointer + AWS Bedrock (Kimi K2.5, default) or OpenRouter (fallback)
- **Database**: PostgreSQL (Prisma 6.x) + pgvector + MongoDB (remote, temporary — user data until GA)
- **Embeddings**: Cohere Embed v4 via Bedrock (`global.cohere.embed-v4:0`, 1024 dims)
- **State**: Zustand (client) + TanStack Query (server)
- **UI**: shadcn/ui + Tailwind CSS v4 + Framer Motion
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth
- **Logging**: Pino (structured JSON)
- **Analytics**: ClickHouse (self-hosted) + Admin Dashboard (`/admin`)

## Key Commands

```bash
yarn dev              # Next.js dev with Turbo
yarn typecheck        # TypeScript check
yarn lint             # ESLint
yarn test:ci          # Full CI (typecheck + lint + unit)
yarn test:e2e         # Playwright E2E
yarn test:ai "query"  # Test AI agent (--debug for token/cost tracking)
yarn deploy           # Build + upload + deploy to EC2

# Database
yarn db:push          # Prisma schema push
yarn db:migrate       # Prisma migrations
yarn db:studio        # Prisma Studio GUI

# AI Enrichment
yarn enrich <tmdb_id>         # Enrich movie content
yarn enrich:series <tmdb_id>  # Enrich series content
yarn summarize <tmdb_id>      # Generate AI summary (--force to regenerate, --flex for Flex pricing)
yarn popularity:sync          # Sync TMDB popularity (daily cron)

# Embeddings
npx tsx scripts/generate-cohere-embeddings.ts --type both --xlarge --force
```

## Infrastructure

**EC2**: `t4g.large` (8GB ARM) in `ap-south-2` (Hyderabad). Managed by Terraform (`terraform/`).

**Services on EC2** (via `docker-compose.yml`):
- PostgreSQL 17 + pgvector + pg_trgm (port 5433)
- ClickHouse (port 8123, localhost only)
- Next.js via PM2 (port 3002)

**CI/CD**: GitHub Actions (`.github/workflows/deploy-ec2.yml`). Push to `master` → typecheck + lint → build → deploy to EC2. Secrets prefixed `NEXT_EC2_*` to avoid collision with legacy Nuxt secrets.

**AWS IAM** (via EC2 instance profile):
- `bedrock:InvokeModel` — Kimi K2.5 (ap-south-1) + Cohere Embed v4 (global)
- `lambda:InvokeFunction` — movie-ratings-scraper
- S3 backup access, CloudWatch logs

**AWS credentials**: On EC2, omit `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — the instance profile provides Bedrock access. Set them only for local dev.

**MongoDB**: Remote on legacy EC2 (temporary). Connected via `MONGO_IP` env var. Will be severed at GA when `USER_DATA_SOURCE=postgres`.

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── ui/                 # shadcn/ui (DO NOT MODIFY)
│   └── features/           # Domain components (ai/, movie/, series/, admin/)
├── server/
│   ├── actions/            # Server Actions (Zod validated)
│   ├── ai/                 # LangGraph agent + tools
│   ├── services/
│   │   ├── hydration/sources/postgres/  # Modular (6 files)
│   │   ├── enrichment/                  # Progressive AI enrichment (Bedrock Flex, dedup, SSE)
│   │   └── ai-data-service.ts           # AI data storage (PostgreSQL, no caching)
│   └── db/postgres/        # PostgreSQL queries
├── lib/                    # Utilities
└── types/                  # TypeScript types
```

## Architecture Patterns

**Server Components First**: Default to RSC. Only add `"use client"` for event handlers, hooks, browser APIs.

**Data Fetching**: Server Actions for page data. API routes only for mutations, webhooks, admin, external integrations. All discover actions use Zod validation.

**Caching**: L1 (memory) + L2 (file) via `cache-service.ts`. TMDB: 1hr, Trending: 15min, Person: 24hr. AI data is NOT cached (fetches from PG ~5ms).

**Hydration Service**: PostgreSQL is source of truth. Flow: Check PG → TMDB API if stale → MongoDB enrichment → Upsert to PG → Return. See `.claude/rules/postgres-hydration.md`.

**Search System**: 3-tier intent classification (regex 70% → embedding 25% → LLM 5%), 14+ filter types, query expansion, fast autocomplete (<100ms). See `.claude/rules/search-system.md`.

**AI Insights**: Tag-based architecture with `ai_data` + `ai_insights` tables. 8 categories, 3 spoiler levels (FREE/LIGHT/HEAVY). See `.claude/rules/ai-insights.md`.

**Theming**: 3-tier system (mode/style/accent), OKLch color space, hero gradients. See `.claude/rules/theming.md`.

**AI Agent (Cue)**: LangGraph agent with MemorySaver checkpointer. 8 consolidated tools, Kimi K2.5 (knowledge cutoff: June 2025). Thread-based conversation persistence — frontend sends `threadId`, server restores full state (messages + tool calls + results). Per-invocation logging isolated via `invocationId` Map. Recursion limit: 25. See `.claude/rules/ai-agent.md`.

**Progressive Enrichment**: Automatic AI enrichment triggered by page visits. When hydration fetches fresh data (Lambda or MongoDB source), `triggerProgressiveEnrichment()` fires in the background — no manual intervention needed. Pipeline: check existing AI data → generate TMDB-only embedding if missing → call Kimi K2.5 via Bedrock Flex (50% off) → parse + store AI insights → regenerate embedding with AI themes/mood/hook. Dedup via in-memory Map (concurrent requests for same item share one Promise). Concurrency capped at 5 LLM calls via `p-limit`. SSE endpoint (`GET /api/[mediaType]/[id]/enrich`) polls PG for state changes and streams ratings/AI updates to the client. Detail pages use `EnrichmentProvider` + `useEnrichmentStream` for live in-place updates (ratings swap, AI sections fade in). Cost: ~$210-250 for full 184K catalog (pop >= 1) via Flex pricing + tighter prompt (~500 output tokens). Key files: `src/server/services/enrichment/progressive.ts`, `src/server/services/enrichment/bedrock-flex.ts`, `src/server/services/enrichment/prompts.ts`, `src/server/services/enrichment/ai-input-builder.ts`, `src/hooks/use-enrichment-stream.ts`, `src/components/features/media/enrichment-provider.tsx`.

## Analytics & Cost Tracking

**Infrastructure**: ClickHouse (self-hosted on EC2, port 8123) stores all analytics events. Admin dashboard at `/admin` with tabs for traffic, AI, Lambda, costs, performance, system, database, and query analytics.

**Client-Side Tracking**: The `useAnalytics` hook (`src/hooks/use-analytics.ts`) provides 13 convenience methods for tracking user actions. Events are batched (10 events or 5s interval), flushed on unmount/visibility-change, sent to `/api/analytics/ingest`. Respects DNT (`navigator.doNotTrack === '1'`).

**Instrumented Components** (15 total):
- **Core actions**: `media-actions.tsx` (watchlist, rating, watched, share), `watch-options.tsx` (OTT clicks), `movie-card-actions.tsx` (quick watchlist/watched), `wide-card.tsx` (continue watching)
- **Search & filters**: `search-command.tsx` (search submit, result clicks, topic/mood select), `filter-sidebar.tsx` (filter apply with 1s debounce), `video-gallery.tsx` (trailer play)
- **AI chat**: `idle-circle.tsx` (chat open), `expanded-chat.tsx` + `minimal-view.tsx` (chat submit), `trailer-carousel.tsx` (trailer play)
- **Discovery & nav**: `topic-pills.tsx`, `mood-cards.tsx`, `media-scroller.tsx` (carousel nav), `image-gallery.tsx` (gallery open/nav), `settings-menu.tsx` (settings change), `person-hero.tsx` (external links)

**Server-Side Tracking**:
- **Embedding calls**: `cohere-generator.ts` tracks all Cohere Embed v4 calls via `trackEmbeddingCall()` → ClickHouse `api_calls` table with `service='embedding'` and token counts. Batch operations send one aggregate event.
- **LLM search parsing**: `llm-query-parser.ts` tracks Tier 3 classification via `trackSearchLLMUsage()` → ClickHouse `ai_usage` table with `query_type='search_llm_parsing'`.
- **AI chat**: Agent tracks full invocations (tokens, cost, tools) via `trackAIUsage()`.
- **Progressive enrichment**: `progressive.ts` tracks LLM costs via `trackAIUsage()` with `query_type='progressive_enrichment'` and embedding costs via `generateAndStoreEmbedding(skipTracking=false)`.

**Cost Tracking**: Unified cost dashboard (`/admin` → Costs tab) aggregates across 4 services: LLM chat, LLM search parsing, embeddings (Cohere), Lambda. Query-time aggregation via `getUnifiedCostBreakdown()` in `src/lib/analytics/queries/costs.ts`. Pricing in `src/lib/model-pricing.ts`.

**Adding Tracking to New Components**:
1. Import `useAnalytics` from `@/hooks/use-analytics`
2. Destructure the needed convenience method (e.g., `const { trackAction } = useAnalytics()`)
3. Call in event handlers — never `await`, tracking is fire-and-forget
4. For new action types, add to `ActionType` union in `src/lib/analytics/types.ts`

**Key files**: `src/hooks/use-analytics.ts` (hook), `src/lib/analytics/track.ts` (server tracking), `src/lib/analytics/types.ts` (event types), `src/lib/analytics/queries/` (ClickHouse queries), `analytics/clickhouse/init/001-schema.sql` (schema). See `.claude/rules/analytics-system.md`.

## GA Roadmap

See `docs/GA_READINESS.md` for full tracker with completed items and switch procedure.

### MongoDB → PostgreSQL Migration

| Data | Source | Status |
|------|--------|--------|
| Movies/Series core | PostgreSQL | ✅ ~5k movies, ~2k series |
| Movies/Series enrichment | MongoDB → PostgreSQL | ⏳ Bulk population needed (~1.15M movies, ~212k series) |
| User data (watchlist, ratings, etc.) | Dual-mode (`USER_DATA_SOURCE` env) | ✅ Code ready, flip to `postgres` at GA |
| Auth (users, sessions) | Dual-mode (`MongoDBAdapter` ↔ `PrismaAdapter`) | ✅ Code ready, switches with `USER_DATA_SOURCE` |
| AI provider | Bedrock (Kimi K2.5) | ✅ Default provider, OpenRouter fallback |
| Embeddings | Cohere Embed v4 (1024 dims) | ✅ Switched from Titan, regenerate existing with `--force` |
| Infrastructure | Terraform + Docker Compose + GitHub Actions CI/CD | ✅ New standalone EC2, Bedrock IAM, PG + ClickHouse |

### GA Switch Procedure

```bash
# 1. Push auth schema (Account, Session, VerificationToken tables)
yarn db:push
# 2. Migrate user data from remote MongoDB
npx tsx scripts/migrate-user-data.ts --verbose
# 3. Flip the switch
echo 'USER_DATA_SOURCE=postgres' >> .env.local
# 4. Restart — all user data now flows through Prisma
pm2 restart all
```

### Post-GA Cleanup (after verifying Postgres mode)

Delete: `src/server/db/mongo/`, `src/server/services/hydration/sources/mongo.ts`, Mongoose models.
Remove packages: `mongoose`, `mongodb`, `@auth/mongodb-adapter`.
Remove: `MONGO_*` env vars from `.env.local`.

## Claude Code Rules

Path-scoped rules in `.claude/rules/` load automatically when editing matching files:

| File | Scope | Description |
|------|-------|-------------|
| `postgres-hydration.md` | `hydration/**`, `enrichment/**`, `postgres/**`, `user-data.ts` | Hydration service, progressive enrichment, freshness, bulk population |
| `search-system.md` | `search/**`, `fuzzy-search.ts`, `embeddings/**` | Hybrid search, RRF ranking, Cohere embeddings |
| `ai-insights.md` | `standout-*.tsx`, `ai-insights.ts` | Tag-based insights, spoiler levels |
| `ai-agent.md` | `server/ai/**`, `use-chat-stream.ts`, `api/ai/chat/**` | Agent architecture, checkpointer, tools, thread lifecycle |
| `ai-components.md` | `features/ai/**` | AI assistant modular structure |
| `server-actions.md` | `server/actions/**` | Zod validation, error handling |
| `server-components.md` | `app/**`, `components/**` | RSC patterns, instant loading with CDN images |
| `api-routes.md` | `app/api/**` | API routes, auth, admin query endpoint |
| `theming.md` | `globals.css`, `preferences.ts` | Mode/style/accent theming, hero gradients |
| `type-safety.md` | `**/*.ts`, `**/*.tsx` | No `any`, type guards, Zod |
| `infrastructure.md` | `terraform/**`, `docker-compose.yml`, `deploy-next.sh`, workflows | EC2, Docker, CI/CD, IAM, memory budget |
| `analytics-system.md` | `analytics/**`, `use-analytics.ts`, `api/analytics/**`, `admin/analytics/**` | Event tracking, cost tracking, ClickHouse queries, dashboard |

Cursor IDE also has separate rules in `.cursor/rules/*.mdc` — those are independent from these.

## AI Agent Workflow

This is an **AI-agent-first codebase**. Use `/frontend-design` skill for all UI changes.

**Parallel Agent Orchestration** for large plans:
1. Split into subtasks using multiple `Task` tool calls
2. Parallelize when agents won't edit the same files
3. Sequence when later work depends on earlier results
4. Use `run_in_background: true` for long-running tasks

## Critical Rules

1. **No `any` types** — use `unknown` with type guards
2. **Zod validation** at all API boundaries
3. **Structured logging** via Pino (not console.log)
4. **Server Components** for data fetching
5. **Keep files under 800 lines** — split large files into modules
6. **`catch (error: unknown)`** with type guards, not `catch (error: any)`

## PM2 Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `popularity-sync` | 3 AM UTC | TMDB daily exports → update popularity |
| `sitemap-generator` | 4 AM UTC | Generate sitemaps from TMDB exports |

## File Size Guidelines

| Category | Max Lines | Current Largest |
|----------|-----------|-----------------|
| Source files | 800 | 779 (shared-upserts.ts) |
| Components | 600 | 520 (minimal-view.tsx) |
