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
  CloudFront sends `Host: origin.themoviebrowser.com` (we do NOT forward viewer Host).
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
1. **RSC client-nav**: cache key MUST include the `_rsc` query param and the
   origin-request policy MUST forward the `rsc` header, or App-Router navigation
   gets HTML instead of a flight payload and breaks. Verify: a `?_rsc=` request
   returns `content-type: text/x-component`.
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
7. **Geo**: behind CloudFront the origin only sees edge IPs → IP-geoip shows US.
   Read the `CloudFront-Viewer-Country` header (`src/lib/geoip.ts`), and `/api/*`
   MUST use the `AllViewerAndCloudFrontHeaders` origin-request policy (plain
   AllViewer does NOT forward CF-generated headers). Header is NOT in the cache key
   (SSR HTML stays country-agnostic; /api/geo is uncached).
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
SERVE the indexers (Googlebot/Bingbot/Applebot/GPTBot/OAI-SearchBot/ClaudeBot/
PerplexityBot) — cached at the edge for ~zero origin cost = back in search + AI
answer engines. `public/robots.txt` mirrors the two tiers. Caddy still keeps a
Tier-1 shed as defense-in-depth, and `src/proxy.ts` 429s forged-Chrome scrapers.
**Edge bot-shedding was THE fix that stopped the cold origin stampeding.**

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
Origin Shield ~$3/mo (keep). The real cost is **egress** (India ~$0.109/GB) +
requests — ~$75–135/mo at the GA surge, ~$15–40 steady. PriceClass tweaks DON'T help
an India-heavy audience (India is in PriceClass_200 and _All alike). **The only
material cost lever is migrating to Cloudflare Free** ($0 egress + free request
collapsing; the setup is portable — DNS + cache-rule re-expression). Deferred
decision: stay CloudFront (AWS-native + api.* product) vs Cloudflare (cost). See
memory `cdn-plan-jun11`.

## Open items (Jun 11, deferred)
- 2 unpushed commits (deploymentId + invalidation + edge-shed/image/api/geo/gating)
  — activate on the next deliberate deploy.
- Origin SG lockdown (above). TF drift from manual SG edits during the incident.
- www still A→EIP (works via 301→CF; cleaner to alias www→CF).
- Pre-existing app bugs surfaced (NOT CDN): `/topics/genre-war-politics-tv` genuine
  404 (topic-slug bug), serwist SW `parseRoute` error (PWA config).

See also: `.claude/rules/performance.md` (cold-start stampede, freeze recovery),
`.claude/rules/infrastructure.md` (EC2/SG/deploy).
