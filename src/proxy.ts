import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { buildTrackingContext, getPageTypeFromPath, getItemFromPath } from "@/lib/analytics/context-core";
import { detectBotFromRequest } from "@/lib/analytics/bot-detection";
import { trackPageView } from "@/lib/analytics/track";
import { SITE_URL } from "@/lib/constants";
import {
  parseMediaDetailPath,
  getCachedSlug,
  resolveMediaSlug,
  decideMediaRoute,
  NOT_FOUND,
  type MediaType,
  type ResolvedSlug,
  type DiscussSuffix,
} from "@/server/proxy/media-resolver";
import { isMarkdownRequest, markdownPathToTarget } from "@/lib/llm/paths";

const { auth } = NextAuth(authConfig);

/**
 * Auth.js proxy for route protection + request path header + page tracking.
 *
 * In Next.js 16, proxy.ts always runs on the Node.js runtime (middleware.ts
 * was Edge), so it can queue ClickHouse events directly. It still uses the
 * lean auth.config.ts (no DB adapter) — sessions are JWT, req.auth is enough.
 *
 * Sets x-pathname header so server components can access the request path.
 *
 * Server-side page-view tracking lives HERE, not in a layout component:
 * anything that awaits headers() inside the render tree opts every route out
 * of ISR (see .claude/rules/performance.md), and with ISR active a cached
 * page serve never re-renders the layout anyway — the proxy is the only
 * place that sees every request, including bots and cache hits.
 */
export default auth((req: NextRequest & { auth: Session | null }) => {
  // Markdown twins (.md paths + /search.md): rewrite to the read-only /api/md
  // route BEFORE the scraper shed and BEFORE the media-resolver. This is the
  // "steer good agents to the cheap .md" exemption — the Accept: text/markdown
  // 429 below and the ClaudeBot/GPTBot BLOCKED_BOT_TYPES 429 must NOT apply
  // here (the .md twin is PG-only, no SSR/hydration/Lambda, and edge-cacheable,
  // so it's the cost-safe path we WANT crawlers on). Short-circuiting also keeps
  // the media-resolver from 308-stripping the ".md" suffix.
  if (req.method === "GET" && isMarkdownRequest(req.nextUrl.pathname)) {
    maybeTrackPageView(req); // keep .md hits visible in analytics
    const url = req.nextUrl.clone();
    const target = markdownPathToTarget(url.pathname);
    // Forward the original query string (q for /search.md, page for /browse.md +
    // /topics/*.md) and set the internal target path. `set("p", …)` overrides any
    // attacker-supplied `p` in the original query, so there's no p-injection.
    const params = new URLSearchParams(req.nextUrl.searchParams);
    params.set("p", target);
    url.pathname = "/api/md";
    url.search = `?${params.toString()}`;
    return NextResponse.rewrite(url);
  }

  // Block high-confidence scrapers BEFORE rendering. Post-GA a distributed
  // fleet (rotating IPs, forged Chrome UAs, no JS) crawled long-tail URLs at
  // a rate that outpaced the ISR cache fill and 502'd the box. Detection is
  // the proven analytics layer-3 logic (see bot-detection.ts): webdriver
  // header, "Headless" client hints, modern-Chrome UA with NO sec-ch-ua
  // (real Chromium >= 89 always sends hints over HTTPS; iOS excluded), plus
  // Accept: text/markdown (LLM scrapers — no browser sends that). Honest
  // crawlers (Googlebot, Bingbot, social preview bots) are NOT affected.
  if (req.method === "GET" && isBlockedScraper(req)) {
    maybeTrackPageView(req); // keep the fleet visible in analytics
    return new NextResponse(null, {
      status: 429,
      // no-store is LOAD-BEARING once CloudFront forwards the real UA (Jul 28
      // 2026): UA is NOT in the edge cache key, so a cacheable 429 emitted on
      // a cache-miss would poison that URL for real users (cdn.md bot-strategy
      // warning). CloudFront honors no-store on error responses.
      headers: { "retry-after": "3600", "cache-control": "private, no-store" },
    });
  }

  // 404/308 resolution for movie/series detail URLs lives HERE, pre-render:
  // the detail routes now carry loading.tsx (instant nav skeletons), which
  // streams a 200 before generateMetadata can throw notFound()/redirect —
  // so the proxy is the only place a real status code can still be emitted.
  // LRU hit = fully synchronous; miss = one indexed PG PK lookup (then a
  // 2s-capped TMDB existence check for not-yet-hydrated new releases).
  // Any failure falls through to the page (fail open). See media-resolver.ts.
  if (req.method === "GET") {
    try {
      const parsed = parseMediaDetailPath(req.nextUrl.pathname);
      if (parsed?.kind === "invalid") {
        // Non-numeric/garbage detail path — can never exist, real 404.
        return applyMediaDecision(req, NOT_FOUND, null, 0);
      }
      if (parsed?.kind === "media") {
        // Accepted limitation: for /discuss/sXeY we verify the SERIES exists
        // (404/308 authority) but NOT that S{s}E{e} exists — that would cost an
        // extra episodes query per request. A discuss page for a nonexistent
        // episode renders the not-found UI with HTTP 200 (soft-404), same
        // fallback class as proxy-bypassing detail requests. Discuss pages are
        // only ever linked for episodes that exist; revisit if GSC flags it.
        const cached = getCachedSlug(parsed.mediaType, parsed.id);
        if (cached !== undefined) {
          return applyMediaDecision(req, cached, parsed.mediaType, parsed.id, parsed.discuss, parsed.discussions);
        }
        return resolveAndApply(req, parsed.mediaType, parsed.id, parsed.discuss, parsed.discussions);
      }
    } catch {
      // Resolver must never take down a route — fall through to the page.
    }
  }

  return passThrough(req);
});

