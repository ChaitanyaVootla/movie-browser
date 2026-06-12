# Movie Browser

AI-first movie/TV discovery platform built with Next.js 15, React 19, TypeScript. Maintained by AI agents with human oversight.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI Agent**: LangGraph.js + MemorySaver checkpointer + AWS Bedrock (Kimi K2.5, default) or OpenRouter (fallback) + Tavily (web search/extract, 1000 credits/month free tier)
- **Database**: PostgreSQL (Prisma 6.x) + pgvector — sole datastore since GA (2026-06-10). Legacy MongoDB archived to S3; code paths flag-gated off, deletion pending (see Post-GA Cleanup)
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

**CDN (since 2026-06-11)**: CloudFront (`E12R1ZNQNG3LK5` / `d1vtxoi7slst5n.cloudfront.net`) fronts the apex + www; origin is `origin.themoviebrowser.com` → EIP (Caddy serves it as a 2nd vhost). It edge-caches anon HTML, collapses the crawler herd (Origin Shield ap-south-1), sheds scrapers at the edge, and serves stale during origin freezes — the 2-vCPU origin could not survive the herd directly. **All CDN work + footguns are in `.claude/rules/cdn.md` — read it before touching CloudFront/Caddy/robots/next.config.**

**Main EC2 (production since GA 2026-06-10, now the CloudFront origin)**: `t4g.large` (8GB ARM) in `ap-south-2` (Hyderabad). EIP `16.112.156.196`. Serves `themoviebrowser.com` + `www` + `beta.themoviebrowser.com` via Caddy (apex block also serves `origin.themoviebrowser.com`). Managed by Terraform (`terraform/`, state key `beta/terraform.tfstate`, project name `movie-browser-beta`).

**Legacy EC2** (pending decommission): `98.130.30.197` — old Nuxt + MongoDB box. `themoviebrowser.com` now points at the main box (GA cutover 2026-06-10); legacy serves nothing. Separate TF state (`production/terraform.tfstate`). Decommission steps in memory `ga-cutover-state`.

