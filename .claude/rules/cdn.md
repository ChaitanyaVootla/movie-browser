---
paths:
  - "terraform/cloudfront*.tf"
  - "terraform/cloudfront-*.js"
  - "Caddyfile"
  - "public/robots.txt"
  - "next.config.mjs"
  - "cache-handler.cjs"
  - "src/server/services/cdn/**"
  - "src/app/api/revalidate/**"
---

# CDN — **Cloudflare** fronts the apex (since Aug 14 2026); CloudFront is the fallback

> **READ THIS FIRST — the CDN changed on 2026-08-14.** The apex is now proxied by
> **Cloudflare Free**. Most of the CloudFront-specific detail below is retained
> deliberately: the CloudFront distribution is still LIVE and is the rollback path,
> and the footgun list is what the Cloudflare config was built to satisfy. Treat any
> unqualified "CloudFront fronts the apex" statement in this file as HISTORY.

**Why a CDN exists at all** (unchanged): the 2-vCPU origin cannot absorb the crawler
herd on a cold cache — a deploy cold-invalidates the ISR tier, the fleet sweeps the
800k-title long tail, hundreds of concurrent renders → multi-GB RSS → kernel freeze.

**Why we moved off CloudFront:** it bills per request and the fleet took us to
~90M req/mo. Feb–May CloudFront billed **$0.00** (images only, inside the 10M/mo
free tier); once HTML went behind it, even a clean baseline was 2–4× over the tier.
Cloudflare requests are unmetered, so the bill goes to ~$0 *regardless of detection
quality*. Full cost history is in the Cost section below.

## Current topology (as of 2026-08-14)

- **Apex `themoviebrowser.com` → `A 16.112.156.196`, PROXIED by Cloudflare.** Zone
  `themoviebrowser.com` on the **Free** plan; nameservers `becky`/`miles.ns.cloudflare.com`
  (moved off Route 53, which the Free plan requires — CNAME/partial setup is Business+).
- **`www`, `beta`, `origin` → `A 16.112.156.196`, gray (DNS-only)** — they bypass
  Cloudflare and hit Caddy directly, exactly as before. `www` 301s to the apex.
- **`image.themoviebrowser.com` → CloudFront `d2qifmj8erqnak…`, gray and STAYS gray.**
  Two reasons: Cloudflare's ToS restricts serving a disproportionate share of images on
  Free, and at ~1.65M req/mo it sits inside the CloudFront free tier (→ $0).
- **Both ACM validation CNAMEs are carried over** — without them the image CDN's
  certificate stops renewing.
- **ROLLBACK = point the apex back at `CNAME d1vtxoi7slst5n.cloudfront.net`, gray.**
  Propagates in seconds (proxied records use short TTLs). The CloudFront distribution
  and the Route 53 zone are BOTH deliberately still alive for this. Do not delete
  either until this has been stable for a long while.
- `ssl` mode is **`full`** (not strict) — Full does not validate the origin cert at
  all, so Caddy's existing Let's Encrypt cert carries it and its eventual
  non-renewal (ACME is intercepted once the apex is proxied) is harmless. Origin CA +
  Authenticated Origin Pulls + `full (strict)` is the post-cutover hardening step,
  and it also closes the long-standing origin-lockdown gap.

**Verified at cutover** (all six gates, each one a past production incident):
`cf-cache-status: HIT` on anon HTML with no `Set-Cookie` surviving; `RSC: 1` **with**
`_rsc` → flight payload but **without** `_rsc` → HTML (the Jun 12 poisoning fix, now
enforced by a Transform Rule since custom cache keys are Enterprise-only);
referer-less Googlebot 200; server-action POST reaching the origin; geo returning a
real city from Cloudflare's headers; image CDN and www untouched.

**Do NOT attribute the Aug-14 origin-load drop to the cutover.** Origin-reaching
requests fell ~85% and the forged-referer fleet vanished from the origin within
minutes of the flip — but Cloudflare's edge only saw 536 requests in the following 2
hours while CloudFront was still taking 52–70k/hr on stale DNS. The fleet has a
documented on/off burst pattern; the timing was coincidence. (Same misattribution
trap as crediting the shed for the CDN bill.)

## Topology (CloudFront as-built — HISTORY, retained as the rollback reference)
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

### The FORGED-PERSONA sheds + Caddy ADMISSION CONTROL (Sep 15 2026)

