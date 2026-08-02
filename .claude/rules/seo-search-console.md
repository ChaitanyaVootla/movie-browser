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
  **THE `adult` FLAG ITSELF IS INCOMPLETE — the coverage gap is now the leak
  (Aug 2 2026).** Everything above keys off TMDB's `adult` boolean, and TMDB
  marks hardcore/"XXX" catalogue entries while MISSING the softcore/erotica long
  tail. When Google finally started sending traffic, the pages it actually ranked
  were the missed ones: `New Female Secretary` (popularity 7.5), `Leggings Mania`,
  `Madame Aema`, `Kissing My Sister` — all `adult = false`, all serving
  `index, follow`, against queries like "sex racecourse" / "american milf movie".
  Second signal: the TMDB **keyword** join (`scripts/backfill-adult-keywords.ts`,
  dry-run by default, `--revert` to undo). Setting `adult = true` needs no other
  code change — noindex, the sitemap gate, `notAdult()` and the `.md` 404s all
  read this one column — and it propagates on its own (ISR ~1h, CDN ~2h, sitemap
  on the nightly cron).
  - **Keyword choice is the entire design; adult-ADJACENT keywords are dominated
    by mainstream cinema.** Verified false positives, do NOT add:
    `prostitution`/`prostitute` (Taxi Driver, Poor Things), `sex comedy`
    (American Pie), `bdsm` (Fifty Shades), `erotic thriller` (Basic Instinct,
    The Handmaiden, Babygirl), `sexploitation` (The Human Centipede 2),
    `erotic movie` (Room in Rome, Below Her Mouth — arthouse),
    `pornography`/`porn industry` (documentaries ABOUT the industry), and the
    trap: plain **`hardcore` is hardcore PUNK MUSIC** (Downeast Hardcore, TERROR,
    gabber fanzines — 5-6 of its 7 titles are FPs). Only `softcore` (4,583) and
    `porn parody` (7) survived sampling. **Sample any new keyword at the top of
    the popularity range AND deep into it before trusting it.**
  - **Certifications are NOT usable**: `18+` (4,411) and `R18+` (2,891) are
    routinely given to violent mainstream films, and even `NC-17` (524) covers
    Requiem for a Dream / Shame. A cast-transitive signal (share of
    `persons.adult` in the credits) was measured and is WEAK — most leaking
    titles have zero adult-flagged cast.
  - **The commercial-footprint guard is what makes even `softcore` safe.** Of
    4,589 candidates exactly **14** report >$1M revenue or budget, and those 14
    are precisely the ones that must stay indexed — `Striptease` (1996, $113M,
    an outright FP), `Nymphomaniac` Vol. I/II, Russ Meyer (`Vixen!`,
    `Supervixens`), Tinto Brass, the 1974/2024 `Emmanuelle`. Porn catalogue
    entries essentially never carry a reported budget or revenue; theatrical
    releases do. Costs ~0.3% coverage, removes the whole embarrassing-mistake
    class. The script prints every title it spares rather than silently dropping.
  **Never add a title- or person-shaped SEO surface without the adult filter.**
  What IS already safe: every TMDB call passes `include_adult: "false"` explicitly
  (`services/tmdb.ts` search/discover, `lib/discover.ts` `DEFAULT_DISCOVER_PARAMS`),
  so `/browse` + `/topics/*` — both TMDB-discover-backed — never list adult titles.
  **LINK surfaces are covered too, since Jul 30 2026** — noindex alone only stops
  indexing; the internal links kept Googlebot spending its throttled crawl budget
  on the ~115k adult long tail instead of the mainstream catalog. Shared predicate
  `notAdult(alias)` (`src/server/db/postgres/adult-filter.ts`) is wired through
  EVERY raw-SQL discovery query: `fts-search.ts` (titles + people, prefix + full),
  `fuzzy-search.ts` (movie/series/person legs, `findExactMatch`,
  `getSpellingSuggestions`), `semantic-search.ts` (both `*ByEmbedding` + both
  `findSimilar*`), `smart-discover.ts` (the detail-page Similar module). Plus
  Prisma `where: { adult: false }` on `getCollectionFromPostgres` and the
  exported-but-unwired `getPopular*`/`search*InPostgres` helpers (list AND count,
  since popularity DESC surfaces adult first). Person filmographies drop adult
  credits via `isNonAdultCredit` in `src/types/client-props.ts`, applied **before
  the slice** or dropped credits silently eat slots — TMDB's person-credit
  endpoints accept no `include_adult`, and a filmography click is the likely route
  by which adult rows got hydrated into PG at all.
  `src/server/db/postgres/adult-filter.test.ts` (9 tests) pins the SQL text; a
  regression there is invisible to typecheck.
  **GOTCHA**: `notAdult()` is for `$queryRawUnsafe` string-built SQL ONLY — inside
  a `$queryRaw` TAGGED template an `${…}` becomes a bind PARAMETER, not SQL, so
  those queries must spell the predicate out inline.
  Still-open (deliberate): `/search.md` still returns adult titles, and the
  TMDB-sourced `/similar` + `/recommendations` endpoints accept no `include_adult`
  so they follow TMDB's own policy. The `include_adult` field on `DiscoverParams`
  is dead code (`toTMDBParams()` never reads it) — safe to delete someday.
