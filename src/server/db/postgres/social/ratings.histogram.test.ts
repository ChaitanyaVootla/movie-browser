import { describe, it, expect } from "vitest";
import { shapeHistogram } from "./ratings";

describe("shapeHistogram", () => {
  it("buckets 1..10, computes average, totals", () => {
    const h = shapeHistogram([
      { score: 8, n: 3 },
      { score: 10, n: 1 },
    ]);
    expect(h.total).toBe(4);
    expect(h.buckets[8]).toBe(3);
    expect(h.buckets[10]).toBe(1);
    expect(h.buckets[1]).toBe(0);
    expect(h.average).toBeCloseTo((8 * 3 + 10) / 4, 5);
  });
  it("returns null average for an empty set", () => {
    const h = shapeHistogram([]);
    expect(h.total).toBe(0);
    expect(h.average).toBeNull();
  });
});
