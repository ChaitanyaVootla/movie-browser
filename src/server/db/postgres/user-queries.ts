/**
 * PostgreSQL User Data Queries
 *
 * All Prisma query implementations for user library data:
 * watchlist, watched, ratings, recents, continue watching, and admin.
 *
 * Polymorphic models (WatchlistItem, UserRating, RecentItem, ContinueWatching)
 * use movieId/seriesId columns to determine entity type.
 */

import { prisma } from "./index";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { markStatsDirty } from "./social/stats-dirty";

const MAX_RECENTS = 20;
const MAX_CONTINUE_WATCHING = 10;

// =============================================================================
// Types
// =============================================================================

interface MovieDetail {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: null;
  genres: { id: number; name: string }[];
}

interface SeriesDetail {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  first_air_date: string | null;
  status: string | null;
  number_of_seasons: number | null;
  next_episode_to_air: unknown;
  last_episode_to_air: unknown;
  vote_average: null;
  genres: { id: number; name: string }[];
}

interface RecentItemResult {
  itemId: number;
  isMovie: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  title: string | null;
  name: string | null;
  viewedAt: Date;
}

interface ContinueWatchingResult {
  itemId: number;
  isMovie: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  title: string | null;
  name: string | null;
  watchLink: string;
  watchProviderName: string | null;
  updatedAt: Date;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function mapGenres(
  genreRelations: Array<{ genre: { tmdbId: number; name: string } }>
): { id: number; name: string }[] {
  return genreRelations.map((g) => ({ id: g.genre.tmdbId, name: g.genre.name }));
}

// =============================================================================
// Library (GET /api/user/library)
// =============================================================================

export async function getLibraryData(userId: number) {
  const [watchedMovies, watchlistMovies, watchlistSeries, ratings, recents, continueWatching] =
    await Promise.all([
      prisma.watchEvent.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
        distinct: ["movieId"],
      }),
      prisma.watchlistItem.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
      prisma.watchlistItem.findMany({
        where: { userId, seriesId: { not: null } },
        select: { seriesId: true },
      }),
      prisma.userRating.findMany({
        where: { userId, rating: { not: null } },
        select: { movieId: true, seriesId: true, rating: true },
      }),
      prisma.recentItem.findMany({
        where: { userId },
        orderBy: { viewedAt: "desc" },
        take: MAX_RECENTS,
        include: {
          movie: { select: { posterPath: true, backdropPath: true, title: true } },
          series: { select: { posterPath: true, backdropPath: true, name: true } },
        },
      }),
      prisma.continueWatching.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: MAX_CONTINUE_WATCHING,
        include: {
          movie: { select: { posterPath: true, backdropPath: true, title: true } },
          series: { select: { posterPath: true, backdropPath: true, name: true } },
        },
      }),
    ]);

  return {
    watchedMovieIds: watchedMovies.flatMap((w) => (w.movieId === null ? [] : [w.movieId])),
    watchlistMovieIds: watchlistMovies.map((w) => w.movieId!),
    watchlistSeriesIds: watchlistSeries.map((s) => s.seriesId!),
    ratings: ratings.flatMap((r) =>
      r.rating === null
        ? []
        : [
            {
              itemId: r.movieId ?? r.seriesId!,
              itemType: r.movieId ? ("movie" as const) : ("series" as const),
              rating: r.rating,
            },
          ]
    ),
    recentItems: recents.map((r) => {
      const isMovie = r.movieId !== null;
      return {
        id: r.movieId ?? r.seriesId!,
        itemId: r.movieId ?? r.seriesId!,
        isMovie,
        poster_path: isMovie ? r.movie?.posterPath ?? null : r.series?.posterPath ?? null,
        backdrop_path: isMovie ? r.movie?.backdropPath ?? null : r.series?.backdropPath ?? null,
        title: r.movie?.title ?? undefined,
        name: r.series?.name ?? undefined,
        viewedAt: r.viewedAt,
      };
    }),
    continueWatchingItems: continueWatching.map((item) => {
      const isMovie = item.movieId !== null;
      return {
        id: item.movieId ?? item.seriesId!,
        itemId: item.movieId ?? item.seriesId!,
        isMovie,
        poster_path: isMovie ? item.movie?.posterPath ?? null : item.series?.posterPath ?? null,
        backdrop_path: isMovie
          ? item.movie?.backdropPath ?? null
          : item.series?.backdropPath ?? null,
        title: item.movie?.title ?? undefined,
        name: item.series?.name ?? undefined,
        watchLink: item.watchLink,
        watchProviderName: item.watchProviderName,
        updatedAt: item.updatedAt,
      };
    }),
  };
}

