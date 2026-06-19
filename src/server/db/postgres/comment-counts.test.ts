import { describe, it, expect } from "vitest";
import { countsToMap } from "./comment-counts";

describe("countsToMap", () => {
  it("maps grouped counts to a movieId→count map", () => {
    const m = countsToMap([
      { movieId: 603, _count: { _all: 12 } },
      { movieId: 78, _count: { _all: 3 } },
    ]);
    expect(m.get(603)).toBe(12);
    expect(m.get(78)).toBe(3);
  });
});
