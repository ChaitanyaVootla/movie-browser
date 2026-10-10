/**
 * Live-DB privacy regressions for the public projection (review findings,
 * Oct 2026). Self-SKIPS unless DATABASE_URL points at :5436 and the taste
 * tables exist. Seeds its own users + synthetic catalog rows (ids 999_300_000+)
 * and removes them afterwards.
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     npx vitest run src/server/services/taste/taste-privacy.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = 999_300_000;
const NOTE_MOVIE = BASE + 1; // score only via a PRIVATE NOTE entry
const REVIEW_MOVIE = BASE + 2; // score only via a PRIVATE review (+ a public unscored NOTE)
const OLD_PRIVATE = BASE + 3; // rated, only watch is private and OLD (outside the 500-row cap)
const BULK = Array.from({ length: 501 }, (_, i) => BASE + 1000 + i); // newer public watches
const SERIES_PRIVATE = BASE + 10;
const SERIES_MIXED = BASE + 11;
const G_A = "taste-privacy-vitest-a";
const G_B = "taste-privacy-vitest-b";

let ready = false;
let uidA = 0;
let uidB = 0;
const DAY = 86_400_000;

async function cleanup() {
  for (const g of [G_A, G_B]) {
    const u = await prisma.user.findUnique({ where: { googleId: g }, select: { id: true } });
    if (!u) continue;
    await prisma.watchEvent.deleteMany({ where: { userId: u.id } });
    await prisma.userReview.deleteMany({ where: { userId: u.id } });
    await prisma.userRating.deleteMany({ where: { userId: u.id } });
    await prisma.seriesProgress.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.movie.deleteMany({ where: { id: { in: [NOTE_MOVIE, REVIEW_MOVIE, OLD_PRIVATE, ...BULK] } } });
  await prisma.series.deleteMany({ where: { id: { in: [SERIES_PRIVATE, SERIES_MIXED] } } });
}

beforeAll(async () => {
  if (!/@(localhost|127\.0\.0\.1):(5436|5437)\//.test(process.env.DATABASE_URL ?? "")) return; // dev or the eval container
  try {
    const t = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT to_regclass('public.user_taste_profiles') IS NOT NULL AS ok`;
    if (!t[0]?.ok) return;
    await cleanup();
    await prisma.movie.createMany({
      data: [NOTE_MOVIE, REVIEW_MOVIE, OLD_PRIVATE, ...BULK].map((id) => ({ id, title: `Vitest Priv ${id}` })),
    });
    await prisma.series.createMany({
      data: [
        { id: SERIES_PRIVATE, name: "Vitest Private Series" },
        { id: SERIES_MIXED, name: "Vitest Mixed Series" },
      ],
    });
    const a = await prisma.user.create({
      data: { googleId: G_A, email: `${G_A}@example.test`, username: "taste_priv_a" },
    });
    const b = await prisma.user.create({
      data: { googleId: G_B, email: `${G_B}@example.test`, username: "taste_priv_b" },
    });
    uidA = a.id;
    uidB = b.id;
    const now = Date.now();

    // A1 — a private NOTE carrying a score (logWatchAction upserts the canonical score).
    await prisma.watchEvent.create({
      data: { userId: uidA, movieId: NOTE_MOVIE, mediaType: "MOVIE", kind: "NOTE", isPrivate: true, score: 10, watchedAt: new Date() },
    });
    await prisma.userRating.create({ data: { userId: uidA, movieId: NOTE_MOVIE, mediaType: "MOVIE", score: 10, ratedAt: new Date() } });
    // A2 — a public unscored NOTE + a PRIVATE review that set the score.
    await prisma.watchEvent.create({
      data: { userId: uidA, movieId: REVIEW_MOVIE, mediaType: "MOVIE", kind: "NOTE", isPrivate: false, watchedAt: new Date() },
    });
    await prisma.userReview.create({
      data: { userId: uidA, movieId: REVIEW_MOVIE, mediaType: "MOVIE", body: "secret review", isPrivate: true },
    });
    await prisma.userRating.create({ data: { userId: uidA, movieId: REVIEW_MOVIE, mediaType: "MOVIE", score: 10, ratedAt: new Date() } });
    // A3 — progress: a privately-watched series, and a mixed one (public S1E1-2, private S1E3-5).
    for (let ep = 1; ep <= 3; ep++) {
      await prisma.watchEvent.create({
        data: { userId: uidA, seriesId: SERIES_PRIVATE, mediaType: "SERIES", seasonNumber: 1, episodeNumber: ep, isPrivate: true, watchedAt: new Date() },
      });
    }
    for (let ep = 1; ep <= 5; ep++) {
      await prisma.watchEvent.create({
        data: { userId: uidA, seriesId: SERIES_MIXED, mediaType: "SERIES", seasonNumber: 1, episodeNumber: ep, isPrivate: ep > 2, watchedAt: new Date() },
      });
    }
    for (const sid of [SERIES_PRIVATE, SERIES_MIXED]) {
      await prisma.seriesProgress.create({
        data: { userId: uidA, seriesId: sid, status: "WATCHING", lastSeasonNumber: 1, lastEpisodeNumber: 5, maxSeasonNumber: 1, maxEpisodeNumber: 5, episodesWatched: 5 },
      });
    }

    // B — one OLD private watch on a rated title, then 501 NEWER public watches.
    await prisma.watchEvent.create({
      data: { userId: uidB, movieId: OLD_PRIVATE, mediaType: "MOVIE", isPrivate: true, watchedAt: new Date(now - 700 * DAY) },
    });
    await prisma.userRating.create({ data: { userId: uidB, movieId: OLD_PRIVATE, mediaType: "MOVIE", score: 10, ratedAt: new Date() } });
    await prisma.watchEvent.createMany({
      data: BULK.map((id, i) => ({ userId: uidB, movieId: id, mediaType: "MOVIE" as const, isPrivate: false, watchedAt: new Date(now - i * 60_000) })),
    });
    ready = true;
  } catch (error: unknown) {
    console.warn("taste privacy integration test skipped:", error instanceof Error ? error.message : error);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanup();
  await prisma.$disconnect();
  const { prisma: shared } = await import("@/server/db/postgres");
  await shared.$disconnect();
});

describe("public projection privacy (live DB)", () => {
  it("scores from a private NOTE or a private review never reach the public projection", async () => {
    if (!ready) return;
    const { fetchTasteSignals } = await import("@/server/db/postgres/social/taste");
    const { titleWeight } = await import("@/lib/taste/weights");
    const signals = await fetchTasteSignals(uidA);
    for (const id of [NOTE_MOVIE, REVIEW_MOVIE]) {
      const s = signals.find((x) => x.key === `m:${id}`);
      expect(s?.rating?.score).toBe(10);
      const pub = titleWeight(s ?? signals[0], "public", { now: new Date(), meanScore: 5.5 });
      expect(pub.score).toBeNull();
      expect(pub.weight).toBe(0);
    }
    const { recomputeTasteNow } = await import("./index");
    const r = await recomputeTasteNow(uidA);
    const json = JSON.stringify(r.public);
    expect(json).not.toContain(String(NOTE_MOVIE));
    expect(json).not.toContain(String(REVIEW_MOVIE));
    expect(json).not.toContain("Vitest Private Series");
  });

  it("the public score histogram drops NOTE/review-sourced private scores", async () => {
    if (!ready) return;
    const { getPublicProfileByUsername } = await import("@/server/db/postgres/social/public-profile");
    const prof = await getPublicProfileByUsername("taste_priv_a");
    expect(prof?.ratingsHistogram[9]).toBe(0);
  });

  it("privacy is decided without the 500-row cap (old private watch on a rated title)", async () => {
    if (!ready) return;
    const { fetchTasteSignals } = await import("@/server/db/postgres/social/taste");
    const { titleWeight, isPrivateOnly } = await import("@/lib/taste/weights");
    const s = (await fetchTasteSignals(uidB)).find((x) => x.key === `m:${OLD_PRIVATE}`);
    expect(s).toBeDefined();
    if (!s) return;
    expect(isPrivateOnly(s)).toBe(true);
    // The old watch is outside the 500 most recent aggregates but still counted.
    expect(s.watches.count.all).toBe(1);
    expect(titleWeight(s, "public", { now: new Date(), meanScore: 5.5 }).weight).toBe(0);
    const { getPublicProfileByUsername } = await import("@/server/db/postgres/social/public-profile");
    const prof = await getPublicProfileByUsername("taste_priv_b");
    expect(prof?.ratingsHistogram[9]).toBe(0);
  });

  it("the public 'currently watching' shelf hides private-only series and shows the public position", async () => {
    if (!ready) return;
    const { getPublicProgressShelf } = await import("@/server/db/postgres/social/progress");
    const shelf = await getPublicProgressShelf(uidA, ["WATCHING", "REWATCHING"], 10);
    expect(shelf.map((s) => s.seriesId)).toEqual([SERIES_MIXED]);
    expect(shelf[0].lastEpisodeNumber).toBe(2);
    expect(shelf[0].episodesWatched).toBe(2);
  });

  it("a mark that lands during a stats recompute keeps the row dirty (lost-dirty guard)", async () => {
    if (!ready) return;
    const { refreshUserStatsSnapshot, writeUserStatsSnapshot } = await import("@/server/db/postgres/social/stats");
    const { markStatsDirty } = await import("@/server/db/postgres/social/stats-dirty");
    const { prisma: shared } = await import("@/server/db/postgres");
    const pair = await refreshUserStatsSnapshot(uidA);
    await shared.$transaction((tx) => markStatsDirty(tx, uidA));
    const marked = await prisma.userStats.findUnique({ where: { userId: uidA }, select: { dirtyAt: true } });
    // A recompute that read the row BEFORE the mark (observed = an older value) must not clear it.
    await writeUserStatsSnapshot(uidA, pair, new Date(0));
    expect((await prisma.userStats.findUnique({ where: { userId: uidA }, select: { dirty: true } }))?.dirty).toBe(true);
    // One that observed the latest mark clears it.
    await writeUserStatsSnapshot(uidA, pair, marked?.dirtyAt ?? null);
    expect((await prisma.userStats.findUnique({ where: { userId: uidA }, select: { dirty: true } }))?.dirty).toBe(false);
  });
});
