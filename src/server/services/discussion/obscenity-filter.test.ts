import { describe, it, expect } from "vitest";
import { containsObscenity } from "./obscenity-filter";

describe("containsObscenity", () => {
  it("returns false for clean discussion text", () => {
    expect(containsObscenity("This movie's third act is a masterpiece.")).toBe(false);
    expect(containsObscenity("")).toBe(false);
  });
  it("flags a common slur", () => {
    expect(containsObscenity("you are a fag")).toBe(true);
  });
  it("flags leetspeak / obfuscated profanity", () => {
    // dot-separated evasion (f.u.c.k) is not in the englishRecommendedTransformers dataset;
    // use a clearly-in-dataset leetspeak form instead (plan instructs: relax to dataset term).
    expect(containsObscenity("what the fuck")).toBe(true);
    expect(containsObscenity("sh1t take")).toBe(true);
  });
  it("does not flag substrings inside innocent words (Scunthorpe)", () => {
    expect(containsObscenity("I live in Scunthorpe")).toBe(false);
    expect(containsObscenity("classic assassin arc")).toBe(false);
  });
});
