import { describe, expect, it, vi } from "vitest";

vi.mock("./index", () => ({ prisma: {} }));

import { MAX_INLINE_EPISODES, toInlineEpisodes } from "./season-episodes";
import { getDefaultSeasonNumber } from "@/lib/series-default-season";

const row = (n: number, over: Partial<Parameters<typeof toInlineEpisodes>[1][number]> = {}) => ({
  tmdbEpisodeId: 1000 + n,
  episodeNumber: n,
  name: `Ep ${n}`,
  overview: "o",
  stillPath: "/s.jpg",
  airDate: new Date("2024-09-01T00:00:00Z"),
  runtime: 60,
  voteAverage: 7.5,
  voteCount: 10,
  ...over,
});

describe("toInlineEpisodes", () => {
  it("maps rows to the client Episode shape with the TMDB id as id", () => {
    const [ep] = toInlineEpisodes(2, [row(1)]) ?? [];
    expect(ep).toEqual({
      id: 1001,
      episode_number: 1,
      season_number: 2,
      name: "Ep 1",
      overview: "o",
      still_path: "/s.jpg",
      air_date: "2024-09-01",
      runtime: 60,
      vote_average: 7.5,
      vote_count: 10,
    });
  });

  it("fills nullable columns with display-safe defaults", () => {
    const [ep] =
      toInlineEpisodes(1, [
        row(3, { name: null, overview: null, airDate: null, runtime: null, voteAverage: null, voteCount: null }),
      ]) ?? [];
    expect(ep).toMatchObject({ name: "Episode 3", overview: "", air_date: "", vote_average: 0, vote_count: 0 });
    expect(ep?.runtime).toBeUndefined();
  });

  it("returns null when there is nothing to inline (client fetches instead)", () => {
    expect(toInlineEpisodes(1, [])).toBeNull();
  });

  it("returns null when any row lacks a TMDB episode id (tracking needs it)", () => {
    expect(toInlineEpisodes(1, [row(1), row(2, { tmdbEpisodeId: null })])).toBeNull();
  });

  it("returns null past the inline cap so long seasons don't bloat the HTML", () => {
    const rows = Array.from({ length: MAX_INLINE_EPISODES + 1 }, (_, i) => row(i + 1));
    expect(toInlineEpisodes(1, rows)).toBeNull();
    expect(toInlineEpisodes(1, rows.slice(0, MAX_INLINE_EPISODES))).toHaveLength(MAX_INLINE_EPISODES);
  });
});

describe("getDefaultSeasonNumber", () => {
  it("picks the latest regular season, ignoring specials", () => {
    expect(getDefaultSeasonNumber([{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }])).toBe(2);
  });
  it("falls back to the first season for specials-only shows, then to 1", () => {
    expect(getDefaultSeasonNumber([{ season_number: 0 }])).toBe(0);
    expect(getDefaultSeasonNumber([])).toBe(1);
  });
});
