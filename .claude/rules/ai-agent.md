---
paths:
  - "src/server/ai/**/*.ts"
  - "src/hooks/use-chat-stream.ts"
  - "src/app/api/ai/chat/**"
---

# AI Agent (Cue)

## Architecture

LangGraph.js agent with MemorySaver checkpointer for multi-turn conversation persistence.

**Model**: Kimi K2.5 via AWS Bedrock (default) or OpenRouter (fallback). Knowledge cutoff: **June 2025**.

**Graph**: `agent` node -> conditional -> `tools` node -> loop back. Compiled with `MemorySaver` checkpointer. Recursion limit: 25.

**Key files**:
- `agent.ts` -- Graph definition, invokeAgent, per-invocation logging
- `prompts/system.ts` -- System prompt with tag format, tool guidance, knowledge cutoff, time/user/status awareness. Built per-request via `buildBasePrompt(isAuthenticated)` — guest prompts REMOVE the get_user_profile guidance (a guest call just burns a turn on an error; verified Kimi ignores a mere "guests can't" note unless the tool-selection section itself flips)
- `tools/` -- 12 consolidated tools (search, smart_discover, get_trending, get_details, get_person, get_upcoming, get_page_context, get_user_profile, get_community_buzz, navigate_to, web_search, web_extract)
- `chat-rate-limit.ts` -- in-memory per-IP (anon) / per-user (authed) sliding-window limits for `/api/ai/chat` (see below)
- `tools/tavily-client.ts` -- Shared Tavily API client with credit tracking, logging, and error handling
- `tools/user-profile.ts` -- Compact taste profile (top genres, recent watches, counts)
- `utils.ts` -- Shared helpers (getUserIdFromConfig, getUserContextFromConfig, getRegionFromConfig)
- `state.ts` -- LangGraph state annotation (PageContext, UserContext)
- `provider.ts` -- Bedrock/OpenRouter abstraction

## Checkpointer & Thread Lifecycle

- `MemorySaver` stores full state (messages + tool calls + tool results) per `thread_id`
- Frontend gets `threadId` from the first response's `done` event, sends it on subsequent turns
- With `threadId`: server only receives the new message, checkpointer restores full history
- Without `threadId`: server generates one, accepts optional `history[]` fallback
- `clearMessages()` in frontend resets `threadIdRef` -- next message starts a fresh thread
- State does NOT survive server restarts (acceptable for short-lived chat sessions)

## Per-Invocation Isolation

Each API call gets a unique `invocationId` (UUID) scoped in a `Map<string, InvocationContext>`. This isolates logging state (turn counts, token usage, tool timing) across concurrent requests. Cleaned up after each invocation completes.

- `invocationId` = per-request, for logging/metrics (ephemeral)
- `thread_id` = per-conversation, for checkpointer state (survives across turns)

## Context Passed to Agent

**UserContext** (built server-side, injected into state + configurable):
- `name` -- from NextAuth session
- `region` -- from `x-country-code` header (default "US")
- `currentTime` -- ISO timestamp
- `timezone` -- IANA timezone from client (e.g. "Asia/Kolkata"), used for accurate local time formatting

**PageContext** (sent from frontend):
- `path`, `mediaType`, `itemId`, `itemTitle` -- always sent
- `genres`, `rating`, `year`, `status` -- sent when on a detail page (from media context store)
- `get_page_context` tool also fetches user status (watched/watchlisted/rated) for the current item

**Tool configurable** (via `toolNodeWithContext`):
- `userId`, `pageContext`, `userContext`, `invocationId` -- all tools can access these

## Tool Rules

