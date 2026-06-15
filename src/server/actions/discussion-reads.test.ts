import { describe, it, expect } from "vitest";
import { GetAnchorActivitySchema } from "./discussion-reads-schema";

describe("GetAnchorActivitySchema", () => {
  it("accepts a movie anchor", () => {
    const r = GetAnchorActivitySchema.parse({ anchor: { type: "movie", movieId: 603 } });
    expect(r.anchor.type).toBe("movie");
  });
  it("rejects a malformed anchor", () => {
    expect(() => GetAnchorActivitySchema.parse({ anchor: { type: "movie" } })).toThrow();
  });
});
