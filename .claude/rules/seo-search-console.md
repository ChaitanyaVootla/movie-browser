# SEO & Search Console (programmatic access + the Google-vs-Bing history)

How to observe and fix search indexing autonomously. Established 2026-07-24
after diagnosing why Google sent ~0 traffic while Bing sent thousands of
clicks.

## Programmatic Search Console access — `scripts/gsc.sh`

- **Auth**: GCP service account `tmbservice@tmbprod.iam.gserviceaccount.com`
  (project `tmbprod`), added as a **Full user** on the domain property
  `sc-domain:themoviebrowser.com`. Key file: **`gcp_service.json` at the repo
  root — GITIGNORED, local-only, never commit, never copy to the box.** If the
  key is missing, ask the user (they hold the GCP console).
- **Helper**: `scripts/gsc.sh` (bash + openssl + python3, no npm deps):
  `sites` · `sitemaps` · `submit-sitemap <url>` · `inspect <page-url>` ·
  `query '<searchanalytics-json>'` · `token`. Property + endpoints are
  hardcoded to the domain property.
- **What the API can do**: list/submit/delete sitemaps (with real
  fetch/indexed counts), URL Inspection (index status, robots state, last
  crawl, canonical, referring URLs), Search Analytics (clicks/impressions by
  query/page/country/device — up to 25k rows/day, 16 months history).
- **What it CANNOT do**: the "Request indexing" button (no public API — the
  separate Indexing API only accepts JobPosting/BroadcastEvent), property
  settings, users. Those are manual UI clicks.
- **GSC UI gotcha**: a child sitemap showing red **"Couldn't fetch" with a
  blank "Last read" is the PENDING state**, not a failure — the API shows it
  as `isPending: true, errors: 0`. Don't panic-resubmit; check the API first.

## Bing Webmaster Tools

No API key wired yet (Bing has one — worth adding if we automate there).
Bing is fed by sitemaps + **IndexNow** (already implemented since the Jun 10
SEO rollout; `generate-sitemap.js` pings recently-updated URLs on every
nightly regen — e.g. 3,580 URLs on the Jul 24 run); IndexNow also feeds
Yandex/Seznam/Naver. **Google does NOT
consume IndexNow** — Google discovery = sitemaps + links only.
Downstream of Bing's index: DuckDuckGo, Yahoo, Ecosia — fixing Bing fixes
them all. Brave has an independent index with NO submission console. Apple
(Applebot, allowed in robots.txt) powers Siri/Spotlight — no console.

## History: why Google was at ~zero while Bing thrived (Jul 2026 diagnosis)

- Bing (Jul 24): 14.4K pages indexed, ~11.8K clicks/3mo. Google: 72
  impressions/3mo. Config was NOT the problem — robots.txt allows Googlebot,
  sitemaps valid, all 200s.
- Root cause: Google's first-impression crawls hit the June outage streak
  (Jun 10–21 disk-full/5xx incidents) and then the **domain expiry NXDOMAIN
  Jun 28–Jul 1** → host-level crawl back-off; GSC sitemap state stuck at a
  Jun-15 "Couldn't fetch" until manual resubmission (done Jul 24; series +
  static fetched same-day, homepage re-crawled Jul 24, verdict PASS).
- Recovery levers, in order: uptime stability (keep it boring), resubmitted
  sitemaps, Request-indexing the top ~10 pages (manual), **inbound links**
  (Bing's own top recommendation; the real gap for a 100k-URL zero-authority
  catalog — most of it will sit "Discovered, not indexed" on both engines
  until authority grows).
- **Domain auto-renew must stay ON** (Squarespace; expiry 2027-06-28). A
  second NXDOMAIN event would reset all of this recovery.

## Site-quality gotchas (found during the same diagnosis)

