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

## The Traffic tab is a THREE-way audience split (Jul 30 2026) — read this first

`traffic-tab.tsx` composes five sub-panels (`components/features/admin/tabs/traffic/`):
**Audience** (default), **Abuse**, **Crawlers**, **Agents**, **Detail**. Abuse, Crawlers
and Agents are `enabled:`-gated in react-query so opening the tab does not pay for them.

**Agents** (added Jul 30 2026, `llm-panel.tsx` ← `queries/llm-layer.ts`, API
`type=llm-layer`) covers consumption of the LLM-friendly `.md` twins + `/llms.txt`. Two
conventions there are load-bearing and easy to undo by accident: it selects the layer by
PATH (`LLM_LAYER_SQL`), never by a new `page_type` — the twins deliberately keep their
underlying movie/person/series `page_type` so the layer can be broken down by content
kind — and its consumer table groups by **raw `user_agent`, not `bot_type`**, because
`bot_type` collapses a real answer-engine and an anonymous scraper into one label
(reading `bot_type` alone once produced a wrong attribution). Full context, including
the origin-observed/pre-28-Jul caveats printed on the panel:
`.claude/rules/llm-friendly.md`.

**Why the old Human-vs-Bot line became a lie.** Until Jul 28 2026 CloudFront did not
forward the viewer User-Agent, so ~94-95% of requests reached the origin as
`User-Agent: Amazon CloudFront` and `bot-filter.ts` force-classified them bot — the
"Human" line sat near zero. When UA forwarding shipped, the SAME crawl fleets started
arriving with **forged but genuine-looking Chrome UAs plus valid `sec-ch-ua` hints**,
and "Human" jumped from ~13-23k/day to 309k (Jul 28) then 560k (Jul 29) with no change
in real visitors. They also forge `Referer: google.com` and run on **residential
proxies** (VNPT-VN, Mexican/Venezuelan consumer ranges), so the datacenter-ASN label
catches ~450 rows/day out of 560k. **No per-request signal separates them from a
person.** Anything that tries is wrong.

The three buckets (`src/lib/analytics/audience.ts`, all query-time so they also
reclassify history):

| Bucket | Predicate | Notes |
|--------|-----------|-------|
| Verified crawlers | `VERIFIED_CRAWLER_SQL` — `is_bot=1 AND bot_type IN` search_engine ∪ social ∪ `chatgpt` | Derived from `getBotTypesByCategory()` in `bot-detection.ts` so it cannot drift. `bot_type` is UA-derived → a forged Googlebot lands here; the UI says so (reverse-DNS is out of scope). |
| Bots & suspected fleets | `KNOWN_BOT_NON_CRAWLER_SQL` OR in a behaviourally-flagged cohort | Includes the proxy's own shed labels (`SHED_BOT_TYPES`, mirrors `BLOCKED_BOT_TYPES` in `src/proxy.ts`). |
| Humans | the residue | Reported as a RANGE, never one number — see below. |

**Humans are a range, deliberately.** `confirmedHumanSessions` (authenticated OR has a
`user_actions` row) is a hard FLOOR — 73/day, 353/7d measured. `engagedHumanSessions`
(2+ views inside one 30-min-gap visit, or authed, or acted, AFTER fleet exclusion) is an
UPPER BOUND — ~11.8k/day, still fleet-contaminated. The truth is near the floor; Search
Console clicks (~147/day) are the external anchor. **Do not "simplify" this to a single
human number** — that is the bug the panel exists to fix, and the on-panel note explains
it so nobody has to remember.

## Behavioural fleet scoring — cohort level ONLY (`fleet-scoring.ts`)

