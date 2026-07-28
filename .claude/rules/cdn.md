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

## Open items (Jun 11–12, deferred)
- Origin SG lockdown (above). TF drift from manual SG edits during the incident.
- **CloudFront access logging enabled Jul 28 2026 via CLI (TF DRIFT)**: standard
  logs → `s3://movie-browser-cf-logs-620733889764/cf/` (7-day lifecycle expiry),
  enabled to trace the Jul 28 residential-proxy scraper fleet. NOT in
  `cloudfront.tf` — a full (non-`-target`) distribution apply would silently
  DISABLE it. Fold into TF or disable when the trace need passes.
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

See also: `.claude/rules/performance.md` (cold-start stampede, freeze recovery),
`.claude/rules/infrastructure.md` (EC2/SG/deploy).
