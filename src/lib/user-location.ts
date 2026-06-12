/**
 * User Profile Location
 *
 * Builds the `metadata.profile.location` object persisted on the PG user row
 * at sign-in. The legacy Nuxt app stamped this from Nginx GeoIP headers; the
 * user-data migration carried those values over, but nothing in this app wrote
 * it for post-GA users — the admin Users tab showed no location for anyone who
 * signed up after the cutover. Shape matches what the migration wrote
 * (scripts/migrate-user-data.ts) and what the admin UI reads.
 */

import { resolveGeo } from "./geoip";

export interface UserProfileLocation {
  countryCode: string;
  countryName?: string;
  city?: string;
  /** State/province display name (admin Users tab reads stateName || region). */
  region?: string;
  timezone?: string;
  /** ISO stamp of when this location was resolved — drives refresh staleness. */
  updatedAt?: string;
}

/** "IN" -> "India"; returns undefined for codes Intl can't name. */
function countryDisplayName(code: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a persistable location from request headers. resolveGeo is CDN-aware:
 * CloudFront viewer headers first, GeoIP of the viewer IP for gaps, and never
 * the connection IP behind the CDN (that's a CloudFront POP — the Jun 2026
 * "users in Seattle/LA" bug). Returns null when nothing resolves — callers
 * must not overwrite an existing stored location with null.
 */
export function resolveUserLocation(headers: {
  get: (name: string) => string | null;
}): UserProfileLocation | null {
  const { country, city, region, timezone } = resolveGeo(headers);
  if (!country || country === "unknown") return null;

  const location: UserProfileLocation = { countryCode: country };
  const countryName = countryDisplayName(country);
  if (countryName) location.countryName = countryName;
  if (city) location.city = city;
  if (region) location.region = region;
  if (timezone) location.timezone = timezone;
  return location;
}

/**
 * Merge a location into a user's JSON metadata, preserving all other
 * metadata/profile keys. Non-object metadata (null, legacy garbage) is
 * treated as empty.
 */
export function mergeProfileLocation(
  metadata: unknown,
  location: UserProfileLocation,
): Record<string, unknown> {
  const base =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const profile =
    typeof base.profile === "object" && base.profile !== null && !Array.isArray(base.profile)
      ? (base.profile as Record<string, unknown>)
      : {};

  return {
    ...base,
    profile: { ...profile, location: { ...location } },
  };
}

/** Read the location object out of a user's JSON metadata, null if absent. */
export function extractProfileLocation(metadata: unknown): unknown {
  if (typeof metadata !== "object" || metadata === null) return null;
  const profile = (metadata as Record<string, unknown>).profile;
  if (typeof profile !== "object" || profile === null) return null;
  const location = (profile as Record<string, unknown>).location;
  if (typeof location !== "object" || location === null) return null;
  return location;
}

/**
 * Decide whether a stored metadata.profile.location needs rewriting given a
 * freshly resolved one: yes when nothing valid is stored, the country/city
 * actually changed, or the stored stamp is older than maxAgeMs. A fresh
 * location with no city never counts as a city change (GeoIP city coverage
 * is spotty — don't churn on lookup variance).
 */
export function shouldRefreshStoredLocation(
  stored: unknown,
  fresh: UserProfileLocation,
  now: Date,
  maxAgeMs: number,
): boolean {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return true;
  const s = stored as Record<string, unknown>;
  if (typeof s.countryCode !== "string" || s.countryCode.length === 0) return true;

  if (s.countryCode !== fresh.countryCode) return true;
  if (fresh.city && s.city !== fresh.city) return true;

  if (typeof s.updatedAt !== "string") return true;
  const stampMs = Date.parse(s.updatedAt);
  if (Number.isNaN(stampMs)) return true;
  return now.getTime() - stampMs > maxAgeMs;
}