Cohort key `(user_agent, country)`. Coarser (UA alone) merges fleets with real humans on
Chrome's reduced UA so the zero-engagement test never fires; finer fragments a fleet below
any usable volume gate. Every rule sits behind TWO gates — volume (≥300 views AND
≥25 views/hour) and **zero engagement** (0 authed views AND 0 acting sessions; one real
person in the cohort spares all of it). Then any of: `no_js`, `url_sweep`, `ip_rotation`,
`nav_hammer`, `enumeration`. Thresholds and their false-positive reasoning are documented
per-constant in `FLEET_THRESHOLDS`; `scoreCohort()` is a pure mirror of the generated SQL
and both are pinned by `fleet-scoring.test.ts`.

**The guard that must never be dropped:** ~50% of REAL sessions have exactly one page
view, so "1 view = bot" is not an acceptable filter. `ip_rotation` is the rule that comes
closest and it requires ≥20 sessions/HOUR in a single (UA, country) cohort — ~10x the
site's entire daily audience.

**PUBLISHED PER-SESSION PACING THRESHOLDS DO NOT TRANSFER TO THIS SCHEMA — measured
Jul 30 2026, do not re-adopt them.** Wikimedia's versioned classifier (≥800
pv/session, ≥30 pv/minute) and the literature's ">0.5 req/s sustained over ≥10
requests is impossible for humans" were each tested against 1,107 CONFIRMED human
sessions (authenticated or having performed a tracked action) over 30 days:

| Rule | Confirmed humans it would exclude |
|------|-----------------------------------|
| >0.5 req/s over ≥10 requests | 139 / 1,107 (12.6%) |
| ≥30 pageviews/minute | 151 / 1,107 (13.6%) |
| ≥800 pageviews/session | 3 / 1,107 (0.3%) |
| nav/footer-only with pv ≥ 10 | 5 / 1,107 (0.5%) |

The fastest confirmed HUMAN session ran at **17.7 requests/second**, 35x the
supposed impossibility floor. Cause: every one of those thresholds assumes a
cookie-scoped session, and our `session_id` is a hash of IP + UA + Accept-Language
(`session.ts`) that aggregates everyone behind a shared/NAT/CGNAT address and
persists for days. **Per-session rate measures IP sharing, not automation.** They
are surfaced with these FP rates in the abuse panel (`getSessionPacingFlags`) and
never applied.

Nor can it be fixed by conjoining zero-engagement: engagement is our ONLY ground
truth for "human", so any rule containing a zero-engagement term is unfalsifiable
against confirmed humans — safe by construction, unmeasurable in practice. Cohort
scoring escapes the trap because volume makes zero engagement itself decisive (no
actions across 80,000 sessions is not a coincidence; no actions in one session is
the norm).

**Deterministic rules that ARE safe to subtract (they live in `bot-filter.ts`, and
the bar is "no real browser can produce this"):**
- **`google.com/search?q=` in the referer.** Google has stripped the query from
  organic referers since Oct 2011, so a real result click carries the ORIGIN only.
  Verified: 2,355 sessions / 108 countries over 7 days, all replaying
  `?q=site%3Athemoviebrowser.com`, with zero authenticated and zero acting sessions.
  **But 2,353 of 2,355 were already `is_bot=1`, so its marginal effect is ~2 rows —
  it does NOT explain the post-Jul-28 human hump.** Related correction: the
  "~20x Search Console overshoot" does not survive measurement. Excluding these
  forged rows, plain `https://www.google.com/` referers in the human pool run ~202
  sessions/day against ~147 GSC clicks/day, i.e. ~1.4x and broadly consistent.
