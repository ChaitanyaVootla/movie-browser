import { describe, it, expect } from "vitest";
import { parseMentions } from "./mentions";

describe("parseMentions", () => {
  it("extracts usernames", () => {
    expect(parseMentions("hey @filmfan42 what did you think")).toEqual(["filmfan42"]);
  });
  it("dedupes case-insensitively, preserving first form lowercased", () => {
    expect(parseMentions("@Ana @ana @ANA")).toEqual(["ana"]);
  });
  it("requires a boundary before @ (emails don't mention)", () => {
    expect(parseMentions("mail me a@b.com")).toEqual([]);
    expect(parseMentions("(@ana) and @bob!")).toEqual(["ana", "bob"]);
  });
  it("enforces username charset and length 3-30", () => {
    expect(parseMentions("@ab @this_is_fine @-bad")).toEqual(["this_is_fine"]);
  });
  it("caps at 5 mentions", () => {
    const body = "@u111 @u222 @u333 @u444 @u555 @u666";
    expect(parseMentions(body)).toHaveLength(5);
  });
  it("ignores mentions inside words", () => {
    expect(parseMentions("price is 5@once")).toEqual([]);
  });
});