**Services on Beta EC2** (via `docker-compose.yml`):
- PostgreSQL 17 + pgvector + pg_trgm (port 5433)
- ClickHouse (port 8123, localhost only)
- Caddy reverse proxy (HTTPS, auto Let's Encrypt) — config in `Caddyfile`
- Next.js via PM2 (port 3002)

**CI/CD**: GitHub Actions (`.github/workflows/deploy-ec2.yml`). Push to `next` → typecheck + lint → build → deploy to EC2 (the CloudFront origin). Environment: `beta`. Secrets prefixed `NEXT_EC2_*`. Build step needs dummy env placeholders (`MONGO_IP`, `DATABASE_URL`, etc.) for Next.js module evaluation. Deploy mechanism (Jun 11 2026): **node_modules ships IN the tar** (built on the runner) — NO on-box `yarn install` (it OOM-froze the 2-vCPU box). `prisma db push` + FTS indexes are **gated by file-hash** (skip unless schema/SQL changed — their memory cost concurrent with the cold restart was a freeze contributor). After PM2 `startOrReload`: revalidate prerendered pages. **NO CloudFront invalidation on deploy** (removed — `/*` cold-purges the whole edge at once; caused the Jun 11 cold-edge outage). Consequence: edge-cached HTML from the previous build serves for up to ~1h after a deploy, and its server-action POSTs 404 (`UnrecognizedActionError` — bit users Jun 12 during 3 rapid deploys). If a deploy breaks something user-visible, run a **manual** `aws cloudfront create-invalidation --paths '/*'` and ride out the cold window; for a single bad page invalidate just that path. Preflight aborts if EC2 disk <2GB or memory <1.5GB free. See `.claude/rules/performance.md` + `cdn.md`.

**AWS IAM** (via EC2 instance profile `movie-browser-beta-ec2-role`):
- `bedrock:InvokeModel` — Kimi K2.5 (ap-south-1) + Cohere Embed v4 (global)
- `lambda:InvokeFunction` — `movie-ratings-scraper-beta` + `puppeteer-node14`
- S3 backup access, CloudWatch logs

**Lambda**: Beta uses `movie-ratings-scraper-beta` (configurable via `LAMBDA_FUNCTION_NAME` env var, defaults to `movie-ratings-scraper`).

**AWS credentials**: On EC2, omit `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — the instance profile provides Bedrock access. Set them only for local dev. Use project IAM user `moviebrowser` (account `620733889764`), never default machine creds.

**MongoDB**: SEVERED at GA (2026-06-10): `USER_DATA_SOURCE=postgres` + `ENABLE_MONGODB_ENRICHMENT=false` on the box; the app makes zero Mongo connections. Enrichment corpus bulk-migrated to PG (534k docs, 0 errors); full mongodump pinned in S3 (`backups/mongo/`). Legacy box pending decommission.

**Local PG Access**: `ssh -i movie-browser-ec2-key.pem -L 5433:localhost:5433 ubuntu@16.112.156.196 -N` then use `yarn db:studio`.

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

**Design System**: `DESIGN.md` at repo root (Google Labs design.md format) is the source of truth for typography scale, layout offsets (mobile has NO top navbar; desktop navbar is exactly 64px/`h-16`), spacing, shapes, and component recipes. All UI changes must follow it; update it first if a new value is needed.

**AI Agent (Cue)**: LangGraph agent with MemorySaver checkpointer. 11 tools (8 TMDB + `get_user_profile` + `web_search` + `web_extract` via Tavily), Kimi K2.5 (knowledge cutoff: June 2025). TMDB-first strategy — agent prefers free TMDB tools, web search only for current events/news/box office/reviews. Agent outputs `[SOURCE:url|title]` citation tags and `[WEB_IMAGE:url|description]` image tags for web results. Thread-based conversation persistence — frontend sends `threadId`, server restores full state (messages + tool calls + results). Tools receive `userId`, `pageContext`, and `userContext` (name, region, timezone) via `config.configurable`. `get_page_context` returns media metadata + user status (watched/watchlisted/rated). `get_user_profile` returns compact taste profile (top genres, recent watches, counts). Per-invocation logging isolated via `invocationId` Map. Recursion limit: 25. `TAVILY_API_KEY` required for web tools. See `.claude/rules/ai-agent.md`.

**Progressive Enrichment**: Automatic AI enrichment triggered by page visits. When hydration fetches fresh data (Lambda or MongoDB source), `triggerProgressiveEnrichment()` fires in the background — no manual intervention needed. Pipeline: check existing AI data → generate TMDB-only embedding if missing → call Kimi K2.5 via Bedrock Flex (50% off) → parse + store AI insights → regenerate embedding with AI themes/mood/hook. Dedup via in-memory Map (concurrent requests for same item share one Promise). Concurrency capped at 5 LLM calls via `p-limit`, and upstream background refreshes (which trigger enrichment) capped globally at `MAX_BACKGROUND_REFRESH` (default 3, 0 disables) — without that cap, crawler traffic over a large stale catalog queued unbounded in-process work (GA day: Node RSS 1.4→2GB in minutes, 19s TTFB). SSE endpoint (`GET /api/[mediaType]/[id]/enrich`) polls PG for state changes and streams ratings/AI updates to the client. Detail pages use `EnrichmentProvider` + `useEnrichmentStream` for live in-place updates (ratings swap, AI sections fade in). Cost: ~$210-250 for full 184K catalog (pop >= 1) via Flex pricing + tighter prompt (~500 output tokens). Key files: `src/server/services/enrichment/progressive.ts`, `src/server/services/enrichment/bedrock-flex.ts`, `src/server/services/enrichment/prompts.ts`, `src/server/services/enrichment/ai-input-builder.ts`, `src/hooks/use-enrichment-stream.ts`, `src/components/features/media/enrichment-provider.tsx`.

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

**Cost Tracking**: Unified cost dashboard (`/admin` → Costs tab) aggregates across 5 services: LLM chat, LLM search parsing, embeddings (Cohere), Lambda, Tavily (web search/extract credits). Query-time aggregation via `getUnifiedCostBreakdown()` in `src/lib/analytics/queries/costs.ts`. Pricing in `src/lib/model-pricing.ts`.

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
| Movies/Series core | PostgreSQL | ✅ ~504k movies, ~68k series |
| Movies/Series enrichment | MongoDB → PostgreSQL | ⏳ Gap-fill plan approved: ~436k enriched movies + ~75k series only (62% of Mongo corpus has no enrichment — skip it) |
| User data (watchlist, ratings, etc.) | **PostgreSQL (flipped 2026-06-10)** | ✅ Synced (3,183 rows, 560 users) + `USER_DATA_SOURCE=postgres` live on beta. Re-run `migrate-user-data.ts` for the delta right before DNS cutover. |
| Auth (users, sessions) | **PrismaAdapter (flipped 2026-06-10)** | ✅ JWT sessions survive the flip; `accounts` rows regenerate on login |
| Mongo read path (ratings/watch links) | **PostgreSQL** | ✅ `cached-queries.ts` reads PG; `ENABLE_MONGODB_ENRICHMENT=false` on beta — app runs fully without Mongo |
| AI provider | Bedrock (Kimi K2.5) | ✅ Default provider, OpenRouter fallback |
| Embeddings | Cohere Embed v4 (1024 dims) | ✅ Switched from Titan, regenerate existing with `--force` |
| Infrastructure | Terraform + Docker Compose + GitHub Actions CI/CD | ✅ New standalone EC2, Bedrock IAM, PG + ClickHouse |

### GA — COMPLETED 2026-06-10

Cutover executed: user data synced (561 users / 3.2k rows, 0 errors; final delta
sync ran post-DNS-flip), `USER_DATA_SOURCE=postgres` + `ENABLE_MONGODB_ENRICHMENT=false`
live, Route 53 apex+www → `16.112.156.196`, Caddy serving apex with LE certs,
`NEXT_PUBLIC_SITE_URL`/`NEXTAUTH_URL` on apex, enrichment corpus bulk-migrated
(PG: ~807k movies, ~112k series, 1.1M rating rows, 50k IN watch links).
Re-run `scripts/migrate-user-data.ts` (idempotent) only if stale-DNS stragglers
hit the legacy site before it's stopped.

### Post-GA Cleanup (pending)

1. Decommission legacy EC2 `98.130.30.197` (stop → watch a week → terminate;
   termination protection must be disabled first; release EIP; remove its
   CloudWatch alarms/disk cron; delete dead `api.themoviebrowser.com` +
   `proxyimage` CloudFront leftovers).
2. Delete Mongo code: `src/server/db/mongo/`, `src/server/services/hydration/sources/mongo.ts`
   (keep `transformMongoToEnriched` consumers in mind — `scripts/migrate-mongo-enrichment.ts`
   imports it; archive the script alongside), Mongoose models, mongodb branches in
   `user-data.ts`/`user-id.ts`/`auth.ts`.
3. Remove packages: `mongoose`, `mongodb`, `@auth/mongodb-adapter`. Remove `MONGO_*` env vars.
4. Keep the S3 mongodump (`backups/mongo/`, 9GB) pinned until cleanup is long verified.

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
| `design-system.md` | `DESIGN.md`, `app/**/*.tsx`, `components/**/*.tsx`, `lib/design.ts`, `globals.css` | DESIGN.md enforcement: tokens/recipes, primitives (`PageMain`, `SectionHeading`, `@/lib/design`), layout facts, UI verification |
| `pwa-mobile.md` | `layout.tsx`, `manifest.json`, `theme-color-sync.tsx`, `use-keyboard-inset.ts`, `features/ai/**` | PWA system-bar blending (ThemeColorSync), interactive-widget keyboard handling, chat control conventions |
| `theming.md` | `globals.css`, `preferences.ts` | Mode/style/accent theming, hero gradients |
| `type-safety.md` | `**/*.ts`, `**/*.tsx` | No `any`, type guards, Zod |
| `infrastructure.md` | `terraform/**`, `docker-compose.yml`, `deploy-next.sh`, workflows | EC2, Docker, CI/CD, IAM, memory budget |
| `analytics-system.md` | `analytics/**`, `use-analytics.ts`, `api/analytics/**`, `admin/analytics/**` | Event tracking, cost tracking, ClickHouse queries, dashboard |
| `performance.md` | `app/**`, `server/**`, `hydration/**`, `search/**`, `docker-compose.yml`, workflows | Diagnosing/fixing/testing perf: measure-first playbook, ISR, non-blocking hydration, ClickHouse CPU cap, deploy gotchas, cold-start stampede + freeze recovery |
| `cdn.md` | `terraform/cloudfront*`, `Caddyfile`, `public/robots.txt`, `next.config.mjs` | CloudFront in front of the origin: topology, the RSC/Set-Cookie/cookie/image/server-action-skew/geo/Accept-Encoding/stale-if-error footguns, edge bot-shedding, origin lockdown (unresolved), cost (Cloudflare-vs-CloudFront) |

Cursor IDE also has separate rules in `.cursor/rules/*.mdc` — those are independent from these.

### Self-curation mandate (this repo is AI-maintained)

You maintain this repo. Treat the rules and skills as a living knowledge base you
own — keep them accurate and useful for your future self:

- **When you learn something durable** (a non-obvious gotcha, a root cause, a
  validated pattern, a "this burned hours" lesson), capture it: add it to the most
  relevant existing rule, or create a new `.claude/rules/*.md` rule if it's a new
  domain. Don't let hard-won knowledge evaporate at end of session.
- **Keep this table in sync** — every rule file must have a row here with an
  accurate scope and one-line description. Add a row when you add a rule.
- **Correct or prune** rules that turn out wrong or stale; a misleading rule is
  worse than none. Verify file/function/flag references still exist before relying
  on a rule.
- **Cross-link** related rules (see-also lines) so one entry point leads to others.
- This complements (does not replace) the file-based memory at
  `~/.claude/.../memory/` — memory is for cross-session operational state and
  incident history; rules are for durable, codebase-scoped engineering guidance.

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
| `popularity-sync` | 21:00 UTC (02:30 IST) | TMDB daily exports → update popularity (streaming, diff-only) |
| `sitemap-generator` | 22:00 UTC (03:30 IST) | Generate sitemaps from PG (quality-gated top 50k movies / 25k series / 25k persons via `SITEMAP_*_LIMIT` envs, honest `lastmod` from `updated_at`, 50k-URL file chunking) |
| `isr-cache-prune` | 23:00 UTC (04:30 IST) | Keep `.next/server/app/{movie,series,person}` under `ISR_CACHE_BUDGET_MB` (5GB). Jun 10 2026: unbounded ISR cache hit 41GB → disk-full outage loop |

All run under `nice -n 19` and carry a **cron-window guard** (`CRON_HOUR_UTC`
env, checked in the scripts): PM2 re-runs cron jobs once on every `pm2 start`
(= every deploy), which used to launch them at peak traffic and 502 the site —
deploy-time autostarts now exit instantly, so deploys safely re-arm the cron.
Manual run: `FORCE_RUN=1 npx tsx scripts/sync-popularity.ts` or
`FORCE_RUN=1 node scripts/generate-sitemap.js` (quiet window; prefix `nice -n 19`).
Post-migration catalog is ~807k movies; sync-popularity streams the export
(was 3.7GB RSS buffered, now ~Map-sized).

## File Size Guidelines

| Category | Max Lines | Current Largest |
|----------|-----------|-----------------|
| Source files | 800 | 779 (shared-upserts.ts) |
| Components | 600 | 520 (minimal-view.tsx) |