- **UA length outside 25–400 chars** (Wikimedia's published window). 13 views/24h.
- Both must be NULL-safe: `referer` is Nullable and a bare comparison makes the
  whole OR-chain NULL, dropping referer-less rows out of BOTH buckets. Use `ifNull`.

**`ip_rotation` is DESKTOP-ONLY.** Carrier CGNAT rotates a real phone's IP between
requests, which under an IP-hash session_id fragments genuine mobile humans into
many 1-view sessions — this rule's exact signature from real people. Measured cost
of the exemption: zero (all 24 cohorts it flags are desktop; 104 desktop vs 1
mobile cohort flagged overall).

**Country device mix is the one non-circular use of `device_type`.** Inside a
`(user_agent, country)` cohort the UA fixes the device, so it measures nothing;
across a whole country it is a real distribution with a published expected value.
Post-fleet-exclusion (24h, Jul 30): US 55.1% mobile (baseline 40.5%) and India
60.8% (65%) look like real consumer traffic; SG 5.1%, CO 3.8%, MX 5.0%, PK 4.9%,
AR 5.7%, BR 9.1%, ZA 1.6%, BD 11.1%, IQ 3.8% do not — i.e. the "likely human"
upper bound is still contaminated, concentrated in identifiable countries. A
0%-mobile observation against a 64% baseline at ≥100 sessions has binomial
probability ~10^-45. **Investigative only** — `device_type` is UA-derived and
excluding a country deletes the real users inside it.

**Presentation contract (do not regress to a single number).** Four tiers —
Verified human / Likely human / Likely automated / Verified bot — with the headline
as a RANGE `[verified, verified+likely]` (MRC §2.4 "decision rate"), exclusions
printed NEXT TO the human counts split declared-vs-heuristic (GA4 hides its
exclusions; showing the subtraction is the point), the 53–57% industry bot baseline
for context (Imperva 2026 / Cloudflare Radar Jun 2026), and an on-panel methodology
note carrying every threshold plus a last-changed date. **Structural caveat that
belongs in that note:** CloudFront edge HITs never reach the origin and humans
concentrate on cached popular pages, so this table is bot-enriched *by
construction* and any bot-share % computed from it overstates site-wide bot share.

### `analytics.errors` is fleet-contaminated too — group by user_agent before believing any count (Aug 2 2026)

The same residential-proxy fleet that inflates `page_views` also writes to
`analytics.errors`, because it executes JS and reaches `/api/analytics/ingest`
(the ASN/CIDR sheds only catch its datacenter-exit minority). Measured on a
7-day error sweep:

- **"Failed to load chunk /_next/static/chunks/*.js from module 964893"** — 1,365
  rows looked like a serious build-skew regression: continuous through Jul 31 and
  Aug 1, both days with **no deploy**, so the documented ~1h post-deploy skew
  window (cdn.md footgun 6) could not explain it. Grouping by `user_agent`
  settled it: **1,326 of 1,365 came from one UA** —
  `Chrome/145.0.0.0` macOS — spread over **1,260 sessions / 82 countries / 0
  authenticated**, i.e. the exact fleet signature from cdn.md. The tail even
  includes a Puppeteer device-emulation preset (`Pixel 2 Build/OPD3.170816.012`).
  `/browse` accounted for 280. Verdict: fleet noise, not a user-facing bug.
- Corollary for triage: **`sessions ≈ error_count` plus many countries plus zero
  authed = a fleet, not an outage.** Always add `GROUP BY user_agent` (and check
  `uniqExact(country)` / authed count) before escalating an error spike — the
  `errors` table has no `is_bot` filter applied by default and the raw counts read
  ~30x worse than reality.
- Genuinely real but tiny: **React #418** (hydration text mismatch,
  `args[]=text` with an empty second arg) at ~166 rows/7d, thinly spread across
  movie/series/person detail pages. Not chased to root cause. Prime suspects for
  a detail page rendered ONCE into the ISR cache and hydrated later in a
  different locale/timezone: the 126 bare `toLocaleString()`/`toLocaleDateString()`
  calls app-wide (server uses Node's default locale, client uses the browser's —
  `1,234` vs `1.234`), and time-dependent branches like
  `media-overview.tsx`'s `new Date(nextAirDate) > new Date()`. Only one bare
  `toLocale*` is in the detail-page component tree today
  (`episode-modal.tsx`, client-only), so the locale theory is unproven.

**Signals that are FLAGS ONLY — never subtract them from a human number:**
- **Session-level absence of a client web-vitals beacon.** Measured over 30 days on prod:
  only **31 of 88 authenticated (definitionally human) sessions** ever produced a
  `performance` row — a 65% false-negative rate (DNT, ad blockers, fast bounces).
  Usable ONLY as a cohort ratio (`maxJsBeaconShare = 0.02`, 17x below the human rate).
  `performance` rows are inserted regardless of `is_bot`, so the signal is not circular.