**Incident:** `next-server` heap-OOM crash loop — exit 134 `FATAL ERROR: Ineffective
mark-compacts near heap limit`, 12 restarts between 04:38 and 06:58 UTC on Sep 14 and
again 04:28/06:29/06:40 on Sep 15, each restart a cold-cache stampede; the site
"hung" (origin TTFB 21s, edge still serving cached HTML). Full perf write-up:
`performance.md` item 14. The load was a residential-proxy fleet that passes EVERY
earlier shed — genuine-looking Chrome 142-145 / Edge / Firefox 151 UAs WITH valid
client hints and Sec-Fetch-* headers: **45,847 origin renders/hr from 43,948
one-request "sessions", 0 authenticated, 0 web-vitals beacons (no JS), 81%
CN-geolocated**, running **03:00–07:00 UTC daily** on top of the 24/7 baseline
fleet (~25k/hr, mostly US). Confirmed humans in the same hour: 42 views, 1 session.
CN confirmed humans over 30 days: none (not in the top 15 countries; 0 sessions with
a beacon or auth).

**How the tells were found — tcpdump the plaintext Caddy→Next leg.** ClickHouse
stores no request headers beyond UA/referer, so header-consistency signals are
invisible there. On the box: `sudo timeout 10 tcpdump -i lo -A -s 4000 -l -c 3000
'tcp dst port 3002'`, parse each packet's headers, cross-tab by
`(Cf-IPCountry, UA family, has Priority, has Upgrade-Insecure-Requests,
signed-exchange in Accept, Sec-Fetch-User, client hints, Accept-Language)`. Two
invariants fell out — the same class as `missing_client_hints` and the no-slash
referer (no conforming browser can emit them):
- **Desktop Chromium ≥ 100 ALWAYS advertises `application/signed-exchange;v=b3;q=0.7`
  in its navigation `Accept`** (SXG since Chrome 73, never removed; Edge/Chromium/
  Vivaldi/Arc inherit it). Every real-looking Chrome/Edge navigation in the capture
  (US/TR/ID, incl. real Edge 148) carried it AND a `Priority: u=0, i` header; every
  fleet request carried neither (pre-73 Accept `…image/apng,*/*;q=0.8`).
- **Firefox ≥ 65 ALWAYS lists `image/webp` in its navigation `Accept`** (avif since
  92; png,svg since ~128) **AND sends `Upgrade-Insecure-Requests: 1`** on document
  navigations. The 24/7 "Firefox 151" persona (~7k/hr) sends the 2018 Accept and no
  UIR. Both must be missing (belt and braces).
- NOT used (yet): missing `Priority` on a Chromium ≥124 UA. Chromium only sends it on
  h2/h3, so a real Chrome forced to HTTP/1.1 (corporate MITM) would false-positive
  at Caddy, which cannot see the viewer protocol. At the EDGE it is safe:
  Cloudflare exposes `http.request.version` — a future WAF rule can gate on it.

**Shipped (Caddyfile `@forgedchromium` / `@forgedfirefox`, 429 `private, no-store`,
twin `isForgedBrowserPersona` in `bot-detection.ts` wired into `scraperShedReason`
as labels `forged_chromium` / `forged_firefox`).** Guards on both: `Sec-Fetch-Mode:
navigate` + `Sec-Fetch-Dest: document` (RSC/prefetch/API fetches are `cors`; Googlebot
and unfurlers send no Sec-Fetch at all and can never match), no session cookie,
`X-Verified-Bot: true` exempt, Brave (brand in `Sec-CH-UA`), Opera/Yandex/Samsung,
WebView, CriOS, Electron, mobile and declared bots excluded from the Chromium arm
rather than trusted. Verified with a 22-case battery in a throwaway Caddy on `:8099`
(forged personas 429; real Chrome/Edge/Firefox, Brave, Android, Chrome 72, Firefox 60,
signed-in, verified bot, RSC fetch, Googlebot, Safari, curl all 200) and then
against the ORIGIN — never the edge (UA/Accept are not in the cache key). Result:
0 restarts since, RSS flat ~2GB, load 0.7, 46k sheds in the first 4h, Firefox-151
persona reaching the origin: 0.

**Admission control — the structural fix, independent of any fingerprint.** Next has
no concurrency limit, so memory scales with in-flight renders: at the crash there
were 450–520 ESTAB connections on `:3002` (351 in CLOSE-WAIT = rendering for
clients that had already gone), accept backlog 512/511. Now in `reverse_proxy`:
`unhealthy_request_count 96` (upstream unavailable while it has that many in
flight) + `lb_try_duration 15s` / `lb_try_interval 100ms` (Caddy QUEUES the excess
— a parked goroutine — and re-checks every 100ms before answering 503). Overload
degrades to fast 200s for what fits + prompt 503s for the rest instead of 21s
TTFBs then a crash. Cloudflare does not cache 503s by default; `Always Online` may
serve stale. Sizing: healthy steady state is ~10–30 in flight on 2 vCPUs; SSE
`enrich` streams (real users only — fleets run no JS) and Next's own self-proxied
rewrites (below) each hold a slot, hence the headroom. Watch `code="503"` in the
metrics before lowering it.

