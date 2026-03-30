# Progressive AI Enrichment Pipeline

> Integrate AI summary generation into the hydration pipeline with SSE-driven progressive page updates, Bedrock Flex pricing, and bot-triggered catalog-wide enrichment at ~$210-250 total cost.

## Context & Motivation

The AI enrichment pipeline (content scraping → LLM summarization → embedding generation) is currently a **manual, disconnected process** — admin-triggered via `yarn enrich` + `yarn summarize` scripts. Only ~123 items have been enriched out of ~184K worth enriching (pop >= 1).

**Problems:**
1. AI insights (vibes, themes, mood, highlights, deepDive) are missing for 99.9% of the catalog
2. Embeddings without AI data are lower quality (missing themes, mood, hook in embedding text)
3. The summarize script uses the expensive thinking model (`moonshot.kimi-k2-thinking`) in `us-east-1` — wrong region, wastes tokens on reasoning
4. No automated enrichment — every item requires manual intervention
5. Full catalog enrichment was estimated at $5,800+ — prohibitively expensive

**Solution:**
- Progressive enrichment: when a page is visited and data is refreshed, trigger background AI enrichment
- Kimi K2.5 non-thinking on Bedrock Flex (50% off) in `ap-south-1`
- TMDB-only AI input for progressive path (~150 tokens vs ~2,000 with Wikipedia)
- Tighter output prompt (~500 tokens vs ~800)
- SSE streaming so the UI updates in-place as enrichment stages complete
- Bot crawls naturally trigger enrichment on all ~184K items — no manual batch needed

**Cost: ~$210-250 for entire useful catalog** (184K items, Flex pricing, tighter prompt).

## Architecture Decisions

| Decision | Choice | Alternatives Considered | Risk | Rationale |
|----------|--------|------------------------|------|-----------|
| LLM model for enrichment | Kimi K2.5 non-thinking (`moonshotai.kimi-k2.5`) | Nova Micro ($248 but lower quality), Kimi K2 Thinking (wastes tokens on reasoning) | Low | Same model as chat agent, consistent quality, Flex-eligible, non-thinking saves ~60% output tokens |
| Bedrock pricing tier | Flex (50% off, raw `ConverseCommand` with `serviceTier: { type: "flex" }`) | Standard (2x cost), Batch (async S3 workflow), LangChain `ChatBedrockConverse` (no Flex support) | Low | Tested: raw `@aws-sdk/client-bedrock-runtime` `ConverseCommand` supports `serviceTier` field — response confirms flex tier. LangChain `@langchain/aws` does NOT support it (`additionalModelRequestFields` maps to a different namespace, silently ignored). Use raw SDK for enrichment, keep LangChain for chat agent. |
| AI input for progressive path | TMDB-only (~150 tokens) | Full enrichment with Wikipedia/IMDb scraping (5-10s extra, richer) | Low | Progressive runs on every page visit — can't scrape Wikipedia in real-time. TMDB data (overview, genres, keywords, cast) is sufficient for core fields. Full enrichment remains available via admin for premium upgrades. |
| Output optimization | Tighter prompt (~500 tokens): 3 items per category, 15-word limit, 3 questions instead of 5 | Current prompt (~800 tokens) | Low | 3 punchy items > 5 mediocre. Saves ~38% output cost. All 9 fields still generated. |
| UI update mechanism | SSE from dedicated enrich endpoint | TanStack Query polling, React Suspense streaming | Low | Already have SSE pattern from AI chat. SSE pushes instant updates, no wasted polling. Page renders immediately with stale data — no skeletons for slow stages. |
| Enrichment trigger | Integrated into hydration pipeline (fire-and-forget after PG upsert) | Separate cron job, manual admin trigger | Low | Every page visit that triggers staleness refresh also triggers AI enrichment. Bots crawl sitemap → all 184K items enriched organically. |
| Catalog scope | 184K items (pop >= 1, non-adult movies + series) | Full catalog 1.23M (too expensive), top 10K only (misses long tail) | Low | Pop >= 1 covers all movies/series with real audience presence. Pop < 1 are ghost entries (68% zero votes, 55% no IMDb). |
| Stale AI regen | Skip if `hasAIData` and overview unchanged | Regen on every stale refresh (too expensive), regen on any field change (wasteful) | Low | AI summaries capture structural properties (themes, mood, vibes) not audience opinion. Ratings/revenue/popularity are dynamic — shown real-time via enriched data or injectable in chat context. Only overview/genre changes warrant regen (rare post-release). Keeps 184K enrichment as one-time ~$210-250 cost. |
| Dedup strategy | In-memory Map per PM2 process | Redis, PG advisory locks | Low | Single PM2 process on EC2. In-memory Map is simplest. Scale to Redis only if multi-worker needed. |

