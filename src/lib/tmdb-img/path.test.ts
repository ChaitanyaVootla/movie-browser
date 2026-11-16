import { describe, expect, it } from "vitest";
import { parseTmdbImagePath, parseYoutubeThumbPath } from "./path";

describe("parseTmdbImagePath", () => {
  it("accepts TMDB image paths", () => {
    expect(parseTmdbImagePath(["t", "p", "w92", "pvske1MyAoymrs5bguRfVqYiM9a.jpg"])).toBe(
      "/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
    );
    expect(parseTmdbImagePath(["t", "p", "original", "a_b-c.png"])).toBe("/t/p/original/a_b-c.png");
    expect(parseTmdbImagePath(["t", "p", "h632", "x.svg"])).toBe("/t/p/h632/x.svg");
  });
  it("rejects anything else (no open proxy)", () => {
    expect(parseTmdbImagePath(["t", "p", "w92"])).toBeNull();
    expect(parseTmdbImagePath(["t", "p", "w92", "..", "x.jpg"])).toBeNull();
    expect(parseTmdbImagePath(["t", "p", "w92", "x.html"])).toBeNull();
    expect(parseTmdbImagePath(["t", "p", "big", "x.jpg"])).toBeNull();
    expect(parseTmdbImagePath(["3", "movie", "550", "x.jpg"])).toBeNull();
  });
});

describe("parseYoutubeThumbPath", () => {
  it("accepts YouTube thumbnail paths", () => {
    expect(parseYoutubeThumbPath(["vi", "LY19rHKAaAg", "hqdefault.jpg"])).toBe("/vi/LY19rHKAaAg/hqdefault.jpg");
    expect(parseYoutubeThumbPath(["vi", "zSWdZVtXT7E", "mqdefault.jpg"])).toBe("/vi/zSWdZVtXT7E/mqdefault.jpg");
  });
  it("rejects anything else", () => {
    expect(parseYoutubeThumbPath(["vi", "abc", "hqdefault.jpg"])).toBeNull();
    expect(parseYoutubeThumbPath(["vi", "LY19rHKAaAg", "x.html"])).toBeNull();
    expect(parseYoutubeThumbPath(["watch", "LY19rHKAaAg", "hqdefault.jpg"])).toBeNull();
  });
});
