# LLM-Friendly Layer (`.md` twins + `llms.txt` + agent search)

Serves AI agents (Claude WebFetch, ChatGPT/OAI-SearchBot, Perplexity, …) clean
markdown views of pages plus a discovery index. Built 2026-07-16. Full design:
`docs/superpowers/specs/2026-07-16-llm-friendly-site-design.md`.

## What it is

- **`/llms.txt`** — static `public/llms.txt` (llmstxt.org format): site overview +
  curated links to `/browse.md`, `/topics.md`, `/search.md?q=`, and popular topic
  `.md` keys. Excluded from the proxy matcher (alongside `robots.txt|sitemap`).
- **`.md` page twins** — append `.md` to any supported page URL to get clean
  markdown: `/movie/{id}/{slug}.md`, `/series/…`, `/person/…`, `/browse.md`,
  `/topics.md` (index), `/topics/{key}.md`, home, and static (`/privacy.md` etc.).
  Movie/series carry navigable + actionable links: cast/crew → person `.md`,
  `## Ratings` → external source URLs, `## Trailers` → YouTube, `## Where to
  watch` → provider deep links + JustWatch, `## Links` → TMDB/IMDb/site, plus
  Keywords + (movies) production companies + collection `/search.md?q=` link.
  Movie/series also emit an `## Images` section — poster + backdrop as embedded
  markdown images via the CDN (`image.themoviebrowser.com/{movie|series}/{id}/
  {poster|backdrop}.webp`), gated on the TMDB path existing; person pages emit a
  `## Photo` (TMDB profile, no person CDN scheme). Helpers: `imagesSection` /
  `personImageSection` in `markdown/shared.ts`. Beneficial for multimodal agents.
- **Pagination** — `/browse.md` and `/topics/{key}.md` take `?page=N` (Prev/Next
  nav; `page` is bounded ≤500 and PG-OFFSET based). The proxy forwards the whole
  original query string (`page`/`q`) to `/api/md`; CloudFront keys on both.
- **`/search.md?q=`** — ranked markdown result list linking to `.md` pages.
- **Discovery** — detail pages emit `<link rel="alternate" type="text/markdown">`
  via `generateMetadata` `alternates.types` (static string; does NOT break ISR).

## Organic data freshness (why no backfill is needed)

`.md` reads current PG, and PG fills/refreshes organically via the render path:
- **Movie/series**: the hydration pipeline persists TMDB→PG on every visit/
  revalidation (see `postgres-hydration.md`), so their `.md` stays fresh.
- **Person**: `getPerson` (`src/server/actions/person.ts`) now fire-and-forgets a
  PG upsert of bio/birthday/deathday/place_of_birth/gender on each person-page
  render (added 2026-07-16 — the `persons` detail columns were 100% NULL before;
  person pages read TMDB but never wrote back). So person `.md` fills in as pages
  are visited. Non-blocking, ISR-safe; popularity stays create-only (credit
  upserts own it). Long tail stays sparse until visited — a one-time TMDB backfill
  is the option for instant broad coverage (not built; organic deemed sufficient).

## How it routes

`src/proxy.ts` has a `.md` branch as the **FIRST** statement in the `auth()` handler
(before the scraper shed AND the media-resolver): `isMarkdownRequest(pathname)` →
`NextResponse.rewrite` to `/api/md?p=<markdownPathToTarget(pathname)>` (+ `q` for
`/search.md`). This short-circuits so the media-resolver never 308-strips the `.md`
suffix, and the request is EXEMPT from the scraper shed (the `Accept: text/markdown`
429 + `BLOCKED_BOT_TYPES` ClaudeBot/GPTBot 429 do NOT apply to `.md` paths — we WANT
good agents on the cheap path). HTML paths are unaffected (still shed).

`src/app/api/md/route.ts` (`runtime="nodejs"`) — Zod-validates `{p, q?}`, dispatches
`parseLlmPath(p)`, renders markdown, returns `text/markdown; charset=utf-8` with
`Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` + `X-Robots-Tag:
noindex` (200); 404s get `s-maxage=300`; 400/500 `no-store`. It's a **route handler
with Cache-Control (CloudFront edge cache), NOT an ISR page** — deliberately, to avoid
growing the `.next` ISR/image disk cache (prior outage cause; see `performance.md`).

## HARD INVARIANTS (do not break)

1. **COST-SAFETY / read-only PG only.** `src/lib/llm/data.ts` uses ONLY read-only
   getters (`getMovieFromPostgres`, `getSeriesFromPostgres`, `getAIData`,
   `getPersonFromPostgres`, `getPopularBrowse`, `getPopularForTopic`). A `.md` request
   NEVER triggers hydration/TMDB/enrichment/ratings-Lambda/SSE. Row absent → 404.
   This is the whole point: the `.md` layer is a cost *win* (cheap PG read, edge-cached)
   that lets us steer AI crawlers off expensive HTML SSR + ratings scrapes.
