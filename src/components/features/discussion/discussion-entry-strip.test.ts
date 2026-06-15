import { describe, it, expect } from "vitest";
import { discussionsHref } from "./discussion-entry-strip-href";

describe("discussionsHref", () => {
  it("movie → /movie/:id/:slug/discussions", () => {
    expect(discussionsHref({ type: "movie", movieId: 603 }, "The Matrix")).toBe(
      "/movie/603/the-matrix/discussions"
    );
  });
  it("series → /series/:id/:slug/discussions", () => {
    expect(
      discussionsHref({ type: "series", seriesId: 1396, seasonNumber: null, episodeNumber: null }, "Breaking Bad")
    ).toBe("/series/1396/breaking-bad/discussions");
  });
});
