/**
 * The shared ANN primitive (spec 2026-10-10-taste-vector-upgrades.md §3) pins
 * the performance.md §19 shape: gated on the index, unfiltered MATERIALIZED
 * CTE on the exact halfvec expression, SET LOCAL in the same transaction.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, flags, txBatches } = vi.hoisted(() => ({
  calls: [] as string[],
  flags: { indexValid: true, rows: [] as Array<{ id: number; dist: number; query: number }> },
  txBatches: [] as number[],
}));

vi.mock("./index", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      if (sql.includes("pg_index")) return [{ valid: flags.indexValid }];
      calls.push(sql);
      return flags.rows;
    }),
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
      return 0;
    }),
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => {
      txBatches.push(ops.length);
      return Promise.all(ops);
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn(), debug: vi.fn() } }));

import { annMaxK, annSearch, candidateParams, candidateSetSql, vectorLiteral } from "./vector-search";
import { ANN_MAX_SCAN_TUPLES, annSessionSql, resetVectorIndexCache } from "./vector-index";

beforeEach(() => {
  calls.length = 0;
  txBatches.length = 0;
  flags.indexValid = true;
  flags.rows = [];
  resetVectorIndexCache();
});

describe("annSearch", () => {
  it("returns null (and runs nothing) without a valid HNSW index", async () => {
    flags.indexValid = false;
    expect(await annSearch({ table: "movies", queries: [[0.1, 0.2]], k: 100 })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("one batch transaction: SET LOCAL ef_search = k + iterative scan, then one unfiltered CTE per query", async () => {
    flags.rows = [{ id: 7, dist: 0.25, query: 0 }];
    const hits = await annSearch({ table: "series", queries: [[0.1, 0.2], [0.3, 0.4]], k: 150 });
    expect(txBatches).toEqual([5]);
    expect(calls[0]).toBe("SET LOCAL hnsw.ef_search = 150");
    expect(calls[1]).toBe("SET LOCAL hnsw.iterative_scan = relaxed_order");
    expect(calls[2]).toBe(`SET LOCAL hnsw.max_scan_tuples = ${ANN_MAX_SCAN_TUPLES}`);
    const selects = calls.slice(3).map((s) => s.replace(/\s+/g, " "));
    expect(selects).toHaveLength(2);
    for (const s of selects) {
      expect(s).toMatch(/WITH c AS MATERIALIZED \( SELECT id AS cid, embedding::halfvec\(1024\) <=> '\[.*\]'::halfvec\(1024\) AS dist FROM series ORDER BY embedding::halfvec\(1024\) <=> '\[.*\]'::halfvec\(1024\) LIMIT 150 \)/);
      expect(s).not.toMatch(/WHERE|adult|ratings/);
    }
    expect(selects[1]).toContain("1::int AS query");
    expect(hits?.[0]).toEqual({ id: 7, dist: 0.25, query: 0 });
  });

  it("caps k at 1000 for movies (the ef_search ceiling) and floors it at 1", async () => {
    await annSearch({ table: "movies", queries: [[1, 0]], k: 5000 });
    expect(calls[0]).toBe("SET LOCAL hnsw.ef_search = 1000");
    expect(calls.at(-1)).toContain("LIMIT 1000");
    calls.length = 0;
    await annSearch({ table: "movies", queries: [[1, 0]], k: 0 });
    expect(calls.at(-1)).toContain("LIMIT 1");
  });

  it("caps series at 500: above ~650 the planner seq-scans the smaller series table (EXPLAIN, eval dump)", async () => {
    expect(annMaxK("series")).toBe(500);
    expect(annMaxK("movies")).toBe(1000);
    await annSearch({ table: "series", queries: [[1, 0]], k: 1000 });
    expect(calls[0]).toBe("SET LOCAL hnsw.ef_search = 500");
    expect(calls.at(-1)).toContain("LIMIT 500");
  });

  it("always bounds the iterative walk with an explicit max_scan_tuples (pathological exclusion lists)", () => {
    expect(ANN_MAX_SCAN_TUPLES).toBe(10_000);
    expect(annSessionSql(200)).toContain(`SET LOCAL hnsw.max_scan_tuples = ${ANN_MAX_SCAN_TUPLES}`);
  });

  it("no queries → [] without SQL", async () => {
    expect(await annSearch({ table: "movies", queries: [], k: 10 })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("filter-stage helpers", () => {
  it("candidateSetSql is an unnest row source bound to the given params", () => {
    expect(candidateSetSql(3, 4)).toBe("unnest($3::int[], $4::float8[]) AS c(cid, dist)");
  });
  it("candidateParams keeps the best distance per id", () => {
    expect(
      candidateParams([
        { id: 1, dist: 0.5, query: 0 },
        { id: 2, dist: 0.3, query: 0 },
        { id: 1, dist: 0.2, query: 1 },
      ])
    ).toEqual({ ids: [1, 2], dists: [0.2, 0.3] });
  });
  it("vectorLiteral is numbers only", () => {
    expect(vectorLiteral([0.5, Number.NaN, 1])).toBe("[0.5000000,0,1.0000000]");
  });
});
