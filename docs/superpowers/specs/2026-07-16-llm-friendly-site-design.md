# LLM-Friendly Site: `llms.txt` + `.md` pages + agent search

**Date:** 2026-07-16
**Status:** Approved (design), implementation in progress
**Branch:** `next` (feature work)

## Goal

Make the site consumable by AI agents (Claude WebFetch, ChatGPT/OAI-SearchBot,
Perplexity, etc.) via three additions:

1. A static `/llms.txt` index (llmstxt.org format).
2. Clean **markdown** twins of pages at a `.md` URL suffix
   (`/movie/123/slug.md`, `/series/123/slug.md`, `/person/123/slug.md`,
   `/browse.md`, `/topics/<key>.md`, home + static pages).
3. An agent search endpoint `GET /search.md?q=...` returning a ranked markdown
   list linking to `.md` pages.

This is **also a cost lever**: today AI crawlers that reach HTML trigger a React
SSR render + a puppeteer ratings-scrape Lambda per unique URL (the documented
Jul-2 reason ClaudeBot/GPTBot were blocked — `public/robots.txt`,
`.claude/rules/cdn.md`). A `.md` twin that is **read-only from Postgres** (no
SSR, no hydration, no TMDB, no enrichment, no Lambda) and edge-cacheable is
dramatically cheaper to serve.

## Non-goals

- No `llms-full.txt` (the ~800k catalog cannot be embedded).
- No `Accept: text/markdown` content negotiation. We serve markdown ONLY at the
  distinct `.md` URL — this keeps CloudFront cache keys clean (no `Vary: Accept`,
  which `.claude/rules/cdn.md` flags as a footgun). (The proxy's existing
  `Accept: text/markdown` handling is addressed below but we do not rely on it.)
- No new crawler invitation in `robots.txt` in this change. The `.md` layer
  serves whoever fetches it (subject to the cost-safe shed policy below); a
  separate follow-up may revisit `robots.txt` allowances.

## HARD INVARIANTS (must not break)

1. **COST-SAFETY / NO-TRIGGER.** Markdown generation reads **only** from
   Postgres via read-only getters. If the row is not already in PG → return
   `404` (or a minimal stub). NEVER call hydration, TMDB, enrichment, the
   ratings/Google Lambda, or open the SSE stream from any `.md` path. This is the
   whole reason the feature is a cost win, not a repeat of the ClaudeBot bill.
2. **NO ISR DISK CACHE GROWTH.** `.md` is served by a **route handler** with
   `Cache-Control: s-maxage` (CloudFront edge cache), NOT an ISR page. This
   avoids adding to the `.next` ISR/​image disk-cache pressure that caused prior
   outages (`.claude/rules/performance.md`).
3. **PROXY MUST NOT 429 `.md`.** `src/proxy.ts:223` currently 429s any request
   with `Accept: text/markdown`, and `BLOCKED_BOT_TYPES` 429s
   ClaudeBot/GPTBot/etc. `.md`/`llms.txt`/`/search.md` paths must be EXEMPT from
   the shed (served, cheap + cacheable) — the "steer good agents to cheap .md"
   decision. HTML routes keep shedding unchanged.
4. **RESOLVER MUST NOT MANGLE `.md`.** The media-resolver
   (`src/server/proxy/media-resolver.ts`) 308-canonicalizes `/movie|series/{id}/...`
   and would otherwise strip or 404 a `.md` tail. `.md` handling happens in the
   proxy **before** the media-resolver block and short-circuits it.
5. **TYPE SAFETY.** No `any`; `catch (e: unknown)` + guards; Zod at the route
   boundary (`.claude/rules/type-safety.md`).

## Architecture

```
Request  /movie/123/inception.md
  │
  ▼  src/proxy.ts  (runs on the .md path)
  ├─ isMarkdownRequest(pathname)? ─ yes ─┐
  │                                      │  (BYPASS scraper shed; do NOT run media-resolver)
  │                                      ▼
  │                          NextResponse.rewrite → /api/md?p=/movie/123/inception
  ▼
src/app/api/md/route.ts  (GET, runtime=nodejs)
  ├─ Zod-parse ?p (+ ?q for search)
  ├─ parseLlmPath(p) → { kind: "movie"|"series"|"person"|"browse"|"topic"|"home"|"static"|"search", ... }
  ├─ read-only PG getter(s)  ──────────────► src/lib/llm/data.ts
  ├─ build markdown  ──────────────────────► src/lib/llm/markdown/*
  └─ new NextResponse(md, { "Content-Type": "text/markdown; charset=utf-8",
                            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
                            "X-Robots-Tag": "noindex" })   // .md twin is noindex; canonical HTML is indexed
```

