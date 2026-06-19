import { describe, it, expect } from "vitest";
import { dateOnlyToUtc, utcDayKey } from "./watch-dates";

describe("dateOnlyToUtc", () => {
  it("stores date-only values at 12:00 UTC (no IST day-shift)", () => {
    const d = dateOnlyToUtc("2026-01-31");
    expect(d.toISOString()).toBe("2026-01-31T12:00:00.000Z");
    // IST is UTC+5:30 → 17:30 same day; US Pacific (UTC-8) → 04:00 same day.
    // Noon UTC keeps the calendar day stable for every offset in (-12, +12).
  });

  it("rejects malformed input", () => {
    expect(() => dateOnlyToUtc("31/01/2026")).toThrow();
    expect(() => dateOnlyToUtc("2026-1-3")).toThrow();
    expect(() => dateOnlyToUtc("")).toThrow();
  });
});

describe("utcDayKey", () => {
  it("returns the UTC calendar day", () => {
    expect(utcDayKey(new Date("2026-01-31T12:00:00.000Z"))).toBe("2026-01-31");
    expect(utcDayKey(new Date("2026-01-31T23:59:59.000Z"))).toBe("2026-01-31");
  });
});
