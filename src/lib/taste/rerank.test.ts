import { describe, expect, it } from "vitest";
import { bestPerKey, blendQueryTaste, minMax } from "./rerank";

describe("bestPerKey", () => {
  it("keeps the smallest distance per key, ascending", () => {
    const out = bestPerKey([
      { key: "a", dist: 0.5, q: 0 },
      { key: "b", dist: 0.2, q: 0 },
      { key: "a", dist: 0.1, q: 1 },
    ]);
    expect(out.map((h) => [h.key, h.dist, h.q])).toEqual([
      ["a", 0.1, 1],
      ["b", 0.2, 0],
    ]);
  });
});

describe("minMax", () => {
  it("maps to 0..1 and a constant list to 1s", () => {
    expect(minMax([2, 4, 3])).toEqual([0, 1, 0.5]);
    expect(minMax([7, 7])).toEqual([1, 1]);
    expect(minMax([])).toEqual([]);
  });
});

describe("blendQueryTaste", () => {
  const items = [
    { key: "q-best", querySim: 0.6, tasteSim: -0.2 },
    { key: "taste-best", querySim: 0.5, tasteSim: 0.5 },
    { key: "worst", querySim: 0.4, tasteSim: -0.3 },
  ];

  it("0.65·query + 0.35·taste after per-term min-max", () => {
    const out = blendQueryTaste(items, 0.65);
    const by = Object.fromEntries(out.map((o) => [o.key, o.score]));
    expect(by["q-best"]).toBeCloseTo(0.65 * 1 + 0.35 * (0.1 / 0.8), 9);
    expect(by["taste-best"]).toBeCloseTo(0.65 * 0.5 + 0.35 * 1, 9);
    expect(by.worst).toBeCloseTo(0, 9);
    expect(out.map((o) => o.key)).toEqual(["q-best", "taste-best", "worst"]);
  });

  it("weight 1 = pure query order, weight 0 = pure taste order", () => {
    expect(blendQueryTaste(items, 1).map((o) => o.key)).toEqual(["q-best", "taste-best", "worst"]);
    expect(blendQueryTaste(items, 0)[0].key).toBe("taste-best");
  });

  it("scale-invariant: a raw-scale shift of either term does not change the order", () => {
    const shifted = items.map((i) => ({ ...i, querySim: i.querySim * 10 + 3, tasteSim: (i.tasteSim ?? 0) + 0.7 }));
    expect(blendQueryTaste(shifted).map((o) => o.key)).toEqual(blendQueryTaste(items).map((o) => o.key));
  });

  it("an item with no taste vector gets the neutral (mean) taste term, never a bonus", () => {
    const out = blendQueryTaste([...items, { key: "unknown", querySim: 0.5, tasteSim: null }], 0.65);
    const by = Object.fromEntries(out.map((o) => [o.key, o.score]));
    expect(by.unknown).toBeLessThan(by["taste-best"]);
    expect(by.unknown).toBeGreaterThan(0.65 * 0.5);
  });

  it("no taste at all degrades to the query order", () => {
    const none = items.map((i) => ({ ...i, tasteSim: null }));
    expect(blendQueryTaste(none).map((o) => o.key)).toEqual(["q-best", "taste-best", "worst"]);
  });
});