- **Forged `Referer: google.com`** — indistinguishable per row; only the aggregate
  overshoot vs Search Console is meaningful.
- **Uniform `device_type` in a cohort** — measures NOTHING here: the cohort key contains
  the exact UA, which determines `device_type`. Deliberately absent from the scorer.

**Rate thresholds dilute a burst over a long window** — the Jul 28-29 fleets flag 351k
views at 24h but only 184k at 30d. Hunt fleets at 24h/7d; the panel says so.

**Measured query cost (prod, read-only tunnel):** audience overview 0.4s/24h, 1.7s/7d,
4.2s/30d; sessionization 0.6s/24h, 1.8s/7d, 4.5s/30d (the two run in `Promise.all`);
trend 0.7s/24h, 1.8s/7d; abuse cohorts 0.55s/24h. One aggregate scan per panel; the only
window functions are the single visit-sessionization.

**ClickHouse gotcha that cost a debug cycle:** `NOT (user_agent, country) IN fleet` parses
as `not(user_agent, country)` → *"Number of arguments for function not doesn't match:
passed 2, should be 1"*. The tuple predicate MUST be parenthesised as a whole
(`IN_FLEET_SQL` in `queries/audience.ts`); `audience.test.ts` pins it.

**Admin UI gotcha:** the admin shell still wraps the dashboard in a hardcoded dark zinc
background, so a **translucent** semantic surface (`bg-muted/40`) composites against
BLACK even in light mode — it rendered the explanatory notes as dark grey blocks with
unreadable `text-muted-foreground`. Inside `/admin`, use OPAQUE surface tokens
(`bg-card`). Also give recharts `<YAxis>` a `width` + `tickFormatter={abbreviateNumber}`:
a negative `left` margin clips six-figure counts to `"00000"`.

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

## Visitor identity: `session_id` is NOT a user, and it INFLATES our counts (researched Aug 14 2026)

Durable findings from a design investigation. Recorded regardless of what we build,
because the measurement below invalidates how our "visitor"/"session" numbers read.

**THE MEASUREMENT (3 days, prod).** Views per `session_id`, by cohort:

| Cohort | Identities | Views | Views/identity |
|---|---|---|---|
| Fleet (`forged_referer`) | 3,794,346 | 4,565,089 | **1.20** |
| Authenticated human | 3 | 179 | **59.67** |
| Other | 570,258 | 1,455,951 | 2.55 |

A ~50× separation — but the important half is the **3.79M identities**. `session_id`
is `hash(IP + UA + Accept-Language)` (`session.ts`) with NO cookie and no round-trip
requirement, so a fleet rotating residential IPs **mints a free identity per IP**.
Our visitor/session counts are therefore not merely approximate, they are
STRUCTURALLY INFLATED, and any funnel/retention/conversion metric built on that
denominator inherits the inflation. (n=3 authenticated is a thin sample — treat
59.67 as directional; the fleet figure is solid.)

**Identity design decides whether bots INFLATE or merely POLLUTE.** Fresh identity
per request = one fleet becomes millions of "visitors" (catastrophic). Persistent
identity = one fleet becomes a few long-lived fake visitors you can quarantine by
cohort. Our current scheme is the worst case: inflation AND CGNAT merging of real
humans simultaneously.

**Our current scheme is legally WORSE than a cookie, not better.** An unsalted
IP+UA+lang hash persisting for days is a device fingerprint (WP29 Opinion 9/2014),
and EDPB Guidelines 2/2023 ¶55 holds that accessing IP addresses triggers Art 5(3)
ePD regardless of hashing. Same legal footing as a cookie, while being less honest
(merges CGNAT), less user-controllable (invisible, undeletable) and unable to answer
the questions. **Switching to a first-party cookie is a privacy IMPROVEMENT.** Do not
repeat the assumption that cookieless is automatically the privacy-safe choice.

