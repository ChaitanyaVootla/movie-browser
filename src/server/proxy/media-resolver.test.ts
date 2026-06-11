import { describe, it, expect, vi } from "vitest";
import {
  parseMediaDetailPath,
  canonicalMediaPath,
  SlugLru,
  resolveMediaSlug,
  decideMediaRoute,
  lruKey,
  NOT_FOUND,
  type ResolverDeps,
} from "./media-resolver";

describe("parseMediaDetailPath", () => {
  it("parses a canonical slugged movie path", () => {
    expect(parseMediaDetailPath("/movie/27205/inception")).toEqual({
      kind: "media",
      mediaType: "movie",
      id: 27205,
    });
  });

  it("parses a slugless path", () => {
    expect(parseMediaDetailPath("/series/1396")).toEqual({
      kind: "media",
      mediaType: "series",
      id: 1396,
    });
  });

  it("parses trailing-slash and extra-segment variants", () => {
    expect(parseMediaDetailPath("/movie/27205/inception/")).toMatchObject({
      kind: "media",
      id: 27205,
    });
    expect(parseMediaDetailPath("/movie/27205/")).toMatchObject({ kind: "media", id: 27205 });
    expect(parseMediaDetailPath("/movie/27205/a/b/c")).toMatchObject({ kind: "media", id: 27205 });
  });

  it("parses the legacy id-slug dash form", () => {
    expect(parseMediaDetailPath("/movie/27205-inception")).toEqual({
      kind: "media",
      mediaType: "movie",
      id: 27205,
    });
  });

  it("returns null for non-media paths (hot-path guard)", () => {
    expect(parseMediaDetailPath("/")).toBeNull();
    expect(parseMediaDetailPath("/browse")).toBeNull();
    expect(parseMediaDetailPath("/person/123/tom-hanks")).toBeNull();
    expect(parseMediaDetailPath("/movie")).toBeNull(); // no trailing segment → Next 404s naturally
    expect(parseMediaDetailPath("/movies/123")).toBeNull();
    expect(parseMediaDetailPath("/api/movie/123")).toBeNull();
  });

  it("flags media-prefixed garbage as invalid (definite 404)", () => {
    expect(parseMediaDetailPath("/movie/abc")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/movie/null")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/series/12abc")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/movie/")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/movie/0")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/movie/-5/x")).toEqual({ kind: "invalid" });
  });
});

describe("canonicalMediaPath", () => {
  it("builds slugged and slugless forms (matches getMediaPath)", () => {
    expect(canonicalMediaPath("movie", 27205, "inception")).toBe("/movie/27205/inception");
    expect(canonicalMediaPath("series", 1396, "")).toBe("/series/1396");
  });
});

describe("SlugLru", () => {
  it("stores and retrieves values, including the NOT_FOUND sentinel and empty slugs", () => {
    const lru = new SlugLru(10);
    lru.set("movie:1", "inception");
    lru.set("movie:2", NOT_FOUND);
    lru.set("movie:3", ""); // slugless title
    expect(lru.get("movie:1")).toBe("inception");
    expect(lru.get("movie:2")).toBe(NOT_FOUND);
    expect(lru.get("movie:3")).toBe("");
    expect(lru.get("movie:999")).toBeUndefined();
  });

  it("evicts the oldest entry at capacity", () => {
    const lru = new SlugLru(3);
    lru.set("a", "1");
    lru.set("b", "2");
    lru.set("c", "3");
    lru.set("d", "4"); // evicts "a"
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBe("2");
    expect(lru.size).toBe(3);
  });

  it("get() bumps recency so hot entries survive eviction", () => {
    const lru = new SlugLru(3);
    lru.set("a", "1");
    lru.set("b", "2");
    lru.set("c", "3");
    lru.get("a"); // bump "a" — "b" is now oldest
    lru.set("d", "4"); // evicts "b"
    expect(lru.get("a")).toBe("1");
    expect(lru.get("b")).toBeUndefined();
  });

  it("set() on an existing key updates in place without evicting", () => {
    const lru = new SlugLru(2);
    lru.set("a", "1");
    lru.set("b", "2");
    lru.set("a", "1b");
    expect(lru.size).toBe(2);
    expect(lru.get("a")).toBe("1b");
    expect(lru.get("b")).toBe("2");
  });
});

function makeDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    fetchTitleFromDb: vi.fn(async () => ({ found: false }) as const),
    fetchTitleFromTmdb: vi.fn(async () => ({ status: "unknown" }) as const),
    ...overrides,
  };
}

