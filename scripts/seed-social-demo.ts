/**
 * seed-social-demo.ts — LOCAL REVIEW KIT seed for the social features
 * (Phase 0 + Phase 1). Populates the LOCAL dev DB with real catalog titles +
 * three demo users + a realistic spread of social data so a human can run the
 * app locally and click through every feature.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost:5436 (the dev
 * DB). NEVER point this at the prod-tunnel .env DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
 *     npx tsx scripts/seed-social-demo.ts
 *
 * Idempotent: safe to re-run. Demo users are upserted by googleId; all social
 * rows owned by the demo users are deleted and re-created on each run.
 *
 * Catalog path:
 *   - If TMDB_API_KEY is set → hydrateMovie/hydrateSeries(forceRefresh) does a
 *     full TMDB upsert (posters/backdrops/episodes all real).
 *   - Otherwise → minimal catalog rows are inserted directly via Prisma with
 *     hardcoded (stable) TMDB poster/backdrop paths so images still resolve via
 *     the CDN, plus a couple of seasons+episodes per series.
 * The chosen path is detected and logged.
 */
import { PrismaClient, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Guard: dev DB only.
// ---------------------------------------------------------------------------
const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL.includes("5436")) {
  console.error(
    "REFUSING TO RUN: DATABASE_URL must point at the local dev DB on port 5436.\n" +
      "  Got: " +
      (DB_URL ? DB_URL.replace(/:[^:@/]+@/, ":****@") : "(unset)") +
      "\n  Expected something like postgresql://dev:dev@localhost:5436/moviebrowser",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Catalog definitions. Hardcoded poster/backdrop paths are stable TMDB file
// paths for the offline fallback; the hydration path overwrites them with the
// live TMDB values.
// ---------------------------------------------------------------------------
interface MovieSeed {
  id: number;
  title: string;
  overview: string;
  releaseDate: string;
  runtime: number;
  posterPath: string;
  backdropPath: string;
}
interface SeriesSeed {
  id: number;
  name: string;
  overview: string;
  firstAirDate: string;
  posterPath: string;
  backdropPath: string;
  seasons: { seasonNumber: number; name: string; episodes: number; episodeRuntime: number }[];
}

const MOVIES: MovieSeed[] = [
  {
    id: 550,
    title: "Fight Club",
    overview:
      "A ticking-time-bomb insomniac and a slippery soap salesman channel male aggression into a shocking new form of therapy.",
    releaseDate: "1999-10-15",
    runtime: 139,
    posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    backdropPath: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
  },
  {
    id: 27205,
    title: "Inception",
    overview:
      "Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life.",
    releaseDate: "2010-07-16",
    runtime: 148,
    posterPath: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    backdropPath: "/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
  },
  {
    id: 155,
    title: "The Dark Knight",
    overview:
      "Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent, until a rising criminal known as the Joker throws Gotham into chaos.",
    releaseDate: "2008-07-18",
    runtime: 152,
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdropPath: "/dqK9Hag1054tghRQSqLSfrkvQnA.jpg",
  },
  {
    id: 13,
    title: "Forrest Gump",
    overview:
      "A man with a low IQ has accomplished great things in his life and been present during significant historic events—in each case, far exceeding what anyone imagined he could do.",
    releaseDate: "1994-06-23",
    runtime: 142,
    posterPath: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    backdropPath: "/3h1JZGDhZ8nzxdgvkxha0qBqi05.jpg",
  },
  {
    id: 603,
    title: "The Matrix",
    overview:
      "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
    releaseDate: "1999-03-30",
    runtime: 136,
    posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    backdropPath: "/icmmSD4vTTDKOq2vvdulafOGw93.jpg",
  },
];

const SERIES: SeriesSeed[] = [
  {
    id: 1396,
    name: "Breaking Bad",
    overview:
      "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine to secure his family's future.",
    firstAirDate: "2008-01-20",
    posterPath: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    backdropPath: "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodes: 7, episodeRuntime: 47 },
      { seasonNumber: 2, name: "Season 2", episodes: 13, episodeRuntime: 47 },
    ],
  },
  {
    id: 1399,
    name: "Game of Thrones",
    overview:
      "Seven noble families fight for control of the mythical land of Westeros. Friction between the houses leads to full-scale war.",
    firstAirDate: "2011-04-17",
    posterPath: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    backdropPath: "/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodes: 10, episodeRuntime: 57 },
      { seasonNumber: 2, name: "Season 2", episodes: 10, episodeRuntime: 56 },
    ],
  },
  {
    id: 66732,
    name: "Stranger Things",
    overview:
      "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.",
    firstAirDate: "2016-07-15",
    posterPath: "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
    backdropPath: "/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodes: 8, episodeRuntime: 50 },
      { seasonNumber: 2, name: "Season 2", episodes: 9, episodeRuntime: 50 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalog seeding.
// ---------------------------------------------------------------------------
async function seedCatalogViaHydration(): Promise<void> {
  // Lazy import so the heavy hydration graph (and its TMDB client) is only
  // loaded when a key is present.
  const { hydrateMovie, hydrateSeries } = await import(
    "../src/server/services/hydration"
  );
  for (const m of MOVIES) {
    console.log(`  hydrating movie ${m.id} (${m.title})...`);
    await hydrateMovie(m.id, { forceRefresh: true, skipLambda: true });
  }
  for (const s of SERIES) {
    console.log(`  hydrating series ${s.id} (${s.name})...`);
    await hydrateSeries(s.id, { forceRefresh: true, skipLambda: true });
  }
}

async function seedCatalogViaFallback(): Promise<void> {
  for (const m of MOVIES) {
    await prisma.movie.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        title: m.title,
        overview: m.overview,
        posterPath: m.posterPath,
        backdropPath: m.backdropPath,
        releaseDate: new Date(`${m.releaseDate}T00:00:00Z`),
        runtime: m.runtime,
        popularity: 50,
        status: "Released",
      },
      update: {
        title: m.title,
        overview: m.overview,
        posterPath: m.posterPath,
        backdropPath: m.backdropPath,
        releaseDate: new Date(`${m.releaseDate}T00:00:00Z`),
        runtime: m.runtime,
      },
    });
  }

  for (const s of SERIES) {
    const totalEpisodes = s.seasons.reduce((sum, sn) => sum + sn.episodes, 0);
    await prisma.series.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        overview: s.overview,
        posterPath: s.posterPath,
        backdropPath: s.backdropPath,
        firstAirDate: new Date(`${s.firstAirDate}T00:00:00Z`),
        popularity: 50,
        status: "Ended",
        numberOfSeasons: s.seasons.length,
        numberOfEpisodes: totalEpisodes,
        episodeRunTime: [s.seasons[0]?.episodeRuntime ?? 45],
      },
      update: {
        name: s.name,
        overview: s.overview,
        posterPath: s.posterPath,
        backdropPath: s.backdropPath,
        firstAirDate: new Date(`${s.firstAirDate}T00:00:00Z`),
        numberOfSeasons: s.seasons.length,
        numberOfEpisodes: totalEpisodes,
      },
    });

    for (const sn of s.seasons) {
      const season = await prisma.season.upsert({
        where: { seriesId_seasonNumber: { seriesId: s.id, seasonNumber: sn.seasonNumber } },
        create: {
          seriesId: s.id,
          seasonNumber: sn.seasonNumber,
          name: sn.name,
          episodeCount: sn.episodes,
        },
        update: { name: sn.name, episodeCount: sn.episodes },
      });
      for (let ep = 1; ep <= sn.episodes; ep++) {
        await prisma.episode.upsert({
          where: { seasonId_episodeNumber: { seasonId: season.id, episodeNumber: ep } },
          create: {
            seasonId: season.id,
            episodeNumber: ep,
            name: `${s.name} S${sn.seasonNumber}E${ep}`,
            runtime: sn.episodeRuntime,
            episodeType: ep === sn.episodes ? "finale" : "standard",
          },
          update: { runtime: sn.episodeRuntime },
        });
      }
    }
  }
}

