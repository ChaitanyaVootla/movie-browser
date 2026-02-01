# Movie Browser - Claude Code Memory

## Project Overview

AI-first movie/TV discovery platform built with Next.js 15, React 19, TypeScript. Maintained by AI agents with human oversight.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI Agent**: LangGraph.js + OpenRouter (Kimi K2.5) or AWS Bedrock (fallback)
- **Database**: PostgreSQL (Prisma 6.x) + pgvector + MongoDB (user data only, migrating at GA)
- **State**: Zustand (client) + TanStack Query (server)
- **UI**: shadcn/ui + Tailwind CSS v4 + Framer Motion
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth
- **Logging**: Pino (structured JSON)
- **Analytics**: ClickHouse (self-hosted) + Admin Dashboard (`/admin`)

## Key Commands

```bash
# Development
yarn dev              # Next.js dev with Turbo
yarn typecheck        # TypeScript check
yarn lint             # ESLint
yarn test:ci          # Full CI (typecheck + lint + unit)

# Database
yarn db:push          # Prisma schema push
yarn db:migrate       # Prisma migrations
yarn db:studio        # Prisma Studio GUI
yarn db:seed:mongo    # Seed from MongoDB

# AI Agent
yarn test:ai "query"  # Test AI agent
yarn test:ai --debug  # With token/cost tracking

# AI Provider (env vars in .env.local)
# AI_PROVIDER=openrouter (default) | bedrock
# OpenRouter: OPENROUTER_KEY, OPENROUTER_MODEL_ID (default: moonshotai/kimi-k2.5)
# Bedrock: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_MODEL_ID, BEDROCK_REGION

# AI Enrichment
yarn enrich <tmdb_id>         # Enrich movie content
yarn enrich:series <tmdb_id>  # Enrich series content
yarn summarize <tmdb_id>      # Generate AI summary (stored in PostgreSQL)
yarn summarize <id> --force   # Regenerate existing summary

# Popularity Sync (daily cron job)
yarn popularity:sync              # Sync all types (movies, series, persons)
yarn popularity:sync --type=movie # Sync movies only
yarn popularity:sync --dry-run    # Preview without updating

# Testing
yarn test:e2e         # Playwright E2E
yarn test:seo         # SEO validation
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── ui/                 # shadcn/ui (DO NOT MODIFY)
│   └── features/           # Domain components
│       ├── ai/             # AI assistant (modular - 7 files)
│       ├── movie/series/   # Media components
│       └── admin/          # Admin dashboard
├── server/
│   ├── actions/            # Server Actions (Zod validated)
│   ├── ai/                 # LangGraph agent
│   │   └── tools/          # AI tools (smart-discover, details, etc.)
│   ├── services/
│   │   ├── hydration/
│   │   │   └── sources/
│   │   │       └── postgres/  # Modular (6 files)
│   │   └── ai-data-service.ts # AI enrichment data (PostgreSQL, no caching)
│   └── db/
│       └── postgres/       # PostgreSQL queries
├── lib/                    # Utilities
└── types/                  # TypeScript types
```

## Architecture Patterns

### Server Components First

Default to Server Components. Only add "use client" for event handlers, hooks, browser APIs.

### Data Fetching

- Server Actions in `src/server/actions/` for page data
- API routes only for: mutations, webhooks, admin, external integrations
- **All discover actions use Zod validation** (`DiscoverParamsSchema`)

### Caching Strategy

- L1 (memory) + L2 (file) cache via `cache-service.ts`
- TMDB: 1hr, Trending: 15min, Person: 24hr, YouTube: 24hr
- **AI data is NOT cached** - fetches directly from PostgreSQL (~5ms) to avoid multi-worker stale data issues

### Hydration Service

PostgreSQL is source of truth for movies/series. Flow: Check PG → TMDB API if stale → MongoDB enrichment → Upsert to PG → Return.

**Modular structure** (`src/server/services/hydration/sources/postgres/`):

- `types.ts` - Shared interfaces
- `queries.ts` - Read operations
- `movie-upsert.ts` - Movie writes (sets `tmdbUpdatedAt`)
- `series-upsert.ts` - Series writes (companies, languages, `tmdbUpdatedAt`)
- `shared-upserts.ts` - Genres, credits, ratings, etc.
- `error-utils.ts` - Type-safe error handling

### MongoDB Status

