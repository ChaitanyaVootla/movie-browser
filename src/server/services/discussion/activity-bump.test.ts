import { describe, it, expect } from "vitest";
import { rootIdFor } from "./activity-bump";

describe("rootIdFor", () => {
  it("returns the parent's root when replying to a reply", () => {
    expect(rootIdFor({ id: 9, parentId: 4 })).toBe(4);
  });
  it("returns the parent's own id when replying to a root", () => {
    expect(rootIdFor({ id: 4, parentId: null })).toBe(4);
  });
});