- **ADULT CONTENT IS NOINDEX EVERYWHERE — the single most important site-quality
  rule here.** TMDB popularity ranks adult titles/performers absurdly high, and
  the catalog holds ~115k adult movies. Two incidents: the persons sitemap led
  with adult-film performers (Bing flagged 879 URLs "Content quality"), and when
  Google finally started sending traffic (Jul 2026, ~147 clicks/day) it was almost
  ENTIRELY adult long-tail queries landing on adult titles (top page:
  `/movie/58713/scooby-doo-a-xxx-parody`). Left alone that gets the whole domain
  classified adult-oriented and SafeSearch-filtered, capping the mainstream product.
  The decision is: adult pages keep WORKING for direct visitors, they just leave
  search indexes. Current coverage (persons Jul 24-25, movies + series Jul 29):
  - `adult` persisted on `persons` / `movies` / `series` (all `@default(false)`;
    written by hydration from TMDB, plus the person-page write-back,
    sync-popularity, and `backfill-person-adult.ts`).
  - `generateMetadata` emits `robots: { index: false, follow: false }` on adult
    movie / series / person pages — **including every branch of the two catch-all
    routes** (`/discussions` for both, `/discuss/sXeY` for series). Derive `adult`
    from a row the function ALREADY fetches so no dynamic API sneaks in and ISR
    survives.
  - `generate-sitemap.js` gates all three queries (`WHERE adult = false` /
    `IS NOT TRUE`).
  - The `.md` twin layer 404s adult movies/series/persons (`api/md/route.ts`), and
    `queryPopular` in `src/lib/llm/data.ts` filters `adult: false` for
    `/browse.md` + `/topics/*.md`.
  **Never add a title- or person-shaped SEO surface without the adult filter.**
  What IS already safe: every TMDB call passes `include_adult: "false"` explicitly
  (`services/tmdb.ts` search/discover, `lib/discover.ts` `DEFAULT_DISCOVER_PARAMS`),
  so `/browse` + `/topics/*` — both TMDB-discover-backed — never list adult titles.
  Still-open holes (audited Jul 29 2026, left as product decisions): the **pgvector**
  leg of "Similar titles" (`smartDiscover` → `semantic-search.ts`) has NO adult
  filter, so an indexable detail page can link to an adult title; and none of the
  PG search paths filter it either (`fts-search.ts`, `fuzzy-search.ts`,
  `autocomplete.ts` → on-site search + `/search.md`). Each is a one-condition SQL
  add, but it changes recommendation/search behaviour — decide deliberately.
- Audience is **GLOBAL** (US #1, then SE Asia; IN ≈ 4% of real sessions) —
  do not IN-first any SEO/content/share decision. (Corrected in the roadmap
  spec 2026-07-24 — the old "IN-heavy" line was wrong.)
- `sitemap_movies.xml` is one 6MB/50k-URL file — valid (limits: 50MB/50k) but
  if Google is slow to fetch it, consider smaller chunks (the generator
  already supports chunking).
- Meta descriptions: Bing flags many as too short — open item.
- AI answer engines: `OAI-SearchBot` + `ChatGPT-User` allowed (ChatGPT search
  can cite us); `PerplexityBot` currently BLOCKED in robots.txt (cost-era
  decision — reconsider now that the `.md` layer + CDN absorb crawl cost);
  ClaudeBot/GPTBot training crawlers stay blocked (see cdn.md + robots.txt).

## Monitoring recipe (do this when asked about SEO health)

1. `scripts/gsc.sh sitemaps` — all fetched? indexed counts moving?
2. `scripts/gsc.sh query '{"startDate":"<30d ago>","endDate":"<today>","dimensions":["date"]}'`
   — clicks/impressions trend.
3. `scripts/gsc.sh inspect <a-top-movie-url>` — spot-check coverageState.
4. Bing side: user checks Bing Webmaster UI (no API wired yet).
5. Cross-check real referral traffic in ClickHouse (`page_views.referer`
   LIKE '%google%' / '%bing%', is_bot=0, non-CloudFront UA).

See also: `.claude/rules/cdn.md` (robots.txt/edge behavior, bot shed),
`.claude/rules/performance.md` (crawler-load history), `public/robots.txt`
(tiered bot policy), `scripts/generate-sitemap.js` (quality gates, lastmod
policy, chunking).