| Data | Source | Status |
|------|--------|--------|
| Movies/Series core | PostgreSQL | ✅ ~5k movies, ~2k series |
| Movies/Series enrichment | MongoDB → PostgreSQL | ⏳ Bulk population needed (~1.15M movies, ~212k series) |
| User data (watchlist, ratings, etc.) | MongoDB | ⏳ Migration script ready (`scripts/migrate-user-data.ts`) |
| Auth (users, sessions) | MongoDB | ⏳ Will switch to PrismaAdapter at GA |

See `docs/USER_DATA_MIGRATION.md` for full migration plan.

### GA Bulk Population (TODO)

**Status**: Script tested and ready, needs to run on EC2 for ~14 days.

**Data flow**: `TMDB API → MongoDB enrichment → PostgreSQL` (no Lambda)

**Critical**: MongoDB has expensive Lambda-sourced ratings/watch links - must preserve!

```bash
# Run on EC2 (where MongoDB lives) to reduce network latency
ssh -i ./movie-browser-ec2-key.pem ubuntu@98.130.30.197
tmux new -s populate

# Phase 1: Top 100k movies (~22 hours)
nohup yarn populate --movies=100000 --skip-existing > populate-p1.log 2>&1 &

# Phase 2: All movies (~9 days)
nohup yarn populate --all --skip-existing > populate-movies.log 2>&1 &

# Phase 3: All series (~4 days)
nohup yarn populate --series=300000 --skip-existing > populate-series.log 2>&1 &
```

See `.claude/rules/postgres-hydration.md` for full details.

## Cursor Rules (Detailed Patterns)

This repo uses **modular Cursor rules** in `.cursor/rules/`:

### Core Architecture

| File                   | Lines | Description                                     |
| ---------------------- | ----- | ----------------------------------------------- |
| `architecture.mdc`     | 322   | Tech stack, directory structure, critical rules |
| `database.mdc`         | 351   | PostgreSQL, hydration, data sources             |
| `routing-loading.mdc`  | 345   | Routes, progressive loading, hero images        |
| `rsc-optimization.mdc` | 191   | RSC payload, Light DTOs                         |
| `discover-topics.mdc`  | 315   | Browse/Topics, URL params, ISR                  |
| `state-mobile.mdc`     | 379   | Zustand, mobile patterns                        |
| `analytics.mdc`        | 243   | ClickHouse, tracking                            |

### Components

| File                      | Lines | Description                     |
| ------------------------- | ----- | ------------------------------- |
| `ui-patterns.mdc`         | 393   | shadcn/ui, Tailwind, animations |
| `movie-series.mdc`        | 803   | Movie/series components         |
| `person-components.mdc`   | 253   | Person page components          |
| `discover-components.mdc` | 563   | Browse, filters, scrollers      |
| `admin-components.mdc`    | 317   | Admin dashboard                 |
| `layout-components.mdc`   | 581   | Nav, search, modals             |

### API & Backend

| File                 | Lines | Description              |
| -------------------- | ----- | ------------------------ |
| `server-actions.mdc` | 448   | Server action patterns   |
| `api-routes.mdc`     | 583   | API route patterns       |
| `user-api.mdc`       | 466   | User library endpoints   |
| `ai-agent.mdc`       | 1284  | LangGraph agent patterns |

### Other

| File             | Description                 |
| ---------------- | --------------------------- |
| `auth.mdc`       | Auth.js v5 patterns         |
| `seo.mdc`        | SEO requirements            |
| `testing.mdc`    | E2E and unit testing        |
| `enrichment.mdc` | Content enrichment pipeline |

## Claude Code Rules

This repo uses **Claude Code rules** in `.claude/rules/` for AI-assisted development. These are **separate** from Cursor rules above.

### Rule Files

| File | Paths | Description |
|------|-------|-------------|
| `ai-insights.md` | `standout-*.tsx`, `ai-insights.ts` | Tag-based insights, spoiler levels, UI components |
| `ai-components.md` | `features/ai/**/*.tsx` | AI assistant modular structure |
| `postgres-hydration.md` | `hydration/**/*.ts`, `postgres/**/*.ts` | Hydration service, freshness tracking |
| `search-system.md` | `search/**/*.ts`, `fuzzy-search.ts` | Hybrid search, RRF ranking boosts |
| `server-actions.md` | `server/actions/**/*.ts` | Zod validation, error handling |
| `server-components.md` | `app/**/*.tsx`, `components/**/*.tsx` | RSC patterns, client islands |
| `api-routes.md` | `app/api/**/*.ts` | API routes, auth patterns, admin query endpoint |
| `theming.md` | `globals.css`, `preferences.ts`, `color-palette-provider.tsx` | 3-tier theming (mode/style/accent), CSS variables, hero gradients |
| `type-safety.md` | `**/*.ts`, `**/*.tsx` | No `any`, type guards, Zod |