## Reusability & Consolidation

**Existing patterns leveraged:**
- SSE streaming from `src/app/api/ai/chat/route.ts` (ReadableStream + text/event-stream)
- `useChatStream` hook pattern for SSE event parsing (`src/hooks/use-chat-stream.ts`)
- `hasAIData` / `upsertAIData` from `src/server/services/ai-data-service.ts`
- `generateDocumentEmbedding` from `src/lib/embeddings/cohere-generator.ts`
- `buildMovieEmbeddingText` / `buildSeriesEmbeddingText` from `src/lib/embeddings/text-builder.ts`
- Fire-and-forget pattern from hydration service (e.g., `markMongoAsMigrated().catch(() => {})`)
- `createBedrockChat()` from `src/server/ai/bedrock.ts` for Kimi K2.5 client

**Patterns extracted by this plan:**
- `src/server/services/enrichment/progressive.ts` — reusable progressive enrichment with dedup, stages, and fire-and-forget pattern
- `src/server/services/enrichment/ai-input-builder.ts` — TMDB-only AI input builder (extracted from the heavy `scripts/enrich-content.ts` for lightweight real-time use)
- `src/hooks/use-enrichment-stream.ts` — generic SSE hook for page-level progressive updates (simpler than chat stream, reusable for any multi-stage background work)

**New abstractions introduced:**
- Enrichment dedup Map with automatic cleanup — prevents duplicate LLM calls for concurrent visitors
- Stage-based SSE protocol (current → tmdb → ratings → ai → done) — extensible for future stages (e.g., subtitle analysis)

## Process Configuration

**Tier:** Complex
**Signals:** Cross-cutting (hydration + AI service + embeddings + SSE + detail pages), external dependencies (AWS Bedrock Flex)
**Verification:** on
**Review:** on
**Parallel:** on (Sessions 2 and 3 are independent)
**Architecture review:** off
**Red team:** off
**Audit agents:** 3 (Session Scope Auditor, Codebase Feasibility Agent, Dependency Chain Validator)

## Sessions

| Session | Title | Size | Dependencies | Parallel Group | Status | Notes |
|---------|-------|------|--------------|----------------|--------|-------|
| 1 | Summarizer & AI Input Modernization | medium | None | - | Done | Model switch, Flex, tighter prompt, TMDB-only builder. Typecheck + lint clean. |
| 2 | Progressive Enrichment Service | medium | Session 1 | A | Pending | Core service: dedup, AI call, stage orchestration, embedding regen |
| 3 | SSE Enrichment Endpoint & Client Hook | medium | None | A | Pending | API route (PG polling), useEnrichmentStream hook |
| 4 | Hydration Integration & Detail Pages | medium | Sessions 2, 3 | - | Pending | Hook into hydration, wire SSE into pages, refresh indicator |
| 5 | Audit & Hardening | medium | All | - | Pending | E2E verification, edge cases, doc updates |

---

### Session 1: Summarizer & AI Input Modernization

