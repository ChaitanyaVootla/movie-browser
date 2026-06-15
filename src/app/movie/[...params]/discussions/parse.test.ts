import { describe, it, expect } from "vitest";
import { parseDiscussionsParams } from "./parse";

describe("parseDiscussionsParams (movie)", () => {
  it("reads the id from params[0]", () => {
    expect(parseDiscussionsParams(["603"])).toBe(603);
    expect(parseDiscussionsParams(["603", "the-matrix"])).toBe(603);
  });
  it("rejects non-numeric", () => {
    expect(parseDiscussionsParams(["abc"])).toBeNull();
    expect(parseDiscussionsParams([])).toBeNull();
  });
});