**Observability: Caddy `/metrics`.** Global `servers { metrics }` (Caddy 2.11 warns
this nested form is deprecated — move to the global `metrics` option on the next
edit). `curl -s localhost:2019/metrics | grep caddy_http_request_duration_seconds_count`
gives request counts by status/handler — the ONLY place a Caddy 429/503 shows up,
since it never reaches Next and never becomes a `page_view` row.

**Caddyfile deploy mechanics (re-learned):** deploys ship `Caddyfile` in the tar but
NEVER recreate the container, and the bind-mounted file is read at container start —
so a repo edit does nothing until `docker compose up -d --force-recreate caddy` on
the box (`caddy validate` first: `docker run --rm -v $PWD/Caddyfile:/etc/caddy/
Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter
caddyfile`). Conversely the box copy must match the repo, or the next recreate
silently reverts the sheds. Backup of the pre-change file:
`/home/ubuntu/movie-browser-next/Caddyfile.bak-20260915T065238Z`.

**Three things found on the way (open):**
1. **The Cloudflare token cannot manage WAF rules.** `GET …/rulesets/phases/
   http_request_firewall_custom/entrypoint` returns `request is not authorized`
   while the late-transform ruleset reads fine and the zone list shows the
   firewall_custom ruleset EXISTS — so this is a missing `Zone → WAF → Edit`
   permission, not the "entrypoint does not exist" case. With it, the cheapest fix
   for this fleet is an edge rule (managed challenge for `ip.src.country eq "CN" and
   not cf.client.bot and not http.cookie contains "authjs.session-token"`, or the
   Accept/Priority invariants gated on `http.request.version`), which also removes
   the fleet's origin egress cost (cdn.md → Cost correction). Needs the user.
2. **Cloudflare's AI-bot block now 403s `Claude-SearchBot`** (`text/plain`, `cf-ray`
   present, at the edge) — the Sep 9 "inert" observation no longer holds. Policy
   question: robots.txt allows Claude-SearchBot and `llm-friendly.md` wants it on
   the `.md` layer.
3. **Prod self-proxies `.md` rewrites through the public hostname.** `next-error.log`
   has 3,471 `Failed to proxy https://themoviebrowser.com/api/md?p=…` /
   `/media-not-found` lines: the proxy's `.md`/404 rewrite is treated as
   cross-origin (the `req.nextUrl.origin` trap in `llm-friendly.md`, live in PROD,
   not just dev), so every `.md` hit is TWO requests through Cloudflare + Caddy
   (and it relays edge 403s — that is how item 2 surfaced). Fix = rewrite to the
   internal origin. Costs a slot under admission control.

## Origin lockdown — UNRESOLVED
Goal: stop bots bypassing CloudFront by hitting the EIP / `origin.*` directly.
- **Sep 28 2026 — it happened: `origin.*` is now 403'd at Caddy (`@originhost`).**
  A forged `Chrome/151.0.0.0` Windows fleet (~44k req/h for 10+ days, 0 authed,
  0 LCP beacons, ~1 distinct path per 2 hits) crawled `origin.themoviebrowser.com`
  directly — 86% of requests reaching Next — skipping Cloudflare, passing the
  proxy.ts shed (clean modern UA), and filling all 96 Caddy admission slots, so
  real users queued behind it (0% idle, homepage 0.2–6.8s). After the block:
  in-flight 96→4, idle 0→25%, homepage ~6ms. Tells: ClickHouse `domain(referer)
  = 'origin.themoviebrowser.com'` (no real visitor ever sees that host), and
  `tcpdump -i lo 'tcp dst port 3002'` Host headers. Admission control BOUNDS
  concurrency but does not SHED — a fleet can still monopolise it.
  **Remove `@originhost` before any CloudFront rollback** (CloudFront fetches
  from that name). Still open: the bare EIP (Host: apex, no `cf-connecting-ip`)
  — the durable fix is SG ingress limited to Cloudflare ranges (~15 v4 CIDRs,
  fits the SG limit, unlike the CloudFront prefix list).
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

**CORRECTION (Sep 9 2026) — EGRESS IS NOT FREE BEHIND CLOUDFLARE; the move was
near cost-neutral.** "Data transfer is irrelevant" above was true only because
EC2→CloudFront origin transfer is $0. Behind Cloudflare every origin fetch is EC2
**internet egress** (`APS5-DataTransfer-Out-Bytes`, **$0.109/GB in ap-south-2**
beyond the account-wide **100 GB/month** free tier). Measured: free tier exhausted
Aug 22; billed **17–24 GB/day = $1.37–2.45/day** Aug 22–31 (the EC2-Compute line
jumped $1.54→$2.90–3.96/day — that is the whole jump, no second instance). Reconciles
with instance `NetworkOut` 25–34 GB/day minus ~8 GB/day same-region S3 backups (free),
and with Cloudflare uncached bytes 12–20 GB/day. Origin gzip is on (43KB/detail page),
so compression is not the lever. **≈ $50–55/mo** vs CloudFront's ~$70/mo pace →
the migration nets ~$20–25/mo, not ~$90. The egress is the fleet: Cloudflare HTML
`miss` bytes rose 5.2→14.6 GB/day (Aug 24→Sep 2) with humans flat. Lever = shed at
the EDGE (Free WAF rules; forged-referer invariant is regex-free and cannot hit
Googlebot) — which reverses "keep shedding at the origin" below: on Cloudflare an
origin 429 is still a billed origin fetch. Trap: `public/` assets serve `max-age=0`
so Cloudflare shows `REVALIDATED`/`expired` on every `/images/*.png`, but the origin
answers the conditional with a 304 + 0 bytes — that costs round-trips, not egress.
Memory: `cost-sep09`.

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