`/search.md?q=` → proxy rewrites to `/api/md?p=/search&q=<q>`.
`/llms.txt` → **static** `public/llms.txt`, excluded from the proxy matcher.

### New module: `src/lib/llm/`

This module is the **interface contract** other files code against. Agents
building the route handler may rely on these exact signatures.

**`src/lib/llm/paths.ts`** — pure, no I/O:
```ts
export type LlmTarget =
  | { kind: "movie" | "series" | "person"; id: number }
  | { kind: "browse" }
  | { kind: "topic"; topicKey: string }
  | { kind: "home" }
  | { kind: "static"; slug: string }          // privacy | terms | content-policy | about
  | { kind: "search" };
/** Parse the ORIGINAL path (no `.md`, no query) into a target, or null if unsupported. */
export function parseLlmPath(path: string): LlmTarget | null;
/** True if a request pathname is a markdown request the proxy should hijack. */
export function isMarkdownRequest(pathname: string): boolean; // endsWith ".md" OR pathname === "/search.md"
/** Strip ".md" and map "/search.md" → "/search". Returns the internal `p`. */
export function markdownPathToTarget(pathname: string): string;
```

**`src/lib/llm/data.ts`** — read-only PG getters (NO triggers). Re-exports the
existing safe getters and adds the person one:
```ts
export { getMovieFromPostgres } from "@/server/db/postgres/movies";   // movies.ts:163
export { getSeriesFromPostgres } from "@/server/db/postgres/series";  // series.ts:176
export { getAIData } from "@/server/services/ai-data-service";        // :241
/** NET-NEW: read-only person over prisma.person (+ credits relation). PG-only, no TMDB. */
export async function getPersonFromPostgres(personId: number): Promise<LlmPerson | null>;
/** PG-native popular lists for browse/topic pages (NOT the TMDB discover() path). */
export async function getPopularForTopic(topicKey: string, limit: number): Promise<LlmCardItem[]>;
export async function getPopularBrowse(limit: number): Promise<LlmCardItem[]>;
```
- `getPersonFromPostgres` uses `prisma.person` (fields per `schema.prisma` — at
  minimum name, biography if present, profile_path, popularity, known-for /
  `credits` relation for a filmography list). PG-only; if the person row is
  absent → `null` (→ 404). Do NOT fall back to TMDB.
- Topic/browse lists use PG-native `getPopularMoviesFromPostgres` /
  `getPopularSeriesFromPostgres` (`movies.ts:628`, `series.ts:685`) or
  `smart-discover.ts`, filtered by the topic's genre/country/language from
  `getTopicByKey` (`src/lib/topics`). Accept that these are PG-native and won't
  byte-match the TMDB-discover HTML lists — fine for agents.

**`src/lib/llm/markdown/`** — pure builders, one file per kind, `index.ts`
dispatches. Each takes already-fetched data and returns a `string`:
```ts
movieToMarkdown(movie, aiData): string
seriesToMarkdown(series, aiData): string
personToMarkdown(person): string
listToMarkdown(title, description, items): string   // browse + topic
searchToMarkdown(query, results): string
staticToMarkdown(slug): string
homeToMarkdown(): string
```
Markdown conventions: leading `# Title (Year)`, a one-line blockquote summary,
`## Overview`, `## Details` (genres, runtime, release, language, ratings as a
list), `## Cast` (top ~10 name — character), `## Where to watch` (India +
provider names), `## AI insights` (hook, mood, themes, best-for — spoiler-FREE
only; NEVER emit spoiler-content AI fields), and a trailing canonical-URL line
`[View on The Movie Browser](https://themoviebrowser.com/movie/123/slug)`.
Every linked title in list/search output uses its `.md` URL
(`getMediaPath(...) + ".md"`).

### Route handler: `src/app/api/md/route.ts`
- `export const runtime = "nodejs";`
- Zod: `{ p: string (starts with "/"), q?: string(≤200) }`.
- Dispatch on `parseLlmPath(p)`; fetch via `data.ts`; build via `markdown/`.
- `search` uses `hybridQuickSearchLexical(q, limit)` (`hybrid.ts`, STRICTLY pure-PG:
  FTS→trigram only). NOTE (corrected in review 2026-07-16): `hybridQuickSearch` is
  NOT safe here — for queries ≥5 chars with non-title intent it delegates to
  `hybridSearch`, whose intent classifier calls Cohere/Bedrock embeddings (paid) on
  cache miss. On this unauthenticated, shed-exempt endpoint that reopens the
  AI-crawler cost hole. Use the lexical helper only.
- 404 (markdown body) when the target row is absent. 400 on bad `p`/`q`.
  `catch (e: unknown)` → 500 with a short markdown error; log via Pino.
