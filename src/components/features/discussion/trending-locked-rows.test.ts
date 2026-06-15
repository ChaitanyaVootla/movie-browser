import { describe, it, expect } from "vitest";
import { lockedEpisodeRows } from "./trending-locked-rows";

describe("lockedEpisodeRows", () => {
  const episodes = [
    { seasonNumber: 1, episodeNumber: 1 },
    { seasonNumber: 1, episodeNumber: 2 },
    { seasonNumber: 2, episodeNumber: 1 },
  ];
  it("marks episodes ahead of the watermark as locked (never leaks titles)", () => {
    const rows = lockedEpisodeRows(episodes, { maxSeason: 1, maxEpisode: 1 });
    expect(rows).toEqual([
      { seasonNumber: 1, episodeNumber: 2, locked: true },
      { seasonNumber: 2, episodeNumber: 1, locked: true },
    ]);
  });
  it("anon (null watermark) locks everything", () => {
    const rows = lockedEpisodeRows(episodes, { maxSeason: null, maxEpisode: null });
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.locked)).toBe(true);
  });
});
