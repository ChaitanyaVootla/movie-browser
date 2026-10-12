import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { FacetStat } from "@/lib/taste/lift";

const fetchUserByUsername = vi.fn();
const fetchUserById = vi.fn();
const isMutualFollow = vi.fn();
const getHiddenUserIds = vi.fn();
const getTasteMatchFor = vi.fn();
const getCommonGroundPicks = vi.fn();
const getTasteProfile = vi.fn();

vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  fetchUserByUsername: (...a: unknown[]) => fetchUserByUsername(...a),
  fetchUserById: (...a: unknown[]) => fetchUserById(...a),
  isMutualFollow: (...a: unknown[]) => isMutualFollow(...a),
}));
vi.mock("@/server/db/postgres/social/blocks", () => ({
  getHiddenUserIds: (...a: unknown[]) => getHiddenUserIds(...a),
}));
vi.mock("@/server/services/taste/match", () => ({
  getTasteMatchFor: (...a: unknown[]) => getTasteMatchFor(...a),
  getCommonGroundPicks: (...a: unknown[]) => getCommonGroundPicks(...a),
}));
vi.mock("@/server/services/taste", () => ({
  getTasteProfile: (...a: unknown[]) => getTasteProfile(...a),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { compareTasteHandler, CompareTasteSchema } = await import("./compare-taste");

const cfg = (userId?: string) => ({ configurable: { userId } });
const parse = async (p: Promise<string>) => JSON.parse(await p);

const user = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  username: `user${id}`,
  name: `User ${id}`,
  image: null,
  isPublic: true,
  showTaste: true,
  avatarImagePath: null,
  ...over,
});

const facet = (type: FacetStat["type"], label: string): FacetStat => ({
  type,
  key: label.toLowerCase(),
  label,
  count: 3,
  lift: 2,
  score: 1,
  titles: [],
});

const snap = (genres: string[], moods: string[]): TasteSnapshot => ({
  v: 1,
  computedAt: "2026-10-12T00:00:00Z",
  scope: "public",
  positiveCount: 10,
  signalCount: 10,
  axes: [],
  moods: moods.map((m) => facet("mood", m)),
  facets: {
    genre: genres.map((g) => facet("genre", g)),
    keyword: [],
    theme: [],
    mood: [],
    director: [],
    cast: [],
    country: [],
    language: [],
    decade: [],
  },
  people: { mostWatched: [], highestRated: [] },
  clusters: [],
});

const MATCH = {
  score: 72,
  components: { scoreSim: 0.7, likedSim: 0.6, tasteSim: 0.8 },
  sharedFavorites: [],
  fightAbout: [],
  evidence: { sharedRated: 4, sharedLiked: 2, hasTaste: true },
};

beforeEach(() => {
  for (const m of [fetchUserByUsername, fetchUserById, isMutualFollow, getHiddenUserIds, getTasteMatchFor, getCommonGroundPicks, getTasteProfile]) {
    m.mockReset();
  }
  fetchUserById.mockResolvedValue(user(1));
  getHiddenUserIds.mockResolvedValue(new Set());
  isMutualFollow.mockResolvedValue(false);
  getTasteMatchFor.mockResolvedValue(MATCH);
  getCommonGroundPicks.mockResolvedValue([]);
  getTasteProfile.mockImplementation(async (id: number) =>
    id === 1 ? snap(["Drama", "Thriller", "Mystery", "Horror"], ["Dark tone", "Erotic awakening"]) : snap(["Comedy"], ["Light tone"])
  );
});

describe("compare_taste", () => {
  it("errors for guests without touching any service", async () => {
    const out = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2" }), cfg()));
    expect(out.error).toBe("Not logged in");
    expect(fetchUserByUsername).not.toHaveBeenCalled();
  });

  it("returns the match and PUBLIC summaries for both sides", async () => {
    fetchUserByUsername.mockResolvedValue(user(2));
    const out = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "@User2" }), cfg("1")));
    expect(fetchUserByUsername).toHaveBeenCalledWith("User2");
    expect(getTasteMatchFor).toHaveBeenCalledWith(1, "user2");
    expect(getTasteProfile).toHaveBeenCalledWith(1, { scope: "public" });
    expect(getTasteProfile).toHaveBeenCalledWith(2, { scope: "public" });
    expect(getTasteProfile).not.toHaveBeenCalledWith(expect.anything(), { scope: "full" });
    expect(out.match.score).toBe(72);
    expect(out.you).toEqual({ topGenres: ["Drama", "Thriller", "Mystery"], topMoods: ["Dark tone"] });
    expect(out.them).toEqual({ username: "user2", firstName: "User", topGenres: ["Comedy"], topMoods: ["Light tone"] });
    expect(out.picks).toBeUndefined();
    expect(getCommonGroundPicks).not.toHaveBeenCalled();
  });

  it("adds common-ground picks with a reason when asked", async () => {
    fetchUserByUsername.mockResolvedValue(user(2));
    getCommonGroundPicks.mockResolvedValue([
      {
        mediaType: "movie",
        id: 77,
        title: "Shared Pick",
        year: 2019,
        posterPath: null,
        viewerAnchor: { mediaType: "movie", id: 5, title: "Your Fav" },
        targetAnchor: { mediaType: "series", id: 6, title: "Their Fav" },
      },
      { mediaType: "series", id: 78, title: "Second", year: null, posterPath: null, viewerAnchor: null, targetAnchor: null },
    ]);
    const out = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2", picks: true, limit: 4 }), cfg("1")));
    expect(getCommonGroundPicks).toHaveBeenCalledWith(1, 2, 4);
    expect(out.picks[0]).toEqual({
      id: 77,
      mediaType: "movie",
      title: "Shared Pick",
      year: 2019,
      reason: "close to both of your favourites: Your Fav (you), Their Fav (them)",
    });
    expect(out.picks[1].reason).toBeNull();
  });

  it("denies a showTaste=false target even with a mutual follow", async () => {
    fetchUserByUsername.mockResolvedValue(user(2, { showTaste: false }));
    isMutualFollow.mockResolvedValue(true);
    const out = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2", picks: true }), cfg("1")));
    expect(out.error).toBe("not_available");
    expect(out.hint).toMatch(/speculate/i);
    expect(getTasteMatchFor).not.toHaveBeenCalled();
    expect(getTasteProfile).not.toHaveBeenCalled();
    expect(getCommonGroundPicks).not.toHaveBeenCalled();
  });

  it("denies private targets, hidden (blocked/muted) users, unknown users and self", async () => {
    fetchUserByUsername.mockResolvedValueOnce(user(2, { isPublic: false }));
    expect((await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2" }), cfg("1")))).error).toBe("not_available");

    fetchUserByUsername.mockResolvedValueOnce(user(3));
    getHiddenUserIds.mockResolvedValueOnce(new Set([3]));
    expect((await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user3" }), cfg("1")))).error).toBe("not_available");

    fetchUserByUsername.mockResolvedValueOnce(null);
    expect((await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "ghost" }), cfg("1")))).error).toBe("not_available");

    fetchUserByUsername.mockResolvedValueOnce(user(1));
    const self = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user1" }), cfg("1")));
    expect(self.error).toBe("self");
    expect(getTasteMatchFor).not.toHaveBeenCalled();
  });

  it("lets a private viewer compare only with a mutual follow", async () => {
    fetchUserById.mockResolvedValue(user(1, { isPublic: false }));
    fetchUserByUsername.mockResolvedValue(user(2));
    expect((await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2" }), cfg("1")))).error).toBe("not_available");
    isMutualFollow.mockResolvedValue(true);
    expect((await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2" }), cfg("1")))).match.score).toBe(72);
  });

  it("returns { error } when a service throws", async () => {
    fetchUserByUsername.mockRejectedValue(new Error("db down"));
    const out = await parse(compareTasteHandler(CompareTasteSchema.parse({ username: "user2" }), cfg("1")));
    expect(out.error).toBeDefined();
  });

  it("clamps the schema", () => {
    expect(() => CompareTasteSchema.parse({ username: "x", limit: 9 })).toThrow();
    expect(() => CompareTasteSchema.parse({ username: "" })).toThrow();
  });
});
