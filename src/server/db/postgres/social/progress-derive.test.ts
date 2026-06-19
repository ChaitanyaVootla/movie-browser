import { describe, it, expect } from "vitest";
import { deriveProgress, type ProgressEventInput } from "./progress-derive";

const d = (s: string) => new Date(s);

function ep(
  season: number,
  episode: number,
  watchedAt: string | null = "2026-01-10",
  createdAt = "2026-01-10"
): ProgressEventInput {
  return {
    seasonNumber: season,
    episodeNumber: episode,
    watchedAt: watchedAt ? d(watchedAt) : null,
    createdAt: d(createdAt),
  };
}

function seriesLevel(createdAt = "2026-01-10"): ProgressEventInput {
  return { seasonNumber: null, episodeNumber: null, watchedAt: null, createdAt: d(createdAt) };
}

const AIRING = { airedEpisodes: 10, isEnded: false };
const ENDED_8 = { airedEpisodes: 8, isEnded: true };

describe("deriveProgress", () => {
  it("no events -> empty (caller deletes the row)", () => {
    expect(deriveProgress([], AIRING, null, null).empty).toBe(true);
  });

  it("mid-season watching", () => {
    const r = deriveProgress([ep(1, 1), ep(1, 2), ep(1, 3)], AIRING, null, null);
    expect(r).toMatchObject({
      empty: false,
      status: "WATCHING",
      lastSeasonNumber: 1,
      lastEpisodeNumber: 3,
      episodesWatched: 3,
      maxSeasonNumber: 1,
      maxEpisodeNumber: 3,
    });
  });

  it("sparse out-of-order watch: watermark is the max tuple, count is distinct", () => {
    const r = deriveProgress([ep(1, 1), ep(3, 4), ep(1, 1)], AIRING, null, null);
    expect(r.status).toBe("WATCHING");
    expect(r.episodesWatched).toBe(2); // distinct (1,1) and (3,4)
    expect(r.maxSeasonNumber).toBe(3);
    expect(r.maxEpisodeNumber).toBe(4);
  });

  it("CAUGHT_UP: all aired episodes of a still-airing show", () => {
    const events = Array.from({ length: 8 }, (_, i) => ep(1, i + 1));
    const r = deriveProgress(events, { airedEpisodes: 8, isEnded: false }, null, null);
    expect(r.status).toBe("CAUGHT_UP");
  });

  it("COMPLETED: all episodes of an ended show", () => {
    const events = Array.from({ length: 8 }, (_, i) => ep(1, i + 1));
    const r = deriveProgress(events, ENDED_8, null, null);
    expect(r.status).toBe("COMPLETED");
  });

  it("series-level event only (IMDb import) -> COMPLETED with NULL position", () => {
    const r = deriveProgress([seriesLevel()], ENDED_8, null, null);
    expect(r.status).toBe("COMPLETED");
    expect(r.lastSeasonNumber).toBeNull();
    expect(r.maxSeasonNumber).toBeNull();
    expect(r.episodesWatched).toBe(0);
  });

  it("rewatch mid-cycle: current pointers reset, lifetime watermark survives", () => {
    const firstRun = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2025-05-01")
    );
    const reset = d("2026-01-01");
    const cycle = [ep(1, 1, "2026-01-02"), ep(1, 2, "2026-01-03")];
    const r = deriveProgress([...firstRun, ...cycle], ENDED_8, reset, null);
    expect(r.status).toBe("REWATCHING");
    expect(r.lastSeasonNumber).toBe(1);
    expect(r.lastEpisodeNumber).toBe(2);
    expect(r.episodesWatched).toBe(2);
    expect(r.maxSeasonNumber).toBe(2); // spoiler gate still sees the ending
    expect(r.maxEpisodeNumber).toBe(4);
  });

  it("rewatch completes -> COMPLETED again", () => {
    const firstRun = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2025-05-01")
    );
    const cycle = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2026-02-01")
    );
    const r = deriveProgress([...firstRun, ...cycle], ENDED_8, d("2026-01-01"), null);
    expect(r.status).toBe("COMPLETED");
  });

  it("freshly reset with zero cycle events -> REWATCHING with null cycle pointers", () => {
    const firstRun = [ep(1, 1, "2025-05-01")];
    const r = deriveProgress(firstRun, AIRING, d("2026-01-01"), null);
    expect(r.status).toBe("REWATCHING");
    expect(r.lastSeasonNumber).toBeNull();
    expect(r.episodesWatched).toBe(0);
    expect(r.maxSeasonNumber).toBe(1);
  });

  it("manual status is preserved while pointers keep updating", () => {
    const r = deriveProgress([ep(1, 1), ep(1, 2)], AIRING, null, "DROPPED");
    expect(r.status).toBe("DROPPED");
    expect(r.lastEpisodeNumber).toBe(2);
  });

  it("season-0 specials count in watermark but not toward CAUGHT_UP", () => {
    const r = deriveProgress([ep(0, 1)], { airedEpisodes: 1, isEnded: false }, null, null);
    expect(r.status).toBe("WATCHING");
    expect(r.maxSeasonNumber).toBe(0);
    expect(r.maxEpisodeNumber).toBe(1);
  });

  it("dateless events use createdAt for cycle membership", () => {
    const before = ep(1, 1, null, "2025-05-01"); // BACKFILL row created before reset
    const after = ep(1, 2, null, "2026-02-01"); // BACKFILL row created after reset
    const r = deriveProgress([before, after], AIRING, d("2026-01-01"), null);
    expect(r.episodesWatched).toBe(1);
    expect(r.lastEpisodeNumber).toBe(2);
  });
});
