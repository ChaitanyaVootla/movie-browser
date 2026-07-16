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

## PRE-DEPLOY (infra, not code — from the security review)

- **CloudFront cache key for `/search.md` MUST include the `q` query string**, or the
  first query's result is served for all queries (wrong results + masks per-query cost).
  CF drops query strings by default — confirm the cache policy forwards `q` for `/api/md`
  / `.md` paths. See `cdn.md` (query-string cache-key handling).
- Confirm the `.md` rewrite response carries no `Set-Cookie` into the edge-cached body
  (the branch runs inside the `auth()` wrapper; existing CDN cookie-stripping should cover
  anonymous agents, but verify).
- `robots.txt` still disallows training crawlers; the `.md` layer is reachable by
  human-driven fetchers (ChatGPT-User, OAI-SearchBot, Claude WebFetch) + anything not shed
  on `.md`. Widening `robots.txt` is a separate decision.

See also: `cdn.md` (edge cache, query-string keys), `performance.md` (ISR/route-handler
caching), `search-system.md` (`hybridQuickSearchLexical` vs the embedding tiers).
