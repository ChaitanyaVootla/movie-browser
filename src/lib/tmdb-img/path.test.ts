import { describe, expect, it } from "vitest";
import { parseTmdbImagePath } from "./path";

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
