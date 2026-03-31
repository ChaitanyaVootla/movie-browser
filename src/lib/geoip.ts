/**
 * GeoIP Lookup
 *
 * App-level GeoIP using geoip-lite (bundles MaxMind GeoLite2).
 * Replaces the Nginx GeoIP2 module for setting x-country-code / x-city headers.
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

/**
 * Resolve country code from request headers, with GeoIP fallback.
 *
 * Priority:
 * 1. x-country-code header (set by proxy, if configured)
 * 2. GeoIP lookup from client IP
 * 3. "unknown"
 */
export function resolveCountry(headers: {
  get: (name: string) => string | null;
}): string {
  const headerCountry = headers.get("x-country-code");
  if (headerCountry) {
    const normalized = headerCountry.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized)) {
      return normalized;
    }
  }

  const ip = extractIP(headers);
  const geo = lookupIP(ip);
  return geo.country;
}

/**
 * Full geo resolution from headers with GeoIP fallback.
 */
export function resolveGeo(headers: {
  get: (name: string) => string | null;
}): { country: string; city: string | null } {
  const headerCountry = headers.get("x-country-code");
  const headerCity = headers.get("x-city");

  if (headerCountry) {
    const normalized = headerCountry.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized)) {
      return { country: normalized, city: headerCity || null };
    }
  }

  const ip = extractIP(headers);
  const geo = lookupIP(ip);
  return { country: geo.country, city: headerCity || geo.city };
}

/** Extract client IP from headers (X-Real-IP > X-Forwarded-For > unknown) */
function extractIP(headers: { get: (name: string) => string | null }): string {
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }

  return "unknown";
}