2. **`/search.md` MUST use `hybridQuickSearchLexical`, NOT `hybridQuickSearch`.**
   `hybridQuickSearch` looks pure-PG but for ≥5-char non-title queries delegates to
   `hybridSearch`, whose intent classifier calls **Cohere/Bedrock embeddings** (paid)
   on cache miss (+ possibly Kimi LLM). On this unauthenticated, shed-exempt endpoint
   that reopens the AI-crawler cost hole. `hybridQuickSearchLexical` (`hybrid.ts`) is
   strictly FTS→trigram, zero Bedrock. Regression tests pin this in `hybrid.test.ts`
   ("cost-safe .md search"). BOTH review agents caught the original leak — do not regress.
3. **No dynamic APIs in the discovery-link edits.** The `alternates.types` additions to
   `movie/series/person/[...params]/page.tsx` must stay static strings (no
   `auth()`/`headers()`) or they kill ISR on the HTML detail pages.
4. **Spoiler safety.** Markdown emits only spoiler-FREE AI fields (`insights.spoilerFree`,
   `hook`, `mood`); NEVER `spoilerContent` (`markdown/ai-insights.ts`).

## Files

- `src/lib/llm/paths.ts` — `parseLlmPath`, `isMarkdownRequest`, `markdownPathToTarget`, `LlmTarget`.
- `src/lib/llm/data.ts` — read-only PG getters (+ `getPersonFromPostgres`, `getPopular*`).
- `src/lib/llm/markdown/*` — pure builders (`movie`, `series`, `person`, `list`, `search`, `static`, `home`) + `index.ts` dispatcher; `ai-insights.ts` (spoiler-free only), `shared.ts`.
- `src/app/api/md/route.ts` — the handler. `src/proxy.ts` — the `.md` branch + matcher exclusion.
- `public/llms.txt`. Tests: `src/lib/llm/paths.test.ts`, `src/lib/llm/markdown/movie.test.ts`, `hybrid.test.ts` (cost-safety).

## Observed traffic + what is (and is NOT) tracked (measured Jul 30 2026)

- **Where to look: admin → Traffic tab → "Agents" panel.** Built Jul 30 2026.
  Queries: `src/lib/analytics/queries/llm-layer.ts` (`getLlmLayerOverview` / `Trend` /
  `Consumers` / `Targets`, predicates `LLM_LAYER_SQL` + `LLM_MD_SQL` pinned by
  `llm-layer.test.ts`); API `type=llm-layer` in `api/admin/analytics/route.ts` (LAZY,
  sequential — 4 range scans at once starves the 0.9-CPU ClickHouse); UI
  `components/features/admin/tabs/traffic/llm-panel.tsx`.
- **`.md` hits ARE tracked**: the proxy's `.md` branch calls `maybeTrackPageView(req)`
  before rewriting, so hits land in ClickHouse `analytics.page_views`. There is
  deliberately **no dedicated `page_type`** — `getPageTypeFromPath` knows nothing about
  the `.md` suffix, so `/person/123/x.md` records as `page_type='person'`. Keep it that
  way: it is exactly what lets the Agents panel break the layer down by content kind.
  Select the layer by PATH (`LLM_LAYER_SQL`), never by a new page_type.
- **`/llms.txt` IS now tracked** (was unobservable everywhere before Jul 30 2026 — the
  Caddyfile declares no `log` directive, and terraform configures no CloudFront access
  logging, so the proxy was the only possible observer). It was **removed from the proxy
  matcher's exclusion list** and given its own shed-exempt branch next to the `.md` one
  (track, then `NextResponse.next()` to the static file). Two things this depends on:
  the branch MUST stay above `scraperShedReason` (429ing an agent looking for the index
  is self-defeating), and its `Cache-Control` is deliberately `s-maxage=300` — the long
  24h TTL its neighbours get would hide nearly every fetch from the origin.
- **`llms.txt` discoverability**: referenced from `public/robots.txt` since Jul 30 2026
  (a comment block — there is no standardised robots directive for it, so nothing parses
  it; it is for humans and agents grepping robots.txt). Detail pages already advertise
  their own twin via `alternates.types`. The individual `.md` twins are deliberately NOT
  enumerated in any sitemap: they are `X-Robots-Tag: noindex` alternates of pages already
  in `sitemap.xml`, so listing ~600k of them buys crawl cost and zero index coverage.
- **Volume: the layer is being bulk-harvested.** ~15-20k `.md` hits/day (peak 42k Jul
  27), and `uniq(path) ≈ count()` — ~17k DISTINCT paths/day, i.e. **near-zero edge-cache
  reuse**, so nearly every hit is a CloudFront MISS → origin PG read. Mix over 7d:
  person 74k > movie 58k > series 15k (persons dominate).
