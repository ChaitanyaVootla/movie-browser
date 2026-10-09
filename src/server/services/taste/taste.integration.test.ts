/**
 * Live-DB integration test for the taste profile service (privacy + lifecycle).
 *
 * Self-SKIPS unless DATABASE_URL points at the local dev DB (:5436) AND the
 * user_taste_profiles table exists, so CI without a seeded DB stays green.
 * Seeds its OWN user, genres and synthetic movie rows (ids 999_100_001+) with
 * embeddings, and removes them afterwards.
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     npx vitest run src/server/services/taste/taste.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GOOGLE = "taste-vitest-user";
const BASE_ID = 999_100_000;
const PUBLIC_IDS = Array.from({ length: 12 }, (_, i) => BASE_ID + 1 + i);
const PRIVATE_IDS = [BASE_ID + 50, BASE_ID + 51, BASE_ID + 52];
const GENRE_PUBLIC = 999_001;
const GENRE_PRIVATE = 999_002;

let ready = false;
let userId = 0;

function vec(axis: number, jitter: number): string {
  const v = new Array<number>(1024).fill(0);
  v[axis] = 1;
  v[(axis + 7) % 1024] = jitter;
  return `[${v.join(",")}]`;
}

async function cleanup() {
  const ids = [...PUBLIC_IDS, ...PRIVATE_IDS];
  const user = await prisma.user.findUnique({ where: { googleId: GOOGLE }, select: { id: true } });
  if (user) {
    await prisma.watchEvent.deleteMany({ where: { userId: user.id } });
    await prisma.userRating.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }); // cascades taste/stats rows
  }
  await prisma.movieGenre.deleteMany({ where: { movieId: { in: ids } } });
  await prisma.movie.deleteMany({ where: { id: { in: ids } } });
  await prisma.genre.deleteMany({ where: { tmdbId: { in: [GENRE_PUBLIC, GENRE_PRIVATE] } } });
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("5436")) return;
  try {
    const t = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT to_regclass('public.user_taste_profiles') IS NOT NULL AS ok`;
    if (!t[0]?.ok) return;
    await cleanup();
    const gPub = await prisma.genre.create({ data: { tmdbId: GENRE_PUBLIC, name: "Vitest Public Genre" } });
    const gPriv = await prisma.genre.create({ data: { tmdbId: GENRE_PRIVATE, name: "Vitest Secret Genre" } });
    for (const [i, id] of PUBLIC_IDS.entries()) {
      await prisma.movie.create({ data: { id, title: `Vitest Public ${i}`, releaseDate: new Date("2001-06-01"), popularity: 10 + i } });
      await prisma.$executeRaw`UPDATE movies SET embedding = ${vec(1, 0.05 * (i % 3))}::vector WHERE id = ${id}`;
      await prisma.movieGenre.create({ data: { movieId: id, genreId: gPub.id } });
    }
    for (const [i, id] of PRIVATE_IDS.entries()) {
      await prisma.movie.create({ data: { id, title: `Vitest Secret ${i}`, releaseDate: new Date("1975-06-01"), popularity: 1 } });
      await prisma.$executeRaw`UPDATE movies SET embedding = ${vec(500, 0.05 * i)}::vector WHERE id = ${id}`;
      await prisma.movieGenre.create({ data: { movieId: id, genreId: gPriv.id } });
    }
    const user = await prisma.user.create({
      data: { googleId: GOOGLE, email: `${GOOGLE}@example.test`, name: "Taste Vitest", username: "taste_vitest" },
    });
    userId = user.id;
    const now = Date.now();
    for (const [i, id] of PUBLIC_IDS.entries()) {
      await prisma.watchEvent.create({
        data: { userId, movieId: id, mediaType: "MOVIE", watchedAt: new Date(now - i * 86_400_000), isPrivate: false },
      });
      await prisma.userRating.create({ data: { userId, movieId: id, mediaType: "MOVIE", score: 9, ratedAt: new Date() } });
    }
    for (const id of PRIVATE_IDS) {
      await prisma.watchEvent.create({
        data: { userId, movieId: id, mediaType: "MOVIE", watchedAt: new Date(), isPrivate: true },
      });
      // A private watch logged WITH a score also writes the canonical rating.
      await prisma.userRating.create({ data: { userId, movieId: id, mediaType: "MOVIE", score: 10, liked: true, ratedAt: new Date() } });
    }
    ready = true;
  } catch (error: unknown) {
    console.warn("taste integration test skipped:", error instanceof Error ? error.message : error);
    ready = false;
  }
}, 60_000);

afterAll(async () => {
  if (ready) await cleanup();
  await prisma.$disconnect();
  const { prisma: shared } = await import("@/server/db/postgres");
  await shared.$disconnect();
});

describe("taste profile service (live DB)", () => {
  it("public projection excludes private watches + their ratings; full includes them", async () => {
    if (!ready) return;
    const { getTasteProfile, getUserTasteEmbedding } = await import("./index");
    const pub = await getTasteProfile(userId, { scope: "public" });
    const full = await getTasteProfile(userId, { scope: "full" });
    expect(pub?.positiveCount).toBe(12);
    expect(full?.positiveCount).toBe(15);
    const pubJson = JSON.stringify(pub);
    expect(pubJson).not.toContain("Vitest Secret");
    expect(pubJson).not.toContain(String(PRIVATE_IDS[0]));
    expect(JSON.stringify(full)).toContain("vitest secret genre");

    const publicVec = await getUserTasteEmbedding(userId, { scope: "public" });
    const fullVec = await getUserTasteEmbedding(userId);
    expect(publicVec?.length).toBe(1024);
    expect(Math.abs(publicVec?.[500] ?? 1)).toBeLessThan(1e-6); // no private direction
    expect(fullVec?.[500] ?? 0).toBeGreaterThan(0.05);
  });

  it("the profile DTO gates on the public threshold and the hide toggle", async () => {
    if (!ready) return;
    const { getProfileTaste } = await import("./index");
    const shown = await getProfileTaste(userId, true);
    expect(shown?.status).toBe("ready");
    expect(await getProfileTaste(userId, false)).toEqual({ status: "hidden" });
  });

  it("markStatsDirty flags taste in the same statement; a recompute clears it", async () => {
    if (!ready) return;
    const { markStatsDirty } = await import("@/server/db/postgres/social/stats-dirty");
    const { prisma: shared } = await import("@/server/db/postgres");
    await shared.$transaction((tx) => markStatsDirty(tx, userId));
    const dirty = await prisma.userTasteProfile.findUnique({ where: { userId }, select: { dirty: true } });
    expect(dirty?.dirty).toBe(true);
    const { getTasteProfile } = await import("./index");
    await getTasteProfile(userId, { scope: "public" });
    const after = await prisma.userTasteProfile.findUnique({ where: { userId }, select: { dirty: true } });
    expect(after?.dirty).toBe(false);
  });

  it("public stats snapshot excludes private watches; full keeps them", async () => {
    if (!ready) return;
    const { getUserStatsSnapshot } = await import("@/server/db/postgres/social/stats");
    const pub = await getUserStatsSnapshot(userId, { scope: "public" });
    const full = await getUserStatsSnapshot(userId, { scope: "full" });
    expect(pub.moviesWatched).toBe(12);
    expect(full.moviesWatched).toBe(15);
    expect(JSON.stringify(pub.topGenres)).not.toContain("Secret");
  });
});
