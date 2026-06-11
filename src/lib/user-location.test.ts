import { describe, it, expect } from "vitest";
import {
  resolveUserLocation,
  mergeProfileLocation,
  shouldRefreshStoredLocation,
  extractProfileLocation,
} from "./user-location";

describe("resolveUserLocation", () => {
  it("returns null when no geo signal is present", () => {
    expect(resolveUserLocation(new Headers())).toBeNull();
  });

  it("builds a location from x-country-code / x-city headers", () => {
    const headers = new Headers({
      "x-country-code": "in",
      "x-city": "Hyderabad",
    });

    const location = resolveUserLocation(headers);

    expect(location).not.toBeNull();
    expect(location?.countryCode).toBe("IN");
    expect(location?.countryName).toBe("India");
    expect(location?.city).toBe("Hyderabad");
  });

  it("falls back to GeoIP lookup from the client IP", () => {
    // 8.8.8.8 (Google public DNS) resolves to US in every GeoLite2 build
    const headers = new Headers({ "x-real-ip": "8.8.8.8" });

    const location = resolveUserLocation(headers);

    expect(location).not.toBeNull();
    expect(location?.countryCode).toBe("US");
    expect(location?.countryName).toBe("United States");
  });
});

describe("mergeProfileLocation", () => {
  const location = { countryCode: "IN", countryName: "India", city: "Hyderabad" };

  it("creates the metadata.profile.location structure from empty metadata", () => {
    expect(mergeProfileLocation(null, location)).toEqual({
      profile: { location },
    });
  });

  it("preserves existing metadata and profile keys", () => {
    const existing = {
      preferences: { theme: "dark" },
      profile: {
        givenName: "Chai",
        location: { countryCode: "US" },
      },
    };

    expect(mergeProfileLocation(existing, location)).toEqual({
      preferences: { theme: "dark" },
      profile: {
        givenName: "Chai",
        location,
      },
    });
  });

  it("treats non-object metadata as empty", () => {
    expect(mergeProfileLocation("garbage", location)).toEqual({
      profile: { location },
    });
  });
});

describe("extractProfileLocation", () => {
  it("returns metadata.profile.location when present", () => {
    const metadata = { profile: { location: { countryCode: "IN" } } };
    expect(extractProfileLocation(metadata)).toEqual({ countryCode: "IN" });
  });

  it("returns null for missing or malformed metadata", () => {
    expect(extractProfileLocation(null)).toBeNull();
    expect(extractProfileLocation({})).toBeNull();
    expect(extractProfileLocation({ profile: "garbage" })).toBeNull();
  });
});

describe("shouldRefreshStoredLocation", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const fresh = { countryCode: "IN", city: "Hyderabad" };
  const recentStamp = new Date(now.getTime() - 60_000).toISOString();

  it("refreshes when nothing is stored", () => {
    expect(shouldRefreshStoredLocation(null, fresh, now, DAY)).toBe(true);
    expect(shouldRefreshStoredLocation("garbage", fresh, now, DAY)).toBe(true);
    expect(shouldRefreshStoredLocation({}, fresh, now, DAY)).toBe(true);
  });

  it("refreshes when the country changed", () => {
    const stored = { countryCode: "US", city: "Hyderabad", updatedAt: recentStamp };
    expect(shouldRefreshStoredLocation(stored, fresh, now, DAY)).toBe(true);
  });

  it("refreshes when the city changed", () => {
    const stored = { countryCode: "IN", city: "Mumbai", updatedAt: recentStamp };
    expect(shouldRefreshStoredLocation(stored, fresh, now, DAY)).toBe(true);
  });

  it("refreshes when the stored stamp is older than maxAge (or missing)", () => {
    const oldStamp = new Date(now.getTime() - 2 * DAY).toISOString();
    expect(
      shouldRefreshStoredLocation({ ...fresh, updatedAt: oldStamp }, fresh, now, DAY),
    ).toBe(true);
    expect(shouldRefreshStoredLocation({ ...fresh }, fresh, now, DAY)).toBe(true);
  });

  it("does not refresh when location is unchanged and recently stamped", () => {
    const stored = { countryCode: "IN", city: "Hyderabad", updatedAt: recentStamp };
    expect(shouldRefreshStoredLocation(stored, fresh, now, DAY)).toBe(false);
  });

  it("does not treat a missing fresh city as a change", () => {
    const stored = { countryCode: "IN", city: "Hyderabad", updatedAt: recentStamp };
    expect(shouldRefreshStoredLocation(stored, { countryCode: "IN" }, now, DAY)).toBe(false);
  });
});
