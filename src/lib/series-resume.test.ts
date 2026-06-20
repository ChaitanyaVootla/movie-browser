import { describe, expect, it } from "vitest";
import { computeResumeTarget, parseResumeParams, resumeQuery } from "./series-resume";

const seasons = [
  { season_number: 0, episode_count: 3 }, // specials — ignored
  { season_number: 1, episode_count: 10 },
  { season_number: 2, episode_count: 8 },
  { season_number: 3, episode_count: 0 }, // not yet aired — ignored
];

describe("computeResumeTarget", () => {
  it("returns null when there is no position", () => {
    expect(computeResumeTarget(seasons, null, null)).toBeNull();
    expect(computeResumeTarget(seasons, 1, null)).toBeNull();
    expect(computeResumeTarget(seasons, null, 5)).toBeNull();
  });

  it("targets the next episode within the same season", () => {
    expect(computeResumeTarget(seasons, 1, 4)).toEqual({
      seasonNumber: 1,
      episodeNumber: 5,
      isNext: true,
    });
  });

  it("rolls over to the first episode of the next season when a season is finished", () => {
    expect(computeResumeTarget(seasons, 1, 10)).toEqual({
      seasonNumber: 2,
      episodeNumber: 1,
      isNext: true,
    });
  });

  it("skips empty/unaired seasons when rolling over", () => {
    // Finished season 2 → season 3 has 0 episodes → caught up → last watched.
    expect(computeResumeTarget(seasons, 2, 8)).toEqual({
      seasonNumber: 2,
      episodeNumber: 8,
      isNext: false,
    });
  });

  it("falls back to last watched when fully caught up", () => {
    expect(computeResumeTarget([{ season_number: 1, episode_count: 6 }], 1, 6)).toEqual({
      seasonNumber: 1,
      episodeNumber: 6,
      isNext: false,
    });
  });

  it("trusts the watermark when season metadata is missing", () => {
    expect(computeResumeTarget([], 4, 2)).toEqual({
      seasonNumber: 4,
      episodeNumber: 2,
      isNext: false,
    });
  });
});

describe("parseResumeParams", () => {
  it("parses season and episode", () => {
    expect(parseResumeParams("?s=2&e=5")).toEqual({ seasonNumber: 2, episodeNumber: 5 });
  });
  it("parses a bare season", () => {
    expect(parseResumeParams("?s=3")).toEqual({ seasonNumber: 3, episodeNumber: null });
  });
  it("returns null without s", () => {
    expect(parseResumeParams("?e=5")).toBeNull();
    expect(parseResumeParams("")).toBeNull();
  });
  it("ignores non-numeric values", () => {
    expect(parseResumeParams("?s=abc")).toBeNull();
    expect(parseResumeParams("?s=2&e=xyz")).toEqual({ seasonNumber: 2, episodeNumber: null });
  });
});

describe("resumeQuery", () => {
  it("builds a query string", () => {
    expect(resumeQuery(2, 5)).toBe("s=2&e=5");
  });
});
