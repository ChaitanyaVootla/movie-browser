---
paths:
  - "src/lib/analytics/**/*.ts"
  - "src/hooks/use-analytics.ts"
  - "src/app/api/analytics/**/*.ts"
  - "src/app/api/admin/analytics/**/*.ts"
  - "src/components/features/admin/**/*.tsx"
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

## Query-time bot classification (admin traffic views — Jul 2026)

The admin analytics **Traffic** tab does NOT trust the frozen ingest-time `is_bot`
flag alone — it reclassifies bot-vs-human at QUERY time via
`src/lib/analytics/bot-filter.ts` (`BOT_SQL` / `HUMAN_SQL` ClickHouse fragments).
WHY: `is_bot` is computed once at ingest and misses cases found later — chiefly
`user_agent = 'Amazon CloudFront'` (behind CloudFront the origin never sees the real
UA, so CDN cache-miss origin-fetches land `is_bot=0` and were ~83% of "human" views,
Jul 2026). Query-time classification also reclassifies HISTORICAL rows with no
re-ingest. **To refine detection, edit the arrays in `bot-filter.ts`**
(`FORCE_BOT_UA_EXACT` / `FORCE_BOT_UA_SUBSTRINGS`) — this is the intended update
point; the "Top Bot User Agents" card surfaces what to add. `page_views` filters use
`HUMAN_SQL`/`BOT_SQL`; `user_actions`/`sessions` keep `is_bot=0` (no `user_agent`
column). Raw page views are still bot-inflated even so — use `engagedSessions` (2+
views OR authed OR any action) as the real-human proxy. Stealth UA-forging fleets are
behavioral (not per-row UA) and intentionally out of scope for `bot-filter.ts`.

## Residential-proxy fleets: what detection is actually buyable (researched Jul 30 2026)

The Jul 2026 fleets forge real Chrome UAs + client hints, execute JS, forge
`Referer: google.com`, and exit through RESIDENTIAL proxies (VNPT-VN, LatAm
consumer ISPs; ~11-23 req per IP across thousands of IPs). UA, ASN and IP
reputation all fail by construction. Verified vendor landscape, so nobody
re-researches this:

- **Nothing in a $20-50/mo band buys an offline residential-proxy database.**
  MaxMind's Anonymous IP DB (the ideal format, 3MB MMDB, has `is_residential_proxy`)
  is **quote-only enterprise** and its GeoLite2 free tier has NO anonymizer data.
  IPQS residential detection starts ~**$999/mo**. IPinfo's residential flag needs
  **Max $130/mo** (Core $41/mo gets VPN/proxy/hosting but NOT residential).
  Spur data feeds are enterprise add-ons. IP2Proxy commercial RES tiers (PX10+)
  are quote-only.
- **The two free things worth having:**
  1. **Spur Monocle — free tier = 100k session assessments/month.** Client-side JS
     that returns a per-SESSION residential-proxy/VPN verdict, validated
     server-side. Our abusers run JS, so it applies to them. Gate it to suspect
     cohorts to stay under quota. (Trade-off to weigh before adopting: it is a
     third-party script on our pages.)
  2. **IP2Proxy LITE** — the only free OFFLINE residential (`RES`) flag;
     bi-weekly refresh (vs exit churn in hours-days, so expect poor recall),
     attribution required. Load via `ip2proxy-nodejs`, or as a ClickHouse
     **`ip_trie` layout dictionary** for `dictGetString()` scoring — that dict
     trick is also how we could retro-score HISTORICAL `page_views` rows.
- **Wrong signals for this problem (don't bother):** AbuseIPDB (residential exits
  are shared consumer IPs with low report density → FP-prone), GreyNoise
  (classifies internet-wide scanners hitting their sensors, not targeted
  scrapers), Spamhaus/FireHOL/X4BNet (datacenter-side only — redundant with our
  `CloudFront-Viewer-ASN` check), Shodan/Censys (RESIP SDK exits expose nothing
  scannable), academic RESIP IP dumps (rot within days).
- **ASN classification cannot help**: CAIDA/Stanford ASdb/PeeringDB all correctly
  label VNPT-VN etc. as consumer ACCESS networks. The abuse is invisible at ASN
  granularity — by construction.
- **The highest-precision, zero-dependency option is our own data**: per-`(asn,
  country, hour)` cohort scoring — z-score on distinct-IP count plus the per-IP
  request ceiling (11-23 req/IP is itself the signature). Nobody sells this; it's
  one materialized view. **Cohort, never per-row** (see the 1-pageview-bounce
  caveat below).