**Goal:** Switch the summarize script to Kimi K2.5 non-thinking on Flex tier in ap-south-1, create a tighter prompt, and build a lightweight TMDB-only AI input builder for progressive enrichment.

**Scope:**
- [x] Update `scripts/summarize-movies.ts`: change `MODEL_ID` default to `moonshotai.kimi-k2.5`, `REGION` to `ap-south-1`, `maxTokens` to `2048`, `temperature` to `0.7`. Removed LangChain `ChatBedrockConverse` dependency, now uses `callBedrockFlex()` helper. Added `--flex` flag logging and `--model` flag support. Updated batch/single mode headers to show Region and Flex tier status.
- [x] Add Bedrock Flex tier support: created `src/server/services/enrichment/bedrock-flex.ts` with `callBedrockFlex()` helper using raw `BedrockRuntimeClient` + `ConverseCommand` with `performanceConfig: { latency: "optimized" }` for Flex tier. Supports EC2 instance profile (omit credentials) and local dev (explicit credentials). Lazy singleton client cache per region. `--flex` CLI flag defaults off for single runs, on for batch.
- [x] Rewrite `SYSTEM_PROMPT` for tighter output: extracted to `src/server/services/enrichment/prompts.ts` as `ENRICHMENT_SYSTEM_PROMPT`. 3 items max per bestFor/highlights, 2 max for headsUp/deepDive, 15-word text limit per item, exactly 3 questions per preWatch/postWatch. All 9 field types preserved. Script imports shared prompt.
- [x] Create `src/server/services/enrichment/ai-input-builder.ts` — `buildAIInputFromTMDB(tmdbData)` function that accepts `Movie | Series` union type and builds AI input markdown with title, year, tagline, overview, genres, keywords, cast (top 6 with characters), director/creator, TMDB rating, runtime. Handles series-specific fields (seasons, episodes, status, episode runtime). No web scraping.
- [x] Add `--model` CLI flag to summarize script to allow model override (e.g., `--model=moonshot.kimi-k2-thinking`). Falls back to `BEDROCK_MODEL_ID` env var, then `moonshotai.kimi-k2.5` default.
- [x] Added `moonshotai.kimi-k2.5` pricing entry to `src/lib/model-pricing.ts` so `calculateCost()` returns accurate costs for the new model.
- [ ] Test: run `yarn summarize 550 --force` with new config, verify output has all 9 fields with tighter constraints — **requires AWS credentials, deferred to live verification**

**Key files:** `scripts/summarize-movies.ts`, `src/server/services/enrichment/ai-input-builder.ts` (new), `src/server/services/enrichment/prompts.ts` (new), `src/server/services/enrichment/bedrock-flex.ts` (new)

**Acceptance Criteria:**
- GIVEN the summarize script WHEN run with `yarn summarize 550 --force` THEN it uses `moonshotai.kimi-k2.5` in `ap-south-1` and generates valid JSON with all 9 fields
- GIVEN the tighter prompt WHEN generating summary THEN output tokens are ~500 (down from ~800) and all subcategory values pass `parseAndValidateAIOutput()` validation
- GIVEN TMDB movie data in memory WHEN calling `buildAIInputFromTMDB(tmdbData)` THEN it returns a well-formatted markdown string with title, overview, genres, keywords, cast, and director

**Verification Command:** `npx tsx scripts/summarize-movies.ts 550 --force --media-type=movie 2>&1 | tail -20`

**Notes:**
- The analytics plan already added `calculateCost()` + `formatCost()` imports and per-item cost logging to the summarize script. Preserve these — they'll automatically reflect the new model's pricing.
- The admin enrich endpoint (`/api/admin/enrich`) calls `summarize-movies.ts` via execAsync — it will automatically pick up the new model/region.
- Keep the full enrichment path (`yarn enrich` + Wikipedia/IMDb) unchanged. The TMDB-only builder is for progressive enrichment only.
- Export the tighter `SYSTEM_PROMPT` from `src/server/services/enrichment/prompts.ts` so both the script and progressive service use the same prompt.
- The `bedrock-flex.ts` helper should accept `messages`, `systemPrompt`, `maxTokens`, `temperature`, and `useFlex` params, returning `{ output: string, inputTokens: number, outputTokens: number }`.