describe("resolveMediaSlug", () => {
  it("DB hit → slugified title, cached, TMDB never consulted", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps({
      fetchTitleFromDb: vi.fn(async () => ({ found: true, title: "The Dark Knight" }) as const),
    });
    const slug = await resolveMediaSlug("movie", 155, deps, cache);
    expect(slug).toBe("the-dark-knight");
    expect(cache.get(lruKey("movie", 155))).toBe("the-dark-knight");
    expect(deps.fetchTitleFromTmdb).not.toHaveBeenCalled();

    // Second call served from cache — no further DB calls
    await resolveMediaSlug("movie", 155, deps, cache);
    expect(deps.fetchTitleFromDb).toHaveBeenCalledTimes(1);
  });

  it("DB miss + TMDB found → slug cached (new releases not yet in PG)", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps({
      fetchTitleFromTmdb: vi.fn(async () => ({ status: "found", title: "Brand New Film" }) as const),
    });
    expect(await resolveMediaSlug("movie", 999, deps, cache)).toBe("brand-new-film");
    expect(cache.get(lruKey("movie", 999))).toBe("brand-new-film");
  });

  it("DB miss + TMDB 404 → NOT_FOUND cached; repeat sweeps cost zero calls", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps({
      fetchTitleFromTmdb: vi.fn(async () => ({ status: "not_found" }) as const),
    });
    expect(await resolveMediaSlug("movie", 999999999, deps, cache)).toBe(NOT_FOUND);
    expect(await resolveMediaSlug("movie", 999999999, deps, cache)).toBe(NOT_FOUND);
    expect(deps.fetchTitleFromDb).toHaveBeenCalledTimes(1);
    expect(deps.fetchTitleFromTmdb).toHaveBeenCalledTimes(1);
  });

  it("TMDB unknown (timeout/5xx/no key) → null, NOT cached (fail open)", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps();
    expect(await resolveMediaSlug("movie", 42, deps, cache)).toBeNull();
    expect(cache.get(lruKey("movie", 42))).toBeUndefined();
    // Next request retries the lookup
    await resolveMediaSlug("movie", 42, deps, cache);
    expect(deps.fetchTitleFromDb).toHaveBeenCalledTimes(2);
  });

  it("DB error → TMDB still consulted (PG outage degrades, doesn't 404)", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps({
      fetchTitleFromDb: vi.fn(async () => ({ error: true }) as const),
      fetchTitleFromTmdb: vi.fn(async () => ({ status: "found", title: "Inception" }) as const),
    });
    expect(await resolveMediaSlug("movie", 27205, deps, cache)).toBe("inception");
  });

  it("empty/non-latin titles resolve to the slugless form ('')", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps({
      fetchTitleFromDb: vi.fn(async () => ({ found: true, title: "你好世界" }) as const),
    });
    expect(await resolveMediaSlug("movie", 7, deps, cache)).toBe("");
  });

  it("ids beyond int4 are NOT_FOUND without any lookup", async () => {
    const cache = new SlugLru(10);
    const deps = makeDeps();
    expect(await resolveMediaSlug("movie", 99_999_999_999, deps, cache)).toBe(NOT_FOUND);
    expect(deps.fetchTitleFromDb).not.toHaveBeenCalled();
    expect(deps.fetchTitleFromTmdb).not.toHaveBeenCalled();
  });
});

describe("decideMediaRoute", () => {
  it("correct slug → verified pass-through", () => {
    expect(decideMediaRoute("/movie/27205/inception", "movie", 27205, "inception")).toEqual({
      action: "next",
      verified: true,
    });
  });

  it("wrong slug → 308 to canonical", () => {
    expect(decideMediaRoute("/movie/27205/wrong-slug", "movie", 27205, "inception")).toEqual({
      action: "redirect",
      location: "/movie/27205/inception",
    });
  });

  it("missing slug → 308 to canonical", () => {
    expect(decideMediaRoute("/movie/27205", "movie", 27205, "inception")).toEqual({
      action: "redirect",
      location: "/movie/27205/inception",
    });
  });

  it("trailing slash / dash form / extra segments → 308 to canonical", () => {
    for (const path of [
      "/movie/27205/inception/",
      "/movie/27205-inception",
      "/movie/27205/inception/extra",
    ]) {
      expect(decideMediaRoute(path, "movie", 27205, "inception")).toEqual({
        action: "redirect",
        location: "/movie/27205/inception",
      });
    }
  });

  it("slugless canonical: bare id passes, anything else redirects to bare id", () => {
    expect(decideMediaRoute("/series/1396", "series", 1396, "")).toEqual({
      action: "next",
      verified: true,
    });
    expect(decideMediaRoute("/series/1396/stale-slug", "series", 1396, "")).toEqual({
      action: "redirect",
      location: "/series/1396",
    });
  });

  it("NOT_FOUND → not_found rewrite", () => {
    expect(decideMediaRoute("/movie/999999999/x", "movie", 999999999, NOT_FOUND)).toEqual({
      action: "not_found",
    });
  });

  it("null (fail open) → unverified pass-through", () => {
    expect(decideMediaRoute("/movie/42/whatever", "movie", 42, null)).toEqual({
      action: "next",
      verified: false,
    });
  });
});