/** Returns "hydration" or "fallback" depending on which path ran. */
async function seedCatalog(): Promise<"hydration" | "fallback"> {
  if (process.env.TMDB_API_KEY) {
    try {
      await seedCatalogViaHydration();
      return "hydration";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  hydration path failed (${message}); falling back to direct rows.`);
    }
  }
  await seedCatalogViaFallback();
  return "fallback";
}

// ---------------------------------------------------------------------------
// Demo users.
// ---------------------------------------------------------------------------
interface DemoUserSeed {
  googleId: string;
  email: string;
  username: string;
  name: string;
  bio: string;
  accent: string;
  location: string;
  links: string[];
  backdrop: { mediaType: "movie" | "series"; tmdbId: number; imagePath: string; titleName: string };
}

const DEMO_USERS: DemoUserSeed[] = [
  {
    googleId: "demo-cinephile-ada",
    email: "ada@demo.local",
    username: "cinephile_ada",
    name: "Ada Lumière",
    bio: "Slow-cinema apologist. Will defend a 3-hour runtime to the death.",
    accent: "violet",
    location: "Paris, FR",
    links: ["https://letterboxd.com/ada", "https://example.com/ada"],
    backdrop: {
      mediaType: "movie",
      tmdbId: 27205,
      imagePath: MOVIES[1].backdropPath,
      titleName: "Inception",
    },
  },
  {
    googleId: "demo-binge-bea",
    email: "bea@demo.local",
    username: "binge_bea",
    name: "Bea Watanabe",
    bio: "One more episode. (It is never one more episode.)",
    accent: "ocean",
    location: "Tokyo, JP",
    links: ["https://example.com/bea"],
    backdrop: {
      mediaType: "series",
      tmdbId: 1396,
      imagePath: SERIES[0].backdropPath,
      titleName: "Breaking Bad",
    },
  },
  {
    googleId: "demo-critic-cy",
    email: "cy@demo.local",
    username: "critic_cy",
    name: "Cy Roberts",
    bio: "Stars are arbitrary, but here are mine anyway.",
    accent: "golden",
    location: "Brooklyn, NY",
    links: [],
    backdrop: {
      mediaType: "movie",
      tmdbId: 155,
      imagePath: MOVIES[2].backdropPath,
      titleName: "The Dark Knight",
    },
  },
];

async function seedUsers(): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const metadata = {
      profile: {
        backdrop: u.backdrop,
        accent: u.accent,
        links: u.links,
        location: u.location,
      },
      preferences: { logPrivatelyByDefault: false },
    } as unknown as Prisma.InputJsonValue;

    const user = await prisma.user.upsert({
      where: { googleId: u.googleId },
      create: {
        googleId: u.googleId,
        email: u.email,
        username: u.username,
        name: u.name,
        bio: u.bio,
        isPublic: true,
        metadata,
      },
      update: {
        email: u.email,
        username: u.username,
        name: u.name,
        bio: u.bio,
        isPublic: true,
        metadata,
      },
    });
    ids[u.username] = user.id;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Social data. Everything owned by the demo users is wiped first (idempotency)
// then re-created. Catalog rows are NOT touched here.
// ---------------------------------------------------------------------------
async function wipeDemoSocialData(userIds: number[]): Promise<void> {
  // Order matters for FKs: reactions/reports → comments; list_items → lists;
  // notifications/follows/blocks reference users directly.
  // Reports filed by demo users OR on demo comments/reviews are cleared.
  const demoComments = await prisma.comment.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const demoReviews = await prisma.userReview.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const commentIds = demoComments.map((c) => c.id);
  const reviewIds = demoReviews.map((r) => r.id);

  await prisma.report.deleteMany({
    where: {
      OR: [
        { reporterId: { in: userIds } },
        { commentId: { in: commentIds } },
        { reviewId: { in: reviewIds } },
      ],
    },
  });
  await prisma.reaction.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { commentId: { in: commentIds } }] },
  });
  // Replies first (parentId), then roots — delete all demo comments in two passes.
  await prisma.comment.deleteMany({ where: { userId: { in: userIds }, parentId: { not: null } } });
  await prisma.comment.deleteMany({ where: { userId: { in: userIds } } });

  await prisma.userReview.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRating.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.watchEvent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.seriesProgress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userStats.deleteMany({ where: { userId: { in: userIds } } });

  const demoLists = await prisma.list.findMany({
    where: { ownerId: { in: userIds } },
    select: { id: true },
  });
  const listIds = demoLists.map((l) => l.id);
  await prisma.listItem.deleteMany({ where: { listId: { in: listIds } } });
  await prisma.list.deleteMany({ where: { ownerId: { in: userIds } } });

  await prisma.notification.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { actorId: { in: userIds } }] },
  });
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
  });
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
  });
}

interface Counts {
  watchEvents: number;
  ratings: number;
  seriesProgress: number;
  reviews: number;
  comments: number;
  follows: number;
  lists: number;
  notifications: number;
}

async function seedSocialData(ids: Record<string, number>): Promise<Counts> {
  const ada = ids["cinephile_ada"];
  const bea = ids["binge_bea"];
  const cy = ids["critic_cy"];

  const counts: Counts = {
    watchEvents: 0,
    ratings: 0,
    seriesProgress: 0,
    reviews: 0,
    comments: 0,
    follows: 0,
    lists: 0,
    notifications: 0,
  };

  // -- WATCH EVENTS (the diary) -------------------------------------------
  // Movies (ada + cy), an episode-level series watch with progress, a rewatch,
  // and one series-level COMPLETED event (granularity unknown).
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000);

  const watchEvents: Prisma.WatchEventCreateManyInput[] = [
    // Ada — five film watches incl. one rewatch of The Matrix.
    { userId: ada, movieId: 550, watchedAt: daysAgo(2), source: "LOGGED", note: "Still hits." },
    { userId: ada, movieId: 27205, watchedAt: daysAgo(9), source: "LOGGED" },
    { userId: ada, movieId: 603, watchedAt: daysAgo(40), source: "LOGGED" },
    { userId: ada, movieId: 603, watchedAt: daysAgo(1), source: "LOGGED", isRewatch: true, note: "Rewatch — caught the Baudrillard nods this time." },
    { userId: ada, movieId: 13, watchedAt: daysAgo(70), source: "LOGGED" },
    // Bea — Breaking Bad S1 fully + into S2 (currently WATCHING).
    ...[1, 2, 3, 4, 5, 6, 7].map((ep) => ({
      userId: bea,
      seriesId: 1396,
      seasonNumber: 1,
      episodeNumber: ep,
      watchedAt: daysAgo(20 - ep),
      source: "LOGGED" as const,
    })),
    ...[1, 2, 3].map((ep) => ({
      userId: bea,
      seriesId: 1396,
      seasonNumber: 2,
      episodeNumber: ep,
      watchedAt: daysAgo(13 - ep),
      source: "LOGGED" as const,
    })),
    // Bea — Game of Thrones, finished (series-level COMPLETED, granularity unknown).
    { userId: bea, seriesId: 1399, watchedAt: daysAgo(120), source: "IMPORT" as const },
    // Cy — a couple of films.
    { userId: cy, movieId: 155, watchedAt: daysAgo(5), source: "LOGGED" as const },
    { userId: cy, movieId: 27205, watchedAt: daysAgo(33), source: "LOGGED" as const },
  ];
  const we = await prisma.watchEvent.createMany({ data: watchEvents });
  counts.watchEvents = we.count;

  // -- USER RATINGS (score 1-10 + thumb) ----------------------------------
  const ratings: Prisma.UserRatingCreateManyInput[] = [
    { userId: ada, movieId: 550, score: 9, rating: 1, ratedAt: daysAgo(2) },
    { userId: ada, movieId: 603, score: 10, rating: 1, ratedAt: daysAgo(1) },
    { userId: ada, movieId: 13, score: 7, rating: 1, ratedAt: daysAgo(70) },
    { userId: ada, movieId: 27205, score: 8, rating: 1, ratedAt: daysAgo(9) },
    { userId: cy, movieId: 155, score: 10, rating: 1, ratedAt: daysAgo(5) },
    { userId: cy, movieId: 27205, score: 6, rating: -1, ratedAt: daysAgo(33) },
    { userId: bea, seriesId: 1396, score: 10, rating: 1, ratedAt: daysAgo(12) },
    { userId: bea, seriesId: 1399, score: 7, rating: 1, ratedAt: daysAgo(120) },
  ];
  const ur = await prisma.userRating.createMany({ data: ratings });
  counts.ratings = ur.count;

  // -- SERIES PROGRESS (materialized watermark) ---------------------------
  // Bea: Breaking Bad WATCHING (watermark S2E3); GoT COMPLETED.
  await prisma.seriesProgress.create({
    data: {
      userId: bea,
      seriesId: 1396,
      status: "WATCHING",
      lastSeasonNumber: 2,
      lastEpisodeNumber: 3,
      episodesWatched: 10,
      maxSeasonNumber: 2,
      maxEpisodeNumber: 3,
    },
  });
  await prisma.seriesProgress.create({
    data: {
      userId: bea,
      seriesId: 1399,
      status: "COMPLETED",
      statusIsManual: true,
      lastSeasonNumber: 8,
      lastEpisodeNumber: 6,
      episodesWatched: 73,
      maxSeasonNumber: 8,
      maxEpisodeNumber: 6,
    },
  });
  counts.seriesProgress = 2;

  // -- USER REVIEWS (published) -------------------------------------------
  // One non-spoiler PUBLISHED (ada/Fight Club), one spoiler PUBLISHED (cy/Dark Knight).
  await prisma.userReview.create({
    data: {
      userId: ada,
      movieId: 550,
      body:
        "A film that rewards rewatches: the satire of consumerism lands harder every decade. Fincher's control of tone is immaculate, and the sound design alone justifies the runtime.",
      containsSpoilers: false,
      status: "PUBLISHED",
    },
  });
  await prisma.userReview.create({
    data: {
      userId: cy,
      movieId: 155,
      body:
        "Heath Ledger's Joker reframes the whole trilogy. SPOILER: the ferry sequence — neither boat detonating the other — is the thesis statement, and Dent's fall is the tragedy that earns the ending's lie.",
      containsSpoilers: true,
      status: "PUBLISHED",
    },
  });
  counts.reviews = 2;

  // -- COMMENTS -----------------------------------------------------------
  // Movie anchor (Fight Club): a NONE-scope root (anon-visible / ISR tier),
  // plus one reply from another user.
  const fcComment = await prisma.comment.create({
    data: {
      userId: bea,
      movieId: 550,
      body: "First rule of this thread: we absolutely talk about this thread.",
      spoilerScope: "NONE",
      status: "PUBLISHED",
      likeCount: 3,
    },
  });
  const fcReply = await prisma.comment.create({
    data: {
      userId: ada,
      movieId: 550,
      parentId: fcComment.id,
      body: "Seconded. The needle-drop in the final shot is unbeatable.",
      spoilerScope: "NONE",
      status: "PUBLISHED",
      likeCount: 1,
    },
  });

  // Episode anchor (Breaking Bad S2E1): an EPISODE-scope comment (progress-gated,
  // scopeSeason/scopeEpisode set) and an ENDING-scope comment, from different users.
  const bbEpisodeScoped = await prisma.comment.create({
    data: {
      userId: bea,
      seriesId: 1396,
      seasonNumber: 2,
      episodeNumber: 1,
      body: "That cold open with the pink teddy bear — instant dread. (Episode-scoped spoiler.)",
      spoilerScope: "EPISODE",
      scopeSeason: 2,
      scopeEpisode: 1,
      status: "PUBLISHED",
      likeCount: 2,
    },
  });
  const bbEndingScoped = await prisma.comment.create({
    data: {
      userId: cy,
      seriesId: 1396,
      seasonNumber: 2,
      episodeNumber: 1,
      body: "Knowing how the whole series lands, this episode reads completely differently. (Series-ending spoilers.)",
      spoilerScope: "ENDING",
      status: "PUBLISHED",
      likeCount: 0,
    },
  });
  counts.comments = 4;

  // A reaction (LIKE) on the Fight Club root comment, from cy.
  await prisma.reaction.create({ data: { userId: cy, commentId: fcComment.id, type: "LIKE" } });
  // A report on the ENDING-scope comment (feeds the admin moderation queue).
  await prisma.report.create({
    data: {
      reporterId: bea,
      commentId: bbEndingScoped.id,
      reason: "SPOILER",
      note: "Posted on an early-episode page without a heavy enough gate.",
      status: "OPEN",
    },
  });

  void fcReply;
  void bbEpisodeScoped;

  // -- FOLLOWS ------------------------------------------------------------
  // ada ↔ bea mutual; cy follows ada.
  const follows: Prisma.FollowCreateManyInput[] = [
    { followerId: ada, followingId: bea },
    { followerId: bea, followingId: ada },
    { followerId: cy, followingId: ada },
  ];
  const fl = await prisma.follow.createMany({ data: follows });
  counts.follows = fl.count;

  // -- LISTS --------------------------------------------------------------
  // Ada's Four Favorites (kind FOUR_FAVORITES, max 4) + a regular public list.
  const POSITION_GAP = 1024;
  const fourFav = await prisma.list.create({
    data: {
      ownerId: ada,
      kind: "FOUR_FAVORITES",
      name: "Four Favorites",
      slug: "four-favorites",
      isPublic: true,
      isPinned: true,
      itemCount: 4,
    },
  });
  await prisma.listItem.createMany({
    data: [
      { listId: fourFav.id, movieId: 603, position: 1 * POSITION_GAP, addedById: ada },
      { listId: fourFav.id, movieId: 550, position: 2 * POSITION_GAP, addedById: ada },
      { listId: fourFav.id, movieId: 27205, position: 3 * POSITION_GAP, addedById: ada },
      { listId: fourFav.id, seriesId: 1396, position: 4 * POSITION_GAP, addedById: ada },
    ],
  });

  const regularList = await prisma.list.create({
    data: {
      ownerId: ada,
      kind: "REGULAR",
      name: "Comfort Rewatches",
      slug: "comfort-rewatches",
      description: "The ones I put on when the brain needs a hug.",
      isPublic: true,
      isPinned: true,
      itemCount: 3,
    },
  });
  await prisma.listItem.createMany({
    data: [
      { listId: regularList.id, movieId: 13, position: 1 * POSITION_GAP, addedById: ada },
      { listId: regularList.id, movieId: 603, position: 2 * POSITION_GAP, addedById: ada },
      { listId: regularList.id, seriesId: 66732, position: 3 * POSITION_GAP, addedById: ada },
    ],
  });
  counts.lists = 2;

  // -- NOTIFICATIONS ------------------------------------------------------
  // A FOLLOW notification (cy → ada) and a REPLY notification (ada replied to bea).
  await prisma.notification.createMany({
    data: [
      {
        userId: ada,
        type: "FOLLOW",
        actorId: cy,
        payload: { kind: "follow" } as unknown as Prisma.InputJsonValue,
      },
      {
        userId: bea,
        type: "REPLY",
        actorId: ada,
        payload: {
          kind: "reply",
          commentId: fcReply.id,
          parentCommentId: fcComment.id,
          movieId: 550,
        } as unknown as Prisma.InputJsonValue,
      },
    ],
  });
  counts.notifications = 2;

  return counts;
}

// ---------------------------------------------------------------------------
// user_stats snapshots. The public profile + Wrapped render ONLY from the
// stored snapshot (never live-compute on those crawler-hammered surfaces — see
// getUserStatsSnapshot in stats.ts), so a freshly-seeded user with no snapshot
// shows "0 films". We proactively compute + store a NON-dirty snapshot here
// (via the same pure aggregation the app uses) so profiles read real numbers
// immediately and the seed summary can print honest totals.
// ---------------------------------------------------------------------------
interface StatsSummary {
  username: string;
  moviesWatched: number;
  episodesWatched: number;
  hoursWatched: number;
}

async function seedUserStats(ids: Record<string, number>): Promise<StatsSummary[]> {
  // Lazy import (mirrors the hydration lazy-import pattern): pulls the shared PG
  // client + the pure stats aggregator only on the path that needs it.
  const { computeUserStats } = await import("../src/server/db/postgres/social/stats");
  // computeUserStats reads via the shared `@/server/db/postgres` client (a
  // SEPARATE connection from this script's `prisma`); our seed writes are
  // already committed, so it sees them. Disconnect it after so the script's
  // event loop can exit cleanly.
  const { prisma: sharedPrisma } = await import("../src/server/db/postgres");

  const out: StatsSummary[] = [];
  for (const [username, userId] of Object.entries(ids)) {
    // computeUserStats reads watch_events (joined to movies/series/episodes/
    // genres/credits) and returns the StatsSnapshot JSON. Imports stay INCLUDED
    // (matches getUserStatsSnapshot) so import-only diaries aren't zeroed.
    const snapshot = await computeUserStats(userId);
    await prisma.userStats.upsert({
      where: { userId },
      create: {
        userId,
        stats: snapshot as unknown as Prisma.InputJsonValue,
        computedAt: new Date(),
        dirty: false,
      },
      update: {
        stats: snapshot as unknown as Prisma.InputJsonValue,
        computedAt: new Date(),
        dirty: false,
      },
    });
    out.push({
      username,
      moviesWatched: snapshot.moviesWatched,
      episodesWatched: snapshot.episodesWatched,
      hoursWatched: snapshot.hoursWatched,
    });
  }
  await sharedPrisma.$disconnect();
  return out;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("Seeding local social demo data (dev DB on :5436)...\n");

  console.log("1/4 Catalog...");
  const catalogPath = await seedCatalog();
  console.log(`    catalog path: ${catalogPath}\n`);

  console.log("2/4 Demo users...");
  const ids = await seedUsers();
  const userIds = Object.values(ids);
  console.log(`    users: ${Object.keys(ids).join(", ")}\n`);

  console.log("3/4 Social data (wipe + reseed for idempotency)...");
  await wipeDemoSocialData(userIds);
  const counts = await seedSocialData(ids);
  console.log("    done.\n");

  console.log("4/4 user_stats snapshots (compute + store)...");
  const stats = await seedUserStats(ids);
  console.log("    done.\n");

  // -- Summary ------------------------------------------------------------
  const slug = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const bb = SERIES[0];

  console.log("============================================================");
  console.log("SEED COMPLETE");
  console.log("============================================================");
  console.log(`Catalog path used : ${catalogPath}`);
  console.log("");
  console.log("Demo users:");
  for (const u of DEMO_USERS) {
    console.log(`  @${u.username.padEnd(14)} (${u.name})  ->  /u/${u.username}`);
  }
  console.log("");
  console.log("Key URLs to click through:");
  console.log(`  Public profile (backdrop+stats+reviews+4-favorites):`);
  console.log(`    /u/cinephile_ada`);
  console.log(`  Movie page with a review + discussion (Fight Club):`);
  console.log(`    /movie/550/${slug("Fight Club")}`);
  console.log(`  Series page with progress tracking (Breaking Bad):`);
  console.log(`    /series/1396/${slug(bb.name)}`);
  console.log(`  Episode discuss page (spoiler-gated comments, BB S2E1):`);
  console.log(`    /series/1396/${slug(bb.name)}/discuss/s2e1`);
  console.log("");
  console.log("Counts created:");
  console.log(`  watch_events     : ${counts.watchEvents}`);
  console.log(`  user_ratings     : ${counts.ratings}`);
  console.log(`  series_progress  : ${counts.seriesProgress}`);
  console.log(`  user_reviews     : ${counts.reviews}`);
  console.log(`  comments         : ${counts.comments} (incl. 1 reply)`);
  console.log(`  follows          : ${counts.follows}`);
  console.log(`  lists            : ${counts.lists} (1 FOUR_FAVORITES + 1 regular)`);
  console.log(`  notifications    : ${counts.notifications}`);
  console.log("");
  console.log("Profile stats (user_stats snapshots — must be > 0 for movie watchers):");
  for (const s of stats) {
    console.log(
      `  @${s.username.padEnd(14)} films=${s.moviesWatched}  episodes=${s.episodesWatched}  hours=${s.hoursWatched}`,
    );
  }
  console.log("============================================================");
}

main()
  .catch((error: unknown) => {
    console.error("\nSEED FAILED:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
