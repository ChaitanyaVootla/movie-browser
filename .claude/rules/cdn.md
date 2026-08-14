---
paths:
  - "terraform/cloudfront*.tf"
  - "terraform/cloudfront-*.js"
  - "Caddyfile"
  - "public/robots.txt"
  - "next.config.mjs"
---

# CDN (CloudFront in front of the origin)

CloudFront fronts the apex since Jun 11 2026. WHY it exists: the 2-vCPU origin
cannot absorb the crawler herd on a cold cache — a deploy/restart cold-invalidates
the in-memory ISR tier, the bot fleet sweeps the 800k-title long tail, hundreds of
concurrent renders → multi-GB RSS → kernel OOM freeze. CloudFront edge-caches
anon HTML, collapses the herd (Origin Shield), and serves stale during origin
freezes. Net: an origin freeze is now invisible to users (apex stayed 200 through
every freeze the night of cutover).

## Topology (as-built)
- Distro `E12R1ZNQNG3LK5` / `d1vtxoi7slst5n.cloudfront.net`, aliases apex + www.
- Origin = `origin.themoviebrowser.com` (Route53 A → EIP). **Caddy serves it as a
  2nd vhost** — the apex block is `themoviebrowser.com, origin.themoviebrowser.com { }`.
  Since Jul 28 2026 the origin-request policy is `allViewerAndWhitelistCloudFront`:
  ALL viewer headers (User-Agent, sec-ch-ua, and viewer Host included) reach the
  origin. Host: apex → same Caddy block (verified 200); Host: www → canonical 301;
  TLS/SNI unaffected (CloudFront connects by origin domain). This ended the
  `User-Agent: Amazon CloudFront` blindness — origin shed + analytics now see the
  real UA for CDN-relayed traffic. INVARIANT that makes this safe: every origin
  429 (proxy.ts shed + Caddy @heavybots) carries `Cache-Control: private,
  no-store`, because UA is NOT in the edge cache key — a cacheable 429 would
  poison the URL for all users. Never remove those headers.
- Origin Shield ap-south-1 (Mumbai) — collapses multi-POP cold-URL misses to ~1
  origin render. ~$3/mo, mandatory for the herd.
- ACM cert (us-east-1, REQUIRED region for CloudFront) = `themoviebrowser.com` +
  `*.themoviebrowser.com`. The old wildcard-only cert did NOT cover the apex.
- TF: `terraform/cloudfront.tf`, `providers.tf` (us_east_1 alias),
  `cloudfront-cookie-normalize.js` (viewer-request function).
- `api.themoviebrowser.com` (distro `E156DU7JYCYHU`) is RESERVED for a future API
  product — do NOT repurpose. `image.themoviebrowser.com` (`E300L33VF15D5T`) is the
  LIVE image CDN — do NOT touch. `E1R5Q2TAZ1SR2W` (Nuxt S3, no alias) is a dead
  orphan, safe to delete.

## The footguns (every one cost a CF redeploy ~5–15min to fix; all are live-fixed)
1. **RSC client-nav**: cache key MUST include BOTH the `_rsc` query param AND
   the `rsc` header (the origin-request policy forwards the header). The param
   alone is NOT enough — Jun 12 2026 prod incident: a request with `RSC: 1`
   but no `_rsc` param (bots replaying captured headers; one curl reproduces
   it) makes Next return the flight payload, and with `header_behavior=none`
   CloudFront cached that `text/x-component` body under the SAME key as the
   HTML page → reloads showed the raw RSC payload to everyone, and the
   year-long `stale-while-revalidate` kept it alive past the 1h s-maxage
   (fix required a `/*` invalidation). Keying `rsc` costs no hit ratio: HTML
   requests never send it. Verify both directions: `?_rsc=` request →
   `text/x-component`; a plain GET *after* a `curl -H 'RSC: 1'` GET of the
   same URL → still `text/html`. Gotcha while testing: identity vs
   gzip/brotli are SEPARATE cache entries — a no-`Accept-Encoding` curl can
   MISS while browsers HIT the poisoned compressed variant; always test with
   `--compressed`.
2. **Set-Cookie leak**: response-headers policy strips `Set-Cookie` on cacheable
   behaviors, or one user's session cookie is replayed to all on cache hits.
3. **Cookies / cache key**: cache policy `cookie_behavior=none` (anon share one
   key); the CF function strips cookies for anon, keeps for logged-in. Pages are
   user-agnostic (SSR renders as `SSR_RENDER_COUNTRY=IN`, client hydrates), so
   serving cached anon HTML to logged-in users is fine — same model as ISR.
4. **`/_next/image*`** needs `url`/`w`/`q` in the cache key — Managed-CachingOptimized
   strips all query strings → 400 on every optimized image (incl. the logo). Use a
   custom cache policy whitelisting those params.