**Cookieless CANNOT do multi-day retention — structural, not a tuning knob.**
Confirmed from vendor primary docs: Plausible — "There is no way to connect a
visitor's activity across sessions, across days or across devices" (same visitor on
5 days = 5 uniques); Fathom — 24-hour visitor-day, "A visitor who comes on Monday and
returns on Tuesday is counted as two separate visitors"; Matomo `config_id` —
"intentionally designed not to be permanent, not recognise returning visitors". The
salt is DESTROYED, so there is no key to join on and retention can never be
backfilled. Umami's **monthly** salt is a middle path (returning cohorts within the
window) but truncates at the rotation boundary AND still mints per-IP identities, so
it does not fix the inflation above.

**If we ever do it: server-minted, HMAC-signed, HttpOnly first-party cookie**, sessions
derived at query time from a 30-min inactivity gap. Non-obvious details:
- **Mint on the `/api/analytics/ingest` (`no-store`) response, NEVER on the HTML
  response.** Anon HTML is CDN-cached and `Set-Cookie` on a cacheable response is a
  cross-user identity leak (cdn.md footgun 2). The Cloudflare cache-response rule we
  ship strips `Set-Cookie` on cacheable paths and exempts `/api/*` — already shaped
  for this.
- **`HttpOnly` is load-bearing**: Safari ITP caps *script-written* persistent cookies
  to 7 days (24h after a decorated navigation); server-set HTTP cookies escape that.
- **Do NOT use localStorage/sessionStorage instead.** EDPB ¶44: Art 5(3) applies the
  moment the value "or any derivation" is accessed — identical legal exposure, plus
  Safari's 7-day script-writable purge. `sessionStorage` is also per-TAB, which
  inflates session counts.
- **Bounded individual-level retention is a SCHEMA decision up front.** ICO names
  indefinite row-level retention as the thing that voids the UK exemption.
- New free bot signal it unlocks: tag events with whether the cookie **round-tripped**
  (a real human's leave-flush carries it; a non-cookie scraper never echoes), and
  rate-limit/monitor **minting** — a chokepoint we do not have today.

**Consent landscape (documented, attributed — NOT legal advice).** UK has a LIVE
statutory analytics exemption (Data (Use and Access) Act 2025; ICO final guidance
29 Apr 2026) explicitly permitting user journeys, bounce rates and page-load speeds,
conditional on: clear information, a "simple and free" opt-out, no sharing, and
aggregation rather than indefinite individual-level retention. EU has no equivalent
statute; CNIL's audience-measurement exemption applies on conditions (single
publisher, no cross-checking, truncated last IP byte, 13-month tracker lifetime,
right to object). The Digital Omnibus Art 88a exemption is TABLED only — do not plan
around it. **Unsettled:** no regulator has ruled on whether a daily-salted IP+UA hash
is anonymous; vendors assert it, EDPB 2/2023 ¶55 + 01/2025 point the other way.
**DNT is dead** (Firefox removed the setting in v135) — add `Sec-GPC`; California
AB 566 makes browser opt-out signals mandatory from 1 Jan 2027.

**Do not benchmark our numbers against Plausible/Fathom/GA4.** Same metric names,
different definitions: Fathom's 24h session means a same-day return retroactively
undoes a bounce; Plausible's bounce rate moves as you add custom events (we fire 13+
action types).

## The Product tab: `HUMAN_SQL` is NOT a product-metric scope (built Aug 14 2026)

`tabs/product-tab.tsx` + `tabs/product/{engagement,titles,speed,product-stat}-panel.tsx`
← `queries/product.ts`, API `type=product&panel=engagement|titles|speed`. Phase 1 of
`docs/superpowers/specs/2026-08-14-admin-analytics-overhaul-design.md`: it renders data
already collected and never displayed — no new tracking, no schema change. Three panels,
each `enabled:`-gated (`titles` costs two full `page_views` range scans; measured ~0.9s
each at 7d, ~2.3s at 30d).

