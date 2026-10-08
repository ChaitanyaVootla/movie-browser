import { describe, it, expect } from "vitest";
import { isSignificantImdbChange, parseImdbRatingLine } from "./lib/imdb-ratings";

describe("parseImdbRatingLine", () => {
  it("parses data lines, rejects header and garbage", () => {
    expect(parseImdbRatingLine("tt0816692\t8.7\t2312345")).toEqual({ tconst: "tt0816692", rating: 8.7, votes: 2312345 });
    expect(parseImdbRatingLine("tconst\taverageRating\tnumVotes")).toBeNull();
    expect(parseImdbRatingLine("tt1\t\\N\t3")).toBeNull();
    expect(parseImdbRatingLine("tt1\t11\t3")).toBeNull();
    expect(parseImdbRatingLine("")).toBeNull();
  });
});

describe("isSignificantImdbChange", () => {
  it("new rows always write", () => {
    expect(isSignificantImdbChange(null, { rating: 7, votes: 10 })).toBe(true);
  });
  it("rating moves write; float noise does not", () => {
    expect(isSignificantImdbChange({ score: 7.1, votes: 1000 }, { rating: 7.2, votes: 1000 })).toBe(true);
    expect(isSignificantImdbChange({ score: 7.1, votes: 1000 }, { rating: 7.1000001, votes: 1000 })).toBe(false);
  });
  it("vote drift under 2% is skipped, over 2% writes", () => {
    expect(isSignificantImdbChange({ score: 8, votes: 100_000 }, { rating: 8, votes: 101_000 })).toBe(false);
    expect(isSignificantImdbChange({ score: 8, votes: 100_000 }, { rating: 8, votes: 102_500 })).toBe(true);
    expect(isSignificantImdbChange({ score: 8, votes: 100 }, { rating: 8, votes: 104 })).toBe(false); // floor of 5
  });
  it("missing stored vote count writes", () => {
    expect(isSignificantImdbChange({ score: 8, votes: null }, { rating: 8, votes: 5 })).toBe(true);
  });
});