5. **Server actions**: POST to page routes with a `next-action` header + an
   Origin-vs-Host CSRF check. CloudFront must forward `next-action`/`Content-Type`/
   `Origin` (origin-request policy), AND `next.config` needs
   `experimental.serverActions.allowedOrigins=[apex,www]` (origin sees Host
   `origin.themoviebrowser.com` ≠ browser Origin → CSRF reject otherwise).
6. **Server-action / RSC BUILD SKEW** (the subtle one): edge HTML cached from build
   A embeds action IDs / RSC route hashes that build B's origin doesn't have →
   "Server Action not found" / RSC 404 (intermittent: pages cached from the current
   build work, older ones don't). **`deploymentId` is NOT a usable fix — it took the
   whole site down on Jun 12 2026.** On Next 16.1.0 + Turbopack, runtime renders
   apply it inconsistently (entry scripts/CSS emitted bare, flight chunk URLs with
   `?dpl=` — even with identical build/runtime config): same chunk loads under two
   URLs → modules execute twice → hydration dies SILENTLY site-wide (pages render,
   nothing clickable, zero console errors; only build-time prerenders are
   consistent). Removed from next.config — do not re-add until verified fixed
   upstream (repro: clean `GITHUB_SHA=x yarn build` + `GITHUB_SHA=x next start`,
   then grep served HTML for bare+dpl duplicates). Current skew posture: accepted
   ~1h window for action POSTs from stale edge HTML; `cache-handler.cjs` namespaces
   ISR by BUILD_ID so the ORIGIN at least never serves cross-build HTML. If skew
   hurts again, the lever is a manual `aws cloudfront create-invalidation --paths
   "/*"` (ONE path, ~free; the >$1k fear is only per-URL BULK purging) — but NOT
   auto-per-deploy (caused the Jun 11 cold-edge outage; commit 05fd778). The EC2
   instance role has `cloudfront:CreateInvalidation`.
7. **Geo**: behind CloudFront the origin's connection IP (Caddy's
   `x-real-ip`/XFF = socket peer) is a CF POP — geo-locating it stamps users
   with the POP's city (Jun 12: logged-in users showed Seattle/LA/Mumbai in
   the admin Users tab via `metadata.profile.location`). The viewer's geo
   ONLY reaches the origin as CloudFront-generated headers, all consumed by
   `src/lib/geoip.ts` (the ONE place geo/IP extraction is allowed to live):
   - `/api/*` uses `Managed-AllViewerAndCloudFrontHeaders-2022-06` (plain
     AllViewer does NOT forward CF-generated headers) → full set:
     `CloudFront-Viewer-Country/-City/-Country-Region-Name/-Time-Zone/
     -Address` (+lat/long/postal). Sign-in location stamping, analytics
     ingest, and /api/geo all live here.
   - Page routes use the custom whitelist policy → `-Country` + `-Address`
     only; city/tz come from geoip-lite on the `-Address` IP. The policy is
     AT its 10-header quota — an 11th header needs an AWS quota increase.
   - `resolveGeo` NEVER geoip-locates the connection IP when CF markers are
     present but `-Address` is missing — null city beats POP city.
   - These are origin-request-policy headers, NOT cache-key headers (SSR HTML
     stays country-agnostic; /api/geo is uncached). Adding viewer geo headers
     to the CACHE policy would shatter the edge cache — never do it.
8. **`Accept-Encoding`** cannot be whitelisted in an origin-request policy when
   Compress=true (CloudFront manages it) — apply errors if you try.
9. **`stale-if-error`**: Next does NOT emit it; Caddy appends `stale-if-error=86400`
   to HTML responses (via a `handle_response` block — `copy_response` is
   load-bearing or the body is dropped) so CloudFront serves the last-good page
   when the origin 5xxs/freezes. THE reason the origin can freeze without a
   user-facing outage.

## Bot strategy — shed at the EDGE, not the origin

**SHED TOKENS ARE SUBSTRINGS — audit every new one against the bots you mean to
SERVE (Aug 2 2026).** `httpclient` was in both shed lists, and LinkedIn's
canonical UA is `LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient
+http://www.linkedin.com)` — so every LinkedIn unfurl of a shared movie/series
page was 429'd and previewed blank. Both layers now consult an **ALWAYS_SERVE
allowlist FIRST** (`terraform/cloudfront-cookie-normalize.js` `ALWAYS_SERVE` +
the `not header_regexp` arm of Caddy's `@heavybots` — **keep the two in sync**,
exactly like the ASN lists). A UA allowlist is forgeable but costs nothing on a
shed that is *already* UA-based; do NOT extend the same trick to `@dcfleet`/ASN,
where the signal is non-forgeable and an exemption is a one-header bypass.
- **These failures are INVISIBLE by construction**: a CF-Function or Caddy 429
  never reaches Next, so no `page_view` row is written and nothing appears in the
  admin dashboard. ClickHouse had 2 `bot_type='linkedin'` rows in 14 days, both
  synthetic probes from the investigation. **You cannot find this class of bug in
  analytics — you have to probe the shed with a UA battery.**
  `scratchpad`-style probe matrix: real crawler + social + AI + browser UAs, each
  asserted 200, plus known-bad UAs asserted 429. Run it against the ORIGIN
  (`curl --resolve …:443:16.112.156.196`) *and* through CloudFront, because the
  two layers shed independently — Caddy's fix alone left LinkedIn broken at the
  edge. The same battery is what caught the Googlebot `Accept: text/markdown`
  429 (see `llm-friendly.md`).