// =============================================================================
// Watchlist
// =============================================================================

export async function getMovieWatchlistWithDates(
  userId: number
): Promise<{ movieId: number; addedAt: Date }[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId, movieId: { not: null } },
    select: { movieId: true, addedAt: true },
    orderBy: { addedAt: "desc" },
  });
  return items.map((i) => ({ movieId: i.movieId!, addedAt: i.addedAt }));
}

export async function getSeriesWatchlistWithDates(
  userId: number
): Promise<{ seriesId: number; addedAt: Date }[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId, seriesId: { not: null } },
    select: { seriesId: true, addedAt: true },
    orderBy: { addedAt: "desc" },
  });
  return items.map((i) => ({ seriesId: i.seriesId!, addedAt: i.addedAt }));
}

export async function getMovieDetails(movieIds: number[]): Promise<MovieDetail[]> {
  if (movieIds.length === 0) return [];

  const movies = await prisma.movie.findMany({
    where: { id: { in: movieIds } },
    select: {
      id: true,
      title: true,
      posterPath: true,
      backdropPath: true,
      overview: true,
      releaseDate: true,
      runtime: true,
      genres: { include: { genre: { select: { tmdbId: true, name: true } } } },
    },
  });

  return movies.map((m) => ({
    id: m.id,
    title: m.title,
    poster_path: m.posterPath,
    backdrop_path: m.backdropPath,
    overview: m.overview,
    release_date: formatDate(m.releaseDate),
    runtime: m.runtime,
    vote_average: null,
    genres: mapGenres(m.genres),
  }));
}

export async function getSeriesDetails(seriesIds: number[]): Promise<SeriesDetail[]> {
  if (seriesIds.length === 0) return [];

  const seriesList = await prisma.series.findMany({
    where: { id: { in: seriesIds } },
    select: {
      id: true,
      name: true,
      posterPath: true,
      backdropPath: true,
      overview: true,
      firstAirDate: true,
      status: true,
      numberOfSeasons: true,
      nextEpisodeData: true,
      lastEpisodeData: true,
      genres: { include: { genre: { select: { tmdbId: true, name: true } } } },
    },
  });

  return seriesList.map((s) => ({
    id: s.id,
    name: s.name,
    poster_path: s.posterPath,
    backdrop_path: s.backdropPath,
    overview: s.overview,
    first_air_date: formatDate(s.firstAirDate),
    status: s.status,
    number_of_seasons: s.numberOfSeasons,
    next_episode_to_air: s.nextEpisodeData,
    last_episode_to_air: s.lastEpisodeData,
    vote_average: null,
    genres: mapGenres(s.genres),
  }));
}

export async function addMovieToWatchlist(userId: number, movieId: number): Promise<void> {
  try {
    await prisma.watchlistItem.upsert({
      where: { userId_movieId: { userId, movieId } },
      create: { userId, movieId, addedAt: new Date() },
      update: {},
    });
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2002") return; // Already exists
    throw error;
  }
}

export async function removeMovieFromWatchlist(userId: number, movieId: number): Promise<void> {
  await prisma.watchlistItem.deleteMany({
    where: { userId, movieId },
  });
}

export async function addSeriesToWatchlist(userId: number, seriesId: number): Promise<void> {
  try {
    await prisma.watchlistItem.upsert({
      where: { userId_seriesId: { userId, seriesId } },
      create: { userId, seriesId, addedAt: new Date() },
      update: {},
    });
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2002") return;
    throw error;
  }
}

export async function removeSeriesFromWatchlist(userId: number, seriesId: number): Promise<void> {
  await prisma.watchlistItem.deleteMany({
    where: { userId, seriesId },
  });
}

// =============================================================================
// Watched
// =============================================================================

export async function getWatchedMovieIdsWithDates(
  userId: number
): Promise<{ movieId: number; createdAt: Date }[]> {
  const rows = await prisma.$queryRaw<Array<{ movie_id: number; last_at: Date }>>`
    SELECT movie_id, MAX(COALESCE(watched_at, created_at)) AS last_at
    FROM watch_events
    WHERE user_id = ${userId} AND movie_id IS NOT NULL
    GROUP BY movie_id
    ORDER BY last_at DESC
  `;
  return rows.map((r) => ({ movieId: r.movie_id, createdAt: r.last_at }));
}

