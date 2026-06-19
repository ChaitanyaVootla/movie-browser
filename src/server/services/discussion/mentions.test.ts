import { describe, it, expect } from "vitest";
import { parseMentions, parseEntityMentions } from "./mentions";

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

describe("parseEntityMentions", () => {
  it("parses typed title/person/episode tokens", () => {
    const body =
      "loved [[movie:550|Fight Club]] and [[person:287|Brad Pitt]] in [[ep:1396:5:14|Ozymandias]]";
    expect(parseEntityMentions(body)).toEqual([
      { kind: "movie", movieId: 550, seriesId: null, personId: null, seasonNumber: null, episodeNumber: null },
      { kind: "person", movieId: null, seriesId: null, personId: 287, seasonNumber: null, episodeNumber: null },
      { kind: "episode", movieId: null, seriesId: 1396, personId: null, seasonNumber: 5, episodeNumber: 14 },
    ]);
  });
  it("parses a bare series token", () => {
    expect(parseEntityMentions("[[series:1396|Breaking Bad]]")).toEqual([
      { kind: "series", movieId: null, seriesId: 1396, personId: null, seasonNumber: null, episodeNumber: null },
    ]);
  });
  it("dedupes identical entity tokens and caps at 8", () => {
    const body = Array.from({ length: 10 }, (_, i) => `[[movie:${i}|m${i}]]`).join(" ");
    expect(parseEntityMentions(body)).toHaveLength(8);
    expect(parseEntityMentions("[[movie:5|A]] [[movie:5|A again]]")).toHaveLength(1);
  });
  it("ignores malformed tokens", () => {
    expect(parseEntityMentions("[[movie:abc|x]] [[unknown:5|y]]")).toEqual([]);
  });
});