- **`DiscussionForumPosting` — never mark up an empty thread (Jul 30 2026: 241
  invalid items, 0 valid).** Two GSC criticals, one root cause: the schema was
  built as `headline` + a nested `comment[]` with no content of its own, and was
  emitted even on threads with ZERO comments. Google models a thread as *the
  opening post IS the posting* (its own `text`, `author`, `datePublished`) with
  replies as `comment`. Fixed by the single helper
  `discussionForumPosting()` in `src/lib/seo/jsonld.ts` (used by all three
  surfaces — movie `/discussions`, series `/discussions`, per-episode
  `/discuss/sXeY`): it returns **null when there are no published roots** and the
  callers render no `<script>` at all. `datePublished` now comes from the opening
  post's `createdAt` — it was previously the movie release / episode air date,
  which is both frequently null (the "Missing field datePublished" error) and
  semantically wrong. Only ever pass the anon-visible tier (spoiler-gate
  invariant). 4 tests in `src/lib/seo/jsonld.test.ts` pin both rules — this bug
  class is invisible to typecheck. Per-episode pages are the highest-volume
  discussion surface, so empty episode shells were most of the 241.
- Audience is **GLOBAL** (US #1, then SE Asia; IN ≈ 4% of real sessions) —
  do not IN-first any SEO/content/share decision. (Corrected in the roadmap
  spec 2026-07-24 — the old "IN-heavy" line was wrong.)
- **Sitemaps are now chunked at 10k URLs, and the 50k single file was the reason
  Google never fetched it (resolved Aug 2 2026).** `sitemap_movies.xml` sat at
  EXACTLY the 50,000-URL protocol cap (6.1MB) with `isPending: true,
  lastDownloaded: NEVER` for 8 days across two submissions, while the smaller
  siblings (series/persons 25k, static 67) all fetched. Ruled out first: the file
  (200, well-formed `application/xml`, exactly 50,000 `<url>` elements, clean
  closing tag — fetched AS Googlebot and parsed) and host-level crawl back-off
  (the index re-fetched within minutes of a resubmit). After splitting to
  `SITEMAP_URLS_PER_FILE=10000`, **`sitemap_movies_2/_3` were fetched within
  minutes** and reported 10,000 URLs each. Don't sit on a protocol maximum.
- **TWO traps that came with chunking — both cost real debugging:**
  1. **Next enumerates `public/` at BOOT**, so any sitemap file the nightly cron
     creates with a NEW name 404s until the server restarts. Confirmed live: every
     `_2.._5` chunk served Next's 404 page while the pre-existing
     `sitemap_movies.xml` was fine; `pm2 reload next` fixed all at once. Left
     alone this is WORSE than the oversized file — the index would advertise 404s.
     `generate-sitemap.js` now snapshots filenames before writing and reloads Next
     only when a genuinely new one appears (no-op on the normal nightly run, since
     chunk counts are stable). If you ever move sitemap writing, keep this in mind
     or serve them from a route handler instead (no boot enumeration).
  2. **Sitemaps were NOT edge-cached.** The `next.config.mjs` public-dir
     Cache-Control rule names `robots.txt` but not `sitemap*.xml`, so they served
     `public, max-age=0` and every poll by Google/Bing/Yandex/Seznam/IndexNow was
     a full multi-MB origin transfer off the 2-vCPU box (`x-cache: Miss from
     cloudfront` on the 6.1MB file). Now `max-age=300, s-maxage=21600` — 6h, not
     the neighbours' 24h, because the generator rewrites them nightly.
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
