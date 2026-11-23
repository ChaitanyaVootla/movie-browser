/**
 * Regression lock (Nov 2026): Set position / Mark season reported success but
 * saved nothing for series whose seasons had NO episode rows in PG (e.g. The
 * Rings of Power: 3 seasons, 0 episodes). Tracking now fills the gap from TMDB
 * before backfilling watch events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const seasonCount = vi.fn();
const transaction = vi.fn();
vi.mock("@/server/db/postgres", () => ({
  prisma: {
    season: { count: (...a: unknown[]) => seasonCount(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

const fetchSeriesFromTmdb = vi.fn();
const fetchAllSeasonEpisodes = vi.fn();
vi.mock("./sources/tmdb", () => ({
  fetchSeriesFromTmdb: (...a: unknown[]) => fetchSeriesFromTmdb(...a),
  fetchAllSeasonEpisodes: (...a: unknown[]) => fetchAllSeasonEpisodes(...a),
}));

const reconcileSeasons = vi.fn();
vi.mock("./sources/postgres/season-upserts", () => ({
  reconcileSeasons: (...a: unknown[]) => reconcileSeasons(...a),
}));

import { ensureSeriesEpisodes, seriesHasEpisodeGap } from "./episode-backfill";

const season = (n: number, episodes?: number) => ({
  id: n,
  season_number: n,
  name: `Season ${n}`,
  poster_path: null,
  air_date: null,
  episode_count: 2,
  ...(episodes === undefined
    ? {}
    : {
        episodes: Array.from({ length: episodes }, (_, i) => ({
          id: n * 100 + i,
          episode_number: i + 1,
          name: `E${i + 1}`,
        })),
      }),
});

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn("tx"));
});

describe("seriesHasEpisodeGap", () => {
  it("looks only at regular seasons that should have episodes but have none", async () => {
    seasonCount.mockResolvedValue(1);
    await expect(seriesHasEpisodeGap(84773)).resolves.toBe(true);
    expect(seasonCount).toHaveBeenCalledWith({
      where: {
        seriesId: 84773,
        seasonNumber: { gt: 0 },
        episodeCount: { gt: 0 },
        episodes: { none: {} },
      },
    });
  });
});

describe("ensureSeriesEpisodes", () => {
  it("is a no-op (no TMDB call) when PG already has every season's episodes", async () => {
    seasonCount.mockResolvedValue(0);
    await expect(ensureSeriesEpisodes(1)).resolves.toBe(true);
    expect(fetchSeriesFromTmdb).not.toHaveBeenCalled();
    expect(reconcileSeasons).not.toHaveBeenCalled();
  });

  it("fetches seasons from TMDB and reconciles them when episodes are missing", async () => {
    seasonCount.mockResolvedValue(3);
    const seasons = [season(1), season(2)];
    fetchSeriesFromTmdb.mockResolvedValue({ id: 84773, seasons });
    const full = [season(1, 2), season(2, 2)];
    fetchAllSeasonEpisodes.mockResolvedValue(full);

    await expect(ensureSeriesEpisodes(84773)).resolves.toBe(true);
    expect(fetchAllSeasonEpisodes).toHaveBeenCalledWith(84773, seasons);
    expect(reconcileSeasons).toHaveBeenCalledWith("tx", 84773, full);
  });

  it("does NOT reconcile a partial fetch (a failed season would be deleted)", async () => {
    seasonCount.mockResolvedValue(1);
    fetchSeriesFromTmdb.mockResolvedValue({ id: 5, seasons: [season(1), season(2)] });
    fetchAllSeasonEpisodes.mockResolvedValue([season(1, 2), season(2)]); // S2 failed
    await expect(ensureSeriesEpisodes(5)).resolves.toBe(false);
    expect(reconcileSeasons).not.toHaveBeenCalled();
  });

  it("dedupes concurrent calls for the same series", async () => {
    seasonCount.mockResolvedValue(1);
    fetchSeriesFromTmdb.mockResolvedValue({ id: 7, seasons: [season(1)] });
    fetchAllSeasonEpisodes.mockResolvedValue([season(1, 2)]);
    await Promise.all([ensureSeriesEpisodes(7), ensureSeriesEpisodes(7)]);
    expect(fetchSeriesFromTmdb).toHaveBeenCalledTimes(1);
  });
});
