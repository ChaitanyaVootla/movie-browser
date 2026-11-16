import { describe, expect, it } from "vitest";
import { isSignificantPopularityChange as sig, roundPopularity } from "./popularity";

describe("isSignificantPopularityChange", () => {
  it("always writes a missing stored value", () => {
    expect(sig(null, 0.2)).toBe(true);
  });

  it("ignores non-finite TMDB values", () => {
    expect(sig(1, Number.NaN)).toBe(false);
  });

  it("ignores long-tail jitter below 1 (the old rule wrote these)", () => {
    expect(sig(0.306, 0.32)).toBe(false);
    expect(sig(0.1, 0.34)).toBe(false);
    expect(sig(0.1, 0.36)).toBe(true);
  });

  it("forces a write when a gate is crossed, however small the change", () => {
    expect(sig(0.99, 1.0)).toBe(true); // scrape gate
    expect(sig(1.0, 0.99)).toBe(true);
    expect(sig(9.9, 10.1)).toBe(true); // enrichment gate
    expect(sig(29.5, 30)).toBe(true);
  });

  it("uses a symmetric ±20% band at or above 1", () => {
    expect(sig(12, 14)).toBe(false); // +16.7%
    expect(sig(12, 14.5)).toBe(true); // +20.8%
    expect(sig(14.5, 12)).toBe(true);
    expect(sig(100, 118)).toBe(false);
    expect(sig(100, 121)).toBe(true);
  });
});

describe("roundPopularity", () => {
  it("rounds to 3 decimals", () => {
    expect(roundPopularity(1.23456)).toBe(1.235);
  });
});
