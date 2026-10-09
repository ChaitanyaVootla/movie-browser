/**
 * seed-taste-demo.ts — LOCAL-ONLY seed that gives the three social demo users
 * (`cinephile_ada`, `binge_bea`, `critic_cy`, from seed-social-demo.ts) enough
 * watch/rating history over titles WITH embeddings to exercise the taste
 * profile (spec docs/superpowers/specs/2026-10-09-taste-profile-design.md).
 *
 * SAFETY: refuses to run unless DATABASE_URL contains 5436 (the dev DB).
 *
 *   DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
 *   ENABLE_MONGODB_ENRICHMENT=false MAX_BACKGROUND_REFRESH=0 \
 *   ENV_FILE=/path/to/.env.local \
 *     npx tsx scripts/seed-taste-demo.ts
 *
 * ENV_FILE (optional) is loaded with dotenv WITHOUT overriding already-set
 * vars — it only supplies TMDB_API_KEY for hydration. The 5436 guard runs
 * AFTER it, so a prod DATABASE_URL in that file can never be picked up.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Hydrates a curated ~55-title catalog from TMDB (TMDB-only: skipLambda,
 *      no Mongo, no enrichment) for any title missing genres locally.
 *   2. DEV-ONLY synthetic data for rows that lack it (never overwrites real data):
 *      - `embedding` (1024-d, deterministic: genre + keyword basis vectors +
 *        per-title jitter, L2-normalised) where `embedding IS NULL`;
 *      - `ai_data` + THEME/VIBE/MOOD `ai_insights` derived from genres, marked
 *        `model_id = 'dev-synthetic-taste'`, only for titles with no ai_data.
 *   3. Per-persona histories (ratings, hearts, watches incl. PRIVATE watches
 *      that must never surface on the public profile, series progress).
 *      Seeded watch events carry tags = ['taste-seed'] and are replaced on re-run.
 *   4. Recomputes stats + taste for each user and prints timings.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

if (process.env.ENV_FILE) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: process.env.ENV_FILE, override: false });
}

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL.includes("5436")) {
  console.error("REFUSING TO RUN: DATABASE_URL must point at the local dev DB on :5436.");
  process.exit(1);
}

const prisma = new PrismaClient();
const SYNTH_MODEL = "dev-synthetic-taste";
const TAG = "taste-seed";
const DIMS = 1024;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
const MOVIES = {
  scifi: [27205, 157336, 603, 78, 335984, 62, 329865, 264660, 1124, 77, 438631, 693134],
  crime: [680, 238, 240, 155, 550, 807, 274, 769, 1422, 496243, 6977],
  horror: [694, 493922, 419430, 138843, 539, 348, 1091, 447332],
  warm: [13, 120467, 194, 313369, 19913, 4348, 38, 152601, 508442, 862, 129, 372058],
};
const SERIES = [1396, 1399, 66732, 1668, 2316, 100088, 87108, 60059, 95396, 46648];

// ---------------------------------------------------------------------------
// Deterministic PRNG + synthetic vectors
// ---------------------------------------------------------------------------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussianVector(seedKey: string): number[] {
  const r = rng(hash(seedKey));
  const v = new Array<number>(DIMS);
  for (let i = 0; i < DIMS; i += 2) {
    const u1 = Math.max(r(), 1e-12);
    const u2 = r();
    const mag = Math.sqrt(-2 * Math.log(u1));
    v[i] = mag * Math.cos(2 * Math.PI * u2);
    if (i + 1 < DIMS) v[i + 1] = mag * Math.sin(2 * Math.PI * u2);
  }
  return v;
}
function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
function synthEmbedding(kind: string, id: number, genres: string[], keywords: string[]): number[] {
  const acc = new Array<number>(DIMS).fill(0);
  const add = (v: number[], w: number) => v.forEach((x, i) => (acc[i] += w * x));
  for (const g of genres) add(normalize(gaussianVector(`genre:${g}`)), 1 / Math.sqrt(genres.length || 1));
  for (const k of keywords.slice(0, 6)) add(normalize(gaussianVector(`kw:${k}`)), 0.35);
  add(normalize(gaussianVector(`title:${kind}:${id}`)), 0.45);
  return normalize(acc);
}

// ---------------------------------------------------------------------------
// Synthetic AI tags by genre (dev only)
// ---------------------------------------------------------------------------
type Mood = { pacing: string; intensity: string; tone: string; emotional: string };
const GENRE_AI: Record<string, { themes: string[]; vibes: string[]; mood: Mood }> = {
  "Science Fiction": { themes: ["Identity and memory", "Humanity vs technology", "Time and loss"], vibes: ["Mind-bending", "Awe-inspiring"], mood: { pacing: "steady", intensity: "medium", tone: "mixed", emotional: "medium" } },
  "Sci-Fi & Fantasy": { themes: ["Identity and memory", "Humanity vs technology"], vibes: ["Mind-bending"], mood: { pacing: "steady", intensity: "medium", tone: "mixed", emotional: "medium" } },
  Horror: { themes: ["Grief and trauma", "The monster within", "Isolation"], vibes: ["Dread-soaked", "Unsettling"], mood: { pacing: "slow", intensity: "high", tone: "dark", emotional: "heavy" } },
  Crime: { themes: ["Power and corruption", "Loyalty and betrayal", "Moral rot"], vibes: ["Gritty", "Slick"], mood: { pacing: "fast", intensity: "high", tone: "dark", emotional: "heavy" } },
  Thriller: { themes: ["Paranoia", "Obsession"], vibes: ["Tense", "Twisty"], mood: { pacing: "fast", intensity: "high", tone: "dark", emotional: "medium" } },
  Mystery: { themes: ["Hidden truths"], vibes: ["Puzzle-box"], mood: { pacing: "steady", intensity: "medium", tone: "dark", emotional: "medium" } },
  Comedy: { themes: ["Found family", "Awkward love"], vibes: ["Cozy", "Quirky"], mood: { pacing: "fast", intensity: "low", tone: "light", emotional: "light" } },
  Romance: { themes: ["Love and timing", "Second chances"], vibes: ["Swoony", "Bittersweet"], mood: { pacing: "steady", intensity: "low", tone: "light", emotional: "medium" } },
  Animation: { themes: ["Growing up", "Wonder"], vibes: ["Whimsical", "Heartwarming"], mood: { pacing: "steady", intensity: "low", tone: "light", emotional: "medium" } },
  Family: { themes: ["Growing up"], vibes: ["Heartwarming"], mood: { pacing: "steady", intensity: "low", tone: "light", emotional: "light" } },
  Drama: { themes: ["Family and duty", "Ambition and its cost"], vibes: ["Intimate", "Slow-burn"], mood: { pacing: "slow", intensity: "medium", tone: "mixed", emotional: "heavy" } },
  Action: { themes: ["Heroism", "Survival"], vibes: ["Propulsive", "Epic"], mood: { pacing: "fast", intensity: "high", tone: "mixed", emotional: "medium" } },
  "Action & Adventure": { themes: ["Heroism", "Survival"], vibes: ["Epic"], mood: { pacing: "fast", intensity: "high", tone: "mixed", emotional: "medium" } },
  Adventure: { themes: ["Survival", "The journey home"], vibes: ["Epic"], mood: { pacing: "fast", intensity: "medium", tone: "mixed", emotional: "medium" } },
  Fantasy: { themes: ["Destiny", "Wonder"], vibes: ["Enchanting"], mood: { pacing: "steady", intensity: "medium", tone: "mixed", emotional: "medium" } },
};
const MOOD_PRIORITY = ["Horror", "Crime", "Thriller", "Science Fiction", "Sci-Fi & Fantasy", "Animation", "Romance", "Comedy", "Drama", "Mystery", "Action", "Action & Adventure", "Adventure", "Fantasy", "Family"];

// ---------------------------------------------------------------------------

async function hydrateCatalog(): Promise<void> {
  if (!process.env.TMDB_API_KEY) {
    console.log("  (no TMDB_API_KEY — skipping hydration; using whatever is in PG)");
    return;
  }
  const { hydrateMovie, hydrateSeries } = await import("../src/server/services/hydration");
  const movieIds = Object.values(MOVIES).flat();
  const haveM = new Set(
    (await prisma.movieGenre.findMany({ where: { movieId: { in: movieIds } }, select: { movieId: true } })).map((r) => r.movieId)
  );
  const haveS = new Set(
    (await prisma.seriesGenre.findMany({ where: { seriesId: { in: SERIES } }, select: { seriesId: true } })).map((r) => r.seriesId)
  );
  for (const id of movieIds.filter((x) => !haveM.has(x))) {
    try {
      await hydrateMovie(id, { forceRefresh: true, skipLambda: true });
      process.stdout.write(".");
    } catch (e: unknown) {
      console.warn(`\n  movie ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const id of SERIES.filter((x) => !haveS.has(x))) {
    try {
      await hydrateSeries(id, { forceRefresh: true, skipLambda: true });
      process.stdout.write("s");
    } catch (e: unknown) {
      console.warn(`\n  series ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log("");
}

async function synthesize(): Promise<{ embeddings: number; ai: number }> {
  let embeddings = 0;
  let ai = 0;
  const movies = await prisma.$queryRaw<Array<{ id: number; has_emb: boolean; has_ai: boolean }>>`
    SELECT m.id, (m.embedding IS NOT NULL) AS has_emb, EXISTS (SELECT 1 FROM ai_data a WHERE a.movie_id = m.id) AS has_ai
    FROM movies m WHERE EXISTS (SELECT 1 FROM movie_genres g WHERE g.movie_id = m.id)`;
  const series = await prisma.$queryRaw<Array<{ id: number; has_emb: boolean; has_ai: boolean }>>`
    SELECT s.id, (s.embedding IS NOT NULL) AS has_emb, EXISTS (SELECT 1 FROM ai_data a WHERE a.series_id = s.id) AS has_ai
    FROM series s WHERE EXISTS (SELECT 1 FROM series_genres g WHERE g.series_id = s.id)`;

  for (const [kind, rows] of [["movie", movies], ["series", series]] as const) {
    for (const r of rows) {
      const genres = (
        kind === "movie"
          ? await prisma.movieGenre.findMany({ where: { movieId: r.id }, select: { genre: { select: { name: true } } } })
          : await prisma.seriesGenre.findMany({ where: { seriesId: r.id }, select: { genre: { select: { name: true } } } })
      ).map((g) => g.genre.name);
      const keywords = (
        kind === "movie"
          ? await prisma.movieKeyword.findMany({ where: { movieId: r.id }, select: { keyword: { select: { name: true } } }, take: 6 })
          : await prisma.seriesKeyword.findMany({ where: { seriesId: r.id }, select: { keyword: { select: { name: true } } }, take: 6 })
      ).map((k) => k.keyword.name);

      if (!r.has_emb) {
        const lit = `[${synthEmbedding(kind, r.id, genres, keywords).map((x) => x.toFixed(6)).join(",")}]`;
        if (kind === "movie") {
          await prisma.$executeRaw`UPDATE movies SET embedding = ${lit}::vector WHERE id = ${r.id} AND embedding IS NULL`;
        } else {
          await prisma.$executeRaw`UPDATE series SET embedding = ${lit}::vector WHERE id = ${r.id} AND embedding IS NULL`;
        }
        embeddings++;
      }
      if (!r.has_ai) {
        const known = genres.filter((g) => GENRE_AI[g]);
        if (known.length === 0) continue;
        const pick = rng(hash(`${kind}:${r.id}`));
        const themes = [...new Set(known.flatMap((g) => GENRE_AI[g].themes))]
          .sort(() => pick() - 0.5)
          .slice(0, 3);
        const vibes = [...new Set(known.flatMap((g) => GENRE_AI[g].vibes))].slice(0, 2);
        const moodGenre = MOOD_PRIORITY.find((g) => known.includes(g)) ?? known[0];
        const mood = GENRE_AI[moodGenre].mood;
        const insights: Prisma.AiInsightCreateWithoutAiDataInput[] = [
          ...themes.map((t) => ({ category: "THEME" as const, text: t })),
          ...vibes.map((t) => ({ category: "VIBE" as const, text: t })),
          ...(Object.entries(mood) as [string, string][]).map(([sub, text]) => ({
            category: "MOOD" as const,
            subcategory: sub,
            text,
          })),
        ];
        await prisma.aiData.create({
          data: {
            ...(kind === "movie" ? { movieId: r.id } : { seriesId: r.id }),
            modelId: SYNTH_MODEL,
            generatedAt: new Date(),
            insights: { create: insights },
          },
        });
        ai++;
      }
    }
  }
  return { embeddings, ai };
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
interface MovieEntry {
  id: number;
  score?: number;
  liked?: boolean;
  watches?: number;
  private?: boolean;
  daysAgo: number;
}
interface SeriesEntry {
  id: number;
  score?: number;
  liked?: boolean;
  episodes: number;
  status: "WATCHING" | "COMPLETED" | "CAUGHT_UP" | "DROPPED";
  private?: boolean;
  daysAgo: number;
}
interface Persona {
  username: string;
  favorites: number[];
  movies: MovieEntry[];
  series: SeriesEntry[];
  watchlist: number[];
}

const PERSONAS: Persona[] = [
  {
    // Cerebral sci-fi first, thrillers second; dislikes the warm/romcom pile.
    // PRIVATE: a horror binge (must NOT show on her public profile).
    username: "cinephile_ada",
    favorites: [27205, 157336, 62, 329865],
    movies: [
      { id: 27205, score: 10, liked: true, watches: 3, daysAgo: 10 },
      { id: 157336, score: 10, liked: true, watches: 2, daysAgo: 30 },
      { id: 603, score: 9, watches: 2, daysAgo: 45 },
      { id: 78, score: 9, liked: true, daysAgo: 80 },
      { id: 335984, score: 9, daysAgo: 95 },
      { id: 62, score: 10, liked: true, daysAgo: 120 },
      { id: 329865, score: 9, liked: true, daysAgo: 140 },
      { id: 264660, score: 8, daysAgo: 160 },
      { id: 1124, score: 9, daysAgo: 200 },
      { id: 77, score: 8, daysAgo: 240 },
      { id: 438631, score: 8, daysAgo: 260 },
      { id: 693134, score: 9, daysAgo: 20 },
      { id: 807, score: 8, daysAgo: 300 },
      { id: 274, score: 7, daysAgo: 330 },
      { id: 496243, score: 9, daysAgo: 360 },
      { id: 313369, score: 4, daysAgo: 400 },
      { id: 4348, score: 3, daysAgo: 410 },
      { id: 19913, score: 4, daysAgo: 420 },
      // private horror binge
      { id: 694, score: 10, liked: true, private: true, daysAgo: 5 },
      { id: 493922, score: 10, liked: true, private: true, daysAgo: 6 },
      { id: 419430, score: 9, private: true, daysAgo: 7 },
      { id: 138843, score: 9, private: true, daysAgo: 8 },
      { id: 1091, score: 9, private: true, daysAgo: 9 },
    ],
    series: [
      { id: 95396, score: 9, liked: true, episodes: 9, status: "CAUGHT_UP", daysAgo: 15 },
      { id: 66732, score: 7, episodes: 8, status: "WATCHING", daysAgo: 50 },
    ],
    watchlist: [348, 447332],
  },
  {
    // Warm comedies, romance, animation, comfort sitcoms. Drops grim prestige TV.
    // PRIVATE: true-crime / crime series.
    username: "binge_bea",
    favorites: [194, 120467, 129, 508442],
    movies: [
      { id: 194, score: 10, liked: true, watches: 3, daysAgo: 12 },
      { id: 120467, score: 9, liked: true, daysAgo: 30 },
      { id: 129, score: 10, liked: true, watches: 2, daysAgo: 60 },
      { id: 508442, score: 9, liked: true, daysAgo: 70 },
      { id: 313369, score: 9, daysAgo: 90 },
      { id: 19913, score: 8, daysAgo: 110 },
      { id: 4348, score: 9, daysAgo: 130 },
      { id: 38, score: 8, daysAgo: 150 },
      { id: 152601, score: 8, daysAgo: 170 },
      { id: 862, score: 9, daysAgo: 190 },
      { id: 372058, score: 9, liked: true, daysAgo: 210 },
      { id: 13, score: 8, daysAgo: 230 },
      { id: 694, score: 3, daysAgo: 400 },
      { id: 807, score: 4, daysAgo: 410 },
    ],
    series: [
      { id: 1668, score: 10, liked: true, episodes: 24, status: "COMPLETED", daysAgo: 25 },
      { id: 2316, score: 9, liked: true, episodes: 22, status: "COMPLETED", daysAgo: 40 },
      { id: 1399, score: 4, episodes: 6, status: "DROPPED", daysAgo: 300 },
      { id: 1396, episodes: 10, status: "WATCHING", daysAgo: 8 },
      { id: 46648, score: 9, episodes: 8, status: "COMPLETED", private: true, daysAgo: 3 },
      { id: 87108, score: 9, episodes: 5, status: "COMPLETED", private: true, daysAgo: 4 },
    ],
    watchlist: [62, 78],
  },
  {
    // Crime + horror classics; a TOUGH rater (scores below TMDB).
    username: "critic_cy",
    favorites: [238, 694, 769, 6977],
    movies: [
      { id: 238, score: 9, liked: true, watches: 4, daysAgo: 14 },
      { id: 240, score: 8, daysAgo: 40 },
      { id: 694, score: 8, liked: true, watches: 2, daysAgo: 60 },
      { id: 769, score: 8, liked: true, daysAgo: 80 },
      { id: 6977, score: 8, daysAgo: 100 },
      { id: 680, score: 7, daysAgo: 120 },
      { id: 1422, score: 7, daysAgo: 140 },
      { id: 807, score: 7, daysAgo: 160 },
      { id: 274, score: 7, daysAgo: 180 },
      { id: 539, score: 8, daysAgo: 200 },
      { id: 348, score: 7, daysAgo: 220 },
      { id: 1091, score: 8, daysAgo: 240 },
      { id: 493922, score: 6, daysAgo: 260 },
      { id: 155, score: 6, daysAgo: 280 },
      { id: 550, score: 5, daysAgo: 300 },
      { id: 13, score: 3, daysAgo: 320 },
      { id: 862, score: 4, daysAgo: 340 },
      { id: 313369, score: 2, daysAgo: 360 },
    ],
    series: [
      { id: 60059, score: 8, liked: true, episodes: 20, status: "COMPLETED", daysAgo: 30 },
      { id: 87108, score: 8, episodes: 5, status: "COMPLETED", daysAgo: 90 },
      { id: 1396, score: 9, episodes: 30, status: "COMPLETED", daysAgo: 200 },
    ],
    watchlist: [496243],
  },
  {
    // The local test-auth user (googleId test-local-user, /api/test-auth/login) so
    // an E2E session can see its OWN profile. PRIVATE: three romcoms.
    username: "local_tester",
    favorites: [603, 680],
    movies: [
      { id: 603, score: 9, liked: true, daysAgo: 5 },
      { id: 157336, score: 9, daysAgo: 20 },
      { id: 78, score: 8, daysAgo: 40 },
      { id: 335984, score: 8, daysAgo: 60 },
      { id: 264660, score: 9, daysAgo: 80 },
      { id: 1124, score: 8, daysAgo: 100 },
      { id: 680, score: 10, liked: true, watches: 2, daysAgo: 120 },
      { id: 807, score: 8, daysAgo: 140 },
      { id: 769, score: 9, daysAgo: 160 },
      { id: 1422, score: 8, daysAgo: 180 },
      { id: 6977, score: 7, daysAgo: 200 },
      { id: 155, score: 8, daysAgo: 220 },
      { id: 4348, score: 10, liked: true, private: true, daysAgo: 3 },
      { id: 19913, score: 9, private: true, daysAgo: 4 },
      { id: 313369, score: 9, private: true, daysAgo: 6 },
    ],
    series: [{ id: 60059, score: 9, episodes: 12, status: "WATCHING", daysAgo: 10 }],
    watchlist: [62],
  },
];

const DAY = 86_400_000;

async function seedPersona(p: Persona, userId: number): Promise<{ events: number; ratings: number }> {
  await prisma.watchEvent.deleteMany({ where: { userId, tags: { has: TAG } } });
  const movieIds = new Set(
    (await prisma.movie.findMany({ where: { id: { in: p.movies.map((m) => m.id) } }, select: { id: true } })).map((m) => m.id)
  );
  const seriesIds = new Set(
    (await prisma.series.findMany({ where: { id: { in: p.series.map((s) => s.id) } }, select: { id: true } })).map((s) => s.id)
  );
  const now = Date.now();
  const events: Prisma.WatchEventCreateManyInput[] = [];
  let ratings = 0;

  for (const m of p.movies) {
    if (!movieIds.has(m.id)) continue;
    const n = m.watches ?? 1;
    for (let i = 0; i < n; i++) {
      events.push({
        userId,
        movieId: m.id,
        mediaType: "MOVIE",
        // i = 0 is the first (oldest) viewing; later viewings are rewatches.
        watchedAt: new Date(now - (m.daysAgo + (n - 1 - i) * 90) * DAY),
        watchedAtPrecision: "DATE",
        isRewatch: i > 0,
        cycle: i + 1,
        isPrivate: m.private === true,
        source: "LOGGED",
        tags: [TAG],
      });
    }
    if (m.score !== undefined || m.liked) {
      const data = { score: m.score ?? null, liked: m.liked === true, ratedAt: new Date(now - m.daysAgo * DAY), mediaType: "MOVIE" as const };
      await prisma.userRating.upsert({
        where: { userId_movieId: { userId, movieId: m.id } },
        create: { userId, movieId: m.id, ...data },
        update: data,
      });
      ratings++;
    }
  }

  for (const s of p.series) {
    if (!seriesIds.has(s.id)) continue;
    for (let ep = 1; ep <= s.episodes; ep++) {
      events.push({
        userId,
        seriesId: s.id,
        mediaType: "SERIES",
        seasonNumber: 1 + Math.floor((ep - 1) / 10),
        episodeNumber: ((ep - 1) % 10) + 1,
        watchedAt: new Date(now - (s.daysAgo + (s.episodes - ep)) * DAY),
        watchedAtPrecision: "DATE",
        isPrivate: s.private === true,
        source: "LOGGED",
        tags: [TAG],
      });
    }
    const lastEp = ((s.episodes - 1) % 10) + 1;
    const lastSeason = 1 + Math.floor((s.episodes - 1) / 10);
    await prisma.seriesProgress.upsert({
      where: { userId_seriesId: { userId, seriesId: s.id } },
      create: {
        userId, seriesId: s.id, status: s.status, statusIsManual: true,
        lastSeasonNumber: lastSeason, lastEpisodeNumber: lastEp, maxSeasonNumber: lastSeason,
        maxEpisodeNumber: lastEp, episodesWatched: s.episodes,
      },
      update: {
        status: s.status, statusIsManual: true, lastSeasonNumber: lastSeason, lastEpisodeNumber: lastEp,
        maxSeasonNumber: lastSeason, maxEpisodeNumber: lastEp, episodesWatched: s.episodes,
      },
    });
    if (s.score !== undefined || s.liked) {
      const data = { score: s.score ?? null, liked: s.liked === true, ratedAt: new Date(now - s.daysAgo * DAY), mediaType: "SERIES" as const };
      const existing = await prisma.userRating.findFirst({
        where: { userId, seriesId: s.id, seasonNumber: null, episodeNumber: null },
        select: { id: true },
      });
      if (existing) await prisma.userRating.update({ where: { id: existing.id }, data });
      else await prisma.userRating.create({ data: { userId, seriesId: s.id, ...data } });
      ratings++;
    }
  }
  await prisma.watchEvent.createMany({ data: events });

  for (const id of p.watchlist) {
    if (!(await prisma.movie.findUnique({ where: { id }, select: { id: true } }))) continue;
    await prisma.watchlistItem.upsert({
      where: { userId_movieId: { userId, movieId: id } },
      create: { userId, movieId: id },
      update: {},
    });
  }

  // Four Favorites (replace; via the app helper so it marks taste dirty too).
  const { setFourFavorites } = await import("../src/server/db/postgres/social/lists");
  const favs = p.favorites.filter((id) => movieIds.has(id)).slice(0, 4);
  await setFourFavorites(userId, favs.map((movieId) => ({ movieId })));

  await prisma.$executeRaw`
    INSERT INTO user_stats (user_id, stats, computed_at, dirty) VALUES (${userId}, '{}'::jsonb, now(), true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true`;
  await prisma.$executeRaw`
    INSERT INTO user_taste_profiles (user_id, dirty) VALUES (${userId}, true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true, updated_at = clock_timestamp()`;
  return { events: events.length, ratings };
}

async function main(): Promise<void> {
  console.log("1/4 Hydrating curated catalog (TMDB-only)...");
  await hydrateCatalog();

  console.log("2/4 Synthetic dev embeddings + AI tags (only where missing)...");
  const synth = await synthesize();
  console.log(`    embeddings set: ${synth.embeddings}, ai_data created: ${synth.ai}`);

  console.log("3/4 Persona histories...");
  // Give the test-auth user a handle (only if it has none) so it owns a profile.
  await prisma.user.updateMany({
    where: { googleId: "test-local-user", username: null },
    data: { username: "local_tester", name: "Local Tester" },
  });
  const users = await prisma.user.findMany({
    where: { username: { in: PERSONAS.map((p) => p.username) } },
    select: { id: true, username: true },
  });
  const byName = new Map(users.map((u) => [u.username ?? "", u.id]));
  for (const p of PERSONAS) {
    const id = byName.get(p.username);
    if (!id) {
      console.warn(`    @${p.username} missing — run seed-social-demo.ts first`);
      continue;
    }
    const c = await seedPersona(p, id);
    console.log(`    @${p.username}: ${c.events} watch events, ${c.ratings} ratings`);
  }

  console.log("4/4 Recompute stats + taste...");
  const { refreshUserStatsSnapshot } = await import("../src/server/db/postgres/social/stats");
  const { recomputeTasteNow } = await import("../src/server/services/taste");
  const { prisma: shared } = await import("../src/server/db/postgres");
  for (const p of PERSONAS) {
    const id = byName.get(p.username);
    if (!id) continue;
    await refreshUserStatsSnapshot(id);
    const r = await recomputeTasteNow(id);
    console.log(
      `    @${p.username.padEnd(14)} ${String(r.ms).padStart(4)}ms  positives full=${r.full.positiveCount} public=${r.public.positiveCount}  clusters=${r.public.clusters.length}  axes=${r.public.axes.map((a) => a.key).join(",")}`
    );
  }
  await shared.$disconnect();
}

main()
  .catch((error: unknown) => {
    console.error("SEED FAILED:", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
