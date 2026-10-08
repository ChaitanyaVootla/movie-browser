import { describe, it, expect } from "vitest";
import { convertStreamRatings, pickRatings, type StreamRating } from "./enrichment-ratings";
import type { ExternalRating } from "@/types";

const row = (slug: string, score: number, extra: Partial<StreamRating> = {}): StreamRating => ({
  score,
  voteCount: null,
  certified: null,
  consensus: null,
  sentiment: null,
  sourceUrl: null,
  source: { slug, name: slug, maxScore: null },
  ...extra,
});

describe("convertStreamRatings", () => {
  it("matches the server's order/whitelist regardless of PG row order", () => {
    const out = convertStreamRatings(
      [row("google", 91), row("metacritic", 74), row("rt_critic", 87), row("imdb", 8.7), row("tmdb", 8.4)],
      157336,
      "movie",
    );
    expect(out.map((r) => r.name)).toEqual(["TMDB", "IMDb", "Rotten Tomatoes", "Google"]);
    expect(out.map((r) => r.rating)).toEqual(["84", "87", "87", "91"]);
  });
});

describe("pickRatings (stale-HTML self-heal)", () => {
  const htmlTmdbOnly: ExternalRating[] = [
    { name: "TMDB", rating: "84", link: "https://www.themoviedb.org/movie/157336" },
  ];

  it("THE REPRO: HTML cached before the scrape (TMDB only) → PG ratings win", () => {
    const out = pickRatings(htmlTmdbOnly, [row("tmdb", 8.4), row("imdb", 8.7)], 157336, "movie");
    expect(out.map((r) => r.name)).toEqual(["TMDB", "IMDb"]);
  });

  it("equal data keeps the server array identity (no swap / flicker)", () => {
    const out = pickRatings(htmlTmdbOnly, [row("tmdb", 8.4)], 157336, "movie");
    expect(out).toBe(htmlTmdbOnly);
  });

  it("no stream data yet → server ratings", () => {
    expect(pickRatings(htmlTmdbOnly, null, 1, "movie")).toBe(htmlTmdbOnly);
    expect(pickRatings(htmlTmdbOnly, [row("metacritic", 70)], 1, "movie")).toBe(htmlTmdbOnly);
  });

  it("keeps the HTML's TMDB entry when PG has no tmdb row", () => {
    const out = pickRatings(htmlTmdbOnly, [row("imdb", 8.7)], 157336, "movie");
    expect(out.map((r) => r.name)).toEqual(["TMDB", "IMDb"]);
  });
});
