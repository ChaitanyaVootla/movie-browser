/**
 * Live-DB integration test for taste recs + taste match, against the seeded
 * dev personas (scripts/seed-social-demo.ts + scripts/seed-taste-demo.ts).
 *
 * Self-SKIPS unless DATABASE_URL points at the local dev DB (:5436) and the
 * demo users exist. Only write: a temporary BLOCK row (removed afterwards).
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser USER_DATA_SOURCE=postgres \
 *     npx vitest run src/server/services/taste/recs.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ENABLED = (process.env.DATABASE_URL ?? "").includes("5436");

let ready = false;
let ada = 0;
let bea = 0;
let tester = 0;
/** Ids of rows THIS test created — afterAll removes only these. */
let createdBlockId: number | null = null;
let createdWatchlistId: number | null = null;

beforeAll(async () => {
  if (!ENABLED) return;
  try {
    const users = await prisma.user.findMany({
      where: { username: { in: ["cinephile_ada", "binge_bea", "local_tester"] } },
      select: { id: true, username: true },
    });
    const by = new Map(users.map((u) => [u.username, u.id]));
    ada = by.get("cinephile_ada") ?? 0;
    bea = by.get("binge_bea") ?? 0;
    tester = by.get("local_tester") ?? 0;
    ready = ada > 0 && bea > 0 && tester > 0;
  } catch {
    ready = false;
  }
});

afterAll(async () => {
  if (createdBlockId !== null) await prisma.block.deleteMany({ where: { id: createdBlockId } });
  if (createdWatchlistId !== null) await prisma.watchlistItem.deleteMany({ where: { id: createdWatchlistId } });
  await prisma.$disconnect();
});

describe("annLimitFor (pure)", () => {
  it("grows the inner ANN LIMIT with the exclusion count, capped at 1000", async () => {
    const { annLimitFor, ANN_MAX_LIMIT } = await import("@/server/db/postgres/social/taste-recs");
    expect(annLimitFor(150, 0)).toBe(150);
    expect(annLimitFor(150, 400)).toBe(550);
    expect(annLimitFor(150, 5000)).toBe(ANN_MAX_LIMIT);
  });
});