- **Who actually consumes it** (7d to Jul 30 2026, grouped by raw UA — `bot_type` is too
  coarse to tell these apart, which is why the panel groups by user agent):
  | Consumer | UA `bot_type` | Requests | Note |
  |---|---|---|---|
  | `Claude-SearchBot/1.0` | `generic_bot` | ~24.5k | Anthropic answer engine. **NOT named in robots.txt** — that blocks `ClaudeBot`/`Claude-Web`/`anthropic-ai`, a different UA. Shed-exempt on `.md` anyway. The layer working as intended. |
  | `meta-webindexer/1.1` | `crawler` | ~8.9k over 4 UA variants | Meta. **Also not in robots.txt** — we block `meta-externalagent`, which is a DIFFERENT UA. |
  | Chrome/135, no client hints | `missing_client_hints` | ~5.3k | A real scraper. Would be 429'd on HTML; harvests `.md` shed-free. |
  | `OAI-SearchBot/1.4` | `generic_bot` | ~186 | OpenAI, explicitly allowed in robots.txt. |
  | `Amazon CloudFront` | (none) | ~108k | NOT a consumer — the pre-28-Jul unattributed aggregate. The panel badges it as such rather than hiding it. |
  **Correction worth remembering:** the `crawler`-labelled rows are Meta's indexer, NOT
  the anonymous datacenter fleet. Reading `bot_type` alone led to that wrong conclusion
  once; always group by `user_agent` when identifying a `.md` consumer.
- The shed exemption cuts both ways: a genuine scraper (`missing_client_hints`) harvests
  `.md` for free because the branch runs BEFORE `scraperShedReason`. That is the accepted
  trade (a `.md` hit is far cheaper than the HTML render it replaces), but it is also why
  per-path edge caching never warms.
- **Analytics caveat for any historical query:** before CloudFront forwarded the real UA
  (Jul 28 2026), ALL of this `.md` traffic logged `is_bot=0`. That is 15-20k/day of bot
  traffic counted as human in `page_views` from Jul 16-27 — corroborates the standing
  "`is_bot=0` ≠ human" rule (see the traffic memories + `cdn.md`).
- **FIXED Jul 30 2026 — HEAD on a `.md` URL used to return the HTML page.** The branch
  gated on `req.method === "GET"`, so `curl -I …/inception.md` fell through to the
  `/movie/[...params]` catch-all and answered `text/html` with the movie page's ISR
  `Cache-Control` — an agent that HEAD-probes content-type before fetching concluded no
  twin existed. The `.md` and `/llms.txt` branches now accept HEAD via `isReadMethod()`;
  everything below them stays GET-only, and `maybeTrackPageView` stays GET-only too, so a
  HEAD probe is served correctly but never counted as a page view. Next serves HEAD for a
  GET-only route handler by running GET and dropping the body, so `/api/md` needed no
  change. A/B verified locally (baseline `text/html` → fixed `text/markdown`).

## Testing the `.md` layer LOCALLY (two dev-only traps)

Both cost a debug cycle on Jul 30 2026; neither is a real bug.

1. **It cannot be exercised on a non-default port.** Next builds its internal absolute
   URLs on the :3000 default regardless of `-p` **and regardless of a matching `PORT` env
   (both were tested)**, so `req.nextUrl.origin` in `src/proxy.ts` reports
   `localhost:3000`. The `.md` branch rewrites via a cloned `nextUrl`, Next therefore
   treats it as CROSS-origin and tries to HTTP-proxy it → `500` with
   `Failed to proxy http://localhost:3000/api/md?p=… ECONNREFUSED`. `ecosystem.dev.config.cjs`
   runs on :3009, so **stop `mb-dev` and run `npx next dev --turbo -p 3000`** to test.
   Same family as the redirect-origin gotcha in `performance.md`. Prod sets `PORT` and is
   consistent.
2. **Even on :3000 the rewrite's query string is dropped in dev**, so `/api/md` answers
   `400 — p: expected string, received null`. Confirmed PRE-EXISTING by A/B against a
   stashed working tree, and prod serves real markdown, so do not chase it. To exercise
   the renderers, call the route directly: `/api/md?p=/browse`. What the `.md` URL still
   proves in dev is ROUTING: a `text/markdown` content-type means the branch fired
   (`text/html` means it did not).

## PRE-DEPLOY (infra, not code — from the security review)

- ~~**CloudFront cache key for `/search.md` MUST include the `q` query string**~~ —
  **VERIFIED CORRECT in prod Jul 30 2026**, no action needed. `?q=inception` vs
  `?q=godfather` return their own distinct results (repeatably), and `/browse.md?page=1`
  vs `?page=2` differ too, so the cache policy forwards `q` AND `page`. Re-test with the
  same two-value A/B if the cache policy is ever edited. See `cdn.md`.
- Confirm the `.md` rewrite response carries no `Set-Cookie` into the edge-cached body
  (the branch runs inside the `auth()` wrapper; existing CDN cookie-stripping should cover
  anonymous agents, but verify).
- `robots.txt` still disallows training crawlers; the `.md` layer is reachable by
  human-driven fetchers (ChatGPT-User, OAI-SearchBot, Claude WebFetch) + anything not shed
  on `.md`. Widening `robots.txt` is a separate decision.

See also: `cdn.md` (edge cache, query-string keys), `performance.md` (ISR/route-handler
caching), `search-system.md` (`hybridQuickSearchLexical` vs the embedding tiers).