- zsh does NOT word-split unquoted `$VARS`, so `curl $ORIGIN_ARGS` fails with
  "option --resolve …: is unknown". Put probe batteries in a `.sh` file.
**The origin Caddy shed CANNOT protect against the herd behind a CDN** — it only
sees cache misses, and a 429 keyed UA-agnostically poisons the URL for humans. Shed
the no-value scrapers (Bytespider/Semrush/Ahrefs/MJ12/DataForSEO/scrapy/python-
requests/...) in the **CloudFront Function** (viewer-request 429) BEFORE the origin.
`public/robots.txt` mirrors the tiers. Caddy keeps a Tier-1 shed as defense-in-depth,
and `src/proxy.ts` 429s forged-Chrome scrapers + the AI bot-types by name.
**Edge bot-shedding was THE fix that stopped the cold origin stampeding.**

**AI-crawler reversal (Jul 2 2026).** The Jun-11 "SERVE the AI answer engines
(GPTBot/OAI-SearchBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot), the edge
caches them for ~zero origin cost" bet was WRONG and is reversed. ClickHouse
(`page_views`, 7d): ClaudeBot (`bot_type='anthropic'`) ~1.4M views / **1.05M unique
paths**, GPTBot (`'openai'`) ~0.5M / 0.41M unique = **~98% of all bot load**, hitting
movie/series/person detail pages. Because they crawl UNIQUE long-tail URLs, every
hit is an edge cache MISS → Origin Shield → origin render → puppeteer ratings scrape;
they drove most of the Lambda ($52/mo) + Origin Shield + CloudFront-request bill for
ZERO search-index value (real indexers Googlebot/Bingbot crawled **6 / 5×** the same
week). Fix: `robots.txt` now DISALLOWS the AI training/bulk crawlers (both honor it —
this is what actually reclaims the CloudFront/Origin-Shield cost, over ~a few days),
Caddy `@heavybots` + `src/proxy.ts BLOCKED_BOT_TYPES` (openai/anthropic/common_crawl/
cohere/amazon/meta) 429 them at the origin for immediate CPU+Lambda relief. KEPT:
Googlebot/Bingbot/Applebot + OAI-SearchBot/ChatGPT-User (user-facing, low volume).
The only immediate CloudFront/Origin-Shield lever (vs waiting for robots.txt) would
be adding these UAs to the CloudFront viewer-request Function — deferred (robots.txt
covers it in days).

**Disguised datacenter fleets — shed by IP, not UA (Jul 28 2026).** A crawler
fleet on **Alibaba Cloud** (SG `43.119.100.x` + US `47.82.201.x`) and **Huawei
Cloud SG** (`124.243.x`) drove ~35-40k origin renders/hr over the long-tail
catalog wearing a *genuine* `Chrome/145` macOS UA **with valid `sec-ch-ua`
hints** — invisible to every UA/heuristic tier above. It runs **real headless
browsers that execute JS**: after `src/proxy.ts` began 429ing its page
requests, the browser JS kept calling `/api/auth/session`, `/api/geo` and
`/api/analytics/ingest` (the last **polluting ClickHouse with fleet rows**),
because the proxy matcher excludes `/api`. So the shed lives in BOTH places:
`proxy.ts` (`BLOCKED_DC_CIDRS`, page routes) and **Caddy `@dcfleet`** (every
path incl. `/api`), both keyed on the CloudFront-forwarded
`CloudFront-Viewer-Address` and both exempting requests that carry a session
cookie (a real human on a cloud VPN can still sign in). Result: fleet page
views ~2,994 → ~100 per 5 min, box load 3.7 → 1.0, CPU 91% idle. **How to
identify the next one: CloudFront access logs are the only source that sees
real UA + client IP per edge request** (`s3://movie-browser-cf-logs-.../cf/`,
gzip TSV: `$5`=IP, `$8`=URI, `$9`=status, `$14`=result-type) → group the
suspect UA by IP, `whois` the top talkers, then shed the provider supernet.
Diagnostic tell of a JS-executing farm vs a plain scraper: it hits
`/api/auth/session` + `/api/geo` on every page.

