/**
 * The seasons rewrite deletes every season (cascading to episodes) and
 * reinserts. It must never run on a season SUMMARY — that is what wiped
 * episodes on every enriched-only series refresh (Oct 2026).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db/postgres", () => ({ prisma: {}, Prisma: {} }));

import { isSummaryOnly } from "./series-upsert";
import type { SeasonWithEpisodes } from "./types";

const season = (n: number, extra: Partial<SeasonWithEpisodes> = {}): SeasonWithEpisodes => ({
  id: 100 + n,
  season_number: n,
  name: `Season ${n}`,
  overview: "",
  poster_path: null,
  air_date: null,
  episode_count: 10,
  ...extra,
});

describe("isSummaryOnly", () => {
  it("PG round-trip / TMDB details seasons (no episodes key) are a summary", () => {
    expect(isSummaryOnly([season(1), season(2)])).toBe(true);
  });

  it("a partly failed per-season fetch (one season missing episodes) is a summary", () => {
    expect(isSummaryOnly([season(1, { episodes: [] as never }), season(2)])).toBe(true);
  });

  it("complete fetched data is authoritative, incl. a genuinely empty season", () => {
    const ep = { id: 1, episode_number: 1, name: "Pilot", still_path: null, air_date: null };
    expect(
      isSummaryOnly([season(1, { episodes: [ep] as never }), season(2, { episode_count: 0 })]),
    ).toBe(false);
    expect(isSummaryOnly([season(0, { episode_count: 0, episodes: [] as never })])).toBe(false);
  });

  it("no seasons at all is not a summary", () => {
    expect(isSummaryOnly([])).toBe(false);
  });
});
