# Movie Browser - Claude Code Memory

## Project Overview

AI-first movie/TV discovery platform built with Next.js 15, React 19, TypeScript. Maintained by AI agents with human oversight.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI Agent**: LangGraph.js + AWS Bedrock (Claude/Kimi K2/Nova Pro)
- **Database**: PostgreSQL (Prisma 6.x) + pgvector + MongoDB (user data only, migrating at GA)
- **State**: Zustand (client) + TanStack Query (server)
- **UI**: shadcn/ui + Tailwind CSS v4 + Framer Motion
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth
- **Logging**: Pino (structured JSON)
- **Analytics**: ClickHouse + Grafana (self-hosted)

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
│   │   └── hydration/
│   │       └── sources/
│   │           └── postgres/  # Modular (6 files)
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
| Movies/Series | PostgreSQL | ✅ Complete |
| User data (watchlist, ratings, etc.) | MongoDB | ⏳ Migration script ready (`scripts/migrate-user-data.ts`) |
| Auth (users, sessions) | MongoDB | ⏳ Will switch to PrismaAdapter at GA |

See `docs/USER_DATA_MIGRATION.md` for full migration plan.

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

## Critical Rules

1. **No `any` types** - Use proper typing or `unknown` with type guards
2. **Zod validation** at all API boundaries (discover, admin, user endpoints)
3. **Structured logging** via Pino loggers (not console.log)
4. **Server Components** for data fetching
5. **Keep files under 800 lines** - Split large files into modules
6. **Use `catch (error: unknown)`** with type guards, not `catch (error: any)`

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

## File Size Guidelines

| Category     | Max Lines | Current Largest         |
| ------------ | --------- | ----------------------- |
| Cursor rules | 800       | 803 (movie-series.mdc)  |
| Source files | 800       | 779 (shared-upserts.ts) |
| Components   | 600       | 520 (minimal-view.tsx)  |