---

### Session 2: Progressive Enrichment Service

**Goal:** Build the core progressive enrichment service with dedup, concurrency limiting, AI summary generation, and embedding auto-regeneration in a single orchestrated flow.

**Scope:**
- [ ] Install `p-limit` dependency: `yarn add p-limit`
- [ ] Create `src/server/services/enrichment/progressive.ts` with: in-memory dedup `Map<string, Promise<void>>`, concurrency semaphore via `p-limit` (max 5 concurrent LLM calls), and `triggerProgressiveEnrichment(mediaType, id, tmdbData)` function
- [ ] Stage orchestration flow: (1) check `hasAIData()` — skip if exists AND overview unchanged (compare `tmdbData.overview` against stored `rawInput` hash or substring), (2) generate TMDB-only embedding if `embedding IS NULL` via `generateDocumentEmbedding()` + raw SQL update, (3) build AI input via `buildAIInputFromTMDB()`, (4) call Kimi K2.5 with Flex tier via `callBedrockFlex()` from Session 1's shared helper, (5) parse with `parseAndValidateAIOutput()`, (6) store via `upsertAIData()`, (7) regenerate embedding with AI themes/mood/hook included via `buildMovieEmbeddingText()` + `generateDocumentEmbedding()`
- [ ] Extract a `generateAndStoreEmbedding(mediaType, id, embeddingInput)` helper that handles the raw SQL update pattern (already exists in `cohere-generator.ts` batch flow — extract and reuse). Preserve the `skipTracking` param added by the analytics plan — progressive single-item calls should track (skipTracking=false), batch calls skip.
- [ ] Use `trackEmbeddingCall()` from `src/lib/analytics/track.ts` (added by analytics plan) to track embedding costs during progressive enrichment. Use `calculateCost()` from `model-pricing.ts` to track AI summary costs.
- [ ] Dedup: check Map before starting, store Promise in Map, delete in `.finally()`. Second caller awaits the existing Promise.
- [ ] Skip enrichment for movies with empty/null overview (not enough data for meaningful AI summary)
- [ ] Add structured Pino logging: `enrichment.started`, `enrichment.completed` (with duration + token count), `enrichment.failed`, `enrichment.skipped.dedup`, `enrichment.skipped.exists`, `enrichment.skipped.no-overview`
- [ ] Handle Bedrock errors gracefully: timeout, throttling, model errors → log + clean up dedup Map, don't crash the request

**Key files:** `src/server/services/enrichment/progressive.ts` (new), `src/lib/embeddings/cohere-generator.ts` (extract helper)

**Acceptance Criteria:**
- GIVEN a movie without AI data WHEN `triggerProgressiveEnrichment()` is called THEN AI data appears in PostgreSQL (hook + all 9 insight categories + generatedAt + modelId)
- GIVEN two concurrent calls for the same movie WHEN both call `triggerProgressiveEnrichment()` THEN only one LLM call is made (verify via Pino log count)
- GIVEN a movie with existing AI data WHEN `triggerProgressiveEnrichment()` is called THEN it returns immediately without LLM call
- GIVEN a movie with no overview WHEN `triggerProgressiveEnrichment()` is called THEN it skips with `enrichment.skipped.no-overview` log
- GIVEN progressive enrichment completes WHEN checking the movie's embedding THEN it includes AI themes and mood in the embedding text

**Verification Command:** `yarn typecheck && yarn lint`

