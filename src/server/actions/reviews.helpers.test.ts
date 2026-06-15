import { describe, it, expect } from "vitest";

import { starsToScore, resolveReviewScope } from "./reviews-helpers";

describe("starsToScore", () => {
  it("maps half-stars 0.5..5 to 1..10", () => {
    expect(starsToScore(0.5)).toBe(1);
    expect(starsToScore(5)).toBe(10);
    expect(starsToScore(3.5)).toBe(7);
  });
  it("maps null/0 to null (unrated abstains)", () => {
    expect(starsToScore(null)).toBeNull();
    expect(starsToScore(0)).toBeNull();
  });
});

describe("resolveReviewScope", () => {
  it("keeps the user's chosen scope when not weaker than the AI suggestion", () => {
    expect(resolveReviewScope("ENDING", null, null, undefined).scope).toBe("ENDING");
  });
  it("upgrades to the AI-suggested scope when stricter than the user's", () => {
    const r = resolveReviewScope("NONE", null, null, { scope: "ENDING", season: null, episode: null });
    expect(r.scope).toBe("ENDING");
  });
  it("keeps the user's scope when the AI suggestion is weaker", () => {
    const r = resolveReviewScope("ENDING", null, null, { scope: "NONE", season: null, episode: null });
    expect(r.scope).toBe("ENDING");
  });
});
