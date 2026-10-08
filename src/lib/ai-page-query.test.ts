import { describe, it, expect } from "vitest";
import { describeLibraryView, pickPageQuery } from "./ai-page-query";

describe("pickPageQuery", () => {
  it("forwards only whitelisted library params", () => {
    expect(pickPageQuery("/library", "?tab=ratings&type=series&rating=loved&utm_source=x")).toEqual({
      tab: "ratings",
      type: "series",
      rating: "loved",
    });
  });

  it("works on a client-sent record too (server re-sanitizes the body)", () => {
    expect(
      pickPageQuery("/library", { tab: "watchlist", secret: "nope", q: "  heat  " })
    ).toEqual({ tab: "watchlist", q: "heat" });
  });

  it("drops empty / over-long values and unknown routes", () => {
    expect(pickPageQuery("/library", "?tab=&q=" + "x".repeat(101))).toBeUndefined();
    expect(pickPageQuery("/movie/1/heat", "?tab=ratings")).toBeUndefined();
    expect(pickPageQuery("/", "?tab=x")).toBeUndefined();
  });

  it("covers the other URL-state pages", () => {
    expect(pickPageQuery("/discussions", "?tab=following")).toEqual({ tab: "following" });
    expect(pickPageQuery("/search", "?q=heat&type=movie&semantic=1")).toEqual({
      q: "heat",
      type: "movie",
    });
  });

  it("ignores prototype keys on records", () => {
    const rec = Object.create({ tab: "inherited" }) as Record<string, string>;
    expect(pickPageQuery("/library", rec)).toBeUndefined();
  });
});

describe("describeLibraryView", () => {
  it("names the tab and its filters", () => {
    expect(describeLibraryView(undefined)).toBe("Watching (Up Next + Continue Watching) tab");
    expect(describeLibraryView({ tab: "ratings", type: "series", rating: "loved" })).toBe(
      "Ratings tab (type=series, rating=loved)"
    );
  });
});
