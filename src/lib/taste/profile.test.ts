import { describe, expect, it } from "vitest";
import { computeTasteProfile, parseTasteSnapshot, type TasteComputeInput } from "./profile";
import type { FacetValue, PersonInfo, TitleMeta, TitleSignals } from "./types";

const NOW = new Date("2026-10-09T12:00:00Z");

function signal(id: number, over: Partial<TitleSignals> = {}): TitleSignals {
  return {
    key: `m:${id}`,
    mediaType: "movie",
    id,
    isFavorite: false,
    rating: null,
    watches: { count: { public: 1, all: 1 }, maxCycle: { public: 1, all: 1 }, lastAt: { public: NOW, all: NOW } },
    progress: null,
    watchlistedAt: null,
    ...over,
  };
}

const privateWatch = { count: { public: 0, all: 1 }, maxCycle: { public: 0, all: 1 }, lastAt: { public: null, all: NOW } };

function meta(id: number, genre: string, theme: string, director: string): TitleMeta {
  const facets: FacetValue[] = [
    { type: "genre", key: genre, label: genre },
    { type: "theme", key: theme, label: theme },
    { type: "director", key: director, label: `Dir ${director}` },
  ];
  return {
    key: `m:${id}`,
    ref: { mediaType: "movie", tmdbId: id, title: `Title ${id}`, posterPath: `/p${id}.jpg` },
    year: 2000 + (id % 20),
    popularity: id,
    tmdbAvg: 7,
    facets,
    mood: { emotional: "heavy", tone: "dark" },
  };
}

/** 12 public sci-fi titles (axis 0) + 3 PRIVATE romcoms (axis 1). */
function fixture(): TasteComputeInput {
  const signals: TitleSignals[] = [];
  const metas = new Map<string, TitleMeta>();
  const embeddings = new Map<string, number[]>();
  for (let i = 1; i <= 12; i++) {
    signals.push(signal(i, { rating: { score: 9, thumb: null, liked: i <= 4, ratedAt: NOW } }));
    metas.set(`m:${i}`, meta(i, "scifi", "space", i <= 6 ? "1" : "2"));
    embeddings.set(`m:${i}`, [1, 0.05 * (i % 3), 0, 0]);
  }
  for (let i = 100; i < 103; i++) {
    signals.push(signal(i, { watches: privateWatch, rating: { score: 10, thumb: null, liked: true, ratedAt: NOW } }));
    metas.set(`m:${i}`, meta(i, "romance", "secret-love", "9"));
    embeddings.set(`m:${i}`, [0, 0, 1, 0]);
  }
  const people = new Map<string, PersonInfo>([
    ["1", { tmdbId: 1, name: "Dir One", profilePath: null }],
    ["2", { tmdbId: 2, name: "Dir Two", profilePath: null }],
    ["9", { tmdbId: 9, name: "Secret Director", profilePath: null }],
  ]);
  return {
    signals,
    meta: metas,
    embeddings,
    people,
    baseline: { count: () => 10, size: () => 10_000 },
    catalog: { popularity: Array.from({ length: 101 }, (_, i) => i), year: Array.from({ length: 101 }, (_, i) => 1925 + i) },
    now: NOW,
  };
}