- **Engineering constraint:** per-request HTTP reputation lookups are a non-starter
  on 2 vCPU (50-200ms each, plus outbound fetch churn — cf. the undici/arena
  history in performance.md). Offline MMDB/BIN lookups are microseconds
  (in-process, LRU-cached) — that or session-level (Monocle) only. Cache any
  API-sourced verdict per IP in PG with a TTL. CloudFront Functions cannot do
  network/DB lookups at all (only a 5MB KeyValueStore), so origin-side is the
  right layer; push only coarse cohort ban-lists to the edge.

## Libraries/algorithms for fleet detection — the verdict (researched Jul 30 2026)

**Every UA library and every blocklist is useless against a fleet sending genuine
Chrome UAs.** Don't re-evaluate these:
- `isbot` (Unlicense, ~1.3µs/call): keep, but ONLY for the inverse problem —
  identifying DECLARED good bots to exempt. Its own README says it "does not try
  to recognise malicious bots or programs disguising themselves as real users."
- `ua-parser-js` **v2 is AGPL-3.0** (v1 MIT but frozen; PRO from $14-599) — a
  landmine for a closed-source site. **We are clean: it is not in our dependency
  tree at all** (`device-parser.ts` is hand-rolled). Keep it that way.
- **FingerprintJS BotD: measured 47% detection on evasive bots** (arXiv:2406.07647)
  and maintenance-only; it inspects headless/automation artifacts that real
  non-headless Chrome simply doesn't have → returns `{bot:false}` for our fleet.
  Fingerprint Pro's residential-proxy signal is Enterprise-beta, and at our volume
  the bill is **~$4,000-8,000/mo**. Skip both.
- **CrowdSec** won't catch this fleet either: its `http-crawl-non_statics` scenario
  fires at ~40 requests in 20s **per IP**, and ours does 11-23 per IP. Its value
  would be as MIT plumbing (a decision bus fed from our own detections + the
  `rdns`/`seo-bots-whitelist` hub collections, optionally enforcing at CloudFront
  via `cs-aws-waf-bouncer`). Community blocklists are datacenter-oriented.
- Bad-bot blocklists / IAB Spiders&Bots ($5-15k/yr): declared-UA lists. Skip.
- **What privacy analytics actually do** (we are not behind the state of the art —
  there barely is one): Umami = one `isbot()` line; Ackee = a 4-word regex;
  Plausible/Fathom = UA lists + datacenter IPs (which residential proxies bypass);
  GoatCounter = the richest, adding `navigator.webdriver` client checks. **Nobody
  does real behavioral filtering.** Everyone leans on "bots don't run JS" — which
  our fleet falsifies.

**Two novel signals we can build from data we ALREADY have (highest ROI, not yet
implemented — next iteration):**
1. **Embedding dispersion.** The most-validated camouflage-proof feature family is
   semantic/topical incoherence of a session's page sequence (Lagopoulos et al.,
   F≈0.92; semantic features dominated ranking). We already store Cohere
   embeddings per title — cosine dispersion across a session's visited titles is
   a near-free port. Humans browse topically coherent sets; catalog crawlers walk
   incoherent long tail.
2. **Popularity mismatch.** Humans hit titles roughly ∝ Zipf popularity; catalog
   crawlers sample the long tail uniformly. We store `popularity` in PG.
Plus **honeypots** (robots.txt-disallowed secret paths + CSS-hidden links) as free
ground-truth labels — high precision, low recall; guard against Next's own
prefetch reaching a trap, and require ≥2 trap signals before acting. This is
exactly how Cloudflare caught Perplexity's stealth fleet (secret domains with
restrictive robots.txt) — a method we can copy for $0.

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
| `traffic.ts` | Page views, visits, bounce rate, geo/device, bot sources |
| `lambda.ts` | Lambda invocation counts, estimated costs |

### The `sessions` table is EMPTY — derive visit metrics from `page_views`

`analytics.sessions` has never had a row: `trackSessionStart` / `trackSessionEnd`
exist in `track.ts` but **nothing calls them**. Any query against that table
returns NULL, which is exactly why the admin "Session Metrics" card showed a
permanent "—" for Avg Duration and Bounce Rate until July 2026. Compute both from
`page_views` instead — `buildVisitMetricsSql()` in `queries/traffic.ts`.

Two things that query has to get right, and neither is optional:

