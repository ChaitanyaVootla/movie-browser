/**
 * Tests for the SQUASHED-PREFIX search tier.
 *
 * WHY IT EXISTS: users type titles without punctuation or spaces ("shangchi",
 * "spiderman", "starwars"). Postgres FTS tokenises "Shang-Chi" as `shang` + `chi`,
 * so a prefix tsquery for "shangchi" can never match. Those queries fell through
 * to the trigram fuzzy fallback and burned its ENTIRE timeout returning nothing —
 * measured 4,859ms for "shangchi" vs 317ms for "interstellar". That was the
 * chronic "search hangs" report.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { squashQuery, squashSql } from "./fts-search";

describe("squashQuery", () => {
  it("strips punctuation and spaces so typed titles match indexed ones", () => {
    expect(squashQuery("Shang-Chi")).toBe("shangchi");
    expect(squashQuery("shang chi")).toBe("shangchi");
    expect(squashQuery("Spider-Man")).toBe("spiderman");
    expect(squashQuery("Star Wars")).toBe("starwars");
    expect(squashQuery("WALL·E")).toBe("walle");
    expect(squashQuery("9-1-1")).toBe("911");
  });

  it("always yields [a-z0-9] only — this is what makes inlining it injection-safe", () => {
    for (const evil of ["'; DROP TABLE movies;--", "%_\\", 'a" OR 1=1 --', "🎬x"]) {
      expect(squashQuery(evil)).toMatch(/^[a-z0-9]*$/);
    }
  });

  it("collapses a query that is only punctuation to empty (caller must skip)", () => {
    expect(squashQuery("---")).toBe("");
    expect(squashQuery("   ")).toBe("");
  });
});

describe("squashSql / index-expression drift guard", () => {
  // THE important test. If the TS expression and the index expression drift,
  // Postgres cannot use `idx_*_squash` and silently seq-scans ~1M movies /
  // ~4.4M persons — reintroducing the multi-second hang this tier removed.
  const sql = readFileSync(
    join(process.cwd(), "postgres", "init", "02-search-indexes.sql"),
    "utf-8"
  );

  it("matches the movies index expression byte-for-byte", () => {
    expect(sql).toContain(squashSql("title"));
  });

  it("matches every other squashed index expression", () => {
    for (const col of ["original_title", "name", "original_name"]) {
      expect(sql).toContain(squashSql(col));
    }
  });

  it("declares a squashed index for movies, series and persons", () => {
    for (const idx of [
      "idx_movies_title_squash",
      "idx_movies_orig_title_squash",
      "idx_series_name_squash",
      "idx_series_orig_name_squash",
      "idx_persons_name_squash",
    ]) {
      expect(sql).toContain(idx);
    }
  });

  it("uses text_pattern_ops — without it LIKE 'x%' cannot use the btree", () => {
    // One per squashed index; a plain btree would not serve prefix LIKE.
    // Match only real definitions (the word also appears in the file's comment).
    expect((sql.match(/\) text_pattern_ops\);/g) ?? []).length).toBe(5);
  });

  it("creates indexes CONCURRENTLY + IF NOT EXISTS (idempotent, never locks)", () => {
    const squashCreates = sql.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_\w+_squash/g) ?? [];
    expect(squashCreates).toHaveLength(5);
  });
});