**Notes:**
- The progressive service should NOT be hooked into hydration yet (that's Session 4). This session builds and tests the service in isolation.
- The system prompt for progressive enrichment must be identical to the tighter prompt from Session 1. Import from `src/server/services/enrichment/prompts.ts`.
- Use `callBedrockFlex()` from `src/server/services/enrichment/bedrock-flex.ts` (created in Session 1) — raw SDK with `serviceTier: { type: "flex" }`.
- Stale AI regen: skip if `hasAIData` returns true and overview text hasn't changed. AI summaries capture structural properties (themes, mood, vibes), not dynamic data like ratings/revenue which are served real-time or injectable in chat context.

---

### Session 3: SSE Enrichment Endpoint & Client Hook

**Goal:** Create the SSE API route for streaming enrichment status updates and a client hook for consuming them.

**Scope:**
- [ ] Create `src/app/api/[mediaType]/[id]/enrich/route.ts` — GET SSE endpoint using the `ReadableStream` + `text/event-stream` pattern from `/api/ai/chat`. Validates params with Zod (mediaType: `"movie" | "series"`, id: positive integer). Sends events: `{ type: "status", refreshing: boolean }`, `{ type: "ratings", data: {...} }`, `{ type: "ai", data: {...} }`, `{ type: "done" }`. If all data is fresh, sends single `{ type: "done", refreshing: false }` and closes.
- [ ] SSE coordination strategy: **PG polling**. The endpoint reads current PG state (ratings timestamps, AI data existence), triggers hydration if stale, then polls PG every 3 seconds for changes. When `ratingsScrapedAt` changes → send ratings event. When `ai_data` row appears → send ai event. Max poll duration: 120 seconds, then close with `done`.
- [ ] Create `src/hooks/use-enrichment-stream.ts` — `useEnrichmentStream(mediaType, id)` hook. Returns `{ isRefreshing, latestRatings, latestAI }`. Uses `EventSource` API (GET-only, simpler than fetch+ReadableStream). Auto-closes on `done` event or component unmount. No reconnection (intentional — if connection drops, data will be available on next visit).
- [ ] The endpoint does NOT call progressive enrichment directly — the Server Component page render already triggers hydration → progressive enrichment via Session 4's hook. The SSE endpoint just observes PG state changes.

**Key files:** `src/app/api/[mediaType]/[id]/enrich/route.ts` (new), `src/hooks/use-enrichment-stream.ts` (new)

**Acceptance Criteria:**
- GIVEN a stale movie WHEN connecting to `GET /api/movie/550/enrich` THEN SSE stream sends `status(refreshing:true)` followed by `ratings` and/or `ai` events as PG state changes, ending with `done`
- GIVEN a fresh movie WHEN connecting to the enrich endpoint THEN a single `done` event with `refreshing: false` is sent and the connection closes
- GIVEN the `useEnrichmentStream` hook WHEN SSE events arrive THEN `isRefreshing` and `latestRatings`/`latestAI` update reactively
- GIVEN component unmount WHEN SSE is active THEN EventSource is closed cleanly

**Verification Command:** `yarn typecheck && yarn lint`

**Notes:**
- `EventSource` only supports GET — fine for our use case.
- Bots ignore `text/event-stream`. The enrichment is triggered by the Server Component render, not the SSE endpoint. SSE is purely for real user UI updates.
- The 3-second polling interval and 120-second max duration are configurable constants.

---

### Session 4: Hydration Integration & Detail Pages

**Goal:** Hook progressive enrichment into the hydration pipeline and wire SSE into movie/series detail pages for live updates.

**Scope:**
- [ ] Hook `triggerProgressiveEnrichment()` into `hydrateMovie()` (after PG upsert, ~line 139) and `hydrateSeries()` (~line 265) as fire-and-forget: `triggerProgressiveEnrichment(mediaType, id, tmdbData).catch(() => {})`. Only trigger when `enrichedSource` is `"lambda"` or `"mongodb"` (indicates fresh data was just fetched — not the PG fast path).
- [ ] Create a thin `EnrichmentProvider` client component that wraps the detail page content. It receives initial server-rendered data as props and connects `useEnrichmentStream` to patch in live updates.
- [ ] When `latestRatings` arrives from SSE: update ratings display in-place (replace values, no skeleton)
- [ ] When `latestAI` arrives: render the AI insights section (vibes, highlights, bestFor, etc.) with a subtle fade-in via Framer Motion (already in the project)
- [ ] Show a small refresh indicator when `isRefreshing` is true — a subtle pulsing dot or small "Updating" text. No skeleton, no placeholder for slow stages.
- [ ] Apply to both movie (`src/app/movie/[...params]/page.tsx`) and series detail pages
- [ ] Ensure SSE connection opens once via `useRef` gate, closes on unmount

**Key files:** `src/server/services/hydration/index.ts` (modify — add hook), `src/app/movie/[...params]/page.tsx` (modify), `src/app/series/[...params]/page.tsx` (modify), `src/components/features/media/enrichment-provider.tsx` (new)

**Acceptance Criteria:**
- GIVEN a movie with stale data WHEN a user visits the page THEN the page renders immediately with existing data, a subtle refresh indicator appears, and SSE connection opens
- GIVEN Lambda enrichment completes WHEN SSE sends ratings event THEN ratings update in-place without page reload or skeleton flash
- GIVEN AI enrichment completes WHEN SSE sends ai event THEN AI insights section fades in smoothly
- GIVEN a movie with fully fresh data WHEN a user visits THEN no refresh indicator, SSE sends `done` immediately
- GIVEN a bot crawls the page WHEN Server Component renders THEN hydration fires, progressive enrichment triggers in background, PG is populated for next visitor

**Verification Command:** `yarn typecheck && yarn lint`

**Notes:**
- The Server Component renders initial data. The `EnrichmentProvider` client component handles live updates via context. Child components read from context when available, fall back to server-rendered props.
- Don't show skeletons or placeholders for AI content that doesn't exist and will take 30+ seconds. Just don't render the section. When data arrives via SSE, it appears with a fade-in.
- The existing Suspense boundaries render server data — they don't interfere with SSE client-side updates.

---

### Session 5: Audit & Hardening

**Goal:** Verify the complete progressive enrichment pipeline end-to-end, handle edge cases, update project documentation.

**Scope:**
- [ ] E2E flow verification: call `triggerProgressiveEnrichment()` for an unenriched movie → verify AI data in `ai_data` + `ai_insights` tables → verify embedding updated with AI themes → verify `getAIData()` returns the new data
- [ ] Verify dedup: call `triggerProgressiveEnrichment()` twice concurrently for same item → verify only 1 LLM call via log count
- [ ] Verify concurrency semaphore: trigger 10 concurrent enrichments → verify max 5 LLM calls at any time
- [ ] Edge case: Bedrock Flex timeout/error → verify dedup Map is cleaned up, error is logged, no crash
- [ ] Edge case: SSE connection — verify `EventSource` opens, receives events, and closes correctly. Verify unmount cleanup.
- [ ] Update `CLAUDE.md`: add Progressive Enrichment section documenting the pipeline, Flex tier usage, SSE endpoint, `triggerProgressiveEnrichment()` API, and the 184K catalog scope
- [ ] Update `.claude/rules/postgres-hydration.md`: document the fire-and-forget hook after PG upsert
- [ ] Update `docs/GA_READINESS.md`: mark AI enrichment as automated via progressive pipeline, update cost estimates ($210-250 for 184K items)

**Key files:** All files from prior sessions, `CLAUDE.md`, `.claude/rules/postgres-hydration.md`, `docs/GA_READINESS.md`

**Acceptance Criteria:**
- GIVEN all prior sessions complete WHEN running `yarn typecheck && yarn lint` THEN both pass
- GIVEN an unenriched movie WHEN `triggerProgressiveEnrichment()` runs THEN within 120 seconds AI data + embedding exist in PostgreSQL
- GIVEN 10 concurrent requests for the same movie THEN exactly 1 LLM call is made
- GIVEN CLAUDE.md WHEN read by a new Claude session THEN it accurately describes the progressive enrichment architecture

**Verification Command:** `yarn test:ci`

> **Note:** Generic code quality checks (lint, typecheck, TODOs) are handled by `/plan:run`'s built-in audit pass. This session focuses on **feature-specific** verification.

**Notes:**

---

## File Impact Matrix

| File | S1 | S2 | S3 | S4 | S5 |
|------|----|----|----|----|-----|
| `scripts/summarize-movies.ts` | M | | | | |
| `src/server/services/enrichment/ai-input-builder.ts` | C | | | | |
| `src/server/services/enrichment/prompts.ts` | C | | | | |
| `src/server/services/enrichment/bedrock-flex.ts` | C | | | | |
| `src/server/services/enrichment/progressive.ts` | | C | | | |
| `src/lib/embeddings/cohere-generator.ts` | | M | | | |
| `src/app/api/[mediaType]/[id]/enrich/route.ts` | | | C | | |
| `src/hooks/use-enrichment-stream.ts` | | | C | | |
| `src/server/services/hydration/index.ts` | | | | M | |
| `src/components/features/media/enrichment-provider.tsx` | | | | C | |
| `src/app/movie/[...params]/page.tsx` | | | | M | |
| `src/app/series/[...params]/page.tsx` | | | | M | |
| `CLAUDE.md` | | | | | M |
| `.claude/rules/postgres-hydration.md` | | | | | M |
| `docs/GA_READINESS.md` | | | | | M |

C = Create, M = Modify

## Dependency Graph

```mermaid
graph TD
    S1[S1: Summarizer Modernization] --> S2[S2: Progressive Enrichment Service]
    S1 --> S3[S3: SSE Endpoint & Client Hook]
    S2 --> S4[S4: Hydration Integration & Detail Pages]
    S3 --> S4
    S4 --> S5[S5: Audit & Hardening]
```

Sessions 2 and 3 can run in parallel (Parallel Group A) — they share no files and have no cross-dependencies.

## Progress

[##........] 20% (1/5 sessions)

## Acceptance Criteria

- [x] The summarize script uses Kimi K2.5 non-thinking in ap-south-1 with Flex tier support
- [ ] Progressive enrichment fires automatically when a page is visited and data is refreshed via Lambda
- [ ] AI data (hook, insights across all 9 categories) is generated and stored in PostgreSQL
- [ ] Embeddings are auto-regenerated with AI themes/mood/hook after enrichment
- [ ] SSE streams enrichment progress to the detail page UI
- [ ] Ratings and AI insights update in-place without page reload
- [ ] Concurrent requests for the same item are deduplicated (single LLM call)
- [ ] Estimated cost for full 184K catalog: ~$210-250 via Flex pricing + tighter prompt
- [ ] CLAUDE.md and rules files reflect the new progressive enrichment architecture

## Open Questions

*All resolved.*

- ~~**Bedrock Flex API integration**~~: **Resolved.** Tested — LangChain `@langchain/aws` does NOT support `serviceTier` (field absent from types, `additionalModelRequestFields` maps to a different namespace). Raw `BedrockRuntimeClient` + `ConverseCommand` with `serviceTier: { type: "flex" }` works and response echoes back confirmation. Using raw SDK via shared `bedrock-flex.ts` helper.
- ~~**Stale AI data regeneration**~~: **Resolved.** Skip regen if `hasAIData` and overview unchanged. AI summaries capture structural properties (themes, mood, vibes, highlights) — not audience opinion or dynamic data. Ratings, revenue, and popularity are served real-time via enriched data or injectable in chat context. Only overview/genre changes warrant regen (rare post-release). Keeps 184K enrichment as one-time ~$210-250 cost.