describe("taste recs (live dev DB)", () => {
  it("returns explained, adult-free, non-engaged titles for a seeded persona", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getRecommendationsForUser, clearRecsCache } = await import("./recommend");
    clearRecsCache();
    const recs = await getRecommendationsForUser(ada);
    expect(["ok", "no_index", "cold_start"]).toContain(recs.reason);
    const items = recs.rows.flatMap((r) => r.items);
    expect(items.length).toBeGreaterThan(0);

    const [watched, rated, listed] = await Promise.all([
      prisma.watchEvent.findMany({ where: { userId: ada }, select: { movieId: true, seriesId: true } }),
      prisma.userRating.findMany({ where: { userId: ada }, select: { movieId: true, seriesId: true } }),
      prisma.watchlistItem.findMany({ where: { userId: ada }, select: { movieId: true, seriesId: true } }),
    ]);
    const engaged = new Set(
      [...watched, ...rated, ...listed].map((r) => (r.movieId ? `movie:${r.movieId}` : `series:${r.seriesId}`))
    );
    for (const it of items) expect(engaged.has(`${it.mediaType}:${it.id}`)).toBe(false);

    const movieIds = items.filter((i) => i.mediaType === "movie").map((i) => i.id);
    const adult = await prisma.movie.count({ where: { id: { in: movieIds }, adult: true } });
    expect(adult).toBe(0);

    // No duplicates across rows.
    const keys = items.map((i) => `${i.mediaType}:${i.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("re-filters a cached result against fresh exclusions (just-watchlisted title disappears)", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getRecommendationsForUser } = await import("./recommend");
    const before = await getRecommendationsForUser(ada);
    const first = before.rows[0]?.items[0];
    if (!first) return ctx.skip();
    // Direct write: does NOT mark taste dirty, so the cache key is unchanged.
    const row = await prisma.watchlistItem.create({
      data: { userId: ada, ...(first.mediaType === "movie" ? { movieId: first.id } : { seriesId: first.id }) },
    });
    createdWatchlistId = row.id;
    const after = await getRecommendationsForUser(ada);
    const keys = after.rows.flatMap((r) => r.items).map((i) => `${i.mediaType}:${i.id}`);
    expect(keys).not.toContain(`${first.mediaType}:${first.id}`);
    await prisma.watchlistItem.deleteMany({ where: { id: row.id } });
    createdWatchlistId = null;
  });

  it("heavy persona: the ANN pool does not collapse when most neighbours are excluded", async (ctx) => {
    if (!ready) return ctx.skip();
    const { annCandidates, fetchRecExclusions } = await import("@/server/db/postgres/social/taste-recs");
    const { hasVectorIndex } = await import("@/server/db/postgres/vector-index");
    const { getTasteVectors } = await import("./index");
    if (!(await hasVectorIndex("movies"))) return ctx.skip();
    const { centroid } = await getTasteVectors(tester);
    if (!centroid) return ctx.skip();
    const ex = await fetchRecExclusions(tester);
    const base = 5;
    // Precondition that makes this a starvation case: far more exclusions than the base LIMIT.
    expect(ex.movieIds.length).toBeGreaterThan(base * 4);
    const eligible = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM movies t
      WHERE t.embedding IS NOT NULL AND t.adult IS NOT TRUE AND NOT (t.id = ANY(${ex.movieIds}::int[]))
        AND EXISTS (SELECT 1 FROM ratings r WHERE r.movie_id = t.id
          AND r.source_id = (SELECT id FROM data_sources WHERE slug = 'tmdb') AND r.vote_count >= 150)`;
    const hits = await annCandidates("movies", [centroid], { excludeIds: ex.movieIds, minVotes: 150, perQuery: base });
    // With a fixed LIMIT 5 the user's own titles would fill the nearest 5 and leave ~0;
    // the exclusion-sized LIMIT still returns up to `base` survivors.
    expect(hits.length).toBeGreaterThanOrEqual(Math.min(base, Number(eligible[0]?.n ?? 0)));
    expect(hits.some((h) => ex.movieIds.includes(h.id))).toBe(false);
  });
});

describe("taste match (live dev DB)", () => {
  it("never surfaces a private-only title and is gated by blocks", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getTasteMatchFor } = await import("./match");
    const match = await getTasteMatchFor(tester, "cinephile_ada");
    expect(match).not.toBeNull();

    // Ada's private-only titles (every WATCH private) must never appear.
    const rows = await prisma.$queryRaw<Array<{ movie_id: number }>>`
      SELECT movie_id FROM watch_events WHERE user_id = ${ada} AND movie_id IS NOT NULL
      GROUP BY movie_id HAVING bool_and(is_private)`;
    const privateOnly = new Set(rows.map((r) => r.movie_id));
    expect(privateOnly.size).toBeGreaterThan(0);
    for (const t of [...(match?.sharedFavorites ?? []), ...(match?.fightAbout ?? [])]) {
      expect(t.mediaType === "movie" && privateOnly.has(t.id)).toBe(false);
    }

    const existing = await prisma.block.findFirst({ where: { blockerId: ada, blockedId: tester } });
    if (!existing) {
      const row = await prisma.block.create({ data: { blockerId: ada, blockedId: tester, type: "BLOCK" } });
      createdBlockId = row.id;
    }
    expect(await getTasteMatchFor(tester, "cinephile_ada")).toBeNull();
    if (createdBlockId !== null) {
      await prisma.block.deleteMany({ where: { id: createdBlockId } });
      createdBlockId = null;
    }
  });

  it("denies self and unknown users", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getTasteMatchFor } = await import("./match");
    expect(await getTasteMatchFor(tester, "local_tester")).toBeNull();
    expect(await getTasteMatchFor(tester, "no_such_user_xyz")).toBeNull();
  });
});