- Responses: `text/markdown; charset=utf-8`, `Cache-Control: public,
  s-maxage=86400, stale-while-revalidate=604800`, `X-Robots-Tag: noindex`.

### Proxy changes: `src/proxy.ts`
- Add `isMarkdownRequest(req.nextUrl.pathname)` check as the FIRST branch inside
  the `auth(...)` handler, BEFORE the shed and BEFORE the media-resolver block:
  - Bypass `isBlockedScraper` entirely for these paths.
  - `NextResponse.rewrite` to `/api/md?p=<markdownPathToTarget(pathname)>` (carry
    `?q` for `/search.md`). Track the page view (bot-visible) as today.
- Do NOT remove the existing `Accept: text/markdown` shed for non-`.md` HTML
  paths (a browserless client hitting HTML with that Accept is still a scraper).
- Matcher: add `llms.txt` to the negative-lookahead exclusion list (alongside
  `robots.txt|sitemap`) so the proxy never touches the static file.

### `public/llms.txt` (llmstxt.org format)
```
# The Movie Browser
> AI-first movie & TV discovery. Clean markdown for every title, person, and
> topic is available by appending `.md` to any page URL.

Movies, series, and people each have a markdown view at `<url>.md`
(e.g. https://themoviebrowser.com/movie/27205/inception.md).

## Discovery
- [Browse](https://themoviebrowser.com/browse.md): popular titles
- [Topics index](https://themoviebrowser.com/topics.md): genres, countries, languages, themes
- [Search](https://themoviebrowser.com/search.md?q=QUERY): ranked markdown results for any query

## Popular topics
- [Action movies](https://themoviebrowser.com/topics/genre-action-movie.md)
- ...(a curated handful of top topic keys)
```
Static, but its top link lists can be regenerated later by the sitemap job.

### Discovery links on HTML pages
Add to each detail page's `generateMetadata` (`movie`/`series`/`person`
`[...params]/page.tsx`) an `alternates` entry that renders
`<link rel="alternate" type="text/markdown" href="<canonical>.md">`. If Next's
metadata API can't express `type="text/markdown"` cleanly, emit it via
`alternates.types = { "text/markdown": "<canonical>.md" }`.

## Decomposition (parallel agents; disjoint file sets)

- **Agent A — core module** (`src/lib/llm/**`, new `getPersonFromPostgres` may
  live in `src/server/db/postgres/persons.ts` if that's the pattern): paths.ts,
  data.ts, markdown/*. No conflicts with others.
- **Agent B — proxy + llms.txt** (`src/proxy.ts`, `public/llms.txt`): shed
  bypass + rewrite + matcher; static file. Codes against `paths.ts` contract.
- **Agent C — route handler + discovery links** (`src/app/api/md/route.ts` new;
  `alternates` in the three detail `page.tsx`). Codes against the module
  contract above.

A/B/C touch disjoint files and all code against the fixed `src/lib/llm`
interface, so they can run concurrently. Integration owner runs typecheck + lint
+ a build with a bogus `DATABASE_URL`, then local verification under PM2
(`ecosystem.dev.config.cjs`, dev DB on :5436).

## Testing / verification

- Unit: `paths.ts` (parse/round-trip, `.md` detection, `/search.md`), and each
  markdown builder against a fixture (snapshot-ish assertions on headings +
  no-spoiler-leak). Vitest.
- Local e2e (per `.claude/rules/social-features.md` local recipe): PM2 dev server
  on :5436, then verify:
  - `curl -s http://localhost:3000/movie/<id>/<slug>.md` → `text/markdown`, real content.
  - `/search.md?q=nolan` → markdown list of `.md` links.
  - `/llms.txt` → served, not proxied/429'd.
  - Confirm NO hydration/enrichment/Lambda log lines fire on a `.md` hit (grep
    PM2 logs) — the cost-safety invariant.
  - A request with `Accept: text/markdown` to a `.md` path is NOT 429'd; the same
    Accept to an HTML path still is.
- Build must pass with a bogus `DATABASE_URL` (catches build-time prerender
  errors early, per `social-features.md` pre-deploy note).

## Risks / open decisions (decided)

- **Person PG data may be thin** (bio/filmography). Decision: build PG-only from
  whatever exists; person `.md` is lower priority and may be sparse. No TMDB
  fallback (cost-safety).
- **Topic/browse lists are PG-native**, not identical to the TMDB-discover HTML
  lists. Accepted.
- **robots.txt still disallows training crawlers.** The `.md` layer is reachable
  by human-driven fetchers (ChatGPT-User, OAI-SearchBot, Claude WebFetch) and by
  anything the proxy no longer sheds on `.md` paths. Widening `robots.txt` is a
  separate decision.
```
