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
  if (ready) await prisma.block.deleteMany({ where: { blockerId: ada, blockedId: tester } });
  await prisma.$disconnect();
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

  it("serves the cached result on a second call", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getRecommendationsForUser } = await import("./recommend");
    const a = await getRecommendationsForUser(ada);
    const b = await getRecommendationsForUser(ada);
    expect(b).toBe(a);
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

    await prisma.block.create({ data: { blockerId: ada, blockedId: tester, type: "BLOCK" } });
    expect(await getTasteMatchFor(tester, "cinephile_ada")).toBeNull();
    await prisma.block.deleteMany({ where: { blockerId: ada, blockedId: tester } });
  });

  it("denies self and unknown users", async (ctx) => {
    if (!ready) return ctx.skip();
    const { getTasteMatchFor } = await import("./match");
    expect(await getTasteMatchFor(tester, "local_tester")).toBeNull();
    expect(await getTasteMatchFor(tester, "no_such_user_xyz")).toBeNull();
  });
});