**The load-bearing finding, and the reason the module exists as its own file: `HUMAN_SQL`
is fine for counting TRAFFIC and useless for measuring PRODUCT USE.** It is a per-row UA
and referer predicate, and the current fleets forge both. Measured while building this
(30d, prod): the top titles by `HUMAN_SQL`-scoped views were empty per-episode discussion
shells — `Tagesschau S48E255` at **9,525 views with zero actions of any kind** — i.e. the
Aug 3 crawl surface, not content anyone watched. So every number on this tab is scoped to
the spec's **confirmed-human floor** instead (`confirmedHumanViewerSql` in `product.ts`:
`is_authenticated = 1 OR session_id IN <acted this window>`). Same floor the audience
panel already reports; deliberately NOT a new human definition. With it, the top titles
became real ones (`KATSEYE: WILD HEARTS`, `Spider-Man: Brand New Day`). 7d prod scope:
**179 confirmed sessions / 15,992 views** (30d: 1,034 / 61,345 — reconciles with the 1,099
confirmed-human sessions in the Aug 11 forged-referer work).

- **The floor is a FLOOR, and the panel says so on every surface.** Entering it requires a
  client-side interaction, which is what a fleet cannot fake per-session — but it also
  drops real people who only read. Never relabel it "visitors".
- **`user_actions` can only ever be filtered on `is_bot = 0`** — it has no `user_agent` or
  `referer` column, so pasting `HUMAN_SQL` in is a query-time unknown-identifier error, not
  a compile error. `product.test.ts` pins that it never appears there.
- **`performance` is fleet-contaminated by 3-4x and had never been scoped.** The live table
  has NO `is_bot` column (the schema file disagrees — no-migrations-era drift) and the fleet
  executes JS, so it posts web-vitals beacons. 30d prod, same table, same window:
  `movie` p75 LCP **11,309ms across 327,812 beacons** vs **3,301ms across the 382** from
  sessions that acted; `series` 10,025 → 2,891; `person` 11,221 → 2,267. It DOES carry
  `session_id`, so the floor applies — but not `is_authenticated`, hence
  `confirmedHumanViewerSql(range, false)`. The panel shows both columns because the
  all-beacons one is the only one with a stable sample size, and the gap is the reading.
- **Don't fold these queries together to save a scan — measured, it does not work.**
  ClickHouse INLINES CTEs rather than materializing them, so a `UNION ALL` over a shared
  expensive CTE re-evaluates it: the combined form cost **4.5s, identical to running the
  two queries separately**. Keep them separate and readable.
- **A conversion rate with no denominator returns `null`, never 0** (`conversionRate`).
  A title can carry actions with zero view rows: `page_views` is written at the ORIGIN, so
  a CloudFront edge HIT records no view while the action's client beacon still arrives. The
  rate is also not clamped to 100 — above 100% IS the signal that views are edge-hidden.
- Ranking is by ACTIONS, not views. Ranking by views answers "what did crawlers fetch".
- `getTopContent` in `queries/content.ts` is deliberately left alone (other callers, own
  contract) — it is `is_bot = 0` only, so it is NOT what this tab renders.
- Verification recipe that caught real issues: capture the SQL the module actually
  GENERATES (mock `../client`'s `query`), qualify the table names, and run it by hand on
  prod — then reconcile one row from raw events. Testing a hand-written prototype instead
  proves nothing about the shipped string. Note a rolling `now() - INTERVAL n DAY` window
  moves between runs (a 456-vs-455 mismatch was one action aging out, not a bug) — put both
  forms in ONE statement to compare them.
- Still Phase 1 only: no funnels, no identity/cookie, no retention, no journeys. The
  `ai_chat_open` 345 → `ai_chat_submit` 17 collapse is VISIBLE as two adjacent rows in the
  action summary, but stating it as a drop-off rate needs the Phase 3 identity — those two
  counts' sessions were never joined.

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
