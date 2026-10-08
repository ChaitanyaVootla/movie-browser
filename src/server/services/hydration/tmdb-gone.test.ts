import { describe, it, expect } from "vitest";
import { TmdbGoneCache, isTmdbNotFound } from "./tmdb-gone";

describe("TmdbGoneCache", () => {
  it("remembers a 404 for the TTL, then lets the title retry", () => {
    let now = 1_000;
    const c = new TmdbGoneCache(60_000, 100, () => now);
    expect(c.has("series", 324537)).toBe(false);
    c.mark("series", 324537);
    expect(c.has("series", 324537)).toBe(true);
    expect(c.has("movie", 324537)).toBe(false); // keyed by media type
    now += 59_999;
    expect(c.has("series", 324537)).toBe(true);
    now += 1;
    expect(c.has("series", 324537)).toBe(false);
    expect(c.size).toBe(0);
  });

  it("is size-capped (oldest dropped)", () => {
    const c = new TmdbGoneCache(60_000, 2, () => 0);
    c.mark("movie", 1);
    c.mark("movie", 2);
    c.mark("movie", 3);
    expect(c.size).toBe(2);
    expect(c.has("movie", 1)).toBe(false);
    expect(c.has("movie", 3)).toBe(true);
  });

  it("only a TMDB 404 counts (5xx / network errors stay retryable)", () => {
    expect(isTmdbNotFound(new Error("TMDB API error: 404 Not Found"))).toBe(true);
    expect(isTmdbNotFound(new Error("TMDB API error: 500 Internal Server Error"))).toBe(false);
    expect(isTmdbNotFound(new TypeError("fetch failed"))).toBe(false);
    expect(isTmdbNotFound("404")).toBe(false);
  });
});