1. **Sessionize on a 30-minute inactivity gap** (`VISIT_GAP_SECONDS`). `session_id`
   is a fingerprint hash of IP + UA + Accept-Language (`session.ts`), NOT a
   per-visit cookie, so one id recurs for days. `max(timestamp) - min(timestamp)`
   per id measured an 11-hour "average session" with a 6.5-day maximum on real
   prod data. The `lagInFrame` + running-`sum` pair splits the rows into visits.
2. **Scope to `HUMAN_SQL` always**, even when the dashboard's "Human only" toggle
   is off. Bot visit durations are meaningless, and the single CloudFront
   origin-fetch pseudo-session carries ~24k views/day — it would both swamp the
   mean and make the window functions scan millions of rows. (7d cost as scoped:
   ~1.5s for a 30-day range.)

**Bot-count gotcha (same card, same fix):** a metric that must be counted across
ALL traffic cannot live in a query whose WHERE already narrowed the rows. The old
overview did `countIf(BOT_SQL)` inside `WHERE … AND HUMAN_SQL`, so "Bot Traffic"
read 0 views whenever "Human only" was on. Scope such totals with `countIf(...)`
per column, not a shared WHERE.

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

## Verifying admin analytics against PROD data (read-only recipe)

To see the dashboard with real numbers you need an SSH tunnel to the prod
ClickHouse **and** `ENABLE_DEV_ANALYTICS=true` (without it `getConfig()` returns
null in dev and every query no-ops). **That flag also re-enables INSERTS**, so a
local dev server pointed at the tunnel writes `page_views` / `performance` /
`errors` rows into production analytics as you click around. Admin-authenticated
page views are skipped (`shouldSkipForAdmin`), but anonymous ones and the other
tables are not — confirmed live: a local session tried to insert `page_views` and
`performance` rows within seconds of boot.

Put a **write-blocking HTTP proxy between the dev server and the tunnel** (reject
any request whose `query` param or body matches
`INSERT|ALTER|DROP|CREATE|TRUNCATE|DELETE|UPDATE|...`, forward the rest) and point
`CLICKHOUSE_PORT` at it. ~30 lines of `node:http`; it turns "probably read-only"
into "cannot write". For an admin session without Google OAuth, `ADMIN_EMAILS`
overrides the whitelist, and a session cookie can be minted locally with
`encode()` from `next-auth/jwt` using `AUTH_SECRET` and salt
`authjs.session-token` (`role: "admin"` in the token — the role comes from the JWT,
not the DB). The test-auth route was NOT usable here: `process.env.ENABLE_TEST_AUTH`
read as unset inside the route despite being in the PM2 env.

## Admin chart colors: `--viz-*`, never `--chart-*`

Every admin chart mark resolves its color through `useChartColors()`
(`components/features/admin/analytics-charts.tsx`), which reads the
**accent-independent `--viz-1…6`** categorical palette (light + dark steps in
`globals.css`; rules in DESIGN.md → Colors → Data viz palette).

- **Do NOT use `--chart-1…5` for charts.** Every `.accent-*` class rewrites those
  five variables into five shades of ONE hue at dark-tuned lightness, so under any
  non-default accent a pie/multi-line chart collapses into indistinguishable bands,
  and on a light card the values (up to L 0.92 for golden) are effectively invisible.
- **Do NOT hardcode a color.** The pre-July-2026 charts used literal
  `oklch(0.9 0 0)` strokes (a near-white line that vanished on a light card) — that
  was the whole "charts unreadable in light mode" bug.
- **`oklch(var(--popover))` is invalid CSS** — those variables already hold a
  complete `oklch(...)` value, so `contentStyle` tooltips built that way silently
  fell back to recharts' white default (unreadable in dark mode). Use the shared
  `<ChartTooltip>` (semantic Tailwind classes) via recharts' `content` prop.
- Axis ticks need an explicit `fill` from the resolved token; a `className` on a
  recharts axis does not reliably reach the tick `<text>`.
- **Known remaining gap:** the admin *shell* primitives (`PremiumCard`,
  `CompactStat` in `analytics-shared.tsx`, plus `analytics-dashboard.tsx`,
  `client.tsx`, `inspect-tab.tsx`, …) still hardcode `bg-zinc-900/40` /
  `text-zinc-*`, ~200 occurrences. The chart cards are semantic shadcn `Card`s, so
  in light mode you get white chart cards next to dark zinc stat tiles. De-zincing
  the admin shell (or deciding /admin is deliberately dark-only) is a separate task.
