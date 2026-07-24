# SEO & Visibility Plan — 2026-07-25 (overnight autonomous run)

Goal: real search visibility fast — $200/mo infra is not defensible at ~0 Google
traffic. Inputs: deep web research (Google Search Central + 2026 core-update
analyses + live SERP inspection) and a full codebase/live-HTML audit (both
Jul 24-25, agents `seo-research` / `seo-audit`; findings preserved here).
Operational context: Google is in crawl-recovery after the June outage streak +
Jun 28–Jul 1 domain NXDOMAIN (see `.claude/rules/seo-search-console.md`);
sitemaps resubmitted Jul 24 via `scripts/gsc.sh`; Bing already indexes 14.4k
pages and feeds DDG/Yahoo/Ecosia AND ChatGPT search (~87% of ChatGPT citations
come from Bing top results).

## Strategic frame (from research — what 2026 rewards)

- The 2026 core updates explicitly demoted aggregator/reskin pages and rewarded
  sites with NATIVE data (UGC, first-party signals). A TMDB-reskin page cannot
  rank; a page with native reviews/discussion/AI-insights/stats can.
- Crawl budget is quality-gated: Google samples; thin samples → less crawling.
  5xx/429 to Googlebot = direct back-off signal (we are recovering from one).
- Recovery ETA after clean serving: ~2–6 weeks. Nothing accelerates it except
  uptime + links; "Request indexing" only for ~10 key URLs (no API).
- Google Indexing API is NOT usable (jobs/livestreams only; 2025 crackdown).
  IndexNow works for Bing only (22% of Bing-clicked URLs originate from it).
- FAQ rich results are DEAD (deprecated May 2026) — never build FAQPage.
- AggregateRating: ONLY ratings collected on our own site may be marked up.
  Marking up scraped IMDb/RT numbers = manual-action-grade violation. (TMDB
  votes currently emitted — see decision B below.)
- DiscussionForumPosting is live + has its own GSC report; ONLY mark up pages
  with ≥1 real published post (full text, author, datePublished). AI (Cue)
  posts must carry digitalSourceType if seeding is re-enabled.
- Niche gap confirmed: tracker/stats league (Trakt 73% direct, Simkl/Serializd
  SEO-negligible) is won via "alternatives" listicles + AlternativeTo, not SERPs.
  Episode-discussion long tail is winnable where Reddit is thin (older /
  international / anime series) but ONLY with ≥1 real comment on the page.

## TONIGHT (executed autonomously — status updated in place)

1. ✅ Adult-performer purge from SEO surfaces (shipped + backfilled: 121,918
   persons flagged; sitemap/noindex/.md-404 live; nightly sync keeps current).
2. ✅ Canonical leak fix (commit 2fe5a26): root-layout `alternates` removed,
   home self-canonical, explicit canonicals added to /discussions + /privacy +
   /terms + /content-policy (all other indexable routes already had their own).
   Curl-verified: /discussions + home canonicals correct; /lists//search no
   longer inherit the homepage canonical.
3. ✅ /discussions hub de-orphan (commit e3b8559): footer Discover link,
   `/discussions` sitemap static entry (daily lastmod), server-rendered
   back-links from movie + series per-title discussions pages.
4. ✅ Footer 404 links (commit 4f40f78): Movies/TV Shows → buildBrowseUrl
   movie/tv. Curl-verified: zero `/movie`|`/series` hrefs in rendered home.
5. ✅ Double-brand titles (commit 1c55c06): fixed 9 pages (/discussions,
   /lists, /ratings, /library, /watched, /diary, /stats, /settings,
   /settings/import). Verified `<title>Discussions - Movie Browser</title>`.
6. ✅ Dead WebSite SearchAction (commit 59f0652) → `/search?q={term}`
   (verified /search reads `q`). Curl-verified in home JSON-LD.
7. ✅ Description upgrades (commit 9078b99): topic pages (143-155 chars,
   verified live), person no-bio fallback ("is an actor known for X, Y and Z"
   via DEPARTMENT_TO_JOB + filmography tail), per-title discussions pages,
   /browse (153 chars) + /discussions hub (152 chars).
8. ✅ Trailer VideoObject (commit 7b67b76): undated trailers skipped; object
   omitted entirely when no trailer has `published_at`.
9. ✅ BreadcrumbList on /browse, /topics, /topics/[topic] + ItemList (20
   titles already server-rendered) on topic pages (commit 1624018).
   Curl-verified on /topics/genre-action-movie. ISR flags intact post-build
   (/ static, /discussions 5m, /topics/[topic] 30m, movie/series/person SSG).