### Session Maintenance

**IMPORTANT for Claude Code**: At the end of sessions or when asked to update rules:

1. **Update `.claude/rules/*.md`** for implementation patterns, not just CLAUDE.md
2. **Check which rules file** matches the work done (by `paths:` frontmatter)
3. **Keep CLAUDE.md** as high-level overview; detailed patterns go in rules files
4. **Create new rules files** when adding major features not covered by existing rules
5. **Run `/memory`** to see currently loaded rules

### AI Agent Workflow

This is an **AI-agent-first codebase**. Optimize for speed and parallelization:

**Frontend Design Skill**: Always use `/frontend-design` skill for UI changes:
- New components, pages, or visual features
- Styling updates, animations, layout changes
- Ensures production-grade, polished output (not generic AI aesthetics)

**Parallel Agent Orchestration**: For large plans that may exceed single-thread context:
1. **Split work into subtasks** using multiple `Task` tool calls with `subagent_type=general-purpose`
2. **Parallelize when safe** - run agents concurrently if they won't edit the same files
3. **Sequence when needed** - chain agents if later work depends on earlier results
4. **Example split**:
   ```
   Plan: "Add user profile with avatar upload"
   → Agent 1: Database schema + API routes (src/server/**, prisma/**)
   → Agent 2: UI components (src/components/**) - CAN RUN IN PARALLEL
   → Agent 3: Integration + testing - MUST WAIT for 1 & 2
   ```
5. **Use background agents** (`run_in_background: true`) for long-running tasks

This approach maximizes throughput and prevents context overflow on complex features.

### Rule File Format

```markdown
---
paths:
  - "src/specific/path/**/*.ts"
  - "src/another/path/*.tsx"
---

# Rule Title

## Section
Content here...
```

The `paths:` frontmatter controls when rules are loaded (based on files being edited).

## Critical Rules

1. **No `any` types** - Use proper typing or `unknown` with type guards
2. **Zod validation** at all API boundaries (discover, admin, user endpoints)
3. **Structured logging** via Pino loggers (not console.log)
4. **Server Components** for data fetching
5. **Keep files under 800 lines** - Split large files into modules
6. **Use `catch (error: unknown)`** with type guards, not `catch (error: any)`

## AI Insights System

Tag-based architecture with `ai_data` + `ai_insights` tables. 8 categories (VIBE, THEME, MOOD, BEST_FOR, HIGHLIGHT, HEADS_UP, QUESTION, DEEP_DIVE) with enforced subcategories.

**Spoiler Levels**: `FREE`, `LIGHT`, `HEAVY` - UI components gate content appropriately.

**Key Files**: `src/types/ai-insights.ts` (schema), `src/server/services/ai-data-service.ts` (data fetching), `src/components/features/media/standout-*.tsx` (UI).

See `.claude/rules/ai-insights.md` for detailed patterns, UI components, and icon mapping.

## Search System

Advanced "search anything" system handling direct titles, typos, natural language ("dark Korean thrillers from the 90s"), and semantic queries seamlessly.

### Architecture

