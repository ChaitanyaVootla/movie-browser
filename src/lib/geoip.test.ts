import { describe, it, expect } from "vitest";
import { extractIP, resolveGeo, resolveCountry } from "./geoip";

// Real GeoLite2 anchors (stable across builds):
// 8.8.8.8 (Google DNS) -> US, 1.1.1.1 (Cloudflare) -> AU.

describe("extractIP", () => {
  it("prefers CloudFront-Viewer-Address over x-real-ip and strips the port", () => {
    const headers = new Headers({
      "cloudfront-viewer-address": "8.8.8.8:46532",
      "x-real-ip": "1.1.1.1",
    });
    expect(extractIP(headers)).toBe("8.8.8.8");
  });

  it("strips the port from an IPv6 viewer address", () => {
    const headers = new Headers({
      "cloudfront-viewer-address": "2001:4860:4860::8888:46532",
    });
    expect(extractIP(headers)).toBe("2001:4860:4860::8888");
  });

  it("falls back to x-real-ip, then x-forwarded-for", () => {
    expect(extractIP(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(extractIP(new Headers({ "x-forwarded-for": "8.8.8.8, 1.1.1.1" }))).toBe("8.8.8.8");
    expect(extractIP(new Headers())).toBe("unknown");
  });
});

describe("resolveGeo", () => {
  it("reads city/region/timezone from CloudFront viewer headers", () => {
    const headers = new Headers({
      "cloudfront-viewer-country": "IN",
      "cloudfront-viewer-city": "Hyderabad",
      "cloudfront-viewer-country-region-name": "Telangana",
      "cloudfront-viewer-time-zone": "Asia/Kolkata",
      // The connection IP behind the CDN is a CloudFront POP — must be ignored
      "x-real-ip": "8.8.8.8",
    });

    expect(resolveGeo(headers)).toEqual({
      country: "IN",
      city: "Hyderabad",
      region: "Telangana",
      timezone: "Asia/Kolkata",
    });
  });

  it("percent-decodes CloudFront city/region values", () => {
    const headers = new Headers({
      "cloudfront-viewer-country": "BR",
      "cloudfront-viewer-city": "S%C3%A3o%20Paulo",
    });
    expect(resolveGeo(headers).city).toBe("São Paulo");
  });

  it("gap-fills city via GeoIP from the viewer address, never the connection IP", () => {
    const headers = new Headers({
      "cloudfront-viewer-country": "US",
      "cloudfront-viewer-address": "8.8.8.8:1234",
      "x-real-ip": "1.1.1.1", // edge POP — would resolve to AU
    });
    const geo = resolveGeo(headers);
    expect(geo.country).toBe("US");
    // Whatever GeoLite says about 8.8.8.8, it must not be the AU lookup of 1.1.1.1
    expect(geo.timezone).not.toBe("Australia/Sydney");
  });

  it("does NOT geo-locate the connection IP when behind the CDN without a viewer address", () => {
    // CDN request (country header present) but no viewer-address forwarded:
    // x-real-ip is a CloudFront POP IP — city/timezone must stay null, not
    // become the POP's city (the Seattle/LA bug, Jun 2026).
    const headers = new Headers({
      "cloudfront-viewer-country": "IN",
      "x-real-ip": "8.8.8.8",
    });
    expect(resolveGeo(headers)).toEqual({
      country: "IN",
      city: null,
      region: null,
      timezone: null,
    });
  });

  it("falls back to GeoIP on the connection IP for direct-origin requests", () => {
    const geo = resolveGeo(new Headers({ "x-real-ip": "8.8.8.8" }));
    expect(geo.country).toBe("US");
  });

  it("still honors legacy x-country-code / x-city headers", () => {
    const geo = resolveGeo(new Headers({ "x-country-code": "in", "x-city": "Hyderabad" }));
    expect(geo.country).toBe("IN");
    expect(geo.city).toBe("Hyderabad");
  });
});

describe("resolveCountry", () => {
  it("prefers the CloudFront country header over any IP", () => {
    const headers = new Headers({
      "cloudfront-viewer-country": "IN",
      "x-real-ip": "8.8.8.8",
    });
    expect(resolveCountry(headers)).toBe("IN");
  });

  it("uses the viewer address, not the connection IP, for the IP fallback", () => {
    const headers = new Headers({
      "cloudfront-viewer-address": "8.8.8.8:99",
      "x-real-ip": "1.1.1.1",
    });
    expect(resolveCountry(headers)).toBe("US");
  });
});

// ---------------------------------------------------------------------------
// Cloudflare (added Aug 2026 for the CloudFront -> Cloudflare migration).
// Both header families are supported simultaneously and DELIBERATELY: the
// apex flips between CDNs via a DNS proxy toggle, so a rollback must not
// require a redeploy. CloudFront wins when present so pre-migration behaviour
// is byte-identical.
// ---------------------------------------------------------------------------

describe("Cloudflare headers", () => {
  it("uses cf-connecting-ip as the client IP (no port to strip)", () => {
    expect(extractIP(new Headers({ "cf-connecting-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("prefers cf-connecting-ip over the connection IP", () => {
    const headers = new Headers({ "cf-connecting-ip": "8.8.8.8", "x-real-ip": "1.1.1.1" });
    expect(extractIP(headers)).toBe("8.8.8.8");
  });

  it("keeps CloudFront authoritative when both families are present (rollback safety)", () => {
    const headers = new Headers({
      "cloudfront-viewer-address": "8.8.8.8:46532",
      "cf-connecting-ip": "1.1.1.1",
    });
    expect(extractIP(headers)).toBe("8.8.8.8");
  });

  it("resolves country from cf-ipcountry", () => {
    expect(resolveCountry(new Headers({ "cf-ipcountry": "in" }))).toBe("IN");
  });

  it("ignores cf-ipcountry sentinel values that are not real countries", () => {
    // Cloudflare sends XX (unknown), T1 (Tor) and sometimes empty.
    expect(resolveCountry(new Headers({ "cf-ipcountry": "XX", "cf-connecting-ip": "8.8.8.8" }))).toBe("US");
    expect(resolveCountry(new Headers({ "cf-ipcountry": "T1", "cf-connecting-ip": "8.8.8.8" }))).toBe("US");
  });

  it("resolves the full geo set from the visitor-location managed transform", () => {
    const headers = new Headers({
      "cf-ipcountry": "IN",
      "cf-ipcity": "Hyderabad",
      "cf-region": "Telangana",
      "cf-timezone": "Asia/Kolkata",
    });
    expect(resolveGeo(headers)).toEqual({
      country: "IN",
      city: "Hyderabad",
      region: "Telangana",
      timezone: "Asia/Kolkata",
    });
  });

  it("gap-fills city/region/timezone from cf-connecting-ip when the location transform is off", () => {
    // cf-ipcountry always arrives; city/region/timezone only once the "Add
    // visitor location headers" managed transform is enabled. Until then every
    // gap must be filled from the REAL viewer IP.
    // 139.130.4.5 is used rather than 8.8.8.8 because the bundled GeoLite2 has
    // no city for anycast DNS resolvers — asserting a city on 8.8.8.8 tests the
    // database, not our code.
    const geo = resolveGeo(new Headers({ "cf-ipcountry": "AU", "cf-connecting-ip": "139.130.4.5" }));
    expect(geo).toEqual({
      country: "AU",
      city: "Broome",
      region: "WA",
      timezone: "Australia/Perth",
    });
  });

  it("does NOT geo-locate the connection IP when behind Cloudflare without cf-connecting-ip", () => {
    // Same invariant as the CloudFront case: x-real-ip is a Cloudflare edge IP,
    // so city/timezone must stay null rather than become the edge's city.
    const headers = new Headers({ "cf-ipcountry": "IN", "x-real-ip": "8.8.8.8" });
    expect(resolveGeo(headers)).toEqual({
      country: "IN",
      city: null,
      region: null,
      timezone: null,
    });
  });

  it("falls back to cf-region-code when the long region name is absent", () => {
    const headers = new Headers({ "cf-ipcountry": "IN", "cf-region-code": "TG" });
    expect(resolveGeo(headers).region).toBe("TG");
  });
});