- **smart_discover** is the primary discovery tool -- handles filters, semantic search, similar-to, and user library in one call
- **get_user_profile** -- compact taste profile for open-ended recs ("what should I watch?"). Returns top genres, recent watches with timestamps, `currentlyWatching` (series + S#E# position via `getProgressShelf`), counts. Logged-in only; the guest prompt variant suppresses it.
- **get_community_buzz** -- site-native reception: rating histogram (`getRatingHistogram`), public reviews (`getPublicReviews` — anon tier ONLY: PUBLISHED + public + spoilerScope NONE), published comment counts. Strips `[[entity]]`/`[spoiler]` tokens before handing bodies to the LLM. Preferred over web_search for "what do people think of X". NEVER widen it past the anon-safe tier (spoiler-gate invariant).
- **get_page_context** -- returns media metadata AND user status (watched, watchlisted, rating) for the current item; has per-route hints for watchlist/library/diary/stats/discussions/profiles/topics/search pages
- **web_search** / **web_extract** -- Tavily-powered live web tools. TMDB-first: agent exhausts TMDB tools before reaching for web search. Web search only for current events, box office, awards, reviews, post-June-2025 info.
- Tool descriptions must include "Use when" / "Don't use when" guidance
- Tools receive `userId`, `pageContext`, and `userContext` via `config.configurable` (injected by `toolNodeWithContext`)
- Use `getUserIdFromConfig()`, `getUserContextFromConfig()`, `getRegionFromConfig()` from `utils.ts` (get_details also uses the config region — do NOT reintroduce `getCountryCode()`/`headers()` into tools)
- All name-based parameters (genres, cast, keywords, providers) are resolved to IDs internally
- `navigate_to` is for explicit navigation requests only, not for showing info about a title. Destinations: movie/series/person (+`movie_discussions`/`series_discussions`) by id, `search` (query), `topic` (key), `profile` (username), and the static pages (home/browse/topics/discussions/watchlist/diary/stats/library/lists/ratings/watched/notifications/settings). Path building lives ONLY in `buildNavigationPath()` (navigation.ts) — `extractNavigation` in agent.ts consumes it; don't duplicate path logic.
- `smart_discover` `watchRegion` auto-defaults to the user's actual region from `userContext`

## Rate Limiting & Guest Access (Jul 2026)

`/api/ai/chat` is open to anonymous users BY DESIGN (guests get the full agent), but every
invocation costs real Bedrock tokens (~18-28k input tokens ≈ $0.01-0.02) and possibly Tavily
credits. Protections:
- **Server-side sliding windows** (`chat-rate-limit.ts`, unit-tested): anon 15/10min + 60/day
  per IP; authed 40/10min + 300/day per user. Returns 429 with a friendly message; the client
  hook surfaces it and (for anon) opens the sign-in dialog. In-memory (single PM2 process).
- The client `ANON_MESSAGE_LIMIT` (10, `use-chat-stream.ts`) is a UX nudge only — the server
  limit is the actual cost bound (the old client-only 3-message limit was trivially bypassable
  with direct POSTs).
- Request body is Zod-validated (message ≤4k chars, history ≤40 msgs, threadId uuid).

## Web Search Credit Budget

- **1,000 credits/month** (Tavily free tier, no rollover)
- Basic search: 1 credit, advanced search: 2 credits
- Basic extract: 1 credit per 5 URLs
- Expected usage: ~70-140 credits/month (well within budget)
- Credit usage tracked in ClickHouse (`api_calls` with `service='tavily'`, `quota_cost` = credits)

## System Prompt

- Knowledge cutoff (June 2025) is stated explicitly -- agent uses tools for anything after
- **TMDB-first decision tree** -- explicit guidance to prefer TMDB tools (free, fast) over web search (costs credits)
- Region from user context drives streaming/upcoming defaults (auto-defaulted, not hardcoded US)
- **User status awareness** -- agent acknowledges watched/rated/watchlisted items
- **Time-aware recs** -- late night, weekend, seasonal guidance based on client timezone
- **Multi-turn patterns** -- refining queries, back-references, action limits (can't modify user data)
- **Error recovery** -- what to do when results are empty
- Tag format: `[MOVIE:id:title|desc]`, `[SERIES:id:title|desc]`, `[RATINGS:movie:id]`, etc.
- Web tags: `[SOURCE:url|title]` (citation pills with favicons), `[WEB_IMAGE:url|description]` (image cards with captions)
- Agent surfaces 2-4 best sources and 0-2 most relevant images per web search response
- IDs from tools: use exactly. IDs from knowledge: skip with `::` format + year hint
- Authenticated users get `hideWatched`, `hideDisliked`, `fromWatchlist`, `get_user_profile`
- `maxTokens: 1536` -- budget for text + multiple media tags + interactive tags

## Cost Tracking

Every agent invocation tracks token usage and cost to ClickHouse (`ai_usage` table):

- Per-turn token counts (input/output) accumulated in `InvocationContext`
- Final cost calculated via `calculateCost()` from `model-pricing.ts`
- Sent to ClickHouse via `trackAIUsage()` with `queryType: 'chat'`
- Pricing: Kimi K2.5 on Bedrock -- $0.60/1M input, $3.00/1M output (output corrected Jul 2026; was logged as $2.50/1M)

## Model Choice (reviewed Jul 2026 — keep Kimi K2.5 on Bedrock)

Kimi K2.5 stays the best fit: the persona/tone is the product differentiator, it's on Bedrock
in ap-south-1 (instance-profile IAM, no key management), tool calling works, and it's cheap
(~$0.01-0.02/invocation at 18-28k input tokens). As of Jul 2026: **K2.6 and K3 are NOT on
Bedrock** (K2.6 = OpenRouter/Moonshot only; K3 released 2026-07-16 at $3/$15 per 1M — 5x cost,
reasoning-heavy overkill for 1-2 sentence chat). Bedrock alternatives if cost ever matters:
GLM 4.7 ($0.60/$2.20), MiniMax M2.1 ($0.30/$1.20), GLM 4.7 Flash ($0.07/$0.40) — all would
need a tone A/B via the existing `BEDROCK_MODEL_ID` env var (+ a `model-pricing.ts` entry)
before switching. Re-check "K2.6/K3 on Bedrock" before any future model revisit.

## Testing (`yarn test:ai`)

- `scripts/test-ai-agent.ts` forces `USER_DATA_SOURCE=postgres` (the app is PG-only since GA).
  Without it, importing the agent graph pulls `lib/auth.ts` down the Mongo-adapter branch and
  tsx dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` from `@auth/mongodb-adapter` (its package has
  no `exports` main). For the same reason `user-data.ts` and `auth.ts` lazy-`require` their
  Mongo implementations — do not reintroduce eager imports of `mongo/user-queries` or
  `@auth/mongodb-adapter` anywhere in the agent's import graph (goes away with Post-GA cleanup step 2).
- Point `DATABASE_URL` at the local dev DB (`...localhost:5436/moviebrowser`, seeded via
  `seed-social-demo.ts`) to exercise get_community_buzz / get_user_profile with real rows.
- System-prompt gotcha: Kimi parrots few-shot examples nearly verbatim and follows the LAST
  relevant instruction — prompt example phrases show up in production replies, and a guest
  restriction stated once early gets ignored if a later section still recommends the tool.

Tavily web search/extract calls tracked separately in `api_calls` table:
- `service: 'tavily'`, `endpoint: '/search'` or `'/extract'`
- `quota_cost` = credits consumed (1 for basic search, 2 for advanced, ceil(urls/5) for extract)
- Cost estimated via `estimateTavilyCost()` in `model-pricing.ts` ($0.008/credit on paid tier)

The unified cost dashboard (`/admin` -> Costs tab) aggregates agent costs alongside embeddings, LLM parsing, Lambda, and Tavily.

## Adding/Modifying Tools

1. Create tool in `tools/` using `tool()` from `@langchain/core/tools` with Zod schema
2. Write a thorough description with "Use when" / "Don't use when" / parameter guidance
3. Add to `allTools` array in `tools/index.ts`
4. Update system prompt's tool selection guide in `prompts/system.ts`
5. If tool needs user context, use `getUserIdFromConfig()`, `getUserContextFromConfig()`, or `getRegionFromConfig()` from `utils.ts`
