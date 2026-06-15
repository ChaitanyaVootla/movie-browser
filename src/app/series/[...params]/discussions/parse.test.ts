import { describe, it, expect } from "vitest";
import { parseSeriesDiscussionsId } from "./parse";

describe("parseSeriesDiscussionsId", () => {
  it("reads the series id from params[0]", () => {
    expect(parseSeriesDiscussionsId(["1396"])).toBe(1396);
    expect(parseSeriesDiscussionsId(["1396", "breaking-bad"])).toBe(1396);
  });
  it("rejects non-numeric / empty", () => {
    expect(parseSeriesDiscussionsId(["x"])).toBeNull();
    expect(parseSeriesDiscussionsId([])).toBeNull();
  });
});
