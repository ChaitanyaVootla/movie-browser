import { describe, expect, it } from "vitest";
import { browseParamsFromSearch } from "@/lib/discover";
import { discoverResultsQuery, parseDiscoverResultsQuery } from "./discover-results";

describe("discoverResultsQuery", () => {
  it("omits defaults and always ends with page", () => {
    expect(discoverResultsQuery({ media_type: "movie", sort_by: "popularity.desc" }, 1)).toBe("page=1");
    expect(discoverResultsQuery({ media_type: "tv" }, 3)).toBe("type=tv&page=3");
  });

  it("sorts and de-duplicates id lists so equivalent filters share one edge key", () => {
    const a = discoverResultsQuery({ media_type: "movie", with_genres: [35, 18, 35] }, 1);
    const b = discoverResultsQuery({ media_type: "movie", with_genres: [18, 35] }, 1);
    expect(a).toBe(b);
    expect(a).toBe("genres=18%2C35&page=1");
  });

  it("drops client-only library filters", () => {
    expect(
      discoverResultsQuery({ media_type: "movie", hideWatched: true, hideWatchlist: true, page: 7 }, 2)
    ).toBe("page=2");
  });
});

describe("parseDiscoverResultsQuery", () => {
  it("round-trips every canonical query the client can build", () => {
    const params = browseParamsFromSearch(
      new URLSearchParams("type=tv&genres=18,35&providers=8&region=US&min_rating=7&year_from=2000&cert=R")
    );
    const q = discoverResultsQuery(params, 4);
    const parsed = parseDiscoverResultsQuery(`?${q}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.page).toBe(4);
      expect(parsed.params.media_type).toBe("tv");
      expect(parsed.params.with_genres).toEqual([18, 35]);
      expect(parsed.params.with_watch_providers).toEqual([8]);
    }
  });

  it("rejects non-canonical forms (bounded edge key space)", () => {
    expect(parseDiscoverResultsQuery("genres=35&page=1&_cb=123").ok).toBe(false); // unknown key
    expect(parseDiscoverResultsQuery("page=1&genres=35").ok).toBe(false); // reordered
    expect(parseDiscoverResultsQuery("genres=35%2C18&page=1").ok).toBe(false); // unsorted ids
    expect(parseDiscoverResultsQuery("type=movie&page=1").ok).toBe(false); // explicit default
    expect(parseDiscoverResultsQuery("hide_watched=1&page=1").ok).toBe(false); // client-only
    expect(parseDiscoverResultsQuery("genres=35").ok).toBe(false); // no page
    expect(parseDiscoverResultsQuery("page=501").ok).toBe(false); // past TMDB's cap
    expect(parseDiscoverResultsQuery("page=0").ok).toBe(false);
    expect(parseDiscoverResultsQuery("page=1.5").ok).toBe(false);
  });

  it("returns the canonical form on mismatch", () => {
    const r = parseDiscoverResultsQuery("page=1&genres=35");
    expect(r).toEqual({ ok: false, canonical: "genres=35&page=1" });
  });
});
