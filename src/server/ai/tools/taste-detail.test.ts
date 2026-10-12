import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TasteCluster, TasteSnapshot } from "@/lib/taste/profile";
import type { FacetStat } from "@/lib/taste/lift";

const getTasteProfile = vi.fn();
const getTasteClusters = vi.fn();
const fetchTitleRefs = vi.fn();
vi.mock("@/server/services/taste", () => ({
  getTasteProfile: (...a: unknown[]) => getTasteProfile(...a),
  getTasteClusters: (...a: unknown[]) => getTasteClusters(...a),
}));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  fetchTitleRefs: (...a: unknown[]) => fetchTitleRefs(...a),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { getTasteDetailHandler, GetTasteDetailSchema } = await import("./taste-detail");

const cfg = (userId?: string) => ({ configurable: { userId } });
const parse = async (p: Promise<string>) => JSON.parse(await p);

const ref = (id: number, title: string) => ({ mediaType: "movie" as const, tmdbId: id, title, posterPath: null });
const facet = (type: FacetStat["type"], label: string, titles = [ref(1, "One")]): FacetStat => ({
  type,
  key: label.toLowerCase(),
  label,
  count: 3,
  lift: 2.345,
  score: 1,
  titles,
});

const snapshot: TasteSnapshot = {
  v: 1,
  computedAt: "2026-10-12T00:00:00Z",
  scope: "full",
  positiveCount: 18,
  signalCount: 20,
  axes: [{ key: "era", value: 0.7123, support: 9, lowLabel: "Classic", highLabel: "New", caption: "Median release year 2014" }],
  moods: [facet("mood", "Dark tone"), facet("theme", "Erotic awakening")],
  facets: {
    genre: [facet("genre", "Science Fiction", Array.from({ length: 9 }, (_, i) => ref(i + 1, `T${i}`)))],
    keyword: [facet("keyword", "Time travel")],
    theme: [],
    mood: [],
    director: [facet("director", "Some Director")],
    cast: [],
    country: [],
    language: [],
    decade: [],
  },
  people: {
    mostWatched: [
      { tmdbId: 5, name: "Some Actor", profilePath: null, role: "cast", count: 4, avgScore: 8.25, shrunkScore: 7.9, ratedCount: 3 },
    ],
    highestRated: [],
  },
  clusters: [],
};

const cluster = (label: string, importance: number, memberKeys: string[]): TasteCluster => ({
  medoid: ref(Number(memberKeys[0].slice(2)), label),
  medoidKey: memberKeys[0],
  memberKeys,
  size: memberKeys.length,
  importance,
  label,
  topFacets: [],
});

beforeEach(() => {
  getTasteProfile.mockReset();
  getTasteClusters.mockReset();
  fetchTitleRefs.mockReset();
  fetchTitleRefs.mockResolvedValue(
    new Map([
      ["m:10", { title: "Member Ten", posterPath: null, releaseDate: "2001-02-03" }],
      ["m:11", { title: "Member Eleven", posterPath: null, releaseDate: null }],
      ["s:20", { title: "Series Twenty", posterPath: null, releaseDate: "2019-01-01" }],
    ])
  );
});

describe("get_taste_detail", () => {
  it("errors for guests without touching the service", async () => {
    const out = await parse(getTasteDetailHandler(GetTasteDetailSchema.parse({}), cfg()));
    expect(out.error).toBe("Not logged in");
    expect(getTasteProfile).not.toHaveBeenCalled();
  });

  it("returns no_profile when there is no FULL snapshot", async () => {
    getTasteProfile.mockResolvedValue(null);
    getTasteClusters.mockResolvedValue([]);
    const out = await parse(getTasteDetailHandler(GetTasteDetailSchema.parse({}), cfg("3")));
    expect(out.error).toBe("no_profile");
  });

  it("returns every part from the FULL scope, members resolved, adult labels dropped", async () => {
    getTasteProfile.mockResolvedValue(snapshot);
    getTasteClusters.mockResolvedValue([
      cluster("Small", 0.2, ["m:11"]),
      cluster("Big", 0.8, ["m:10", "s:20", "m:99"]),
    ]);
    const out = await parse(getTasteDetailHandler(GetTasteDetailSchema.parse({ part: "all" }), cfg("3")));
    expect(getTasteProfile).toHaveBeenCalledWith(3, { scope: "full" });
    expect(out.basedOnTitles).toBe(18);
    expect(out.clusters.map((c: { label: string }) => c.label)).toEqual(["Big", "Small"]);
    expect(out.clusters[0].members).toEqual([
      { id: 10, mediaType: "movie", title: "Member Ten", year: 2001 },
      { id: 20, mediaType: "series", title: "Series Twenty", year: 2019 },
    ]); // m:99 missing / adult → dropped
    expect(out.thinnestCluster).toEqual({ index: 1, label: "Small", share: 0.2 });
    expect(out.facets.genre[0]).toMatchObject({ label: "Science Fiction", count: 3, lift: 2.35 });
    expect(out.facets.genre[0].titles).toHaveLength(6);
    expect(out.moods.map((m: { label: string }) => m.label)).toEqual(["Dark tone"]);
    expect(out.axes[0]).toEqual({
      axis: "era",
      value: 0.71,
      low: "Classic",
      high: "New",
      caption: "Median release year 2014",
      support: 9,
    });
    expect(out.people.mostWatched[0]).toMatchObject({ name: "Some Actor", role: "cast", count: 4 });
  });

  it("filters to one part / one cluster", async () => {
    getTasteProfile.mockResolvedValue(snapshot);
    getTasteClusters.mockResolvedValue([cluster("Big", 0.8, ["m:10"]), cluster("Small", 0.2, ["m:11"])]);
    const out = await parse(getTasteDetailHandler({ part: "clusters", clusterIndex: 1 }, cfg("3")));
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0]).toMatchObject({ index: 1, label: "Small" });
    expect(out.facets).toBeUndefined();
    expect(out.axes).toBeUndefined();
  });

  it("returns { error } when the service throws", async () => {
    getTasteProfile.mockRejectedValue(new Error("boom"));
    getTasteClusters.mockResolvedValue([]);
    const out = await parse(getTasteDetailHandler(GetTasteDetailSchema.parse({}), cfg("3")));
    expect(out.error).toBeDefined();
  });

  it("never phrases anything about the person", async () => {
    getTasteProfile.mockResolvedValue(snapshot);
    getTasteClusters.mockResolvedValue([cluster("Big", 0.8, ["m:10"])]);
    const text = await getTasteDetailHandler(GetTasteDetailSchema.parse({}), cfg("3"));
    expect(text).not.toMatch(/you're|you are|are a\b/i);
  });
});
