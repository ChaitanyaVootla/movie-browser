/**
 * smartDiscover resolved the TMDB ratings source as a hardcoded `source_id = 1`,
 * but data_sources ids are autoincrement (TMDB is 6 in prod). Because minVotes
 * defaults to 50, every call carried an EXISTS on that id and returned ZERO
 * rows — the AI agent's smart_discover and the embedding "Similar" row were
 * silently dead (Oct 2026). These pin the SQL text (prisma is mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rawCalls, queryRawUnsafe } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    rawCalls: calls,
    queryRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
      // The similarTo source-embedding lookup expects an `embedding` column.
      if (sql.includes("SELECT embedding::text")) return [{ embedding: "[0.1,0.2]" }];
      return [];
    }),
  };
});

vi.mock("./index", () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));
vi.mock("@/lib/embeddings", () => ({ generateQueryEmbedding: vi.fn(async () => [0.1, 0.2]) }));
vi.mock("@/lib/logger", () => ({
  dataLogger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { smartDiscover, TMDB_SOURCE_ID_SQL } from "./smart-discover";

function mainSql(): string {
  const sql = rawCalls.filter((s) => !s.includes("SELECT embedding::text"));
  expect(sql).toHaveLength(1);
  return sql[0].replace(/\s+/g, " ");
}

beforeEach(() => {
  rawCalls.length = 0;
  queryRawUnsafe.mockClear();
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
