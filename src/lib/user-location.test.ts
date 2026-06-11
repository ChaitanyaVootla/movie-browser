import { describe, it, expect } from "vitest";
import { resolveUserLocation, mergeProfileLocation } from "./user-location";

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