### Cloudflare zone config AS-BUILT + the Free-plan facts that matter (Aug 14 2026)

Config applied while every record was still GRAY (so zero traffic risk). Current state:

| Setting | Value | Why |
|---|---|---|
| `ssl` | **full** (not strict) | Full does NOT validate the origin cert — docs: "can be expired, self-signed, or not even have a matching CN/SAN". So Caddy's existing LE cert carries the cutover and its eventual non-renewal is harmless. Origin CA + AOP + strict = post-cutover hardening. |
| `browser_check` | **off** (was ON by default) | Browser Integrity Check blocks missing/non-standard UAs — a hidden second shed under our own, and **Free has no `Log` action** so its false positives are permanently unobservable. Redundant (we already handle `empty_ua` + UA-length bounds) and exactly the Aug-2 incident shape. |
| `always_online` | **on** | Fires ONLY on 520–527 (origin *unreachable*), NOT on an origin-returned 5xx. That happens to cover our real historical failure mode (kernel freeze / PM2 daemon dead), so it partially restores the `stale-if-error` we thought we'd lost outright. |
| `tiered_caching` + `smart_topology` | **on** | **Both ARE available on Free** (the earlier "Tiered Cache is gated" reading was wrong — the availability table says Yes/Yes/Yes/Yes; only Generic/Regional/Custom *topology* is Enterprise). Free replacement for Origin Shield. |
| `security_level` | medium (default) | Never flip to `under_attack` — it Managed-Challenges everything = SEO catastrophe. |
| Managed transform | `add_visitor_location_headers` | **`CF-IPCountry` is NOT sent by default** — without this transform geo silently breaks. `True-Client-IP` is Enterprise; `CF-Connecting-IP`/`X-Forwarded-For`/`X-Forwarded-Proto` are always present. |
| `http_request_late_transform` | 2 rules | `X-Viewer-ASN` (`to_string(ip.src.asnum)` — **`cf.asn` is NOT available in this phase**), `X-Verified-Bot`, `X-Verified-Bot-Category`; plus the `rsc`-header strip. |
| `http_request_cache_settings` | 2 rules | authed bypass / anon cache respecting origin TTL, mutually exclusive so order-independent. |
| `http_response_cache_settings` | 1 rule | `strip_set_cookie` — see the trap below. |

**THE SET-COOKIE TRAP — most likely single cause of a failed cutover.** Cloudflare's
documented matrix: "eligible for cache" **without an explicit Edge TTL** *preserves*
`Set-Cookie` and then **refuses to cache the asset at all** → a silent 0% HTML hit
ratio, which a 2-vCPU origin at 2M+ req/day will not survive. With an explicit Edge
TTL it strips `Set-Cookie` and caches. We do it EXPLICITLY via a **Cache Response
Rule** (`http_response_cache_settings`, action `set_cache_settings`, params
`{"strip_set_cookie": true}`, **10 rules on Free**) rather than relying on that side
effect. Scoped to exactly the cacheable expression so `/api/auth/*` and
authenticated responses keep their cookies — this mirrors what the CloudFront
response-headers policy already does (footgun 2), and prod proves sign-in works with
`Set-Cookie` stripped from cached page HTML. **Verify `cf-cache-status: HIT` on an
anonymous detail page before declaring the cutover done.**

**Free-plan facts worth not re-deriving:**
- **Snippets are NOT on Free (limit 0).** Workers Paid ($5/mo + 10M req, then $0.30/M
  ≈ $20–27/mo at our volume) is the only edge-compute path.
- **Purge by URL / prefix / tag / hostname / everything is free on ALL plans** since
  Apr 2025 (5 req/min for prefix/tag/everything; 100 items per API call). This removes
  the cost objection behind the deferred `/u/<username>*` privacy-flip / moderation /
  username-change invalidations — CloudFront billed per path, Cloudflare doesn't.
  **BUT our `CLOUDFLARE_API_TOKEN` currently CANNOT purge** — tried Aug 18 2026 and
  got `{"code":10000,"message":"Authentication error"}`. The token carries the
  migration scopes (Zone Analytics Read / DNS / Rules) but not **Zone → Cache Purge →
  Purge**. So every "just purge it" plan above is blocked until that scope is added.
  (Re-verified Oct 8 2026 with a purge of a never-cached probe URL: still code 10000.
  The title-purge pipeline below reads a dedicated `CLOUDFLARE_PURGE_TOKEN` first.)
  **Workaround that needs no token:** Cloudflare keys on the FULL query string, so
  appending a cache-buster (`?_cb=<ts>`) forces a MISS and fetches fresh origin HTML —
  invaluable for verifying a deploy without waiting out `s-maxage`, since through the
  edge you are otherwise testing the PREVIOUS build.