10. Verification: typecheck + lint + local prod build + live curl of fixed
    routes post-deploy (edge cache lags ~1h — fresh-curl or wait).
11. ✅ Force sitemap regen post-backfill + resubmit via `scripts/gsc.sh`
    (done Jul 24 ~19:10 UTC: regen 52s, adult performers verified gone from
    sitemap_persons.xml, persons/movies/index resubmitted → 204. Discovered:
    the generator ALREADY pings IndexNow on regen — 3,580 URLs pushed to Bing;
    the "IndexNow on content change" backlog item is only about intra-day
    events, the nightly baseline exists).

## NEEDS HUMAN (accounts/outreach — the actual authority levers)

- **Show HN launch** (angles: AI-maintained movie tracker; free stats that
  Letterboxd/Trakt paywall; `.md` twins for AI agents). Highest single-event
  link ROI. Needs an HN account with history.
- **Directory sweep** (one afternoon, permanent links): AlternativeTo (list as
  Letterboxd/Trakt/TVTime alternative — also an acquisition channel),
  Crunchbase, Wellfound, Product Hunt, StartupStash, SaaSHub.
- **Listicle outreach**: pitch inclusion in existing "Best Trakt alternatives"
  articles (they already rank for the migration queries).
- **Journalist-request stack** (~1h/week): Featured.com (HARO relaunch),
  Source of Sources, Qwoted — answer entertainment/streaming queries citing
  our data (see linkable assets below).
- **GSC Request-indexing clicks** for ~10 key URLs (no API): home, /browse,
  /topics, /discussions, top titles.
- **Reddit**: authentic participation only; mention volume correlates with
  ChatGPT citations (heavy-Reddit domains ~7 vs 1.8 citations) but self-promo
  gets punished by mods AND Google.

## NEXT CODE ITERATIONS (designed, not built — do after tonight's deploy)

- **Tiered sitemaps** (research action #2): tier-1 = differentiated titles only
  (AI insights present / ≥1 review or comment / high popularity, ~5–15k URLs)
  in separate files so GSC shows per-tier indexed ratios; widen as ratios prove
  out. Deliberately NOT done tonight: sitemaps were resubmitted Jul 24 and
  churning file structure mid-recovery muddies the signal; revisit ~Aug 7 with
  `gsc.sh sitemaps` data.
- **Crawlable pagination** on /browse + topics (audit decision A): server-render
  `?page=N` with real prev/next anchors, capped depth (CPU: 2-vCPU box), or
  more static hub surfaces (year/decade/language topic keys). Decide cost
  tradeoff first.
- **IndexNow pings on content change** (hydration refresh / new review or
  comment / new enrichment) — Bing+ChatGPT-search freshness for near-zero cost.
- **Deterministic "About" paragraph** on sparse detail pages from PG facts
  (genres/runtime/providers/collection; no AI) — anti-thin-content (audit D).
  Needs a template-design pass to avoid 800k-page duplicate text.
- **Linkable data assets** (research #7): auto-generated report pages from
  ClickHouse + catalog ("most disagreed-on films: IMDb vs RT vs audience",
  "how fast releases hit streaming 2026", "most-binged shows"). Journalists
  link data, not tools. Design pass first (they must be excellent).
- **Per-title /discussions sitemap entries** where published comments > 0;
  public profiles/lists sitemap inclusion (defer until recovery stabilizes).
- **DiscussionForumPosting gating**: verify markup only renders with ≥1
  published comment (audit flagged empty-shell risk).
- **Regional watch long-tail**: "where to watch X in {country}" — competitors
  are US-centric; our audience is global (US + SEA). Needs page-design decision
  (audit A interacts).

## DECISIONS TAKEN (record)

- **B (AggregateRating source)**: keep TMDB vote markup for now (native
  user_ratings volume is too thin — 2–9 logged-in users/day would strip stars
  from ~every page). Revisit at volume. NEVER emit scraped IMDb/RT as
  AggregateRating. llms.txt: keep (harmless, agent-useful) but invest nothing —
  Google/OpenAI don't read it for AI search.
- Empty-thread indexing: discussion pages stay indexable only via internal
  links (not sitemap) until they have comments; JSON-LD gated on real posts.

## Success metrics (check via `scripts/gsc.sh` + Bing WMT)

- GSC: sitemap "indexed" counts > 0 and climbing week-over-week; crawl stats
  host status green; impressions trend (query dimension = date).
- Bing: indexed 14.4k → 20k+; "Content quality" flag count falling after the
  adult purge + description upgrades.
- North star: organic clicks/day (both engines) and signups/day.