**It ROTATES PROVIDERS — shed by ASN, not IP (Jul 29 2026, one day later).** The
same fleet reappeared on **Vultr/Constant (AS20473) + DigitalOcean (AS14061)**
and friends, spread over **~14k distinct IPs at 1-2 origin requests each**.
Consequences to internalize: **per-IP rate limiting is USELESS against this**
(every IP looks human-paced; only the aggregate hurts) and per-CIDR blocking is
whack-a-mole on a daily cycle. The durable signal is the hosting **ASN** —
`CloudFront-Viewer-ASN` is whitelisted in the origin-request policy and shed in
BOTH `src/proxy.ts` (`BLOCKED_HOSTING_ASNS`) and Caddy (`@dcfleet`); **keep the
two lists in sync**. NEVER block AWS 16509 / Google 15169 / Azure 8075 /
Cloudflare 13335 — real search crawlers and link-unfurl bots (Slack/Discord/
WhatsApp previews) live there; that omission also means a FORGED Googlebot UA
from a cheap-VPS ASN gets shed while the real one always passes, so the ASN
check needs no UA exemption and must not grow one. Verified: fleet 2,520 → 230
views/5min, load 5.91 → 0.30, CPU 4% → 71% idle, cold render 9.07s → 2.18s.
Compounding factor to check in the same breath: the ISR cache pinned AT
`BOUNDED_CACHE_MB` while a fleet crawls tens of thousands of unique paths/hour
= the Jun 19 THRASH (every cold render evicts a page that is about to be
re-requested). Shed the fleet; do NOT reflexively raise the cap (disk headroom
was only 17GB, and disk-full has taken prod down twice).

## Bot-detection signals available behind CloudFront (researched Jul 30 2026)

