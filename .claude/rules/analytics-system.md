---
paths:
  - "src/lib/analytics/**/*.ts"
  - "src/hooks/use-analytics.ts"
  - "src/app/api/analytics/**/*.ts"
  - "src/app/api/admin/analytics/**/*.ts"
  - "src/components/features/admin/tabs/costs-tab.tsx"
  - "src/components/features/admin/analytics-dashboard.tsx"
  - "analytics/clickhouse/**/*.sql"
---

# Analytics & Cost Tracking

## Architecture

```
Client (useAnalytics hook) -> POST /api/analytics/ingest -> ClickHouse
Server (track*.ts functions) -> per-table in-process queue (200 events / 5s, 5k bound drop-oldest, single-flight, async_insert) -> ClickHouse
Admin dashboard -> GET /api/admin/analytics -> ClickHouse queries -> React Query -> Charts
```

## Client-Side: useAnalytics Hook

`src/hooks/use-analytics.ts` -- 14 convenience methods. Import in any `"use client"` component.

```typescript
const { trackAction, trackWatchlistAdd, trackWatchlistRemove, trackRating,
        trackWatched, trackShareClick, trackWatchClick, trackSearch,
        trackFilterApply, trackTrailerPlay, trackAIChatOpen,
        trackAIChatSubmit, trackExternalLink } = useAnalytics();
```

**Behavior**: Batches events, flushes on unmount, respects DNT (`navigator.doNotTrack === '1'`), excludes admin traffic by default.

**Pattern for new components**: Import hook, destructure method, call inside existing handler (non-blocking, no `await`).

### Instrumented Components (15+)

| Category | Components | Events |
|----------|-----------|--------|
| Media actions | media-actions, movie-card-actions | watchlist_add/remove, rate_like/dislike, watched |
| Watch | watch-options, wide-card | watch_click, continue_watching_click |
| Search | search-command | search_submit, search_result_click, topic_select, mood_select |
| Filters | filter-sidebar | filter_apply (1s debounce) |
| AI chat | idle-circle, expanded-chat, minimal-view | ai_chat_open, ai_chat_submit |
| Media | video-gallery, trailer-carousel | trailer_play |
| Discovery | topic-pills, mood-cards | topic_select, mood_select |
| Navigation | media-scroller, image-gallery | carousel_nav, gallery_open, gallery_nav |
| Settings | settings-menu | settings_change |
| Person | person-hero | external_link |

## Server-Side Tracking

`src/lib/analytics/track.ts` -- functions for server-side events. All fire-and-forget.

| Function | ClickHouse Table | Use Case |
|----------|-----------------|----------|
| `trackAIUsage()` | `ai_usage` | Agent chat invocations (tokens, cost, tools) + progressive enrichment (query_type=progressive_enrichment) |
| `trackSearchLLMUsage()` | `ai_usage` | Tier 3 LLM query parsing (query_type=search_llm_parsing) |
| `trackEmbeddingCall()` | `api_calls` | Cohere embedding calls (service=embedding, tokens field) |
| `trackAPICall()` | `api_calls` | TMDB, Lambda, embedding, Tavily API calls |
| `trackPageView()` | `page_views` | Page views — fired from `src/proxy.ts` (NOT a layout component: layout `headers()` killed ISR, and cached serves never re-render the layout anyway). Document GETs only (`rsc`/`next-router-prefetch` excluded). Blocked scrapers (429 in proxy) are still tracked with `is_bot=1`. |
| `trackError()` | `errors` | Application errors |

**Critical rule**: All tracking calls must be fire-and-forget -- no `await`, wrapped in try-catch. Analytics must never break the application.

## Bot Detection (4 layers — June 2026 rework)

Post-GA, 97% of "human visitors" were scrapers. Detection now layers (see
`src/lib/analytics/bot-detection.ts`):

