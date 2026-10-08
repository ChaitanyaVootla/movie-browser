import { describe, expect, it } from "vitest";
import { parseTopComments } from "./web-reactions";

// parseTopComments replaced a zod schema (zod shipped ~62KB gz to the client
// just for this). These pin the semantics the schema had.
describe("parseTopComments", () => {
  it("returns [] for non-array input", () => {
    expect(parseTopComments(null)).toEqual([]);
    expect(parseTopComments({ text: "x" })).toEqual([]);
  });

  it("keeps only author/text/likeCount and drops unknown keys", () => {
    expect(
      parseTopComments([{ author: "a", text: "hi", likeCount: 3, publishedAt: "2026", isCreatorHeart: true }])
    ).toEqual([{ author: "a", text: "hi", likeCount: 3 }]);
  });

  it("rejects items with a present-but-wrong-typed field", () => {
    expect(parseTopComments([{ text: "ok", author: 5 }, { text: "ok", likeCount: "9" }, { text: 1 }])).toEqual([]);
    expect(parseTopComments([{ text: "ok", likeCount: Number.NaN }])).toEqual([]);
    expect(parseTopComments([{ text: "ok", author: null }])).toEqual([]);
  });

  it("skips items without text and honours the limit", () => {
    const raw = [{ author: "no text" }, { text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }];
    expect(parseTopComments(raw).map((c) => c.text)).toEqual(["1", "2", "3"]);
    expect(parseTopComments(raw, 1)).toEqual([{ text: "1" }]);
  });

  it("ignores non-object entries", () => {
    expect(parseTopComments(["str", 4, null, [], { text: "y" }])).toEqual([{ text: "y" }]);
  });
});
