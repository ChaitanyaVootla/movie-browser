import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setUserRating: vi.fn(),
  upsertRecFeedback: vi.fn(),
  movieFind: vi.fn(),
  seriesFind: vi.fn(),
  getTasteProfile: vi.fn(),
  evict: vi.fn(),
  fetchCalibrationCandidates: vi.fn(),
  getRecPoolForUser: vi.fn(),
}));
vi.mock("@/server/db/postgres", () => ({
  prisma: { movie: { findMany: h.movieFind }, series: { findMany: h.seriesFind } },
}));
vi.mock("@/server/db/audit", () => ({ auditedTransaction: (_id: number, fn: (tx: unknown) => Promise<unknown>) => fn("TX") }));
vi.mock("@/server/db/postgres/social/ratings", () => ({ setUserRating: h.setUserRating }));
vi.mock("@/server/db/postgres/social/calibration", () => ({ fetchCalibrationCandidates: h.fetchCalibrationCandidates }));
vi.mock("@/server/db/postgres/social/rec-feedback", () => ({
  upsertRecFeedback: h.upsertRecFeedback,
  fetchActiveSkips: vi.fn(async () => ({ movieIds: [5], seriesIds: [] })),
}));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  fetchRecExclusions: vi.fn(async () => ({ movieIds: [1], seriesIds: [2] })),
}));
vi.mock("./index", () => ({ getTasteProfile: h.getTasteProfile }));
vi.mock("./recommend", () => ({ evictRecsCache: h.evict, getRecPoolForUser: h.getRecPoolForUser }));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn() } }));

const { submitCalibrationFor, getCalibrationDeckFor } = await import("./calibration");

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.movieFind.mockResolvedValue([{ id: 10 }, { id: 11 }, { id: 12 }]);
  h.seriesFind.mockResolvedValue([{ id: 20 }]);
  h.getTasteProfile.mockResolvedValue({ positiveCount: 3 });
  h.getRecPoolForUser.mockResolvedValue(null);
});

describe("submitCalibrationFor", () => {
  it("writes ratings through setUserRating (one audited tx), skips as rec_feedback SKIP", async () => {
    const out = await submitCalibrationFor(7, {
      answers: [
        { mediaType: "movie", id: 10, answer: "loved" },
        { mediaType: "movie", id: 11, answer: "liked" },
        { mediaType: "movie", id: 12, answer: "disliked" },
        { mediaType: "series", id: 20, answer: "skip" },
        { mediaType: "movie", id: 999, answer: "loved" }, // not in the catalog → dropped
      ],
    });
    expect(out).toEqual({ positives: 3, ready: true });
    expect(h.setUserRating.mock.calls).toEqual([
      [7, { itemId: 10, itemType: "movie", liked: true }, "TX"],
      [7, { itemId: 11, itemType: "movie", thumb: 1 }, "TX"],
      [7, { itemId: 12, itemType: "movie", thumb: -1 }, "TX"],
    ]);
    expect(h.upsertRecFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, mediaType: "series", id: 20, kind: "SKIP", rowId: "calibration" })
    );
    expect(h.evict).toHaveBeenCalledWith(7);
  });
  it("not ready below the centroid minimum; never throws", async () => {
    h.getTasteProfile.mockResolvedValue({ positiveCount: 2 });
    expect(await submitCalibrationFor(7, { answers: [{ mediaType: "movie", id: 10, answer: "liked" }] })).toEqual({
      positives: 2,
      ready: false,
    });
    h.setUserRating.mockRejectedValue(new Error("boom"));
    expect(await submitCalibrationFor(7, { answers: [{ mediaType: "movie", id: 10, answer: "liked" }] })).toEqual({
      positives: 0,
      ready: false,
    });
  });
});

describe("getCalibrationDeckFor", () => {
  it("excludes engaged + skipped titles and relaxes the vote floor until the deck fills", async () => {
    h.fetchCalibrationCandidates.mockResolvedValue([]);
    const out = await getCalibrationDeckFor(7, "start", new Date("2026-10-12T00:00:00Z"));
    expect(out.items).toEqual([]);
    expect(h.fetchCalibrationCandidates).toHaveBeenCalledWith("movies", { excludeIds: [1, 5], minVotes: 1000, limit: 80 });
    expect(h.fetchCalibrationCandidates).toHaveBeenCalledWith("movies", expect.objectContaining({ minVotes: 0 }));
  });
});

describe("sharpen deck", () => {
  const scored = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const series = i % 5 === 0;
      const id = 1000 + i;
      return {
        key: `${series ? "s" : "m"}:${id}`,
        mediaType: series ? "series" : "movie",
        id,
        title: `T${id}`,
        posterPath: null,
        releaseDate: "2020-01-01",
        year: 2020,
        genres: ["Drama"],
      };
    });

  it("drops engaged titles (fresh exclusions) and 90-day SKIPs before taking the middle ranks", async () => {
    const pool = scored(200);
    h.getRecPoolForUser.mockResolvedValue({ scored: pool });
    // The first 120 ranks (the whole unfiltered sharpen window) are engaged or skipped.
    const window = pool.slice(0, 120);
    const ex = window.filter((c) => c.mediaType === "movie" && c.id % 2 === 0).map((c) => c.id);
    const skip = window.filter((c) => c.mediaType === "movie" && c.id % 2 === 1).map((c) => c.id);
    const exS = window.filter((c) => c.mediaType === "series").map((c) => c.id);
    const tr = await import("@/server/db/postgres/social/taste-recs");
    const rf = await import("@/server/db/postgres/social/rec-feedback");
    vi.mocked(tr.fetchRecExclusions).mockResolvedValueOnce({ movieIds: ex, seriesIds: exS });
    vi.mocked(rf.fetchActiveSkips).mockResolvedValueOnce({ movieIds: skip, seriesIds: [] });
    const out = await getCalibrationDeckFor(7, "sharpen", new Date("2026-10-12T00:00:00Z"));
    const banned = new Set([...ex.map((i) => `movie:${i}`), ...skip.map((i) => `movie:${i}`), ...exS.map((i) => `series:${i}`)]);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.items.some((it) => banned.has(`${it.mediaType}:${it.id}`))).toBe(false);
  });
});
