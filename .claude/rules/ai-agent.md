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
- `agent.ts` -- Graph definition, invokeAgent/streamAgent, per-invocation logging
- `prompts/system.ts` -- System prompt with tag format, tool guidance, knowledge cutoff
- `tools/` -- 10 consolidated tools (search, smart_discover, get_trending, get_details, get_person, get_upcoming, get_page_context, navigate_to, web_search, web_extract)
- `tools/tavily-client.ts` -- Shared Tavily API client with credit tracking, logging, and error handling
- `utils.ts` -- Shared helpers (getUserIdFromConfig)
- `state.ts` -- LangGraph state annotation
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

## Tool Rules

- **smart_discover** is the primary discovery tool -- handles filters, semantic search, similar-to, and user library in one call
- **web_search** / **web_extract** -- Tavily-powered live web tools. TMDB-first: agent exhausts TMDB tools before reaching for web search. Web search only for current events, box office, awards, reviews, post-June-2025 info.
- Tool descriptions must include "Use when" / "Don't use when" guidance
- Tools receive `userId` and `pageContext` via `config.configurable` (injected by `toolNodeWithContext`)
- All name-based parameters (genres, cast, keywords, providers) are resolved to IDs internally
- `get_user_data` was removed -- use `smart_discover({ fromWatchlist: true })` instead
- `navigate_to` is for explicit navigation requests only, not for showing info about a title

## Web Search Credit Budget

- **1,000 credits/month** (Tavily free tier, no rollover)
- Basic search: 1 credit, advanced search: 2 credits
- Basic extract: 1 credit per 5 URLs
- Expected usage: ~70-140 credits/month (well within budget)
- Credit usage tracked in ClickHouse (`api_calls` with `service='tavily'`, `quota_cost` = credits)

## System Prompt

- Knowledge cutoff (June 2025) is stated explicitly -- agent uses tools for anything after
- **TMDB-first decision tree** -- explicit guidance to prefer TMDB tools (free, fast) over web search (costs credits)
- Region from user context drives streaming/upcoming defaults (not hardcoded US)
- Tag format: `[MOVIE:id:title|desc]`, `[SERIES:id:title|desc]`, `[RATINGS:movie:id]`, etc.
- Web tags: `[SOURCE:url|title]` (citation pills with favicons), `[WEB_IMAGE:url|description]` (image cards with captions)
- Agent surfaces 2-4 best sources and 0-2 most relevant images per web search response
- IDs from tools: use exactly. IDs from knowledge: skip with `::` format + year hint
- Authenticated users get `hideWatched`, `hideDisliked`, `fromWatchlist` flags
- `maxTokens: 1536` -- budget for text + multiple media tags + interactive tags

## Cost Tracking

Every agent invocation tracks token usage and cost to ClickHouse (`ai_usage` table):

- Per-turn token counts (input/output) accumulated in `InvocationContext`
- Final cost calculated via `calculateCost()` from `model-pricing.ts`
- Sent to ClickHouse via `trackAIUsage()` with `queryType: 'chat'`
- Pricing: Kimi K2.5 -- $0.0006/1K input, $0.0025/1K output

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
5. If tool needs user context, read from `config?.configurable?.userId` / `pageContext`
