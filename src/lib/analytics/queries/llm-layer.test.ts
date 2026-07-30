/**
 * Pins the agent-layer SQL predicates.
 *
 * This bug class is INVISIBLE to typecheck: these are strings interpolated into
 * ClickHouse SQL, so a predicate that silently stops matching (or starts
 * matching HTML pages) still compiles and still returns rows — just wrong ones.
 * Same rationale as `src/server/db/postgres/adult-filter.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { LLM_LAYER_SQL, LLM_MD_SQL } from "./llm-layer";

/**
 * Stand-in for ClickHouse's `LIKE` over the small set of shapes we care about.
 * Only `%`-suffix/prefix patterns are used in these predicates, so a translation
 * to a JS regex is faithful here.
 */
function sqlLike(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

/** Evaluate the tiny predicate grammar these two constants use. */
function matches(predicate: string, path: string): boolean {
  const clauses = predicate
    .replace(/^\(|\)$/g, "")
    .split(" OR ")
    .map((c) => c.replace(/^\(|\)$/g, "").trim());

  return clauses.some((clause) => {
    const like = clause.match(/^path LIKE '(.+)'$/);
    if (like) return sqlLike(path, like[1]);
    const eq = clause.match(/^path = '(.+)'$/);
    if (eq) return path === eq[1];
    throw new Error(`unhandled clause: ${clause}`);
  });
}

describe("LLM_LAYER_SQL", () => {
  it("matches markdown twins for every surface", () => {
    for (const path of [
      "/movie/27205/inception.md",
      "/series/1396/breaking-bad.md",
      "/person/287/brad-pitt.md",
      "/topics/genre-action-movie.md",
      "/browse.md",
      "/search.md",
      "/privacy.md",
    ]) {
      expect(matches(LLM_LAYER_SQL, path), path).toBe(true);
    }
  });

  it("matches the llms.txt discovery index", () => {
    expect(matches(LLM_LAYER_SQL, "/llms.txt")).toBe(true);
  });

  it("does NOT match the HTML pages the twins shadow", () => {
    for (const path of [
      "/movie/27205/inception",
      "/series/1396/breaking-bad",
      "/person/287/brad-pitt",
      "/browse",
      "/",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(matches(LLM_LAYER_SQL, path), path).toBe(false);
    }
  });
});

describe("LLM_MD_SQL", () => {
  it("covers the twins but EXCLUDES the index", () => {
    // The overview splits `.md` volume from index fetches; if this predicate
    // ever swallowed /llms.txt, requestsPerPath would be quietly skewed.
    expect(matches(LLM_MD_SQL, "/movie/27205/inception.md")).toBe(true);
    expect(matches(LLM_MD_SQL, "/llms.txt")).toBe(false);
  });
});