| Component | Purpose |
|-----------|---------|
| 3-Tier Classification | regex (70%) → embedding (25%) → LLM (5%) |
| 14+ Filter Types | genre, year, cast, director, country, language, streaming, network, collection, keywords, mood, etc. |
| Query Expansion | Theme/mood synonyms, typo correction, country/language normalization |
| Autocomplete | Fast suggestions (<100ms) with titles, people, filters, moods |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/search/intent.ts` | Filter extraction (14+ types) |
| `src/lib/search/intent-embeddings.ts` | 3-tier classification (80% cost reduction) |
| `src/lib/search/query-expansion.ts` | Theme/mood expansion, typo correction |
| `src/lib/search/llm-query-parser.ts` | Kimi K2 fallback for complex NL |
| `src/lib/search/hybrid.ts` | RRF combining fuzzy + semantic |
| `src/server/actions/autocomplete.ts` | Fast autocomplete |

### Cost/Latency

| Query Type | Cost | Latency |
|------------|------|---------|
| High-confidence | $0 | ~500ms |
| Medium-confidence | $0.00002 | ~600ms |
| Low-confidence (LLM) | $0.01 | ~1.5s |
| **Average** | ~$0.0006 | ~600ms |

**Note**: `persons` table uses internal `id` + separate `tmdb_id`; fuzzy search returns `tmdb_id` as `id` for URL compatibility.

See `.claude/rules/search-system.md` for detailed patterns, filter types, and query expansion.

## PM2 Scheduled Jobs

Production uses PM2 `cron_restart` for scheduled jobs (see `ecosystem.config.cjs`):

| Job | Schedule | Purpose |
|-----|----------|---------|
| `popularity-sync` | 3 AM UTC | Download TMDB daily exports, update popularity for movies/series/persons |
| `sitemap-generator` | 4 AM UTC | Generate sitemaps from TMDB daily exports |

## Recent Refactoring (Jan 2026)

### Completed

- Split `core.mdc` (2325 lines) → 7 focused files
- Split `components.mdc` (3240 lines) → 6 domain files
- Split `api.mdc` (1295 lines) → 3 focused files
- Split `postgres.ts` (2019 lines) → 6 modular files
- Split `assistant-floaty.tsx` (1488 lines) → 7 components
- Deleted deprecated AI tools (discover.ts, similar.ts, semantic-search.ts)
- Deduplicated `person-credits.ts` using generics
- Added Zod validation to discover actions
- Fixed command injection in admin/enrich
- Replaced `as any` with proper interfaces
- Replaced `catch (error: any)` with `unknown` + type guards
- Added `tmdbUpdatedAt` tracking to movie and series upserts
- Added series production companies storage (`series_companies`)
- Added series spoken languages storage (`series_languages`)
- User data migration script ready (`scripts/migrate-user-data.ts`)
- AI enrichment data migrated from file-based to PostgreSQL (`ai_data` + `ai_insights` tables)
- Added series enrichment support (`yarn enrich:series`, `scripts/enrich-series.ts`)
- Tag-based AI insights architecture with 8 categories and enforced subcategories
- New insight display components with Lucide icons (StandoutBadges, StandoutAspects, etc.)
- Spoiler gating system (FREE/LIGHT/HEAVY) with reveal buttons in DeepDiveSection
- Fixed summarize script max_tokens (4096 → 16384) to prevent JSON truncation with Kimi K2
- Search ranking enhancements: trending boost (including persons), quality boost, recency boost
- Person search fix: return `tmdb_id` instead of internal `id` for correct URL navigation
- Popularity storage: credits hydration now extracts and stores person popularity from TMDB
- Popularity sync job (`scripts/sync-popularity.ts`): daily TMDB export download + batch updates
- PM2 cron jobs configured for popularity sync (3 AM) and sitemap generation (4 AM)
- Bulk population script improvements (`scripts/populate-postgres.ts`):
  - Added `--retry-failed` flag to retry previously failed items
  - Added auto-retry at end of run with concurrency=1
  - Failed items saved to `.populate-progress.json` for later retry
  - **Bug fix**: Stale MongoDB data now used when `skipLambda=true` (was returning empty)
- TMDB export analysis: ~1.15M movies, ~212k series (non-adult, sorted by popularity)
- Grafana removed from analytics stack - SQL Query Explorer added to admin dashboard (`/admin`)
  - Safe SQL execution (SELECT-only, 30s timeout, 10k row limit)
  - Schema browser with click-to-insert columns
  - 6 pre-built saved queries (top pages, AI costs, errors, traffic by country, etc.)
  - CSV export for query results
- **Advanced Search System** (major overhaul):
  - 3-tier intent classification: regex → embedding → LLM (80% cost reduction)
  - 14+ filter types: genre, year, cast, director, country, language, streaming, network, collection, keywords, mood, bestFor, contentWarnings, seriesStatus
  - Query expansion with 30 theme expansions, 20 mood expansions, 50+ typo corrections
  - Country/language detection with 40+ country and 30+ language mappings
  - Franchise detection (Marvel, Star Wars, Harry Potter, Ghibli, etc.)
  - Fast autocomplete (<100ms) with categorized suggestions
  - Query understanding UI with color-coded filter chips
  - Progressive fallback when filters too restrictive
  - New files: `intent-embeddings.ts`, `query-expansion.ts`, `llm-query-parser.ts`, `autocomplete.ts`
- **Instant Loading with CDN Images**:
  - Movie/series `loading.tsx` now renders actual CDN images instead of skeletons
  - Uses `useParams()` to extract media ID from URL during navigation
  - Same CDN URLs as home carousel → images cached → instant display
  - Person page has standard skeleton (no CDN images for persons)
  - See `.claude/rules/server-components.md` for pattern details

## File Size Guidelines

| Category     | Max Lines | Current Largest         |
| ------------ | --------- | ----------------------- |
| Cursor rules | 800       | 803 (movie-series.mdc)  |
| Source files | 800       | 779 (shared-upserts.ts) |
| Components   | 600       | 520 (minimal-view.tsx)  |
