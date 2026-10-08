import { describe, it, expect } from "vitest";
import { getMediaHrefFromItem, getMediaPath, isMovieItem } from "./utils";
import { LIBRARY_TABS, legacyLibraryUrl, libraryHref } from "./library-routes";
import { mergeSearch, pickParam, withSearch } from "./url-state";

describe("media link helpers", () => {
  it("builds canonical slugged detail paths", () => {
    expect(getMediaPath("movie", 27205, "Inception")).toBe("/movie/27205/inception");
    expect(getMediaPath("series", 1396, "Breaking Bad")).toBe("/series/1396/breaking-bad");
    expect(getMediaPath("person", 6193, "Leonardo DiCaprio")).toBe(
      "/person/6193/leonardo-dicaprio"
    );
  });

  it("never emits a trailing slash when the name has no usable slug", () => {
    // The old hand-built `/person/${id}/${getSlug(name)}` produced "/person/1/" here.
    expect(getMediaPath("person", 1, "李小龍")).toBe("/person/1");
    expect(getMediaPath("person", 1, null)).toBe("/person/1");
  });

  it("infers media type from title/name, falling back to the stored flag", () => {
    expect(isMovieItem({ title: "Up" })).toBe(true);
    expect(isMovieItem({ name: "Lost" })).toBe(false);
    // A movie row with no catalog title used to resolve to /series/{id}.
    expect(isMovieItem({ isMovie: true })).toBe(true);
    expect(isMovieItem({ isMovie: false })).toBe(false);
    expect(isMovieItem({})).toBe(false);
  });

  it("library/continue-watching items link to the right type and never to an 'untitled' slug", () => {
    expect(getMediaHrefFromItem(550, { title: "Fight Club", isMovie: true })).toBe(
      "/movie/550/fight-club"
    );
    expect(getMediaHrefFromItem(1399, { name: "Game of Thrones", isMovie: false })).toBe(
      "/series/1399/game-of-thrones"
    );
    expect(getMediaHrefFromItem(550, { isMovie: true })).toBe("/movie/550");
    expect(getMediaHrefFromItem(1399, { title: null, name: null, isMovie: false })).toBe(
      "/series/1399"
    );
  });
});

describe("libraryHref / legacyLibraryUrl", () => {
  it("watching is the bare default", () => {
    expect(libraryHref()).toBe("/library");
    expect(libraryHref("watching")).toBe("/library");
    expect(libraryHref("watchlist")).toBe("/library?tab=watchlist");
    expect(libraryHref("ratings", { type: "series", rating: undefined })).toBe(
      "/library?tab=ratings&type=series"
    );
  });

  it("maps every legacy route, preserving the sub-view", () => {
    expect(legacyLibraryUrl("watchlist")).toBe("/library?tab=watchlist");
    expect(legacyLibraryUrl("watchlist", { tab: "movies" })).toBe(
      "/library?tab=watchlist&type=movies"
    );
    expect(legacyLibraryUrl("watchlist", { tab: "series" })).toBe("/library?tab=watchlist");
    expect(legacyLibraryUrl("watched", { anything: "x" })).toBe("/library?tab=watched");
    expect(legacyLibraryUrl("ratings")).toBe("/library?tab=ratings");
    expect(legacyLibraryUrl("ratings", { type: "series", rating: "dislikes" })).toBe(
      "/library?tab=ratings&type=series&rating=dislikes"
    );
    // Junk values don't leak through.
    expect(legacyLibraryUrl("ratings", { type: "<script>", rating: ["dislikes", "x"] })).toBe(
      "/library?tab=ratings&rating=dislikes"
    );
  });

  it("every tab round-trips through pickParam", () => {
    for (const tab of LIBRARY_TABS) {
      const qs = libraryHref(tab).split("?")[1] ?? "";
      expect(pickParam(new URLSearchParams(qs).get("tab"), LIBRARY_TABS, "watching")).toBe(tab);
    }
  });
});

describe("url-state helpers", () => {
  it("merges, and drops params equal to their default or empty", () => {
    expect(mergeSearch("tab=watchlist", { type: "movies" })).toBe("tab=watchlist&type=movies");
    expect(mergeSearch("tab=watchlist&type=movies", { type: "series" }, { type: "series" })).toBe(
      "tab=watchlist"
    );
    expect(mergeSearch("q=abc&sort=title", { q: "" , sort: null })).toBe("");
  });

  it("pickParam rejects unknown values", () => {
    expect(pickParam("movies", ["series", "movies"] as const, "series")).toBe("movies");
    expect(pickParam("nope", ["series", "movies"] as const, "series")).toBe("series");
    expect(pickParam(null, ["series", "movies"] as const, "series")).toBe("series");
  });

  it("withSearch omits an empty query", () => {
    expect(withSearch("/library", "")).toBe("/library");
    expect(withSearch("/library", "tab=watched")).toBe("/library?tab=watched");
  });
});
