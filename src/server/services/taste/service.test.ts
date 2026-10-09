/**
 * Render-path safety of the taste service: bounded waits, in-flight dedupe,
 * failure backoff, and a baseline read that never scans. DB + compute mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  readTasteRow: vi.fn(),
  readTasteVectors: vi.fn(),
  compute: vi.fn(),
  readBaselineMeta: vi.fn(),
  readBaselineCounts: vi.fn(),
}));

vi.mock("@/server/db/postgres/social/taste", () => ({
  readTasteRow: h.readTasteRow,
  readTasteVectors: h.readTasteVectors,
  readBaselineMeta: h.readBaselineMeta,
  readBaselineCounts: h.readBaselineCounts,
}));
vi.mock("@/server/db/postgres/social/taste-dirty", () => ({ markTasteDirty: vi.fn() }));
vi.mock("./compute", () => ({ computeAndStoreTaste: h.compute, fullFacetsColumn: () => ({}) }));

import { emptyFacets } from "@/lib/taste/profile";
import { TASTE_ALGO_VERSION } from "@/lib/taste/constants";

const snapshot = {
  v: 1,
  computedAt: "2026-10-01T00:00:00.000Z",
  scope: "public",
  positiveCount: 12,
  signalCount: 12,
  axes: [],
  moods: [],
  facets: emptyFacets(),
  people: { mostWatched: [], highestRated: [] },
  clusters: [],
};
const staleRow = (userId: number) => ({
  dirty: true,
  updatedAt: new Date(userId),
  computedAt: new Date("2026-10-01T00:00:00Z"),
  algoVersion: TASTE_ALGO_VERSION,
  publicSnapshot: snapshot,
  facets: {},
  axes: [],
  clusters: [],
  signalCount: 12,
  positiveCount: 12,
});

beforeEach(() => {
  vi.resetModules();
  Object.values(h).forEach((f) => f.mockReset());
});
afterEach(() => vi.useRealTimers());

describe("taste service recompute policy", () => {
  it("serves the stale row after the bounded wait while the recompute keeps running", async () => {
    h.readTasteRow.mockResolvedValue(staleRow(1));
    h.compute.mockReturnValue(new Promise(() => {})); // never finishes
    const { getTasteProfile } = await import("./index");
    const t0 = Date.now();
    const snap = await getTasteProfile(1, { scope: "public" });
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(snap?.positiveCount).toBe(12);
  });

  it("dedupes concurrent recomputes for one user", async () => {
    h.readTasteRow.mockResolvedValue(staleRow(2));
    h.compute.mockReturnValue(new Promise(() => {}));
    const { getTasteProfile } = await import("./index");
    await Promise.all([getTasteProfile(2, { scope: "public" }), getTasteProfile(2, { scope: "public" })]);
    expect(h.compute).toHaveBeenCalledTimes(1);
  });

  it("a failing recompute backs off instead of retrying on every render", async () => {
    h.readTasteRow.mockResolvedValue(staleRow(3));
    h.compute.mockRejectedValue(new Error("boom"));
    const { getTasteProfile } = await import("./index");
    expect((await getTasteProfile(3, { scope: "public" }))?.positiveCount).toBe(12); // stale served
    await getTasteProfile(3, { scope: "public" });
    await getTasteProfile(3, { scope: "public" });
    expect(h.compute).toHaveBeenCalledTimes(1);
  });

  it("first-ever compute still running → the profile renders no taste (null), not a fake 0", async () => {
    h.readTasteRow.mockResolvedValue(null);
    h.compute.mockReturnValue(new Promise(() => {}));
    const { getProfileTaste } = await import("./index");
    expect(await getProfileTaste(4, true)).toBeNull();
  });
});

describe("baseline read path", () => {
  it("fresh env (no meta row): no per-key lookups, size 0 → uniform prior, no quantiles", async () => {
    h.readBaselineMeta.mockResolvedValue(null);
    const { getBaseline } = await import("./baseline-cache");
    const { baseline, catalog } = await getBaseline(new Map([["genre", new Set(["horror"])]]));
    expect(h.readBaselineCounts).not.toHaveBeenCalled();
    expect(baseline.size("genre")).toBe(0);
    expect(catalog).toBeNull();
  });

  it("with a meta row: PK lookups only for uncached keys", async () => {
    h.readBaselineMeta.mockResolvedValue({
      mode: "votes", catalogSize: 50_000, enrichedSize: 30_000,
      popularityQuantiles: [0, 1], yearQuantiles: [1900, 2026], computedAt: new Date(),
    });
    h.readBaselineCounts.mockResolvedValue(new Map([["horror", 900]]));
    const { getBaseline } = await import("./baseline-cache");
    const first = await getBaseline(new Map([["genre", new Set(["horror"])]]));
    expect(first.baseline.count("genre", "horror")).toBe(900);
    expect(first.baseline.size("theme")).toBe(30_000);
    await getBaseline(new Map([["genre", new Set(["horror"])]]));
    expect(h.readBaselineCounts).toHaveBeenCalledTimes(1); // cached
  });
});