describe("computeTasteProfile", () => {
  it("PUBLIC projection never contains private-only titles, facets or people", () => {
    const { snapshot, centroid } = computeTasteProfile(fixture(), "public");
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("romance");
    expect(json).not.toContain("secret-love");
    expect(json).not.toContain("Secret Director");
    expect(json).not.toMatch(/"tmdbId":10[0-2]\b/);
    expect(snapshot.positiveCount).toBe(12);
    // public centroid points at the public cluster only
    expect(centroid?.[2] ?? 1).toBeCloseTo(0, 5);
  });

  it("FULL projection includes the private titles", () => {
    const { snapshot, centroid } = computeTasteProfile(fixture(), "full");
    expect(snapshot.positiveCount).toBe(15);
    expect(JSON.stringify(snapshot.facets.genre)).toContain("romance");
    expect(centroid?.[2]).toBeGreaterThan(0.1);
  });

  it("produces facets, people, axes and clusters with evidence", () => {
    const { snapshot, clusters } = computeTasteProfile(fixture(), "full");
    expect(snapshot.facets.genre[0].titles.length).toBeGreaterThan(0);
    expect(snapshot.moods.length).toBeGreaterThan(0);
    expect(snapshot.people.mostWatched.map((p) => p.name)).toContain("Dir One");
    expect(snapshot.axes.map((a) => a.key)).toEqual(expect.arrayContaining(["mainstream", "era", "rating", "weight"]));
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    for (const c of clusters) expect(c.memberKeys).toContain(c.medoidKey);
    // the display view strips member keys
    expect(JSON.stringify(snapshot.clusters)).not.toContain("memberKeys");
  });

  it("v2: public clusters carry ≤12 PUBLIC members (medoid first), axes carry public examples, people carry titles", () => {
    const { snapshot } = computeTasteProfile(fixture(), "public");
    expect(snapshot.v).toBe(2);
    expect(snapshot.clusters.length).toBeGreaterThan(0);
    for (const c of snapshot.clusters) {
      expect(c.members.length).toBeGreaterThan(0);
      expect(c.members.length).toBeLessThanOrEqual(12);
      expect(c.members[0]).toEqual(c.medoid);
      for (const m of c.members) expect(m.tmdbId).toBeLessThan(100);
    }
    const examples = snapshot.axes.flatMap((a) => [...a.examples.low, ...a.examples.high]);
    expect(examples.length).toBeGreaterThan(0);
    for (const e of examples) expect(e.tmdbId).toBeLessThan(100);
    const dirOne = snapshot.people.mostWatched.find((p) => p.name === "Dir One");
    expect(dirOne?.titles.length).toBeGreaterThan(0);
    for (const t of dirOne?.titles ?? []) expect(t.tmdbId).toBeLessThanOrEqual(6);
  });

  it("v2: neutral mid-scale moods never reach snapshot.moods or facets", () => {
    const input = fixture();
    for (const m of input.meta.values()) {
      m.facets.push(
        { type: "mood", key: "intensity:medium", label: "Medium intensity" },
        { type: "mood", key: "tone:mixed", label: "Mixed tone" },
        { type: "mood", key: "pacing:steady", label: "Steady pacing" },
        { type: "mood", key: "emotional:medium", label: "Emotionally balanced" },
        { type: "mood", key: "pacing:fast", label: "Fast-paced" }
      );
    }
    for (const scope of ["public", "full"] as const) {
      const { snapshot } = computeTasteProfile(input, scope);
      const labels = [...snapshot.moods, ...snapshot.facets.mood].map((f) => f.label);
      expect(labels).toContain("Fast-paced");
      for (const bad of ["Medium intensity", "Mixed tone", "Steady pacing", "Emotionally balanced"]) {
        expect(labels).not.toContain(bad);
      }
    }
  });

  it("v2: a cluster is named by its top GENRE, never a bare keyword", () => {
    const input = fixture();
    for (const m of input.meta.values()) m.facets.push({ type: "keyword", key: "scientist", label: "Scientist" });
    const { snapshot } = computeTasteProfile(input, "public");
    for (const c of snapshot.clusters) {
      expect(c.label).not.toBe("Scientist");
      expect(c.topFacets[0]).toBe(c.label);
    }
  });

  it("parses a stored v1 snapshot (new fields default empty)", () => {
    const { snapshot } = computeTasteProfile(fixture(), "public");
    const v1 = JSON.parse(JSON.stringify(snapshot));
    v1.v = 1;
    for (const a of v1.axes) delete a.examples;
    for (const c of v1.clusters) delete c.members;
    for (const p of v1.people.mostWatched) delete p.titles;
    const parsed = parseTasteSnapshot(v1);
    expect(parsed?.v).toBe(2);
    expect(parsed?.axes[0].examples).toEqual({ low: [], high: [] });
    expect(parsed?.clusters[0]?.members ?? []).toEqual([]);
  });

  it("round-trips through the stored-snapshot schema", () => {
    const { snapshot } = computeTasteProfile(fixture(), "public");
    const parsed = parseTasteSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).toEqual(snapshot);
    expect(parseTasteSnapshot({ v: 2 })).toBeNull();
  });

  it("an empty history yields an empty, valid snapshot", () => {
    const input = { ...fixture(), signals: [] };
    const { snapshot, centroid } = computeTasteProfile(input, "public");
    expect(snapshot.positiveCount).toBe(0);
    expect(snapshot.clusters).toEqual([]);
    expect(centroid).toBeNull();
  });
});
