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

function handler(event) {
    var request = event.request;
    var headers = request.headers;

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