export async function markMovieWatched(userId: number, movieId: number): Promise<void> {
  const existing = await prisma.watchEvent.findFirst({
    where: { userId, movieId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.create({
      data: { userId, movieId, watchedAt: new Date(), watchedAtPrecision: "DATETIME", source: "LOGGED" },
    });
    await markStatsDirty(tx, userId);
  });
}

export async function unmarkMovieWatched(userId: number, movieId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.deleteMany({ where: { userId, movieId } });
    await markStatsDirty(tx, userId);
  });
}

// =============================================================================
// Ratings
// =============================================================================

export async function getUserRatings(
  userId: number
): Promise<{ itemId: number; itemType: "movie" | "series"; rating: number; createdAt: Date }[]> {
  const ratings = await prisma.userRating.findMany({
    where: { userId, rating: { not: null } },
    select: { movieId: true, seriesId: true, rating: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return ratings.flatMap((r) =>
    r.rating === null
      ? []
      : [
          {
            itemId: r.movieId ?? r.seriesId!,
            itemType: r.movieId ? ("movie" as const) : ("series" as const),
            rating: r.rating,
            createdAt: r.createdAt,
          },
        ]
  );
}

export async function upsertRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series",
  rating: number
): Promise<void> {
  if (itemType === "movie") {
    await prisma.userRating.upsert({
      where: { userId_movieId: { userId, movieId: itemId } },
      create: { userId, movieId: itemId, rating, ratedAt: new Date() },
      update: { rating, createdAt: new Date(), ratedAt: new Date() },
    });
  } else {
    await prisma.userRating.upsert({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      create: { userId, seriesId: itemId, rating, ratedAt: new Date() },
      update: { rating, createdAt: new Date(), ratedAt: new Date() },
    });
  }
}

export async function deleteRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series"
): Promise<void> {
  // Legacy semantics = remove the thumb; must NOT nuke a coexisting score.
  const where =
    itemType === "movie" ? { userId, movieId: itemId } : { userId, seriesId: itemId };
  const existing = await prisma.userRating.findFirst({
    where,
    select: { id: true, score: true },
  });
  if (!existing) return;
  if (existing.score === null) {
    await prisma.userRating.delete({ where: { id: existing.id } });
  } else {
    await prisma.userRating.update({ where: { id: existing.id }, data: { rating: null } });
  }
}

// =============================================================================
// Recents
// =============================================================================

export async function getRecentItems(userId: number): Promise<RecentItemResult[]> {
  const items = await prisma.recentItem.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: MAX_RECENTS,
    include: {
      movie: { select: { posterPath: true, backdropPath: true, title: true } },
      series: { select: { posterPath: true, backdropPath: true, name: true } },
    },
  });

  return items.map((r) => {
    const isMovie = r.movieId !== null;
    return {
      itemId: r.movieId ?? r.seriesId!,
      isMovie,
      poster_path: isMovie ? r.movie?.posterPath ?? null : r.series?.posterPath ?? null,
      backdrop_path: isMovie ? r.movie?.backdropPath ?? null : r.series?.backdropPath ?? null,
      title: r.movie?.title ?? null,
      name: r.series?.name ?? null,
      viewedAt: r.viewedAt,
    };
  });
}

export async function upsertRecentItem(
  userId: number,
  data: {
    itemId: number;
    isMovie: boolean;
    poster_path?: string | null;
    backdrop_path?: string | null;
    title?: string;
    name?: string;
  }
): Promise<void> {
  const { itemId, isMovie } = data;

  if (isMovie) {
    await prisma.recentItem.upsert({
      where: { userId_movieId: { userId, movieId: itemId } },
      create: { userId, movieId: itemId, viewedAt: new Date() },
      update: { viewedAt: new Date() },
    });
  } else {
    await prisma.recentItem.upsert({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      create: { userId, seriesId: itemId, viewedAt: new Date() },
      update: { viewedAt: new Date() },
    });
  }

  // Prune to MAX_RECENTS
  const allRecents = await prisma.recentItem.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    select: { id: true },
  });

  if (allRecents.length > MAX_RECENTS) {
    const idsToDelete = allRecents.slice(MAX_RECENTS).map((r) => r.id);
    await prisma.recentItem.deleteMany({ where: { id: { in: idsToDelete } } });
  }
}

// =============================================================================
// Continue Watching
// =============================================================================

