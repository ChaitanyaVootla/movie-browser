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

describe("Google avatar mirror", () => {
  it("accepts Google profile-photo paths", async () => {
    const { parseGoogleAvatarPath } = await import("./path");
    expect(parseGoogleAvatarPath(["a", "ACg8ocKabc123_-xyz=s96-c"])).toBe("/a/ACg8ocKabc123_-xyz=s96-c");
    expect(parseGoogleAvatarPath(["a-", "AOh14Gabcdefgh"])).toBe("/a-/AOh14Gabcdefgh");
  });
  it("rejects anything else", async () => {
    const { parseGoogleAvatarPath } = await import("./path");
    expect(parseGoogleAvatarPath(["b", "ACg8ocKabc123"])).toBeNull();
    expect(parseGoogleAvatarPath(["a", "../etc"])).toBeNull();
    expect(parseGoogleAvatarPath(["a", "x", "y"])).toBeNull();
  });
  it("maps lh3 URLs to the same-origin route", async () => {
    const { sameOriginImageUrl } = await import("./path");
    expect(sameOriginImageUrl("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c")).toBe("/g-avatar/a/ACg8ocK=s96-c");
    expect(sameOriginImageUrl("https://image.tmdb.org/t/p/w342/x.jpg")).toBe("/tmdb-img/t/p/w342/x.jpg");
    expect(sameOriginImageUrl("https://example.com/a.jpg")).toBeNull();
  });
});
