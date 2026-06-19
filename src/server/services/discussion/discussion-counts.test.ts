import { describe, it, expect } from "vitest";
import { adaptiveCountLabel } from "./discussion-counts";

describe("adaptiveCountLabel", () => {
  it("invites below the threshold (no negative social proof)", () => {
    expect(adaptiveCountLabel(0)).toEqual({ variant: "invite", label: "Start the discussion" });
    expect(adaptiveCountLabel(4)).toEqual({ variant: "invite", label: "Join the discussion" });
  });
  it("shows the real count at/above the threshold", () => {
    expect(adaptiveCountLabel(5)).toEqual({ variant: "count", label: "5 comments" });
    expect(adaptiveCountLabel(1)).toEqual({ variant: "invite", label: "Join the discussion" });
    expect(adaptiveCountLabel(248)).toEqual({ variant: "count", label: "248 comments" });
  });
  it("singularizes at exactly the threshold boundary", () => {
    expect(adaptiveCountLabel(1, 1)).toEqual({ variant: "count", label: "1 comment" });
  });
  it("honors a custom threshold", () => {
    expect(adaptiveCountLabel(7, 10)).toEqual({ variant: "invite", label: "Join the discussion" });
    expect(adaptiveCountLabel(10, 10)).toEqual({ variant: "count", label: "10 comments" });
  });
});
