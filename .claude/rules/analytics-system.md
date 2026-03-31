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
Server (track*.ts functions) -> direct insert -> ClickHouse
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
| `trackPageView()` | `page_views` | SSR page views |
| `trackError()` | `errors` | Application errors |

**Critical rule**: All tracking calls must be fire-and-forget -- no `await`, wrapped in try-catch. Analytics must never break the application.

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
