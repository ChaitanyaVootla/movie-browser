import { describe, it, expect } from "vitest";
import { parseImdbRatings } from "./imdb";

const CSV = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0113277,9,2026-01-04,Heat,Heat,https://www.imdb.com/title/tt0113277/,Movie,8.3,170,1995,"Action, Crime",750000,1995-12-15,Michael Mann
tt0903747,10,2026-01-05,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,45,2008,"Crime, Drama",2200000,2008-01-20,
tt0959621,9,2026-01-06,Pilot,Pilot,https://www.imdb.com/title/tt0959621/,TV Episode,9.0,58,2008,"Crime, Drama",60000,2008-01-20,
`;

describe("parseImdbRatings", () => {
  it("movie ratings import with imdb ids; rating implies a dateless watch", () => {
    const out = parseImdbRatings(CSV);
    const heat = out.ratings.find((r) => r.ref.imdbId === "tt0113277");
    expect(heat).toMatchObject({ score: 9, ratedAt: "2026-01-04", ref: { kind: "movie" } });
    const watch = out.watches.find((w) => w.ref.imdbId === "tt0113277");
    expect(watch).toMatchObject({ watchedAt: null, precision: "UNKNOWN" });
  });

  it("TV Series ratings -> series-level granularity-unknown watch (spec)", () => {
    const out = parseImdbRatings(CSV);
    const bb = out.watches.find((w) => w.ref.imdbId === "tt0903747");
    expect(bb?.ref.kind).toBe("series");
    expect(bb?.episode).toBeUndefined();
  });

  it("TV Episode rows are unmappable (no episode external-id mapping), counted not dropped", () => {
    const out = parseImdbRatings(CSV);
    expect(out.unmappable.some((u) => u.reason.includes("TV Episode"))).toBe(true);
    expect(out.watches.find((w) => w.ref.imdbId === "tt0959621")).toBeUndefined();
  });
});