export async function getContinueWatchingItems(
  userId: number
): Promise<ContinueWatchingResult[]> {
  const items = await prisma.continueWatching.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_CONTINUE_WATCHING,
    include: {
      movie: { select: { posterPath: true, backdropPath: true, title: true } },
      series: { select: { posterPath: true, backdropPath: true, name: true } },
    },
  });

  return items.map((item) => {
    const isMovie = item.movieId !== null;
    return {
      itemId: item.movieId ?? item.seriesId!,
      isMovie,
      poster_path: isMovie ? item.movie?.posterPath ?? null : item.series?.posterPath ?? null,
      backdrop_path: isMovie ? item.movie?.backdropPath ?? null : item.series?.backdropPath ?? null,
      title: item.movie?.title ?? null,
      name: item.series?.name ?? null,
      watchLink: item.watchLink,
      watchProviderName: item.watchProviderName,
      updatedAt: item.updatedAt,
    };
  });
}

export async function upsertContinueWatchingItem(
  userId: number,
  data: { itemId: number; isMovie: boolean; watchLink: string; watchProviderName?: string }
): Promise<void> {
  const { itemId, isMovie, watchLink, watchProviderName } = data;

  if (isMovie) {
    // Delete + create to ensure updatedAt is fresh
    await prisma.continueWatching.deleteMany({ where: { userId, movieId: itemId } });
    await prisma.continueWatching.create({
      data: { userId, movieId: itemId, watchLink, watchProviderName },
    });
  } else {
    await prisma.continueWatching.deleteMany({ where: { userId, seriesId: itemId } });
    await prisma.continueWatching.create({
      data: { userId, seriesId: itemId, watchLink, watchProviderName },
    });
  }

  // Prune to MAX_CONTINUE_WATCHING
  const allItems = await prisma.continueWatching.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (allItems.length > MAX_CONTINUE_WATCHING) {
    const idsToDelete = allItems.slice(MAX_CONTINUE_WATCHING).map((i) => i.id);
    await prisma.continueWatching.deleteMany({ where: { id: { in: idsToDelete } } });
  }
}

export async function deleteContinueWatchingItem(
  userId: number,
  itemId: number,
  isMovie: boolean
): Promise<void> {
  if (isMovie) {
    await prisma.continueWatching.deleteMany({ where: { userId, movieId: itemId } });
  } else {
    await prisma.continueWatching.deleteMany({ where: { userId, seriesId: itemId } });
  }
}

// =============================================================================
// AI Tools
// =============================================================================

export async function getUserItemStatus(
  userId: number,
  itemId: number,
  mediaType: "movie" | "series"
): Promise<{ inWatchlist: boolean; isWatched: boolean; userRating: number | null }> {
  if (mediaType === "movie") {
    const [watchlist, watched, rating] = await Promise.all([
      prisma.watchlistItem.findUnique({
        where: { userId_movieId: { userId, movieId: itemId } },
        select: { id: true },
      }),
      prisma.watchEvent.findFirst({
        where: { userId, movieId: itemId },
        select: { id: true },
      }),
      prisma.userRating.findUnique({
        where: { userId_movieId: { userId, movieId: itemId } },
        select: { rating: true },
      }),
    ]);
    return {
      inWatchlist: !!watchlist,
      isWatched: !!watched,
      userRating: rating?.rating ?? null,
    };
  }

  // Series
  const [watchlist, rating, progress] = await Promise.all([
    prisma.watchlistItem.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { id: true },
    }),
    prisma.userRating.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { rating: true },
    }),
    prisma.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { status: true },
    }),
  ]);
  return {
    inWatchlist: !!watchlist,
    isWatched: progress?.status === "COMPLETED" || progress?.status === "CAUGHT_UP",
    userRating: rating?.rating ?? null,
  };
}

export async function getUserExclusions(
  userId: number,
  mediaType: "movie" | "series"
): Promise<{ watchedIds: number[]; watchlistIds: number[]; dislikedIds: number[] }> {
  if (mediaType === "movie") {
    const [watched, watchlist, disliked] = await Promise.all([
      prisma.watchEvent.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
        distinct: ["movieId"],
      }),
      prisma.watchlistItem.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
      prisma.userRating.findMany({
        where: { userId, movieId: { not: null }, rating: -1 },
        select: { movieId: true },
      }),
    ]);
    return {
      watchedIds: watched.flatMap((w) => (w.movieId === null ? [] : [w.movieId])),
      watchlistIds: watchlist.map((w) => w.movieId!),
      dislikedIds: disliked.map((d) => d.movieId!),
    };
  }

  // Series: watched = finished or caught up (matches getUserItemStatus);
  // WATCHING/PAUSED/DROPPED must stay recommendable.
  const [watched, watchlist, disliked] = await Promise.all([
    prisma.seriesProgress.findMany({
      where: { userId, status: { in: ["COMPLETED", "CAUGHT_UP"] } },
      select: { seriesId: true },
    }),
    prisma.watchlistItem.findMany({
      where: { userId, seriesId: { not: null } },
      select: { seriesId: true },
    }),
    prisma.userRating.findMany({
      where: { userId, seriesId: { not: null }, rating: -1 },
      select: { seriesId: true },
    }),
  ]);
  return {
    watchedIds: watched.map((w) => w.seriesId),
    watchlistIds: watchlist.map((w) => w.seriesId!),
    dislikedIds: disliked.map((d) => d.seriesId!),
  };
}