/** Default pass-through: x-pathname header + page-view tracking. */
function passThrough(
  req: NextRequest & { auth: Session | null },
  mediaVerified = false,
): NextResponse {
  let response: NextResponse;
  if (mediaVerified) {
    // Informational marker for the page: the proxy already confirmed this
    // id/slug, so the page's generateMetadata fallback throws are dead code
    // for this request.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-media-verified", "1");
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next();
  }
  response.headers.set("x-pathname", req.nextUrl.pathname);
  maybeTrackPageView(req);
  return response;
}

/** Turn a resolved slug (or NOT_FOUND / null) into the proxy response. */
function applyMediaDecision(
  req: NextRequest & { auth: Session | null },
  resolved: ResolvedSlug | null,
  mediaType: MediaType | null,
  id: number,
  discuss?: DiscussSuffix,
  discussions?: boolean,
): NextResponse {
  const decision =
    mediaType === null
      ? ({ action: "not_found" } as const)
      : decideMediaRoute(req.nextUrl.pathname, mediaType, id, resolved, discuss, discussions);

  if (decision.action === "redirect") {
    // 308 to the single canonical form, preserving the query string (the
    // page's old permanentRedirect dropped it; keeping it is strictly safer
    // and can't loop — the canonical path always compares equal next time).
    // Origin gotchas (all verified): Next's proxy adapter REQUIRES an absolute
    // Location (a relative one throws ERR_INVALID_URL → 500), and
    // req.nextUrl.origin reflects the server's internal address, not the request
    // (`-p 3111` server reported localhost:3000). So build the origin from what
    // the client asked for: X-Forwarded-Proto/Host.
    //
    // CRITICAL (Jun 11): behind CloudFront the origin sees Host:
    // origin.themoviebrowser.com — CF rewrites the viewer Host to the origin
    // domain and Caddy mirrors it into x-forwarded-host. Emitting THAT as the
    // 308 target sent every bare-id nav (all trending-carousel links lack a
    // slug) CROSS-ORIGIN to origin.* → App-Router client navigation broke. So
    // canonicalize the internal origin host back to the public site host. dev
    // (localhost) / beta / www keep their own host and just get the slug 308.
    const proto =
      req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    const base = host === "origin.themoviebrowser.com" ? SITE_URL : `${proto}://${host}`;
    maybeTrackPageView(req);
    const redirect = NextResponse.redirect(
      `${base}${decision.location}${req.nextUrl.search}`,
      308,
    );
    // Let CloudFront cache the canonical-slug redirect — wrong-slug URLs
    // (old indexed links) otherwise cost an origin round-trip per hit. Safe
    // to cache long: the canonical slug only changes with a title rename,
    // and the target page itself revalidates hourly.
    redirect.headers.set("cache-control", "public, s-maxage=86400");
    return redirect;
  }

  if (decision.action === "not_found") {
    // Rewrite (not redirect) to a loading.tsx-less route that calls
    // notFound() pre-flush → branded not-found UI with a REAL 404 status.
    maybeTrackPageView(req); // keep garbage-id crawler sweeps visible
    const url = req.nextUrl.clone();
    url.pathname = "/media-not-found";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  return passThrough(req, decision.verified);
}

/** LRU-miss path: resolve via PG → TMDB, then apply. Never throws. */
async function resolveAndApply(
  req: NextRequest & { auth: Session | null },
  mediaType: MediaType,
  id: number,
  discuss?: DiscussSuffix,
  discussions?: boolean,
): Promise<NextResponse> {
  try {
    const resolved = await resolveMediaSlug(mediaType, id);
    return applyMediaDecision(req, resolved, mediaType, id, discuss, discussions);
  } catch {
    return passThrough(req); // fail open
  }
}

// Live ClickHouse data (GA day): missing_client_hints 4,016 req/10min +
// stale_chrome 2,858 req/10min vs ~650 human requests — these two classes
// ARE the fleet. stale_chrome = Chrome major <= 109 baked into scraper
// configs; real 2026 usage of those versions is ~0 (see bot-detection.ts).
// bytedance (ByteSpider): top *served* crawler at ~420 req/10–15min sustained
// (Jun 10 2026: 6.3k req/15min, >40% of all traffic) — its cold-render burn
// after each deploy's ISR wipe drove three brief outages in one evening. It
// ignores robots.txt crawl-delay and brings no referral traffic; 429 it.
//
// AI TRAINING/BULK CRAWLERS (Jul 2 2026): ClickHouse showed ClaudeBot
// ("anthropic", ~1.4M views/wk) + GPTBot ("openai", ~0.5M/wk) = ~98% of bot
// load, crawling ~1.5M unique long-tail URLs → cache-miss renders + puppeteer
// ratings scrapes = the bulk of the Lambda + Origin Shield + CloudFront bill,
// for ZERO search-index value (Googlebot/Bingbot crawled 6/5× the same week).
// robots.txt now disallows them (both honor it, effective in days); this 429s
// them immediately for origin-CPU + Lambda relief. NOT blocked: "chatgpt"
// (ChatGPT-User) — a human-initiated fetch, kept per robots.txt. See cdn.md.
const BLOCKED_BOT_TYPES = new Set([
  "webdriver",
  "headless_hint",
  "missing_client_hints",
  "stale_chrome",
  "bytedance",
  "openai", // GPTBot
  "anthropic", // ClaudeBot / Claude-Web / anthropic-ai
  "common_crawl", // CCBot (feeds most LLM training sets)
  "cohere", // cohere-ai
  "amazon", // Amazonbot
  "meta", // meta-externalagent (Meta AI training)
]);

// DATACENTER-FLEET SHED (Jul 28 2026). A disguised crawler fleet on Alibaba
// Cloud (SG + US regions) crawled the long-tail catalog at ~35k renders/hr
// wearing a real Chrome UA (Chrome/145, macOS) WITH valid sec-ch-ua hints —
// invisible to the UA/heuristic shed above. Identified via CloudFront access
// logs (rotating 43.119.100.x + 47.82.201.x instances, ~100 req each) + whois
// (Alibaba Cloud Singapore Pte Ltd / Alibaba Cloud LLC). Requires the
// CloudFront-Viewer-Address header (forwarded since the allViewer origin-req
// policy, same day). Anonymous page GETs only — a logged-in session cookie
// exempts the request (a real human on an Alibaba-adjacent VPN can still
// sign in). Supernets, not /24s: the fleet rotates within the allocations.
// UPDATE Jul 29 2026 — the fleet ROTATED PROVIDERS within a day (Alibaba →
// Vultr/Constant + DigitalOcean + friends: 45.32/45.76/45.77/108.61/139.180/
// 149.28/152.42/168.144/207.148 …), so ~14k distinct IPs each made only 1-2
// origin requests: **per-IP rate limiting cannot catch this** (every single IP
// looks human-paced; only the aggregate hurts) and per-CIDR is whack-a-mole.
// So the PRIMARY signal is now the hosting **ASN** (`CloudFront-Viewer-ASN`,
// added to the origin-request whitelist the same day); the CIDR list below is
// kept as a fallback for when the header is missing.
//
// DELIBERATELY NOT BLOCKED: AWS (16509), Google (15169), Microsoft/Azure
// (8075), Cloudflare (13335). Real search crawlers AND link-unfurl bots
// (Slack/Discord/WhatsApp previews — load-bearing for the share strategy) live
// there. Consequence worth noting: a FORGED Googlebot UA coming from a
// cheap-VPS ASN is now shed, while the real Googlebot (Google ASN) always
// passes — so no UA exemption is needed here, and none should be added (it
// would hand every scraper a one-header bypass).
const BLOCKED_HOSTING_ASNS = new Set([
  20473, // AS-CHOOPA / Vultr (The Constant Company) — the Jul 29 bulk
  14061, // DigitalOcean
  45102, // Alibaba Cloud (Singapore)
  37963, // Alibaba Cloud (Hangzhou)
  45103, // Alibaba Cloud US
  136907, // Huawei Cloud
  55990, // Huawei Cloud (2)
  51167, // Contabo
  24940, // Hetzner
  16276, // OVH
  63949, // Akamai/Linode
  132203, // Tencent Cloud
  45090, // Tencent Cloud (2)
  9009, // M247
  49981, // WorldStream
]);

const BLOCKED_DC_CIDRS: Array<[string, number]> = [
  ["43.96.0.0", 11], // Alibaba Cloud APAC (the Jul 28 fleet)
  ["47.80.0.0", 13], // Alibaba Cloud US (the Jul 28 fleet)
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isBlockedDatacenterIP(req: NextRequest): boolean {
  try {
    // Logged-in users are always exempt (the CF function only forwards cookies
    // for authenticated requests, so cookie presence = real session). Checked
    // first so a human on a cloud VPN is never shed by ASN or CIDR.
    if (req.cookies.has("__Secure-authjs.session-token") || req.cookies.has("authjs.session-token")) {
      return false;
    }

    const asn = Number(req.headers.get("cloudfront-viewer-asn"));
    if (Number.isFinite(asn) && asn > 0 && BLOCKED_HOSTING_ASNS.has(asn)) return true;

    // "ip:port" for IPv4; IPv6 (contains extra colons) is not fleet traffic —
    // skip it rather than mis-parse.
    const addr = req.headers.get("cloudfront-viewer-address");
    if (!addr) return false;
    const ip = addr.split(":")[0];
    if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
    const ipInt = ipv4ToInt(ip);
    return BLOCKED_DC_CIDRS.some(
      ([net, bits]) => ipInt >>> (32 - bits) === ipv4ToInt(net) >>> (32 - bits),
    );
  } catch {
    return false; // never block on a parse failure
  }
}

function isBlockedScraper(req: NextRequest): boolean {
  try {
    // LLM/markdown scrapers self-identify via Accept (browsers never send this)
    if (req.headers.get("accept")?.includes("text/markdown")) return true;

    if (isBlockedDatacenterIP(req)) return true;

    const { botType } = detectBotFromRequest(
      req.headers.get("user-agent") || "",
      req.headers.get("sec-ch-ua"),
      req.headers.get("x-analytics-wd"),
    );
    return botType !== null && BLOCKED_BOT_TYPES.has(botType);
  } catch {
    return false; // never block on a detection failure
  }
}

/**
 * Track full-document GET requests (the equivalent of what the old
 * ServerPageTracker layout component saw). RSC navigation/prefetch requests
 * are excluded — client-side PageViewTracker covers soft navigations.
 */
function maybeTrackPageView(req: NextRequest & { auth: Session | null }): void {
  try {
    if (req.method !== "GET") return;
    if (req.headers.get("rsc") || req.headers.get("next-router-prefetch")) return;

    const path = req.nextUrl.pathname;
    if (path.startsWith("/api/") || path.startsWith("/_next/")) return;

    const context = buildTrackingContext(req.headers, req.auth?.user ?? null);
    const { mediaType, itemId } = getItemFromPath(path);

    trackPageView(context, {
      path,
      pageType: getPageTypeFromPath(path),
      itemId,
      itemMediaType: mediaType,
    });
  } catch {
    // Analytics must never break request handling
  }
}

/**
 * Matcher configuration - defines which routes the proxy runs on.
 *
 * We exclude:
 * - _next/static (static files)
 * - _next/image (image optimization files)
 * - favicon.ico and other public assets
 * - API routes except auth
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, etc.)
     */
    // 666170ce… = IndexNow key file; its verifier must never hit the scraper 429
    "/((?!_next/static|_next/image|favicon.ico|images|popcorn|manifest.json|robots.txt|llms.txt|sitemap|serwist|api|666170ce7734064c2d3dbe589dc9cdfb.txt).*)",
  ],
};
