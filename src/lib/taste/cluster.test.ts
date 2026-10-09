import { describe, expect, it } from "vitest";
import { cutTree, silhouette, wardClusters, wardLinkage } from "./cluster";
import { l2Normalize } from "./vector";

/** Deterministic PRNG (mulberry32) so tests never flake. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `groups` tight blobs around orthogonal axes in `dims` dimensions. */
function blobs(groups: number, perGroup: number, dims = 16, noise = 0.15, seed = 7) {
  const r = rng(seed);
  const items: { key: string; weight: number; vector: number[]; group: number }[] = [];
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < perGroup; i++) {
      const v = Array.from({ length: dims }, () => (r() - 0.5) * noise);
      v[g] += 1;
      items.push({ key: `g${g}-${i}`, weight: 1 + r(), vector: v, group: g });
    }
  }
  return items;
}

describe("wardLinkage + cutTree", () => {
  it("produces n-1 merges and recovers separable groups", () => {
    const items = blobs(3, 6);
    const units = items.map((x) => l2Normalize(x.vector) ?? []);
    const merges = wardLinkage(units);
    expect(merges).toHaveLength(items.length - 1);
    const assign = cutTree(merges, units.length, 3);
    // every blob maps to exactly one cluster id, and ids differ across blobs
    const byGroup = new Map<number, Set<number>>();
    items.forEach((x, i) => byGroup.set(x.group, new Set([...(byGroup.get(x.group) ?? []), assign[i]])));
    for (const ids of byGroup.values()) expect(ids.size).toBe(1);
    expect(new Set(assign).size).toBe(3);
  });

  it("cut at k=1 is a single cluster, k=n is singletons", () => {
    const units = blobs(2, 3).map((x) => l2Normalize(x.vector) ?? []);
    const merges = wardLinkage(units);
    expect(new Set(cutTree(merges, units.length, 1)).size).toBe(1);
    expect(new Set(cutTree(merges, units.length, units.length)).size).toBe(units.length);
  });

  it("silhouette is high for separated blobs and ~0 for one cluster", () => {
    const units = blobs(2, 6).map((x) => l2Normalize(x.vector) ?? []);
    const assign = cutTree(wardLinkage(units), units.length, 2);
    expect(silhouette(units, assign)).toBeGreaterThan(0.5);
    expect(silhouette(units, new Array(units.length).fill(0))).toBe(0);
  });
});

describe("wardClusters", () => {
  it("chooses k by silhouette (3 blobs → 3 clusters) with valid medoids + importance", () => {
    const items = blobs(3, 6);
    const out = wardClusters(items);
    expect(out).toHaveLength(3);
    expect(out.reduce((s, c) => s + c.importance, 0)).toBeCloseTo(1, 3);
    for (const c of out) {
      expect(c.memberKeys).toContain(c.medoidKey);
      const groups = new Set(c.memberKeys.map((k) => k.split("-")[0]));
      expect(groups.size).toBe(1);
    }
    // sorted by importance desc
    for (let i = 1; i < out.length; i++) expect(out[i - 1].importance).toBeGreaterThanOrEqual(out[i].importance);
  });

  it("caps k at 4", () => {
    expect(wardClusters(blobs(6, 4)).length).toBeLessThanOrEqual(4);
  });

  it("returns ONE cluster under the minimum input size", () => {
    const out = wardClusters(blobs(2, 3)); // 6 < 8
    expect(out).toHaveLength(1);
    expect(out[0].size).toBe(6);
    expect(out[0].importance).toBe(1);
  });

  it("ignores non-positive weights and returns [] for no input", () => {
    expect(wardClusters([])).toEqual([]);
    expect(wardClusters([{ key: "a", weight: -1, vector: [1, 0] }])).toEqual([]);
  });

  it("weighted medoid prefers the heavy, central member", () => {
    const out = wardClusters(
      [
        { key: "a", weight: 1, vector: [1, 0.2] },
        { key: "b", weight: 5, vector: [1, 0] },
        { key: "c", weight: 1, vector: [1, -0.2] },
      ],
      { minInput: 8 }
    );
    expect(out[0].medoidKey).toBe("b");
  });

  it("is fast enough at the 200-item cap with 1024 dims", () => {
    const items = blobs(4, 50, 1024, 0.4, 11);
    const t0 = performance.now();
    const out = wardClusters(items);
    const ms = performance.now() - t0;
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(ms).toBeLessThan(1500); // generous CI bound; ~100ms locally
  });
});
