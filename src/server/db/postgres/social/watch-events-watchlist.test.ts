/**
 * Regression lock: watching a title auto-removes it from the watchlist
 * (Trakt/Letterboxd model), but a NOTE (a diary entry that is NOT a viewing)
 * does NOT. This behavior already exists (watch-events.ts) — this test pins it
 * so a future refactor can't silently break it.
 *
 * Live-DB test (needs the watch_events + watchlist tables + FK targets). It
 * self-SKIPS when no DATABASE_URL is reachable, so CI stays green. Seeds its
 * OWN user + movie rows idempotently (does NOT assume seed movies 603/604).
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     npx vitest run src/server/db/postgres/social/watch-events-watchlist.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { logWatchEvent } from "./watch-events";

const prisma = new PrismaClient();

const USER_GOOGLE = "watchlist-autoremove-vitest";
const MOVIE_WATCH = 999000603; // synthetic ids; do NOT assume seed movies exist
const MOVIE_NOTE = 999000604;

let dbReady = false;
let U = 0;

beforeAll(async () => {
  try {
    const user = await prisma.user.upsert({
      where: { googleId: USER_GOOGLE },
      update: {},
      create: { googleId: USER_GOOGLE, email: `${USER_GOOGLE}@example.test`, name: "Watchlist Tester" },
      select: { id: true },
    });
    U = user.id;
    for (const id of [MOVIE_WATCH, MOVIE_NOTE]) {
      await prisma.movie.upsert({
        where: { id },
        update: {},
        create: { id, title: `Watchlist Test Movie ${id}` },
      });
    }
    // Clean any leftover state from a prior aborted run.
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
    await prisma.movie.deleteMany({ where: { id: { in: [MOVIE_WATCH, MOVIE_NOTE] } } });
    await prisma.user.deleteMany({ where: { googleId: USER_GOOGLE } });
  }
  await prisma.$disconnect();
});

describe("watchlist auto-removal on watch (Trakt/Letterboxd model)", () => {
  it("WATCH on a movie removes it from the watchlist", async () => {
    if (!dbReady) return;
    await prisma.watchlistItem.create({ data: { userId: U, movieId: MOVIE_WATCH } });
    await logWatchEvent(U, { movieId: MOVIE_WATCH, kind: "WATCH" });
    const still = await prisma.watchlistItem.findFirst({ where: { userId: U, movieId: MOVIE_WATCH } });
    expect(still).toBeNull();
  });

  it("a NOTE (not a viewing) does NOT remove it from the watchlist", async () => {
    if (!dbReady) return;
    await prisma.watchlistItem.create({ data: { userId: U, movieId: MOVIE_NOTE } });
    await logWatchEvent(U, { movieId: MOVIE_NOTE, kind: "NOTE" });
    const still = await prisma.watchlistItem.findFirst({ where: { userId: U, movieId: MOVIE_NOTE } });
    expect(still).not.toBeNull();
  });
});
