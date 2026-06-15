import { describe, it, expect } from "vitest";
import {
  shouldRunNow,
  isNewlyAired,
  EPISODE_DROP_LOOKBACK_MS,
  dropKeysFromEpisodes,
} from "./seed-episode-drop-notifications";

const NOW = new Date("2026-06-15T00:00:00Z");

describe("shouldRunNow", () => {
  it("respects the cron window with FORCE_RUN override", () => {
    expect(shouldRunNow({ nowHourUtc: 5, cronHourUtc: 5, force: false })).toBe(true);
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 5, force: false })).toBe(false);
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 5, force: true })).toBe(true);
  });
});

describe("isNewlyAired", () => {
  it("true for an episode aired within the lookback window", () => {
    const within = new Date(NOW.getTime() - EPISODE_DROP_LOOKBACK_MS / 2);
    expect(isNewlyAired(within, NOW)).toBe(true);
  });
  it("false for an episode aired long ago (avoid backfill spam)", () => {
    expect(isNewlyAired(new Date("2020-01-01T00:00:00Z"), NOW)).toBe(false);
  });
  it("false for a future air date", () => {
    expect(isNewlyAired(new Date("2027-01-01T00:00:00Z"), NOW)).toBe(false);
  });
  it("false for a NULL air date (UNKNOWN, not a real drop)", () => {
    expect(isNewlyAired(null, NOW)).toBe(false);
  });
});

describe("dropKeysFromEpisodes", () => {
  it("collapses multiple episodes of one season into ONE (series,season) drop key", () => {
    const keys = dropKeysFromEpisodes([
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 7 },
    ]);
    expect(keys).toEqual([
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 7 },
    ]);
  });
});
