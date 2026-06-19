import { describe, it, expect } from "vitest";
import { scoreToStars } from "./star-rating-input";

describe("scoreToStars", () => {
  it("renders 1..10 score as 0.5..5 stars", () => {
    expect(scoreToStars(1)).toBe(0.5);
    expect(scoreToStars(10)).toBe(5);
    expect(scoreToStars(7)).toBe(3.5);
    expect(scoreToStars(null)).toBe(0);
  });
});
