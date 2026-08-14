/**
 * GeoIP Lookup
 *
 * Geo resolution for a request, CDN-aware. Behind CloudFront the connection
 * IP (x-real-ip / x-forwarded-for, set by Caddy from the socket peer) is a
 * CloudFront POP — geo-locating it puts users in Seattle/LA/Mumbai (the Jun
 * 2026 wonky-location bug). The viewer's identity only reaches the origin via
 * CloudFront-generated headers:
 *
 * - CloudFront-Viewer-Country / -City / -Country-Region-Name / -Time-Zone —
 *   computed at the edge from the viewer IP. Forwarded on /api/* by the
 *   managed AllViewerAndCloudFrontHeaders policy; page routes get -Country +
 *   -Address via the custom origin-request policy (terraform/cloudfront.tf).
 * - CloudFront-Viewer-Address — the real viewer "ip:port". Used for GeoIP
 *   gap-fill and as the canonical client IP.
 *
 * Cloudflare (added Aug 2026, migration in progress) supplies the same facts
 * under different names, and BOTH families are read here on purpose: the apex
 * flips between CDNs via a DNS proxy toggle, so a rollback must not require a
 * redeploy. CloudFront wins when present, keeping pre-migration behaviour
 * byte-identical.
 *
 * - `CF-Connecting-IP` — the real viewer IP (no port, unlike CloudFront's).
 * - `CF-IPCountry` — always sent by Cloudflare. NOTE it uses `XX` for unknown
 *   and `T1` for Tor; both are valid-looking 2-letter codes that must NOT be
 *   accepted as countries or they suppress the GeoIP fallback.
 * - `CF-IPCity` / `CF-Region` / `CF-Region-Code` / `CF-Timezone` — only present
 *   when the "Add visitor location headers" managed transform is enabled.
 *   Until then `CF-IPCountry` + gap-fill from `CF-Connecting-IP` covers it.
 *
 * HEADER TRUST: these are only trustworthy because the CDN overwrites them.
 * A request reaching the origin directly can forge any of them (a pre-existing
 * hole — `origin.themoviebrowser.com` is publicly reachable and the Caddy
 * X-Origin-Verify gate is dormant). Closing it is the Authenticated Origin
 * Pulls step in the migration plan; see `.claude/rules/cdn.md`.
 *
 * The geoip-lite (bundled MaxMind GeoLite2) fallback only ever runs against
 * an IP we can attribute to the viewer: the viewer address behind the CDN, or
 * the connection IP for direct-origin/dev requests. If a CDN request carries
 * no viewer address, missing fields stay null — never the POP's city.
 *
 * IMPORTANT: geoip-lite reads .dat files eagerly on require().
 * We lazy-load it to avoid build-time failures during Next.js page data collection.
 */

export interface GeoResult {
  country: string;
  city: string | null;
  region: string | null;
  timezone: string | null;
  ll: [number, number] | null;
}

export interface ResolvedGeo {
  country: string;
  city: string | null;
  region: string | null;
  timezone: string | null;
}

type HeaderGetter = { get: (name: string) => string | null };

const FALLBACK: GeoResult = {
  country: "unknown",
  city: null,
  region: null,
  timezone: null,
  ll: null,
};

/** Lazy-loaded geoip-lite module */
let geoip: typeof import("geoip-lite") | null = null;

function getGeoIP(): typeof import("geoip-lite") | null {
  if (geoip) return geoip;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    geoip = require("geoip-lite") as typeof import("geoip-lite");
    return geoip;
  } catch {
    return null;
  }
}

/**
 * Look up geographic info from an IP address.
 * Returns country code (e.g. "US", "IN"), city, region, timezone.
 */
export function lookupIP(ip: string): GeoResult {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return FALLBACK;
  }

  const geo = getGeoIP();
  if (!geo) return FALLBACK;

  const result = geo.lookup(ip);
  if (!result) return FALLBACK;

  return {
    country: result.country || "unknown",
    city: result.city || null,
    region: result.region || null,
    timezone: result.timezone || null,
    ll: result.ll || null,
  };
}

/** "1.2.3.4:46532" / "2001:db8::1:46532" -> IP without the port. */
function stripViewerAddressPort(address: string): string {
  const trimmed = address.trim();
  // Bracketed IPv6 ("[::1]:443") — not CloudFront's format, but cheap to honor.
  const bracket = trimmed.match(/^\[(.+)\]:\d+$/);
  if (bracket?.[1]) return bracket[1];
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return trimmed;
  return trimmed.slice(0, lastColon);
}

/** CloudFront percent-encodes non-ASCII header values (e.g. "S%C3%A3o Paulo"). */
function decodeViewerValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getDecoded(headers: HeaderGetter, name: string): string | null {
  const value = headers.get(name);
  return value ? decodeViewerValue(value).trim() || null : null;
}