1. **UA patterns** (`detectBot`) — honest crawlers, HTTP libs, Puppeteer
   device-emulation preset strings (`SM-G900P/LRX21T`, `Pixel 2/OPD3.170816.012`,
   `iPhone OS 13_2_3`), and stale Chrome majors ≤109 (real usage in 2026 ≈ 0).
2. **Client signal** — the hook sends `x-analytics-wd: navigator.webdriver ? 1 : 0`;
   ingest marks `webdriver` bots (Puppeteer/Playwright/Selenium running JS).
3. **Client hints** (`detectBotFromRequest`, used by BOTH the ingest route and the
   SSR `getTrackingContext`) — `sec-ch-ua` containing "Headless", and the killer:
   a modern-Chrome UA with NO `sec-ch-ua` header is a JS-less HTTP client in a
   browser costume (real Chromium ≥89 always sends hints over HTTPS; iOS
   CriOS/EdgiOS excluded — WebKit sends none).
4. **Engagement** (`engagedSessions` in `getTrafficOverview`) — the ceiling-breaker
   for scrapers that forge UA *and* client hints: they surf rotating IPs at exactly
   1.0 views/session with zero mobile devices. Engaged = 2+ pageviews OR any
   user_action OR authenticated. **Use engagedSessions for human-growth metrics.**

Schema quirks: `user_actions` has `is_bot` but NO `user_agent` column (can't be
UA-backfilled); the live `performance` table predates `is_bot` entirely (schema
file says otherwise — drift from the no-migrations era). Backfills are ClickHouse
`ALTER TABLE ... UPDATE` mutations — deterministic UA patterns only; behavioral
backfills of production data need explicit user sign-off.

Diagnostic signature of a scraper fleet: `uniq(session_id) ≈ count()` (1.0
views/session), no mobile devices, ancient or preset UA strings.

## Cost Tracking

Pricing in `src/lib/model-pricing.ts`:

| Service | Rate | Tracked In |
|---------|------|-----------|
| Kimi K2.5 (chat) | $0.0006/1K input, $0.0025/1K output | `ai_usage` |
| Kimi K2 (search parser) | $0.0006/1K input, $0.0025/1K output | `ai_usage` |
| Cohere Embed v4 | $0.001/1K tokens | `api_calls` (service=embedding) |
| Lambda (ratings scraper) | Estimated from invocation count | `api_calls` (service=lambda) |
| Tavily (web search/extract) | $0.008/credit (free tier: $0, 1000 credits/month) | `api_calls` (service=tavily, quota_cost=credits) |

Unified view: `getUnifiedCostBreakdown(range)` in `queries/costs.ts` aggregates all five services.

## Query Functions

`src/lib/analytics/queries/` -- 14 query files for the admin dashboard:

| File | Key Functions |
|------|--------------|
| `costs.ts` | `getUnifiedCostBreakdown()` -- 5-service aggregation with daily breakdown |
| `embedding.ts` | `getEmbeddingUsageOverview()`, `getDailyEmbeddingUsage()`, `getEmbeddingByType()` |
| `ai.ts` | AI chat usage, token consumption, tool frequency |
| `content.ts` | User action summary, per-action-type breakdown |
| `traffic.ts` | Page views, sessions, bounce rates |
| `lambda.ts` | Lambda invocation counts, estimated costs |

## Adding Tracking to a New Component

1. Add `"use client"` if not already
2. `import { useAnalytics } from "@/hooks/use-analytics"`
3. Destructure the relevant method (or use `trackAction` for custom events)
4. Call inside the existing event handler -- after the UI action, before any navigation
5. If you need a new `ActionType`, add it to `src/lib/analytics/types.ts`

## Adding a New Server-Side Tracking Point

1. Import the appropriate `track*` function from `src/lib/analytics/track.ts`
2. Call without `await`, wrap in try-catch
3. If tracking a new service type, extend the `service` union in `TrackAPICallOptions`
4. Update the ClickHouse schema comment in `analytics/clickhouse/init/001-schema.sql`