// =============================================================================
// Admin
// =============================================================================

/**
 * Extract the location object stored at metadata.profile.location (backfilled
 * by the user-data migration, stamped/refreshed at sign-in — see
 * resolveLoginLocation in src/lib/auth.ts). The admin UI expects it at the
 * top level of each user row, matching the legacy MongoDB response shape.
 */
function extractLocation(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const profile = (metadata as Record<string, unknown>).profile;
  if (typeof profile !== "object" || profile === null) return null;
  const location = (profile as Record<string, unknown>).location;
  if (typeof location !== "object" || location === null) return null;
  return location as Record<string, unknown>;
}

export async function getAdminUsersWithActivity() {
  // Split watchlist counts by type (the single _count above can't express two
  // differently-filtered counts of the same relation) — legacy shape reports
  // MoviesWatchList and SeriesList separately.
  const seriesListCounts = await prisma.watchlistItem.groupBy({
    by: ["userId"],
    where: { seriesId: { not: null } },
    _count: { _all: true },
  });
  const seriesListByUser = new Map(seriesListCounts.map((c) => [c.userId, c._count._all]));

  const watchedCounts = await prisma.$queryRaw<Array<{ user_id: number; n: bigint }>>`
    SELECT user_id, COUNT(DISTINCT movie_id)::bigint AS n
    FROM watch_events
    WHERE movie_id IS NOT NULL
    GROUP BY user_id
  `;
  const watchedByUser = new Map(watchedCounts.map((c) => [c.user_id, Number(c.n)]));

  // Legacy shape also carries the 10 most recent items per user with display
  // titles ("recent-items") — the admin UI's expanded card renders them.
  // Window function keeps this a single bounded query regardless of table size.
  const recentRows = await prisma.$queryRaw<
    Array<{ user_id: number; item_id: number; title: string | null; name: string | null }>
  >`
    SELECT r.user_id, COALESCE(r.movie_id, r.series_id) AS item_id, m.title, s.name
    FROM (
      SELECT user_id, movie_id, series_id, viewed_at,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY viewed_at DESC) AS rn
      FROM recent_items
    ) r
    LEFT JOIN movies m ON m.id = r.movie_id
    LEFT JOIN series s ON s.id = r.series_id
    WHERE r.rn <= 10
    ORDER BY r.user_id, r.rn
  `;
  const recentItemsByUser = new Map<number, Array<{ itemId: number; title?: string; name?: string }>>();
  for (const row of recentRows) {
    const list = recentItemsByUser.get(row.user_id) ?? [];
    list.push(
      row.title !== null
        ? { itemId: row.item_id, title: row.title }
        : { itemId: row.item_id, name: row.name ?? undefined }
    );
    recentItemsByUser.set(row.user_id, list);
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      googleId: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      lastActiveAt: true,
      preferredCountry: true,
      metadata: true,
      _count: {
        select: {
          watchlistItems: true,
          ratings: true,
          recentItems: true,
          continueWatching: true,
        },
      },
    },
    orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
  });

  return users.map((u) => ({
    id: u.googleId,
    sub: u.id,
    name: u.name,
    email: u.email,
    picture: u.image,
    image: u.image,
    createdAt: u.createdAt.toISOString(),
    lastVisited: u.lastActiveAt?.toISOString() ?? null,
    preferredCountry: u.preferredCountry,
    role: u.role,
    WatchedMovies: watchedByUser.get(u.id) ?? 0,
    MoviesWatchList: u._count.watchlistItems - (seriesListByUser.get(u.id) ?? 0),
    recent: u._count.recentItems,
    "recent-items": recentItemsByUser.get(u.id) ?? [],
    ContinueWatching: u._count.continueWatching,
    SeriesList: seriesListByUser.get(u.id) ?? 0,
    location: extractLocation(u.metadata),
    metadata: u.metadata,
  }));
}
