import { describe, it, expect } from "vitest";
import { commentIsCue } from "./comments";

describe("commentIsCue", () => {
  it("true when the author metadata carries a bot flag", () => {
    expect(commentIsCue({ bot: true })).toBe(true);
  });
  it("false for a normal author / null metadata", () => {
    expect(commentIsCue(null)).toBe(false);
    expect(commentIsCue({})).toBe(false);
    expect(commentIsCue([])).toBe(false);
  });
});