/**
 * Cloudflare sends `CF-IPCountry: XX` when it cannot geo-locate and `T1` for
 * Tor exit nodes. Both are syntactically valid 2-letter codes, so they would
 * sail through the regex below and suppress the GeoIP fallback with a country
 * that does not exist.
 */
const NON_COUNTRY_CODES = new Set(["XX", "T1"]);

function normalizeCountry(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (NON_COUNTRY_CODES.has(normalized)) return null;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

/**
 * The IP we are allowed to GEO-LOCATE as the viewer:
 * - CloudFront-Viewer-Address when present (the real viewer IP),
 * - the connection IP only for direct-origin/dev requests (no CDN markers),
 * - null for CDN requests without a viewer address (connection IP = POP).
 */
function viewerIPForGeo(headers: HeaderGetter): string | null {
  const address = headers.get("cloudfront-viewer-address");
  if (address) return stripViewerAddressPort(address);
  // Cloudflare's equivalent. Carries no port, so no stripping.
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  // A CDN marker with no viewer IP means the connection IP is an edge node —
  // geo-locating it would stamp the user with the POP's city (the Jun 2026 bug).
  if (headers.get("cloudfront-viewer-country") || headers.get("cf-ipcountry")) return null;
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }
  return null;
}

/**
 * Resolve country code from request headers, with GeoIP fallback.
 *
 * Priority:
 * 1. CloudFront-Viewer-Country (authoritative behind the CDN)
 * 2. x-country-code header (legacy nginx GeoIP2 path)
 * 3. GeoIP lookup of the viewer IP (see viewerIPForGeo)
 * 4. "unknown"
 */
export function resolveCountry(headers: HeaderGetter): string {
  const headerCountry =
    normalizeCountry(headers.get("cloudfront-viewer-country")) ||
    normalizeCountry(headers.get("cf-ipcountry")) ||
    normalizeCountry(headers.get("x-country-code"));
  if (headerCountry) return headerCountry;

  const ip = viewerIPForGeo(headers);
  return ip ? lookupIP(ip).country : "unknown";
}

/**
 * Full geo resolution from headers: country/city/region/timezone from the
 * CloudFront viewer headers, gaps filled by a GeoIP lookup of the viewer IP.
 * Fields a CDN request doesn't carry stay null — never the POP's geo.
 */
export function resolveGeo(headers: HeaderGetter): ResolvedGeo {
  const headerCountry =
    normalizeCountry(headers.get("cloudfront-viewer-country")) ||
    normalizeCountry(headers.get("cf-ipcountry")) ||
    normalizeCountry(headers.get("x-country-code"));
  const headerCity =
    getDecoded(headers, "cloudfront-viewer-city") ||
    getDecoded(headers, "cf-ipcity") ||
    headers.get("x-city");
  const headerRegion =
    getDecoded(headers, "cloudfront-viewer-country-region-name") ||
    getDecoded(headers, "cloudfront-viewer-country-region") ||
    getDecoded(headers, "cf-region") ||
    getDecoded(headers, "cf-region-code");
  const headerTimezone =
    headers.get("cloudfront-viewer-time-zone") || headers.get("cf-timezone");

  const needsLookup = !headerCountry || !headerCity || !headerRegion || !headerTimezone;
  const ip = needsLookup ? viewerIPForGeo(headers) : null;
  const ipGeo = ip ? lookupIP(ip) : FALLBACK;

  return {
    country: headerCountry || ipGeo.country,
    city: headerCity || ipGeo.city,
    region: headerRegion || ipGeo.region,
    timezone: headerTimezone || ipGeo.timezone,
  };
}

/**
 * The viewer's network ASN, or null.
 *
 * CloudFront forwards this natively as `CloudFront-Viewer-ASN`. **Cloudflare has
 * no equivalent header** — `cf.asn` exists only as a ruleset FIELD. So behind
 * Cloudflare we synthesise `X-Viewer-ASN` with a request-header Transform Rule
 * whose value is the `cf.asn` expression; without that rule this returns null
 * and every ASN-derived signal (the proxy's datacenter shed, the analytics
 * "datacenter" bot label) silently goes dark rather than misfiring.
 *
 * Same trust model as the geo headers: safe only because the CDN overwrites it.
 */
export function resolveViewerAsn(headers: HeaderGetter): number | null {
  const raw = headers.get("cloudfront-viewer-asn") ?? headers.get("x-viewer-asn");
  if (!raw) return null;
  const asn = Number(raw.trim());
  return Number.isFinite(asn) && asn > 0 ? asn : null;
}

/**
 * Extract the client IP for hashing/logging (NOT for geo — see viewerIPForGeo).
 * Priority: CloudFront-Viewer-Address > CF-Connecting-IP > X-Real-IP >
 * X-Forwarded-For > unknown.
 */
export function extractIP(headers: HeaderGetter): string {
  const address = headers.get("cloudfront-viewer-address");
  if (address) return stripViewerAddressPort(address);

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }

  return "unknown";
}
