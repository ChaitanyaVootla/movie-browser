import { describe, it, expect } from "vitest";
import { parseMovieDiscussions } from "./discussions-parse";

describe("parseMovieDiscussions", () => {
  it("returns id when last segment is 'discussions' (with slug)", () => {
    expect(parseMovieDiscussions(["603", "the-matrix", "discussions"])).toBe(603);
  });

  it("returns id when last segment is 'discussions' (no slug)", () => {
    expect(parseMovieDiscussions(["603", "discussions"])).toBe(603);
  });

  it("returns null for a plain detail page (no discussions segment)", () => {
    expect(parseMovieDiscussions(["603", "the-matrix"])).toBeNull();
    expect(parseMovieDiscussions(["603"])).toBeNull();
  });

  it("returns null when 'discussions' is not the LAST segment", () => {
    // catch-all guarantees discussions is terminal; a non-terminal match must not trigger
    expect(parseMovieDiscussions(["603", "discussions", "extra"])).toBeNull();
  });

  it("returns null for a non-numeric id", () => {
    expect(parseMovieDiscussions(["not-a-number", "discussions"])).toBeNull();
  });

  it("returns null for empty params", () => {
    expect(parseMovieDiscussions([])).toBeNull();
  });
});
