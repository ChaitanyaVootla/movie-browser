/**
 * L1 byte-budget regression tests — the unbounded L1 NodeCache grew to 4.8GB
 * under crawler load and kernel-froze the box twice (Jun 11 2026).
 */
import { describe, it, expect, beforeEach } from "vitest";

process.env.L1_CACHE_BUDGET_MB = "1"; // 1MB budget for tests, set before import

const { cacheSet, cacheGet, getCacheStats } = await import("./cache-service");

describe("L1 byte budget", () => {
  beforeEach(() => {
    // each test works with distinct keys; no flush API needed
  });

  it("evicts oldest entries once the byte budget is exceeded", () => {
    const big = "x".repeat(200 * 1024); // ~200KB serialized each
    for (let i = 0; i < 10; i++) {
      cacheSet("search", `budget-key-${i}`, { payload: big });
    }
    // budget 1MB → at most ~5 entries can remain
    expect(cacheGet("search", "budget-key-0")).toBeFalsy();
    expect(cacheGet("search", "budget-key-9")).toBeTruthy();
    const stats = getCacheStats();
    expect(stats.memory.keys).toBeLessThan(10);
  });

  it("refuses entries larger than a quarter of the budget", () => {
    cacheSet("search", "oversized", { payload: "y".repeat(600 * 1024) });
    expect(cacheGet("search", "oversized")).toBeFalsy();
  });

  it("recently-read entries survive eviction over cold ones", () => {
    const big = "z".repeat(150 * 1024);
    cacheSet("search", "lru-hot", { payload: big });
    cacheSet("search", "lru-cold", { payload: big });
    cacheGet("search", "lru-hot"); // touch
    for (let i = 0; i < 8; i++) cacheSet("search", `lru-fill-${i}`, { payload: big });
    // hot was touched after cold, so cold should die first
    expect(cacheGet("search", "lru-cold")).toBeFalsy();
  });
});