**CORRECTION to the long-standing "move to Cloudflare Free" recommendation below
and in memory `cdn-plan-jun11` / `cost-firstbill-jul`: for BOT DETECTION,
Cloudflare Free is strictly WEAKER than what we already have.** Free gives only
Bot Fight Mode (one on/off toggle) — no per-request bot score, no `cf.client.bot`,
no `cf.bot_management.*`, no `verifiedBotCategory`, no JA3/JA4 fields; those are
Enterprise Bot Management. CloudFront hands us raw fingerprint headers for free.
(The Cloudflare case is still valid on COST — $0 egress + unlimited requests —
just don't justify it with bot management.)

**Free, available now via the origin-request policy** (CF-generated headers; they
work in an origin-request policy but NOT a cache policy — never put them in the
cache key or the edge cache shatters):
`CloudFront-Viewer-JA4-Fingerprint` (38-char JA4, since Oct 2024),
`-JA3-Fingerprint`, `-TLS` (version:cipher:handshake),
**`-Header-Order`** (colon-separated header names in received order, ≤7,680
chars — AWS documents it FOR UA-vs-header-order coherence checks),
`-Header-Count`, plus the `-ASN`/`-Address` we already forward.

**Hard limits of those signals against OUR adversary — read before investing:**
- **JA3 is dead** for browsers: Chrome ≥110 permutes ClientHello extension order
  every connection (~15! orderings), so the hash differs per request. JA4 fixes
  this by sorting — but a fleet driving REAL Chrome (ours executes JS) produces a
  JA4 **byte-identical to a genuine visitor's**. So JA4 is a COHERENCE input
  ("UA claims Chrome 138 but JA4/header-order says otherwise"), never a blocklist.
- **HTTP/2 (Akamai) fingerprinting is IMPOSSIBLE here**: CloudFront terminates the
  viewer's H2/H3 and re-originates as **HTTP/1.1** on pooled connections, so the
  viewer SETTINGS/WINDOW_UPDATE/pseudo-header order never reaches Caddy, and no CF
  header exposes it. Same for viewer RTT (anycast masks it) — which kills the
  latency-incoherence trick that is the best published residential-proxy tell.
  Getting these back means terminating TLS ourselves (e.g. `wi1dcard/fingerproxy`,
  which computes JA3+JA4+H2) and GIVING UP the edge the 2-vCPU box depends on —
  almost certainly a net loss.
- **Residential proxies defeat IP/ASN reputation by construction** (a Stanford
  measurement enumerated 6.18M residential exit IPs across 52k ISPs; exits are
  genuine home addresses). The durable counter is **binding rate limits to a
  stable fingerprint/session rather than to an IP** (our fleet shows ~11-23 req
  per IP across thousands of IPs = textbook pool rotation), plus a paid exit-node
  feed (Spur/IPQS/IP2Proxy) if we ever want per-IP verdicts.
- Cheapest real bot SCORING on the current stack is **AWS WAF Bot Control on the
  existing distribution** (paid add-on), not a CDN migration.
- Our strongest surface is **client-side JS coherence** (the fleet runs JS):
  GPU/renderer vs claimed UA (naive headless reports `Google SwiftShader`),
  CDP artifacts, and multi-layer consistency. Note `rebrowser-patches`/Patchright
  close the easy tells (`Runtime.enable`, `navigator.webdriver`, sourceURL), so no
  single flag suffices — combine, and weight coherence over any one signal.

Practical stance: the JA4/Header-Order headers are only worth forwarding once
something CONSUMES them (they cost bytes on every origin fetch, and Header-Order
is large). Enable them together with storage + coherence logic, not speculatively.

### The FORGED-REFERER shed — the one high-precision signal this fleet gave us (Aug 11 2026)

The research above concludes no per-request signal separates this fleet from a
person. **That conclusion was wrong in exactly one place, and it was decisive:
the fleet forged a `Referer` that no URL serializer can produce.**

Incident: prod homepage TTFB 58s, movie pages 502, swap exhausted (1.9/2.0 GiB),
`next-server` RSS 4GB, ISR cache pinned at its 25GB cap with **29,414 of 348,537
entries rewritten per hour**. Driver was ~70k req/hr sustained for days, sweeping
~11k DISTINCT long-tail paths every 30 min — all CloudFront MISSes, all cold SSR,
each one evicting a page a real user wanted (the Aug 3 thrash mechanism again,
but volume-driven rather than cap-driven).

**The signal:** `Referer: https://themoviebrowser.com` — a bare origin with **no
trailing slash** — on deep detail URLs. The WHATWG URL serializer always emits
`/` for an empty path, so every referer a real user agent sends has one. Under
our `strict-origin-when-cross-origin` policy a cross-origin referral is trimmed
to the ORIGIN (still slashed) and a same-origin navigation keeps the full path.
A scraper concatenating a plausible header omits it. Measured (7d/30d):

| Referer | Views | Sessions | Authed |
|---|---|---|---|
| `https://themoviebrowser.com` (no slash) | 2,192,483 | 2,002,073 | **0** |
| `https://themoviebrowser.com/` (slash) | 4,119 | 2,864 | **118** |

Every OTHER origin-only referer on the site — Bing, DuckDuckGo, Google, Baidu,
Yandex, Yahoo, Brave, Ecosia, our own `www`/`http`/`origin.` variants — carried
the slash. The fleet was the only path-less row on the entire site.

**Ground truth before shipping (do this for ANY new shed rule):** against 1,099
CONFIRMED human sessions over 30 days (authenticated OR having performed a
tracked action), the rule shed **0 sessions and 0 of 54,736 views**.

Implementation: `isForgedOriginReferer` (`lib/analytics/bot-detection.ts`), wired
into `scraperShedReason` as label `forged_referer`; 7 tests in
`bot-detection.test.ts` pin it. Design choices that are load-bearing:
- **Referer-LESS requests are NEVER matched.** Googlebot sends no referer, so it
  cannot be caught — the property that makes this safe after the Aug 2 incident.
- **Host-agnostic on purpose.** The Jul 2026 fleet rotated providers within a
  day; keying on our own origin would just relocate the forgery. The invariant is
  about URL serialization, not about who is imitated.
- **Fails OPEN** on anything unparseable, and **signed-in sessions are exempt**
  (`hasSessionCookie`, shared with the datacenter shed) — belt-and-braces, since
  0 of the 2.0M forged sessions were authenticated.
- It reuses the existing 429 response, whose **`cache-control: private, no-store`
  is load-bearing**: `Referer` is NOT in the edge cache key, so a cacheable 429
  on a MISS would poison that URL for real users. Same trap as UA.
- Keep `SHED_BOT_TYPES` + `SHED_REASON_LABELS` (`lib/analytics/audience.ts`) in
  sync when adding a shed label, or the traffic lands in the wrong audience
  bucket. `audience.test.ts` enforces the label; nothing enforces the set.

**Generalizable lesson:** prefer a signal that is a PROTOCOL/SERIALIZATION
invariant ("no conforming implementation can emit this") over any behavioural
heuristic. Those are the only rules cheap enough to enforce per-request and safe
enough to 429 on. The bar is the same one `bot-filter.ts` uses for the stripped
`google.com/search?q=` referer — and it is why that section says to hunt for
determinism, not thresholds.

## Origin lockdown — UNRESOLVED
Goal: stop bots bypassing CloudFront by hitting the EIP / `origin.*` directly.
- Caddy has a dormant `X-Origin-Verify` secret-header gate (activates when
  `ORIGIN_VERIFY_SECRET` is set in the box env — currently NOT set; secret in
  /tmp on the operator machine + the CloudFront origin custom header).
- **SG prefix-list lockdown does NOT fit**: a managed prefix-list reference counts
  ~55 rules (its max-entries) against the 60-rule SG limit → can't add it. Needs an
  SG-quota increase, or rely on the secret-header gate (needs box .env access).
- Until locked, direct-origin load is small (apex→CF, bots crawl the apex), but it's
  an open hole.

## Deploy interaction (see also infrastructure.md / performance.md)
- Deploys are now edge-protected: the cold-start restart is covered by CF cache +
  stale-if-error; the deploy auto-invalidates `/*` and gates the prisma/FTS DB steps
  (they spiked memory concurrent with the cold restart — a freeze contributor).
- node_modules ships IN the deploy tar (no on-box `yarn install` — it OOM-froze the
  box). prisma db push uses the bundled CLI, gated by schema-hash.

## Cost
**Origin Shield DISABLED Jul 2 2026** (`cloudfront.tf` `origin_shield.enabled=false`,
APPLIED via `terraform apply -target=aws_cloudfront_distribution.main` — pass the live
`TF_VAR_origin_verify_secret` (read it from the distro's X-Origin-Verify custom header)
so only origin_shield flips; verified `shieldEnabled:false`, status Deployed): the
June bill showed it was $10.31/mo (11.45M requests) collapsing ~nothing (≈13M origin
fetches/mo) — the unique-long-tail + India-1-POP pattern has no multi-POP herd to
collapse. Egress is ~$0 (well under the 1TB free tier); the real CloudFront cost is
**request count** (~14.5M/mo, over the 10M free tier) — and most of it is bots whose
UA the origin CANNOT see (the origin-request policy does NOT forward User-Agent, so
CloudFront-fronted cache-miss origin fetches arrive as `User-Agent: Amazon CloudFront`
→ logged is_bot=0, unblockable at the origin). To cut CloudFront request cost you must
block those bots at the EDGE (CloudFront viewer-request Function — it sees the real UA)
or forward UA to the origin (blocked: origin-request policy is AT its 10-header quota,
needs an AWS quota bump or dropping a header). **The only material structural lever
remains migrating to Cloudflare Free** ($0 egress + unlimited requests + free bot
mgmt; portable — DNS + cache-rule re-expression). See memory `cdn-plan-jun11` +
`cost-firstbill-jul`. NOTE: ClaudeBot/GPTBot were found (Jul 2) hitting the ORIGIN
DIRECTLY (real UAs, bypassing CloudFront — the unresolved origin-lockdown hole), so
they cost origin CPU + Lambda but NOT CloudFront; robots.txt + `src/proxy.ts` 429
handle them.

### Measured cost history + the Cloudflare decision (Aug 13 2026)

Numbers pulled from Cost Explorer + CloudWatch, superseding the "~14.5M/mo"
figure above. **Data transfer is irrelevant — $0.05/mo. The bill IS request count.**

| Period | Requests/mo | CloudFront | What changed |
|---|---|---|---|
| Feb–May 2026 | 5.0–6.3M | **$0.00** | images only, inside the 10M/mo Always-Free tier |
| Jun | 42.6M | $20.81 | **HTML moved behind the CDN Jun 11** |
| Jul | 57.3M | $31.05 | |
| Aug (12d) | 51.7M | $27.72 | → **~$91/mo projected** |

Two facts that decide the migration:
1. **The step change is one day: Jul 27→28, 1,276,820 → 3,247,929 req/day**, and it
   never came back. That is the residential-proxy fleet arriving (same day as the
   UA-forwarding flip, which is *how* we became able to see it). The Aug 2–3 peak
   of 5.1–5.6M/day is that fleet PLUS the empty-discussions crawl surface; the
   robots `Disallow` shipped Aug 3 is visible as 5.61M → 0.93M by Aug 6.
2. **Even a clean pre-fleet baseline (0.63–1.28M req/day = 19–38M/mo) is 2–4× over
   the free tier.** So CloudFront can NEVER return to ~$0 while HTML flows through
   it. Cloudflare Free saves ~$32–42/mo on a clean baseline and ~$90–116/mo with
   the fleet (incl. ~$11.50/mo of Route 53 that disappears, since Free plan forces
   DNS to Cloudflare). The fleet changes the SIZE of the win, not whether one exists.
   **Do NOT attribute the elevated bill to the origin shed** — the 3–5× step
   predates it by two weeks; the shed's marginal cost is ~$1/day.

Watch it with **`./scripts/cdn-watch.sh`** (requests/day, month-end projection vs
the free tier, origin shed volume, threshold verdict). Deliberately a pull script,
not a daemon: CloudWatch keeps daily metrics 455 days and ClickHouse keeps
`page_views`, so history accrues with nothing polling.

**Cloudflare Free feature-parity research (Aug 13 2026) — the two real regressions.**
The hard constraint is that **custom cache keys (keying on headers/cookies) are
Enterprise-only**; Free/Pro/Business get only device-type, ignore/sort query string,
and cache deception armor. Consequences, footgun by footgun:
- Footgun 1 (RSC poisoning): NOT solvable via cache key. Solvable with a **Transform
  Rule** (all plans, 10 on Free) that STRIPS the `rsc` request header when the query
  lacks `_rsc`, so the origin can't emit a flight payload for an HTML URL. Real
  `?_rsc=` requests key separately because Cloudflare keys on the full query string.
- Footgun 3 (cookie normalization) **disappears** — cookies aren't in Cloudflare's
  default cache key, so the fragmentation the CF Function prevents can't occur.
- Footgun 4 (`/_next/image*` params) **disappears** — full query string is keyed.
- Footgun 7 (geo, AT the 10-header quota) **improves** — Managed Transform "Add
  visitor location headers" is on ALL plans and adds 10 headers (city, country,
  continent, lat, long, region, region-code, metro, postal, timezone).
- Origin lockdown (still unresolved below) **gets fixed** — Authenticated Origin
  Pulls (mTLS) is free.
- **REGRESSION 1: `stale-if-error` is gone.** Cloudflare's "Serve stale content"
  Cache Rules setting is revalidation-ONLY; default on origin failure is a 521/522
  error page, and Always Online (Free) serves from the Internet Archive with a
  banner. Mitigating: every freeze cause is now fixed and `stale-if-error` never
  covered a HUNG origin anyway (only 5xx).
- **REGRESSION 2: no per-request logs.** Logpush is Enterprise. BUT this only bites
  if we shed at Cloudflare's edge — and on Cloudflare requests are unmetered, so
  keeping the shed at the ORIGIN costs nothing and preserves full ClickHouse
  visibility. Resolution: keep shedding at the origin.
- Also: regex `matches` requires Business+; `eq`/`contains` work on Free (5 custom
  rules). Our forged-referer rule is exact-match so it fits, but the host-agnostic
  regex form does not.
- DNS: Free = **full setup, nameservers must move** (CNAME/partial is Business+,
  $200/mo). Zone is only 10 records, but **a botched NS change = NXDOMAIN = exactly
  the Jun 28–Jul 1 outage that reset Google crawl recovery.** Carry over the
  `google-site-verification` TXT and BOTH ACM validation CNAMEs (or the image CDN
  cert stops renewing). Keep `image.themoviebrowser.com` DNS-only on CloudFront —
  Cloudflare's ToS still restricts serving a disproportionate share of images, and
  at 1.65M req/mo it sits inside the CloudFront free tier anyway (→ $0).

### Cloudflare cutover mechanics learned the hard way (Aug 14 2026)

**1. Universal SSL must be ISSUED before you orange-cloud ANYTHING.** Proven by
canary: with the cert pack at `status=pending_validation`, orange-clouding a
hostname makes VIEWERS fail at the TLS handshake (`sslv3 alert handshake
failure`) — Cloudflare's edge has no certificate to present. Check
`/zones/{id}/ssl/certificate_packs?status=all` for `status=active` on
`themoviebrowser.com` + `*.themoviebrowser.com` first. (Ruled out as a cause of
slow issuance: there are NO CAA records on the zone, so no CA is restricted — a
CAA locked to Amazon from the ACM era would have blocked Cloudflare's CA outright,
which is worth re-checking on any future domain.)

**2. The safe way to validate the Cloudflare header pipeline is a CANARY on an
unused hostname, never the apex.** `beta.themoviebrowser.com` is unused (it only
301s to the apex), so orange-clouding just that record exercises the entire edge
path — transform rules, managed transforms, cache rules — with zero user-facing
blast radius. Point it at a Caddy block that echoes the headers you want to prove.
Do NOT use `origin.themoviebrowser.com` for this: CloudFront resolves that name as
its origin, so proxying it puts Cloudflare in the middle of LIVE traffic.
Aftermath note: Cloudflare synthesises AAAA records for proxied names, so after
un-proxying, a local resolver can keep returning the Cloudflare IPv6 for a while
and the hostname appears dead (`curl` 000) when the zone is already correct —
verify with `--resolve` against the origin IP before believing it.

**3. Caddyfile changes require a container RECREATE, not `caddy reload`.** The
RUNNING container does not pick up host-file edits: `docker inspect` shows only the
`movie-browser-caddy-data` → `/data` volume, and after editing the host Caddyfile
in place (inode preserved) `docker exec … grep` found 0 matches inside the
container while the host file had them. `docker exec caddy caddy reload` therefore
reloads the OLD config and reports success. The Caddyfile's own header comment is
right: apply with `docker compose up -d --force-recreate caddy`. Budget for that
(a few seconds of origin downtime, currently absorbed by CloudFront) when shipping
the Phase 3 origin-certificate change.

## Open items (Jun 11–12, deferred)
- Origin SG lockdown (above). TF drift from manual SG edits during the incident.
- **CloudFront access logging enabled Jul 28 2026 via CLI (TF DRIFT)**: standard
  logs → `s3://movie-browser-cf-logs-620733889764/cf/` (7-day lifecycle expiry),
  enabled to trace the Jul 28 residential-proxy scraper fleet. NOT in
  `cloudfront.tf` — a full (non-`-target`) distribution apply would silently
  DISABLE it. Fold into TF or disable when the trace need passes.
- **CF Function `movie-browser-beta-cookie-normalize` updated via CLI Aug 2 2026
  (minor TF DRIFT)**: the LinkedIn allowlist fix was shipped with
  `aws cloudfront update-function` + `publish-function`, NOT `terraform apply`,
  to avoid a distribution apply silently disabling the access logging above (and
  because `origin_verify_secret`/`postgres_password` have no defaults, so even a
  `-target` apply prompts). The `.js` in git matches what was uploaded, so the
  drift is one state attribute and the next real apply is a content no-op.
  Recipe (creds: `set -a; . ./.env.local; set +a` then unset AWS_PROFILE —
  account 620733889764, region MUST be us-east-1): `describe-function --stage
  DEVELOPMENT` for the ETag → `update-function --if-match` → verify →
  `publish-function --if-match`. **Updating DEVELOPMENT is traffic-safe** (only
  LIVE is attached), so stage first and publish only after checking.
  `update-function` itself validates syntax/size (10KB), so a bad artifact is
  rejected before it can reach LIVE.
  **`aws cloudfront test-function` was ServiceUnavailable for the whole session**
  (AWS-side, persistent across ~15 min of retries) — do not assume your event
  JSON is malformed. Fallbacks that DID work: evaluate the real `.js` in vitest
  (`terraform/cloudfront-cookie-normalize.test.ts`), `npx acorn --ecma5` to prove
  ES5, and publish behind a scripted 6-probe apex health gate with a one-shot
  rollback script staged first (a throwing viewer-request function 503s EVERY
  request — there is no fail-open).
- www still A→EIP (works via 301→CF; cleaner to alias www→CF).
- Image distro (`E300L33VF15D5T`): no Origin Shield, 24h TTL on immutable
  posters — each edge node misses independently against the image origin.
  Improvement candidate, but it's outside this repo's TF state: plan it as its
  own change, never as a drive-by.

## Cache-lifetime posture (fixed Jun 12 2026, commit 70a2db1 — keep these true)
- HTML SWR is bounded: `expireTime: 7200` in next.config → movie/series emit
  `s-maxage=3600, swr=3600` (was swr≈1 YEAR, which kept stale-build HTML with
  dead server-action IDs servable long past s-maxage; person: no SWR since its
  revalidate 86400 > expireTime — verified, no odd clamping).
- 404s: `media-not-found` has `revalidate = 3600` (was s-maxage=1y — one
  transient 404 pinned a URL dead at the edge forever, with no deploy purge).
- `/serwist/*`: next.config headers() → `max-age=0, s-maxage=60` (was
  year-pinned SW). (The Jun-11 serwist `parseRoute` error was fixed Jun 12 —
  serwist v9 `matcher`+strategy-instance shapes, plus `{scope:"/"}`.)
- manifest/favicon/robots: `max-age=300, s-maxage=86400` (were uncacheable).
  GOTCHA: because `robots.txt` is edge-cached `s-maxage=86400`, a deploy that
  changes it serves the OLD file for up to 24h — bots keep reading stale rules.
  After a robots.txt policy change, `aws cloudfront create-invalidation
  --paths /robots.txt` (single path, ~free) to make it live now (done Jul 2 2026
  for the AI-crawler block).
- Canonical-slug 308 in `src/proxy.ts`: `s-maxage=86400`.
- `llms.txt`: its OWN rule at `max-age=300, s-maxage=300` — deliberately NOT the
  86400 its static-file neighbours get. Page-view tracking happens in the proxy,
  which only ever sees CDN cache MISSES, so a 24h edge TTL would hide nearly
  every fetch of the one agent-facing surface we added to measure it. See
  `.claude/rules/llm-friendly.md`.

## Framing / clickjacking headers (changed Jul 30 2026)

- **`X-Frame-Options` is GONE** app-wide; CSP `frame-ancestors` (built from
  `FRAME_ANCESTORS` in `next.config.mjs`) is the sole anti-clickjacking control.
  Reason: the creator's portfolio (`vootlachaitanya.com`, static S3) embeds a live
  `<iframe src="https://themoviebrowser.com">` preview, and XFO cannot express an
  allowlist at all (`ALLOW-FROM` is dead and Chrome never supported it). Chrome and
  Firefox ignore XFO when `frame-ancestors` is present, but Safari is not reliable
  about that, so leaving XFO in place would have kept the frame broken there.
  `frame-ancestors` is strictly more expressive — do NOT re-add XFO "for defence in
  depth"; it only re-breaks the embed.
- Exposure is small because the Auth.js session cookie is `SameSite=Lax` (v5 default,
  not overridden), so it is not sent in a cross-site iframe: a framed instance is
  always anonymous and no authenticated action can be triggered inside it. That is
  load-bearing — if a session cookie is ever switched to `SameSite=None`, revisit
  this decision.
- **EDGE CAVEAT when changing `FRAME_ANCESTORS`:** the CSP rides on the HTML
  response, which CloudFront caches (`s-maxage=3600` + SWR), so a deploy keeps
  serving the OLD policy from the edge for up to ~2h. Either wait it out or
  invalidate the specific paths — NEVER `/*` (see the cold-edge outage above).

See also: `.claude/rules/performance.md` (cold-start stampede, freeze recovery),
`.claude/rules/infrastructure.md` (EC2/SG/deploy),
`.claude/rules/llm-friendly.md` (the `.md`/llms.txt layer these TTLs serve).
