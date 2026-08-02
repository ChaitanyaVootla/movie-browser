// CloudFront Function (viewer-request) — cookie normalization for cache-key hygiene.
//
// Runtime constraints (cloudfront-js-2.0): ES5.1-ish, synchronous only, no
// async/await, no network, no require(), <1ms, <10KB. Keep it tiny + pure.
//
// Purpose: anonymous viewers must SHARE one cache key per URL. The origin (Next)
// and analytics set many cookies (e.g. analytics IDs) that would otherwise
// fragment the cache into one object per visitor and crush the hit ratio.
//
// Logic:
//   * If an Auth.js SESSION cookie is present (`__Secure-authjs.session-token`
//     or `authjs.session-token`), the viewer is LOGGED IN. We leave the Cookie
//     header fully intact so the request key is unique and CloudFront does NOT
//     hand this viewer a cached anonymous HTML object. Combined with the cache
//     policy whitelisting the session cookie in the cache key, logged-in
//     requests get their own (effectively uncached / per-session) variant and
//     the origin renders fresh. See cloudfront.tf for how the cache policy
//     participates in this.
//   * Otherwise (anonymous), strip the Cookie header entirely so every
//     anonymous request for a URL collapses to a single shared cache key.
//
// NOTE: this function only touches the REQUEST. Removing Set-Cookie from cached
// RESPONSES (so we never replay one user's session cookie to another) is done by
// the response headers policy, not here.

// Shed-tier scrapers (no index/answer-engine value) — 429 them HERE at the
// edge, before they reach the origin or even consume edge cache. The origin
// Caddy shed can't do this behind CloudFront (it only sees cache misses, and a
// 429 cached by UA-agnostic key would poison the URL for humans). Edge-shedding
// is what keeps the scraper long-tail off the (cold, 2-vCPU) origin. Indexers
// (Googlebot/Bingbot/GPTBot/ClaudeBot/PerplexityBot/etc.) are NOT listed → served.
var SHED_BOTS = [
    'bytespider', 'bytedance', 'semrushbot', 'ahrefsbot', 'dataforseo',
    'mj12bot', 'dotbot', 'blexbot', 'petalbot', 'scrapy', 'python-requests',
    'go-http-client', 'node-fetch', 'axios', 'wget', 'libwww', 'httpclient'
];

// Checked BEFORE SHED_BOTS, because several TIER-2 "always serve" bots identify
// themselves with a generic HTTP-client token that SHED_BOTS matches.
//
// Aug 2 2026: `LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient
// +http://www.linkedin.com)` contains "httpclient", so LinkedIn link previews
// were 429'd — at the edge here AND at Caddy — for every movie/series page
// anyone shared. It was invisible in analytics precisely because the 429 happens
// before the origin (only 2 `bot_type='linkedin'` page_views in 14 days, both
// synthetic probes). Link-unfurl bots are load-bearing for the share strategy
// (see .claude/rules/cdn.md).
//
// A UA allowlist is forgeable, but it costs nothing here: this shed is ALREADY
// UA-based, so a scraper could simply omit the shed token instead. (Contrast the
// ASN shed, which must NOT grow a UA exemption — there the signal is
// non-forgeable and an exemption would hand out a one-header bypass.)
// Only entries that collide with a SHED_BOTS token change behaviour; the rest
// are listed so the next collision is harmless.
var ALWAYS_SERVE = [
    'linkedinbot',      // Apache-HttpClient -> collides with 'httpclient'
    'googlebot', 'bingbot', 'applebot', 'duckduckbot', 'yandexbot',
    'slackbot', 'discordbot', 'twitterbot', 'facebookexternalhit',
    'whatsapp', 'telegrambot', 'redditbot', 'pinterest',
    'oai-searchbot', 'chatgpt-user'
];

function handler(event) {
    var request = event.request;
    var headers = request.headers;

    // Edge bot-shed (viewer-request short-circuit): 429 shed-tier scrapers.
    var uaHeader = headers['user-agent'];
    if (uaHeader && uaHeader.value) {
        var ua = uaHeader.value.toLowerCase();
        var serve = false;
        for (var a = 0; a < ALWAYS_SERVE.length; a++) {
            if (ua.indexOf(ALWAYS_SERVE[a]) !== -1) {
                serve = true;
                break;
            }
        }
        for (var i = 0; !serve && i < SHED_BOTS.length; i++) {
            if (ua.indexOf(SHED_BOTS[i]) !== -1) {
                return {
                    statusCode: 429,
                    statusDescription: 'Too Many Requests',
                    headers: { 'retry-after': { value: '3600' } }
                };
            }
        }
    }

    if (!headers.cookie) {
        return request;
    }

    var cookieValue = headers.cookie.value;

    // Cheap substring check is sufficient and fast; cookie names are fixed.
    var hasSession =
        cookieValue.indexOf('__Secure-authjs.session-token=') !== -1 ||
        cookieValue.indexOf('authjs.session-token=') !== -1;

    if (hasSession) {
        // Logged-in: keep cookies intact — distinct cache key, origin serves fresh.
        return request;
    }

    // Anonymous: drop ALL cookies so anon viewers share one cache key per URL.
    delete request.headers.cookie;

    return request;
}
