import { describe, it, expect } from "vitest";
import {
  ANON_GATE_CONTEXT,
  isScopeVisible,
  scopeRank,
  isStricterScope,
  scopeKeyFor,
  type ViewerGateContext,
} from "./spoiler-gate";

const anon = ANON_GATE_CONTEXT;
const movieWatched: ViewerGateContext = { ...anon, loggedIn: true, movieWatched: true };
const midS2E5: ViewerGateContext = {
  loggedIn: true, movieWatched: false, seriesCompleted: false,
  maxSeason: 2, maxEpisode: 5,
};
const completed: ViewerGateContext = { ...midS2E5, seriesCompleted: true };

describe("isScopeVisible", () => {
  it("NONE is visible to everyone, including anon", () => {
    expect(isScopeVisible("NONE", null, null, anon, "movie")).toBe(true);
    expect(isScopeVisible("NONE", null, null, anon, "series")).toBe(true);
  });
  it("anon sees nothing gated", () => {
    expect(isScopeVisible("WATCHED", null, null, anon, "movie")).toBe(false);
    expect(isScopeVisible("EPISODE", 1, 1, anon, "series")).toBe(false);
    expect(isScopeVisible("ENDING", null, null, anon, "series")).toBe(false);
  });
  it("movie: WATCHED/ENDING visible iff a watch event exists", () => {
    expect(isScopeVisible("WATCHED", null, null, movieWatched, "movie")).toBe(true);
    expect(isScopeVisible("ENDING", null, null, movieWatched, "movie")).toBe(true);
    expect(isScopeVisible("WATCHED", null, null, { ...anon, loggedIn: true }, "movie")).toBe(false);
  });
  it("series: EPISODE gated by lifetime watermark tuple", () => {
    expect(isScopeVisible("EPISODE", 2, 5, midS2E5, "series")).toBe(true);  // equal
    expect(isScopeVisible("EPISODE", 1, 9, midS2E5, "series")).toBe(true);  // earlier season
    expect(isScopeVisible("EPISODE", 2, 6, midS2E5, "series")).toBe(false); // one ahead
    expect(isScopeVisible("EPISODE", 3, 1, midS2E5, "series")).toBe(false);
  });
  it("series: WATCHED/ENDING require COMPLETED status", () => {
    expect(isScopeVisible("WATCHED", null, null, midS2E5, "series")).toBe(false);
    expect(isScopeVisible("ENDING", null, null, midS2E5, "series")).toBe(false);
    expect(isScopeVisible("WATCHED", null, null, completed, "series")).toBe(true);
    expect(isScopeVisible("ENDING", null, null, completed, "series")).toBe(true);
  });
  it("COMPLETED sees everything", () => {
    expect(isScopeVisible("EPISODE", 99, 99, completed, "series")).toBe(true);
  });
  it("EPISODE with null season fails closed", () => {
    expect(isScopeVisible("EPISODE", null, null, completed, "series")).toBe(true); // completed bypasses
    expect(isScopeVisible("EPISODE", null, null, midS2E5, "series")).toBe(false);  // can't compare → hidden
  });
});

describe("scope strictness (AI suggestion flow)", () => {
  it("ranks NONE < EPISODE < WATCHED < ENDING", () => {
    expect(scopeRank("NONE")).toBeLessThan(scopeRank("EPISODE"));
    expect(scopeRank("EPISODE")).toBeLessThan(scopeRank("WATCHED"));
    expect(scopeRank("WATCHED")).toBeLessThan(scopeRank("ENDING"));
  });
  it("a later episode tuple is stricter at equal rank", () => {
    expect(isStricterScope("EPISODE", 2, 6, "EPISODE", 2, 5)).toBe(true);
    expect(isStricterScope("EPISODE", 2, 5, "EPISODE", 2, 5)).toBe(false);
  });
  it("EPISODE suggestion over NONE choice is stricter", () => {
    expect(isStricterScope("EPISODE", 1, 1, "NONE", null, null)).toBe(true);
  });
});

describe("scopeKeyFor (thread-summary cache key)", () => {
  it("buckets viewers", () => {
    expect(scopeKeyFor(anon, "movie")).toBe("none");
    expect(scopeKeyFor(movieWatched, "movie")).toBe("watched");
    expect(scopeKeyFor(midS2E5, "series")).toBe("s2e5");
    expect(scopeKeyFor(completed, "series")).toBe("completed");
  });
});