- **Build skew is very visible right after a deploy, and it looks like a broken
  feature.** Post-deploy, edge HTML from the old build still embeds old server-action
  IDs, so the origin logs `Failed to find Server Action "40b3c0dc…". This request might
  be from an older or newer deployment.` and any action-driven UI (search palette,
  ratings, watchlist) silently does nothing for those viewers until `s-maxage=3600`
  expires. Aug 18 2026: this made a freshly-deployed search fix appear completely
  broken (every query timed out) and a fixed page appear unfixed — both were stale
  edge HTML, not the code. **Verify a deploy against the ORIGIN (`--resolve`) or with a
  cache-buster, never through the plain edge URL.**
- **`cf.threat_score` is INERT** — docs say it is "always 0" now. Any rule built on it
  matches uniformly. Don't.
- **WAF: 5 custom rules on Free, and NO `Log` action below Enterprise** — you cannot
  dry-run an edge shed before enforcing it. Keep staging sheds at the ORIGIN where we
  can log, then promote. (Which is also why we keep the forged-referer shed at the
  origin: on Cloudflare requests are unmetered, so edge-blocking saves nothing and
  costs us all ClickHouse visibility.)
- **Alerting: Free is email-only and does NOT include Origin Error Rate** (Enterprise)
  or Health Checks (Pro+). Cloudflare will not tell us the origin is 5xx-ing — keep
  our own monitoring.
- **Cache Analytics is NOT on Free** → use the GraphQL Analytics API instead.
- **DNSSEC footgun for any FUTURE nameserver change**: remove the DS record at the
  registrar and wait out its TTL (24–48h) FIRST, or validating resolvers SERVFAIL the
  whole domain — a self-inflicted repeat of the Jun-28 NXDOMAIN class.
- **Cloudflare Registrar is at-cost with auto-renew enrolled by default** — worth
  considering purely as insurance against another Squarespace-style domain lapse.

