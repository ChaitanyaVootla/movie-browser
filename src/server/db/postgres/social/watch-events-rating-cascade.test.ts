/**
 * The implied-watch cascade: rating / liking / reviewing a MOVIE auto-creates a
 * WATCH event (and drops it from the watchlist), idempotently; series ratings do
 * NOT (series watched-ness is progress-based). Pins `isPositiveRatingSignal`
 * (pure) + `ensureMovieWatchedTx` (DB).
 *
 * Pure tests always run. The DB tests self-SKIP when no DATABASE_URL is
 * reachable, so CI stays green. Seeds their OWN user + movie rows idempotently.
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     npx vitest run src/server/db/postgres/social/watch-events-rating-cascade.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureMovieWatchedTx, isPositiveRatingSignal } from "./watch-events";

describe("isPositiveRatingSignal (pure)", () => {
  it("a score, thumb, or heart is a positive signal", () => {
    expect(isPositiveRatingSignal({ score: 7 })).toBe(true);
    expect(isPositiveRatingSignal({ thumb: 1 })).toBe(true);
    expect(isPositiveRatingSignal({ thumb: -1 })).toBe(true); // a dislike still implies you saw it
    expect(isPositiveRatingSignal({ liked: true })).toBe(true);
  });

  it("a clear (all empty) is NOT a positive signal", () => {
    expect(isPositiveRatingSignal({ score: null, thumb: null, liked: false })).toBe(false);
    expect(isPositiveRatingSignal({})).toBe(false);
  });
});

const prisma = new PrismaClient();
const USER_GOOGLE = "rating-cascade-vitest";
const MOVIE_RATED = 999000701;
const MOVIE_RERATE = 999000702;
const SERIES_RATED = 999000703;

let dbReady = false;
let U = 0;

beforeAll(async () => {
  try {
    const user = await prisma.user.upsert({
      where: { googleId: USER_GOOGLE },
      update: {},
      create: { googleId: USER_GOOGLE, email: `${USER_GOOGLE}@example.test`, name: "Cascade Tester" },
      select: { id: true },
    });
    U = user.id;
    for (const id of [MOVIE_RATED, MOVIE_RERATE]) {
      await prisma.movie.upsert({ where: { id }, update: {}, create: { id, title: `Cascade Movie ${id}` } });
    }
    await prisma.series.upsert({
      where: { id: SERIES_RATED },
      update: {},
      create: { id: SERIES_RATED, name: `Cascade Series ${SERIES_RATED}` },
    });
    await prisma.watchEvent.deleteMany({ where: { userId: U } });
    await prisma.watchlistItem.deleteMany({ where: { userId: U } });
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  if (dbReady) {
    await prisma.watchEvent.deleteMany({ where: { userId: U } });
    await prisma.watchlistItem.deleteMany({ where: { userId: U } });
    await prisma.movie.deleteMany({ where: { id: { in: [MOVIE_RATED, MOVIE_RERATE] } } });
    await prisma.series.deleteMany({ where: { id: SERIES_RATED } });
    await prisma.user.deleteMany({ where: { googleId: USER_GOOGLE } });
  }
  await prisma.$disconnect();
});

describe("ensureMovieWatchedTx (implied-watch cascade)", () => {
  it("creates a dateless WATCH event and removes the movie from the watchlist", async () => {
    if (!dbReady) return;
    await prisma.watchlistItem.create({ data: { userId: U, movieId: MOVIE_RATED } });

    const created = await prisma.$transaction((tx) => ensureMovieWatchedTx(tx, U, MOVIE_RATED));
    expect(created).toBe(true);

    const watch = await prisma.watchEvent.findFirst({
      where: { userId: U, movieId: MOVIE_RATED, kind: "WATCH" },
      select: { watchedAt: true, watchedAtPrecision: true },
    });
    expect(watch).not.toBeNull();
    expect(watch?.watchedAt).toBeNull();
    expect(watch?.watchedAtPrecision).toBe("UNKNOWN");

    const inList = await prisma.watchlistItem.findFirst({ where: { userId: U, movieId: MOVIE_RATED } });
    expect(inList).toBeNull();
  });

  it("is idempotent — re-rating does not stack a second WATCH event", async () => {
    if (!dbReady) return;
    const first = await prisma.$transaction((tx) => ensureMovieWatchedTx(tx, U, MOVIE_RERATE));
    const second = await prisma.$transaction((tx) => ensureMovieWatchedTx(tx, U, MOVIE_RERATE));
    expect(first).toBe(true);
    expect(second).toBe(false);
    const count = await prisma.watchEvent.count({
      where: { userId: U, movieId: MOVIE_RERATE, kind: "WATCH" },
    });
    expect(count).toBe(1);
  });
});
