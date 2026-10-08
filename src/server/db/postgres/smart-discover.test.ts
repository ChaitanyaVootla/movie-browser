/**
 * smartDiscover resolved the TMDB ratings source as a hardcoded `source_id = 1`,
 * but data_sources ids are autoincrement (TMDB is 6 in prod). Because minVotes
 * defaults to 50, every call carried an EXISTS on that id and returned ZERO
 * rows — the AI agent's smart_discover and the embedding "Similar" row were
 * silently dead (Oct 2026). These pin the SQL text (prisma is mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rawCalls, queryRawUnsafe, executeRawUnsafe, flags } = vi.hoisted(() => {
  const calls: string[] = [];
  const flags = { indexValid: false };
  return {
    rawCalls: calls,
    flags,
    queryRawUnsafe: vi.fn(async (sql: string) => {
      // The HNSW-index existence probe (vector-index.ts).
      if (sql.includes("pg_index")) return [{ valid: flags.indexValid }];
      calls.push(sql);
      // The similarTo source-embedding lookup expects an `embedding` column.
      if (sql.includes("SELECT embedding::text")) return [{ embedding: "[0.1,0.2]" }];
      return [];
    }),
    executeRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
      return 0;
    }),
  };
});

vi.mock("./index", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/embeddings", () => ({ generateQueryEmbedding: vi.fn(async () => [0.1, 0.2]) }));
vi.mock("@/lib/logger", () => ({
  dataLogger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { smartDiscover, TMDB_SOURCE_ID_SQL } from "./smart-discover";
import { resetVectorIndexCache } from "./vector-index";

function mainSql(): string {
  const sql = rawCalls.filter((s) => !s.includes("SELECT embedding::text") && !s.startsWith("SET LOCAL"));
  expect(sql).toHaveLength(1);
  return sql[0].replace(/\s+/g, " ");
}

beforeEach(() => {
  rawCalls.length = 0;
  queryRawUnsafe.mockClear();
  flags.indexValid = false;
  resetVectorIndexCache();
});

describe("smartDiscover TMDB ratings source", () => {
  it("resolves the TMDB source by slug, never by a hardcoded id", async () => {
    await smartDiscover({ mediaType: "movie", minRating: 7, sortBy: "rating" });
    const sql = mainSql();
    expect(TMDB_SOURCE_ID_SQL).toContain("slug = 'tmdb'");
    expect(sql).toContain(`r.source_id = ${TMDB_SOURCE_ID_SQL}`);
    expect(sql).toContain(`source_id = ${TMDB_SOURCE_ID_SQL} LIMIT 1`);
    expect(sql).not.toMatch(/source_id = 1\b/);
  });

  it("applies the default minVotes filter against the slug-resolved source", async () => {
    await smartDiscover({ mediaType: "series" });
    const sql = mainSql();
    expect(sql).toContain("r.series_id = m.id");
    expect(sql).toContain(`r.source_id = ${TMDB_SOURCE_ID_SQL}`);
    expect(sql).toContain("r.vote_count >=");
  });

  it("similarTo queries use the same source", async () => {
    await smartDiscover({ mediaType: "movie", similarToId: 157336 });
    const sql = mainSql();
    expect(sql).toContain("m.embedding <=>");
    expect(sql).not.toMatch(/source_id = 1\b/);
  });
});

describe("smartDiscover vector path", () => {
  it("without a valid HNSW index: exact distance in one query, no ANN CTE", async () => {
    await smartDiscover({ mediaType: "movie", similarToId: 157336 });
    const sql = mainSql();
    expect(sql).not.toContain("MATERIALIZED");
    expect(sql).toContain("m.embedding <=> '[0.1,0.2]'::vector");
  });

  it("with the index: nearest candidates by the halfvec expression, then filter + re-rank", async () => {
    flags.indexValid = true;
    await smartDiscover({ mediaType: "movie", similarToId: 157336, popularityWeight: 0.15 });
    const sql = mainSql();
    // Candidate CTE orders by EXACTLY the indexed expression and carries no filters.
    expect(sql).toMatch(
      /WITH c AS MATERIALIZED \( SELECT id AS cid, embedding::halfvec\(1024\) <=> '\[0\.1,0\.2\]'::halfvec\(1024\) AS dist FROM movies ORDER BY embedding::halfvec\(1024\) <=> '\[0\.1,0\.2\]'::halfvec\(1024\) LIMIT 200 \)/
    );
    expect(sql).toContain("FROM c JOIN movies m ON m.id = c.cid");
    // Filters (adult, TMDB votes) and the blended rank live in the outer query.
    expect(sql).toContain("m.adult IS NOT TRUE");
    expect(sql).toContain(`r.source_id = ${TMDB_SOURCE_ID_SQL}`);
    expect(sql).toContain("(1 - c.dist)");
    // SET LOCAL ran in the same transaction.
    expect(rawCalls).toContain("SET LOCAL hnsw.iterative_scan = relaxed_order");
  });
});