**Cloudflare defaults that are WRONG for this site — do NOT enable:**
- **Bot Fight Mode.** Un-exemptable by design ("Skip, Bypass, and Allow actions have
  no effect"), force-enables JavaScript Detections that cannot be disabled and inject
  a script needing `/cdn-cgi/challenge-platform/` in our **app-wide CSP**, and has
  repeated reports of challenging Googlebot. The documented escape hatch is "upgrade
  to Pro". Never.
- **Managed robots.txt.** It **PREPENDS** its own file, including a competing
  `User-agent: *` group, ahead of ours — an unacceptable risk to the Aug-3
  `Disallow: /*/discussions` crawl-budget fix. Ours stays in git.
- **One-click "AI Scrapers and Crawlers" block.** Would cut off `Claude-SearchBot`
  (~24.5k/7d, our #1 `.md` consumer) and OAI-SearchBot, both of which robots.txt
  deliberately allows. Use per-crawler AI Crawl Control if ever needed.
- **Crawler Hints.** Pings IndexNow off cache-MISS signals — with ~1.2M
  robots-disallowed thin `/discussions` shells we would be volunteering exactly the
  pages we just told Google to stop crawling. We already run IndexNow deliberately.
- **AI Labyrinth.** Generates crawlable junk pages; we are already losing crawl budget
  to thin pages.
- **Polish / Mirage / Images.** Contradicts the Jun-19 `images.unoptimized: true`
  decision that fixed a disk-filling outage.

### GraphQL Analytics on Free — MEASURED on our zone (Aug 14 2026)

Once Cloudflare caches HTML, most of our ~2M req/day terminates at the EDGE and
disappears from ClickHouse (which only ever sees origin-reaching requests).
Logpush is Enterprise, so polled GraphQL is the only free way to keep counting it.
Needs `Zone → Analytics → Read` on the API token.

**Do NOT trust published per-plan retention tables — query the `settings` node for
YOUR zone.** Ours reports (and this CONTRADICTS the "Free = 24h firewall events"
figure in the docs/research, which would have led to building a needless
hourly-or-lose-it poller):

| Dataset | Retention | Max query window |
|---|---|---|
| `httpRequestsAdaptiveGroups` | **8 days** | 1 day |
| `httpRequestsAdaptive` (raw) | **8 days** | 1 day |
| `firewallEventsAdaptive` | **15 days** | 1 day |

The 1-day `maxDuration` means any ingest must page day-by-day. A daily cron is
sufficient given 8-day retention.

**Validated working query shape** (accepted against the live zone; returns 0 rows
only because nothing is proxied yet):
`httpRequestsAdaptiveGroups(limit, filter:{datetime_geq, datetime_leq, requestSource:"eyeball"}, orderBy:[count_DESC]){ count dimensions{ cacheStatus edgeResponseStatus clientCountryName userAgentBrowser } }`

- **`requestSource: "eyeball"`** separates real client traffic from internal/CF
  fetches — the fix for the `User-Agent: Amazon CloudFront` noise that polluted our
  origin-side human counts for months.
- **`cacheStatus` is a Free dimension**, which is what makes Cache Analytics being
  Pro-only survivable.
- **What Free CANNOT give**: `botDetectionIds` (Enterprise Bot Management) and
  **`clientRefererHost_like` (paid plans only)** — the latter is exactly the field
  our forged-referer shed keys on, so that shed's logic is NOT reproducible at the
  edge or in Free GraphQL. Second independent reason it stays at the ORIGIN.
- Datasets carry the `Adaptive` (ABR sampling) suffix; docs warn they are not
  billing-grade. Fine for traffic-mix ratios, not exact counts.
- **Build the ingest AT cutover, not before** — there is no data to verify shapes
  against until the apex is proxied.

**Token permission note:** `Bot Management → Edit` is offered but grants NOTHING on
Free — `cf.bot_management.score`/`.ja4` fail with "not entitled", which is a
SUBSCRIPTION gate, not a token-scope gate. Leave it off (least privilege).

**Still to verify in the dashboard / needs extra token perms:** whether the Cache
Rules `Vary` setting accepts `RSC` (would be a cleaner RSC fix than our header-strip,
though the strip is deployed and sufficient); GraphQL retention via the `settings`
node (needs `Zone → Analytics → Read`); whether a RUM beacon is auto-enabled for Free
(needs `Zone → Web Analytics → Read`) — docs suggest RUM is auto-on for Free zones
with EU traffic excluded, so we may be shipping a beacon nobody chose.

### Post-cutover cost + load, MEASURED 3 days in (Aug 17 2026)

The migration delivered, and the numbers are unambiguous (Cost Explorer by USAGE_TYPE,
3 days pre Aug 12–14 vs 3 days post Aug 15–17):

| Line | Pre (3d) | Post (3d) | Note |
|---|---|---|---|
| CloudFront requests (all `*-Requests-Tier2-HTTPS`) | $6.59 | **$0.15** | main distro 2.6M req/day → 4.2k |
| CloudFront Functions executions | $0.62 (6.16M) | **$0.003** (28k) | the cookie-normalize fn |
| Route 53 `DNS-Queries` | $1.23 (3.08M) | **$0.006** (13.9k) | NS moved to Cloudflare |
| `PublicIPv4:InUseAddress` | $0.36 | $0.26 | the EIP — unavoidable floor |

Whole-account daily spend went **$5.67 (Aug 13) → $2.49–2.80 (Aug 15–16)**; monthly
totals Jun $226 → Jul $156 → Aug $90 MTD (front-loaded with pre-cutover days).
**In September the image distro alone (~1.4–1.65M req/mo) sits back inside the 10M
free tier → CloudFront returns to ~$0**, exactly as predicted above. The two Route 53
hosted zones still bill $0.50/mo each; keep `themoviebrowser.com` as rollback insurance.

**THE ONE NEW CHARGE THE MIGRATION CREATES — origin egress is now billed.** AWS is
NOT a Bandwidth Alliance member, so EC2 → Cloudflare is ordinary internet
`DataTransfer-Out`, whereas EC2 → CloudFront was free (`APS5-CloudFront-Out-Bytes`,
always $0). Measured, the egress simply moved buckets: internet ~0.4 GB/day → **~6.4
GB/day**, to-CloudFront ~10–20 GB/day → ~0.85. That projects to **~195 GB/mo against
the 100 GB/mo AWS free tier ≈ $10/mo of NEW EC2 egress**, first visible on the
September bill (August is still inside the free tier at 24 GB MTD, which is why it
currently reads $0.00 and is easy to miss). Still hugely net-positive — ~$30/mo of
CloudFront + ~$5.50/mo of Route 53 queries removed for ~$10/mo of egress — but do not
report the saving without it. Enabling Cloudflare's cache more aggressively (raising
the HTML hit ratio) is the lever that shrinks it.

**`scripts/cdn-watch.sh`'s "forward run-rate" is misleading post-cutover**: it means
the last 8 *settled* Cost Explorer days, which still spans pre-cutover traffic, and so
reported ~$46.70/mo when the true CloudFront rate was ~$0.05/day ≈ $1.50/mo. Read the
per-day column, not the projection, until the window clears.

### Origin load after the cutover: 34% of edge traffic is our own 429s

Cloudflare GraphQL (`httpRequestsAdaptiveGroups`, `requestSource:"eyeball"`, 23h)
cross-tabbed by `cacheStatus` × `edgeResponseStatus` — the single most useful shape
for this zone, and worth re-running before any shed change:

| cacheStatus | status | count | share |
|---|---|---|---|
| **bypass** | **429** | **491,519** | **34.3%** |
| miss | 200 | 411,779 | 28.7% |
| dynamic | 200 | 230,315 | 16.1% |
| hit | 200 | 131,743 | 9.2% |
| — | 403 | 46,875 | 3.3% |

Of 1.43M edge requests/day, only **9.2% are HITs**. The headline: the origin shed's
own 429s are the **largest single class of edge traffic**, and because each 429
correctly carries `Cache-Control: private, no-store` (a cacheable 429 would poison the
URL — see footgun 2/UA note), Cloudflare *cannot* absorb them. Every one round-trips to
the 2-vCPU origin purely to be rejected. **88% of them (431,835) are one cohort:
country SG + `userAgentBrowser: Chrome`** = the datacenter fleet, i.e. the same
mechanism behind the Aug 11 502/58s-TTFB incident, just at lower volume.

**This partially invalidates the "keep the shed at the ORIGIN" reasoning above.** That
decision was argued on MONEY (Cloudflare requests are unmetered → edge-blocking saves
nothing) plus ClickHouse visibility, and both halves are still true — but it never
weighed **origin CPU**, which is the actual scarce resource. Shedding the hosting ASNs
in one of the **5 free WAF custom rules** would convert ~490k origin round-trips/day
into zero-cost edge blocks. Do NOT ship it casually: Free has **no `Log` action**, so
there is no dry-run, and a bad rule that catches Googlebot repeats the Aug 2 incident.
Stage it as an exact-match/ASN rule, keep the origin shed underneath as
defence-in-depth, and probe with the UA battery against BOTH layers first.
The other 411,779 MISS/200s are genuine cold SSR of the long-tail catalog
(`crawler` 166k + `generic_bot` 88k + `googlebot` 57k origin views/24h) — expected for
800k titles crawled on unique paths, and the reason the hit ratio can't approach a
normal site's.

Also seen and benign: the **403s are Cloudflare's free managed WAF** blocking
credential scanners at the edge (`/.env`, `/gcp-key.json`, `/.aws/config`,
`/.cursor/mcp.json`) — our origin answers those 404, so the edge is doing free work.
Verified separately that no real secret path is reachable: `/gcp_service.json`,
`/.env`, `/.env.local`, `/movie-browser-ec2-key.pem`, `/.git/config`,
`/terraform/terraform.tfstate` all 404.

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

## Title purge: fresh ratings/deep links/AI on the next reload (Oct 2026)

**The bug it fixes (user repro):** a visitor lands on a title with no IMDb/RT. The
render returns PG data and kicks the background refresh; the SSE enrich stream then
shows the new ratings LIVE. A plain reload served the cached HTML again and the
ratings vanished — for up to ~2h (origin ISR `revalidate=3600`, edge `s-maxage=3600,
stale-while-revalidate=3600`). Three independent layers now cover it:

| Layer | Mechanism | Where |
|---|---|---|
| 1. Origin ISR | entry for the canonical path DELETED in-process right after the committed upsert, and again ~3s later (a render that was mid-flight when the upsert committed can re-cache old data) | `cdn/origin-isr.ts` → `cache-handler.cjs` `invalidateKeys` via `globalThis[Symbol.for("movie-browser.bounded-isr")]` |
| 2. Cloudflare | debounced (3s), token-bucket (3 calls/min), batched (≤50 titles) purge: files = page + `.md` twin, prefix = canonical path (covers `?_rsc=` flight variants) | `cdn/purge-queue.ts`, `cdn/cloudflare.ts` |
| 3. Client self-heal | every SSE stream opens with a `ratings` snapshot of PG; `LiveRatings` swaps it in when it differs from the HTML (`pickRatings`, identity-preserving when equal). Live AI components mount only when the HTML had no AI and request a one-shot `?once=1&ai=1` snapshot | `api/[mediaType]/[id]/enrich/route.ts`, `use-enrichment-stream.ts`, `enrichment-provider.tsx`, `enrichment-ratings.ts` |

Layer 3 is the one that works even if 1/2 lose a race or the token is missing — it
makes it impossible for a page to show OLDER ratings than PG holds. It costs nothing
new: the stream already opened on every page view and already read the ratings row;
it just stopped throwing the snapshot away on the "already settled" fast path (which
is exactly the repro's reload).

**Change signal (only purge on meaningful change):** `upsertRatings` returns the
number of DISPLAYED enriched sources written (IMDb, RT critic/audience, Google —
NOT TMDB, whose vote jitter changes every refresh, NOT Metacritic/Letterboxd, which
are not rendered); `upsertScrapedWatchLinks` returns rows written+removed;
`upsertMovie/SeriesToPostgres` return `UpsertOutcome { written, contentChanged }`
read only after the transaction COMMITS. Hydration calls `notifyIfContentChanged`
(background refresh + the sync force-refresh path); progressive enrichment calls
`notifyTitleContentChanged` after storing AI. Not covered (deliberately): TMDB
watch-provider list changes (`upsertWatchProviders`) — rare, and ISR catches them.

**Why in-process and not a PG "dirty" table + PM2 cron:** the signal is born in the
`next` process (PM2 fork, ONE instance — the cache-handler stores are in its memory,
so only this process can drop the hot copy), the latency target is seconds, and the
work is a lossy freshness hint (a restart/deploy resets the ISR namespace anyway,
and the edge copy expires on its own within ~2h).

**Rate-limit math (Cloudflare Free, researched Oct 2026):** single-file purge
800 URLs/s/account; prefix/tag/host/everything **5 req/min/account, bucket 25**;
≤100 items per call; one kind per call. The queue spends ≤3 prefix calls/min (+3
file calls), leaving headroom on the shared account bucket for humans. Demand is
bounded upstream: `MAX_BACKGROUND_REFRESH=3` concurrent refreshes, each seconds
long, and only changed titles enqueue — tens/min worst case vs a 150 titles/min
queue ceiling. Pending set capped at 2,000 (newest dropped + counted).

**`IMDb nightly sync` does NOT purge** (`scripts/sync-imdb-ratings.ts`, a separate
process that cannot reach the ISR store anyway). Its nightly diffs are ~0.1-point
moves across many rows; per-row purging would be pointless edge churn. ISR picks it
up within the hour, and layer 3 shows the PG value on every page load meanwhile.

**Config / ops:**
- Edge purge is a silent no-op unless `CLOUDFLARE_ZONE_ID` + a token with
  `Zone → Cache Purge → Purge` exist. Preferred: a dedicated least-privilege
  `CLOUDFLARE_PURGE_TOKEN` (falls back to `CLOUDFLARE_API_TOKEN`, which lacks the
  scope as of Oct 8 2026). Kill switches: `CDN_EDGE_PURGE=off`,
  `ORIGIN_ISR_INVALIDATE=off`.
- Manual: `POST /api/revalidate` (header `x-revalidate-secret: $AUTH_SECRET`) body
  `{"titles":[{"mediaType":"movie","id":157336,"title":"Interstellar"}]}`.
- Observe: ClickHouse `api_calls WHERE service='cdn_purge'` — endpoints
  `origin:isr` (`quota_cost`=paths, `response_size`=entries removed),
  `cloudflare:files` / `cloudflare:prefixes` (`quota_cost`=items, `error_type`
  `cf_<code>` / `network`). `cf_10000` = token lacks the purge scope;
  `cf_971`/`cf_1134`-class = rate limited.
- Verify a purge on prod: `curl -sI` the page with a real-Chrome header set →
  `cf-cache-status: MISS` on the first request after a change, then `HIT`.

**Gotchas found building it:**
- **`revalidatePath()` was a silent no-op for every cached PAGE under
  `cache-handler.cjs` until Oct 2026.** Next 16 calls `set()` for APP_PAGE with NO
  `ctx.tags` — a page's tags (incl. the implicit `_N_T_/<path>` that revalidatePath
  targets) live only in `value.headers["x-next-cache-tags"]`. Verified on prod: every
  stored entry had `tags: []` while its header held `_N_T_/movie/382544/loha`. The
  handler now unions both (`entryTags`). The deploy's `/api/revalidate` of `/` was
  therefore never doing anything (harmless: BUILD_ID namespacing already cold-starts).
- `revalidatePath` also cannot be called from the background refresh at all — it
  needs a request work-store ("static generation store missing") and throws during
  render. Hence the registry.
- The ISR cache key IS the request pathname (`sha1("/movie/382544/loha")` = the file
  name on disk — verified). The canonical slug must come from `getMediaPath`, the same
  function the proxy canonicalizes with.
- Prefix purge matches "regardless of query string", which is the ONLY way to reach
  `?_rsc=` variants (Cloudflare keys on the full query string). Never send a prefix
  shallower than `/movie|series/{id}/{slug}` — `isSafePrefix` enforces it, and
  slugless titles get files only (`/movie/12` would string-match `/movie/123…`).
- `/api/watch-providers` is `cf-cache-status: DYNAMIC` (the cache rule does not cover
  `/api`), so its `s-maxage=3600` never applied at the edge — nothing to purge, and
  non-SSR-country deep links already read PG per page load. The SSR-country (`IN`)
  deep links in the HTML rely on layers 1+2 (no client self-heal for them yet).

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
