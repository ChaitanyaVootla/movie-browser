/**
 * Adult-content exclusion across every LINK surface backed by raw SQL.
 *
 * noindex alone only stops indexing — the internal links keep Googlebot spending
 * its (throttled) crawl budget on ~115k adult pages, starving the mainstream
 * catalog. So search/autocomplete/similar must not LINK to adult titles either.
 *
 * These pin the WHERE clauses, not the DB: prisma is mocked and we assert on the
 * SQL text each function builds. A regression here is invisible to typecheck.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above module-level consts, so the SQL recorder
// has to live in vi.hoisted().
const { rawCalls, queryRawUnsafe, queryRaw } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    rawCalls: calls,
    /** Records `$queryRawUnsafe(sql, ...params)`. */
    queryRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
      return [];
    }),
    /** Records `$queryRaw` tagged templates by joining the static string parts. */
    queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(strings.join(" ? "));
      return [];
    }),
  };
});

vi.mock("./index", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
    $queryRaw: queryRaw,
    $executeRawUnsafe: vi.fn(),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: vi.fn() }),
  },
}));

vi.mock("@/lib/logger", () => ({
  dataLogger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  ftsPrefixSearchTitles,
  ftsPrefixSearchPeople,
  ftsSearchTitles,
  ftsSearchPeople,
} from "./fts-search";
import { fuzzySearch, findExactMatch, getSpellingSuggestions } from "./fuzzy-search";
import { findSimilarByEmbedding } from "./semantic-search";

/** Every recorded SQL string, whitespace-collapsed for stable matching. */
function collectedSql(): string[] {
  return rawCalls.map((sql) => sql.replace(/\s+/g, " "));
}

/** The adult predicate for a table alias, as the query files emit it. */
function adultPredicate(alias: string): string {
  return `${alias}.adult IS NOT TRUE`;
}

beforeEach(() => {
  rawCalls.length = 0;
  queryRawUnsafe.mockClear();
  queryRaw.mockClear();
});

describe("FTS search excludes adult rows", () => {
  it("ftsPrefixSearchTitles filters both movies and series", async () => {
    await ftsPrefixSearchTitles("incep");
    const sql = collectedSql();
    expect(sql).toHaveLength(2);
    expect(sql.some((s) => s.includes(adultPredicate("m")))).toBe(true);
    expect(sql.some((s) => s.includes(adultPredicate("s")))).toBe(true);
  });

  it("ftsPrefixSearchPeople filters persons", async () => {
    await ftsPrefixSearchPeople("leo");
    const sql = collectedSql();
    // Assert a query actually ran — `every` on [] is vacuously true.
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain(adultPredicate("p"));
  });

  it("ftsSearchTitles filters both movies and series", async () => {
    await ftsSearchTitles("the matrix");
    const sql = collectedSql();
    expect(sql.some((s) => s.includes(adultPredicate("m")))).toBe(true);
    expect(sql.some((s) => s.includes(adultPredicate("s")))).toBe(true);
  });

  it("ftsSearchPeople filters persons", async () => {
    await ftsSearchPeople("nolan");
    const sql = collectedSql();
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain(adultPredicate("p"));
  });
});

describe("trigram search excludes adult rows", () => {
  it("fuzzySearch filters movies, series and persons in one UNION", async () => {
    await fuzzySearch("matrix", { mediaTypes: ["movie", "series", "person"] });
    const sql = collectedSql().join("\n");
    expect(sql).toContain(adultPredicate("m"));
    expect(sql).toContain(adultPredicate("s"));
    expect(sql).toContain(adultPredicate("p"));
  });

  it("findExactMatch filters all three tables", async () => {
    await findExactMatch("the matrix");
    const sql = collectedSql();
    // One query per table; each must carry the unaliased predicate.
    expect(sql).toHaveLength(3);
    expect(sql.every((s) => s.includes("adult IS NOT TRUE"))).toBe(true);
  });

  it("getSpellingSuggestions filters all three UNION branches", async () => {
    await getSpellingSuggestions("matrikx");
    const sql = collectedSql().join("\n");
    expect(sql.match(/adult IS NOT TRUE/g) ?? []).toHaveLength(3);
  });
});

describe("pgvector similarity excludes adult rows", () => {
  it("findSimilarByEmbedding filters adult movies out of Similar titles", async () => {
    await findSimilarByEmbedding(27205, "movie");
    expect(collectedSql().join("\n")).toContain(adultPredicate("t"));
  });

  it("findSimilarByEmbedding filters adult series out of Similar titles", async () => {
    await findSimilarByEmbedding(1396, "series");
    expect(collectedSql().join("\n")).toContain(adultPredicate("t"));
  });
});
