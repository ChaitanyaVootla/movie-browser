import { describe, it, expect } from "vitest";
import { parseTraktExport } from "./trakt";

const HISTORY = JSON.stringify([
  {
    watched_at: "2026-01-04T21:30:00.000Z",
    type: "movie",
    movie: { title: "Heat", year: 1995, ids: { tmdb: 949, imdb: "tt0113277" } },
  },
  {
    watched_at: "2026-01-05T20:00:00.000Z",
    type: "episode",
    show: { title: "Breaking Bad", year: 2008, ids: { tmdb: 1396 } },
    episode: { season: 1, number: 2, ids: { tmdb: 62086 } },
  },
]);

const RATINGS = JSON.stringify([
  { rated_at: "2026-01-04T22:00:00.000Z", rating: 9, type: "movie", movie: { title: "Heat", year: 1995, ids: { tmdb: 949 } } },
  { rated_at: "2026-01-06T22:00:00.000Z", rating: 8, type: "episode", show: { title: "Breaking Bad", ids: { tmdb: 1396 } }, episode: { season: 1, number: 2, ids: { tmdb: 62086 } } },
]);

const WATCHLIST = JSON.stringify([
  { listed_at: "2026-01-07T10:00:00.000Z", type: "show", show: { title: "The Wire", year: 2002, ids: { tmdb: 1438 } }, notes: "everyone says so" },
]);

function files(extra: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      "history.json": HISTORY,
      "ratings.json": RATINGS,
      "watchlist.json": WATCHLIST,
      ...extra,
    })
  );
}

describe("parseTraktExport", () => {
  it("movie history -> DATETIME watches with tmdb ids", () => {
    const out = parseTraktExport(files());
    const movie = out.watches.find((w) => w.ref.kind === "movie");
    expect(movie).toMatchObject({
      ref: { kind: "movie", tmdbId: 949 },
      watchedAt: "2026-01-04T21:30:00.000Z",
      precision: "DATETIME",
    });
  });

  it("episode history -> series ref + tmdbEpisodeId-FIRST episode ref", () => {
    const out = parseTraktExport(files());
    const ep = out.watches.find((w) => w.ref.kind === "series");
    expect(ep?.ref.tmdbId).toBe(1396);
    expect(ep?.episode).toEqual({ tmdbEpisodeId: 62086, seasonNumber: 1, episodeNumber: 2 });
  });

  it("movie/show ratings import; episode ratings counted unmappable (no table yet)", () => {
    const out = parseTraktExport(files());
    expect(out.ratings).toHaveLength(1);
    expect(out.ratings[0]).toMatchObject({ score: 9, ratedAt: "2026-01-04" });
    expect(out.unmappable.some((u) => u.reason.includes("episode rating"))).toBe(true);
  });

  it("watchlist keeps notes (import fidelity)", () => {
    const out = parseTraktExport(files());
    expect(out.watchlist[0]).toMatchObject({
      ref: { kind: "series", tmdbId: 1438 },
      note: "everyone says so",
    });
  });

  it("malformed JSON is unmappable, not a crash", () => {
    const out = parseTraktExport(files({ "history.json": "{not json" }));
    expect(out.unmappable.some((u) => u.file === "history.json")).toBe(true);
  });
});
