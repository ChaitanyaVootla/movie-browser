import { describe, it, expect } from "vitest";
import { parseSeriesDiscussions } from "./discussions-parse";

describe("parseSeriesDiscussions", () => {
  it("returns id when last segment is 'discussions' (with slug)", () => {
    expect(parseSeriesDiscussions(["1396", "breaking-bad", "discussions"])).toBe(1396);
  });

  it("returns id when last segment is 'discussions' (no slug)", () => {
    expect(parseSeriesDiscussions(["1396", "discussions"])).toBe(1396);
  });

  it("returns null for a plain detail page", () => {
    expect(parseSeriesDiscussions(["1396", "breaking-bad"])).toBeNull();
    expect(parseSeriesDiscussions(["1396"])).toBeNull();
  });

  it("does NOT collide with the per-episode discuss route", () => {
    // /series/1396/breaking-bad/discuss/s2e5 → must not be treated as discussions index
    expect(parseSeriesDiscussions(["1396", "breaking-bad", "discuss", "s2e5"])).toBeNull();
  });

  it("returns null for a non-numeric id", () => {
    expect(parseSeriesDiscussions(["nope", "discussions"])).toBeNull();
  });

  it("returns null for empty params", () => {
    expect(parseSeriesDiscussions([])).toBeNull();
  });
});
