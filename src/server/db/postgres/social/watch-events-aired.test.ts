import { describe, it, expect } from "vitest";
import { airedEpisodeOrWhere } from "./watch-events";

/**
 * The bug: `fetchAiredEpisodes` filtered with `airDate: { lte: now }`, which
 * Prisma compiles to `air_date <= now()` — SQL NULL comparisons are UNKNOWN,
 * so every episode with `air_date IS NULL` was silently excluded. NULL means
 * UNKNOWN, not future, so mark-season / mark-series / set-position matched
 * zero rows for any show with missing air dates (all dev episodes, common in
 * prod). The fix builds an OR predicate: include NULL, include past/now,
 * exclude only KNOWN-future.
 *
 * These tests pin the boolean semantics by mirroring how Postgres evaluates
 * the two OR branches the predicate generates, with no DB needed.
 */

const NOW = new Date("2026-06-13T00:00:00Z");

/** Mirror of Prisma's `{ OR: [{ airDate: null }, { airDate: { lte: now } }] }`. */
function matches(airDate: Date | null, now: Date): boolean {
  const branches = airedEpisodeOrWhere(now)!;
  return branches.some((b) => {
    if ("airDate" in b && b.airDate === null) return airDate === null;
    if ("airDate" in b && b.airDate && typeof b.airDate === "object" && "lte" in b.airDate) {
      // SQL: NULL <= x is UNKNOWN (false in a WHERE), matching Prisma.
      return airDate !== null && airDate <= (b.airDate.lte as Date);
    }
    return false;
  });
}

describe("airedEpisodeOrWhere (bulk-mark eligibility)", () => {
  it("INCLUDES an episode with NULL air_date (UNKNOWN, not future)", () => {
    expect(matches(null, NOW)).toBe(true);
  });

  it("INCLUDES an episode with a past air_date", () => {
    expect(matches(new Date("2020-01-01T00:00:00Z"), NOW)).toBe(true);
  });

  it("INCLUDES an episode airing exactly now (boundary, lte)", () => {
    expect(matches(NOW, NOW)).toBe(true);
  });

  it("EXCLUDES an episode with a KNOWN future air_date", () => {
    expect(matches(new Date("2027-01-01T00:00:00Z"), NOW)).toBe(false);
  });

  it("emits exactly the two OR branches (null + lte)", () => {
    const branches = airedEpisodeOrWhere(NOW)!;
    expect(branches).toEqual([{ airDate: null }, { airDate: { lte: NOW } }]);
  });
});
