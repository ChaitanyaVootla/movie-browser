# GA Refactoring Plan

## Objective

Restructure large files and Cursor rules to reduce AI context overload and make the repo production-ready.

## Current State

### Large Cursor Rules (10,387 total lines)

| File           | Lines | Issue                              |
| -------------- | ----- | ---------------------------------- |
| components.mdc | 3,240 | Too large, covers too many topics  |
| core.mdc       | 2,325 | Massive, includes all architecture |
| api.mdc        | 1,295 | Could be split                     |
| ai-agent.mdc   | 1,284 | Acceptable but dense               |

### Large Code Files (>700 lines)

| File                 | Lines | Action                      |
| -------------------- | ----- | --------------------------- |
| postgres.ts          | 2,019 | Split into modules          |
| assistant-floaty.tsx | 1,488 | Extract subcomponents       |
| discover.ts          | 1,065 | DELETE (deprecated)         |
| users-tab.tsx        | 1,033 | Extract subcomponents       |
| cache-service.ts     | 1,019 | Acceptable (complex logic)  |
| agent.ts             | 976   | Extract prompts/config      |
| generator.ts         | 963   | Acceptable (self-contained) |
| smart-discover.ts    | 821   | Acceptable                  |
| media-data.ts        | 817   | Split shared utilities      |
| analytics-charts.tsx | 795   | Extract chart types         |

---

## Phase 1: Cursor Rules Restructuring

### 1.1 Split core.mdc (2,325 lines → 5 files)

- `architecture.mdc` - Directory structure, tech stack (~400 lines)
- `data-patterns.mdc` - Data fetching, caching, server actions (~500 lines)
- `database.mdc` - PostgreSQL, MongoDB, Prisma patterns (~500 lines)
- `conventions.mdc` - Naming, imports, types (~300 lines)
- `deployment.mdc` - EC2, PM2, deploy commands (~200 lines)

### 1.2 Split components.mdc (3,240 lines → 6 files)

- `ui-patterns.mdc` - shadcn/ui usage, styling (~300 lines)
- `movie-series.mdc` - Movie/series components (~500 lines)
- `person.mdc` - Person page components (~400 lines)
- `discover.mdc` - Browse, topics, filters (~400 lines)
- `admin.mdc` - Admin dashboard components (~400 lines)
- `layout.mdc` - Nav, footer, modals (~300 lines)

### 1.3 Split api.mdc (1,295 lines → 3 files)

- `server-actions.mdc` - Server action patterns (~400 lines)
- `api-routes.mdc` - API route patterns (~400 lines)
- `user-api.mdc` - User library endpoints (~300 lines)

### 1.4 Keep as-is (appropriately sized)

- ai-agent.mdc (1,284 lines) - Dense but focused
- auth.mdc (575 lines) - Good size
- testing.mdc (495 lines) - Good size
- seo.mdc (483 lines) - Good size
- enrichment.mdc (363 lines) - Good size
- ai-maintenance.mdc (327 lines) - Good size

---

## Phase 2: Code File Restructuring

### 2.1 postgres.ts (2,019 → ~4 files)

Split `src/server/services/hydration/sources/postgres.ts`:

- `postgres/movie-upsert.ts` - Movie upsert logic (~500 lines)
- `postgres/series-upsert.ts` - Series upsert logic (~600 lines)
- `postgres/shared-upserts.ts` - Genres, keywords, credits (~400 lines)
- `postgres/queries.ts` - Query functions (~300 lines)
- `postgres/index.ts` - Re-exports

### 2.2 assistant-floaty.tsx (1,488 → ~5 files)

Split `src/components/features/ai/assistant-floaty.tsx`:

- `ai/idle-circle.tsx` - Idle state bubble (~100 lines)
- `ai/minimal-view.tsx` - Minimal chat view (~200 lines)
- `ai/expanded-chat.tsx` - Full chat view (~300 lines)
- `ai/poster-card-large.tsx` - Large poster card (~150 lines)
- `ai/prompts.ts` - Prompt generation functions (~100 lines)
- `ai/assistant-floaty.tsx` - Main orchestrator (~400 lines)

### 2.3 discover.ts (1,065 lines)

DELETE deprecated tool - replaced by smart-discover.ts

### 2.4 similar.ts and semantic-search.ts

DELETE deprecated tools - functionality in smart-discover.ts

### 2.5 users-tab.tsx (1,033 → ~3 files)

Split `src/components/features/admin/tabs/users-tab.tsx`:

- `users-tab/user-table.tsx` - Table component (~300 lines)
- `users-tab/user-details.tsx` - User detail view (~300 lines)
- `users-tab/index.tsx` - Main container (~300 lines)

### 2.6 person-credits.ts (Deduplicate)

Refactor to use generics instead of duplicated Light/Regular versions.

---

## Phase 3: Critical Fixes

### 3.1 Security

- Add Zod validation to discover actions
- Fix command injection in admin/enrich
- Add rate limiting to AI chat endpoint

### 3.2 Performance

- Fix N+1 in getTrendingTrailers (batch video fetches)
- Fix N+1 in PostgreSQL upserts (use createMany)

### 3.3 Type Safety

- Create PostgresMovieResult/PostgresSeriesResult interfaces
- Replace `catch (error: any)` with `unknown`

---

## Execution Order

1. **Rules restructuring** (reduces context for all future work)
2. **Delete deprecated code** (quick wins)
3. **Split postgres.ts** (largest file, most impactful)
4. **Split assistant-floaty.tsx** (second largest)
5. **Split users-tab.tsx** (admin component)
6. **Deduplicate person-credits.ts** (maintainability)
7. **Critical fixes** (security/performance)

---

## Success Criteria

- No Cursor rule file > 600 lines
- No source file > 800 lines (except cache-service.ts, generator.ts which are self-contained)
- All deprecated code removed
- No `any` types in error handling
- Rate limiting on AI endpoint
- Zod validation on all discover inputs
