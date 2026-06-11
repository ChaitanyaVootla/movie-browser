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

import { resolveGeo, lookupIP, extractIP } from "./geoip";

export interface UserProfileLocation {
  countryCode: string;
  countryName?: string;
  city?: string;
  timezone?: string;
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
 * Resolve a persistable location from request headers (x-country-code/x-city
 * if a proxy sets them, GeoIP lookup from the client IP otherwise).
 * Returns null when nothing resolves — callers must not overwrite an existing
 * stored location with null.
 */
export function resolveUserLocation(headers: {
  get: (name: string) => string | null;
}): UserProfileLocation | null {
  const { country, city } = resolveGeo(headers);
  if (!country || country === "unknown") return null;

  // resolveGeo skips the IP lookup when header geo is present; do it here so
  // timezone (and city, if the header path had none) still gets captured.
  const ipGeo = lookupIP(extractIP(headers));

  const location: UserProfileLocation = { countryCode: country };
  const countryName = countryDisplayName(country);
  if (countryName) location.countryName = countryName;
  const resolvedCity = city ?? ipGeo.city;
  if (resolvedCity) location.city = resolvedCity;
  if (ipGeo.timezone) location.timezone = ipGeo.timezone;
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
