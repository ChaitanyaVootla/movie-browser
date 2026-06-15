import { describe, it, expect } from "vitest";
import { shouldShowBadge } from "./discussion-count-badge";

describe("DiscussionCountBadge (pure helpers)", () => {
  it("returns false below the invite threshold (cards stay clean)", () => {
    expect(shouldShowBadge(0)).toBe(false);
    expect(shouldShowBadge(4)).toBe(false);
    expect(shouldShowBadge(1)).toBe(false);
  });
  it("returns true at/above threshold", () => {
    expect(shouldShowBadge(5)).toBe(true);
    expect(shouldShowBadge(42)).toBe(true);
  });
  it("honors a custom threshold", () => {
    expect(shouldShowBadge(3, 10)).toBe(false);
    expect(shouldShowBadge(10, 10)).toBe(true);
  });
});
