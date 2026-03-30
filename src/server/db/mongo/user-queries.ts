/**
 * MongoDB User Queries
 *
 * Centralized wrapper for all MongoDB user data operations.
 * Mirrors the Prisma user-queries interface so the switcher service
 * can delegate to either backend based on feature flag.
 *
 * At GA (full Prisma migration), this entire file gets deleted.
 */

import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
  RecentItem,
  ContinueWatching,
} from "@/server/db/models/user-library";
import { Movie } from "@/server/db/models/movie";
import { Series } from "@/server/db/models/series";
import { getMongoClient } from "@/lib/auth";

// =============================================================================
// Library
// =============================================================================

export async function getLibraryData(userId: number) {
  await connectDB();

  const [watchedMovies, watchlistMovies, watchlistSeries, ratings, recents, continueWatching] =
    await Promise.all([
      WatchedMovie.find({ userId }).select("movieId -_id").lean(),
      MoviesWatchlist.find({ userId }).select("movieId -_id").lean(),
      SeriesWatchlist.find({ userId }).select("seriesId -_id").lean(),
      UserRating.find({ userId }).select("itemId itemType rating -_id").lean(),
      RecentItem.find({ userId }).select("-__v -userId").sort({ updatedAt: -1 }).limit(20).lean(),
      ContinueWatching.find({ userId })
        .select("-__v -userId")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
    ]);

  return {
    watchedMovieIds: (watchedMovies as Array<{ movieId: number }>).map((m) => m.movieId),
    watchlistMovieIds: (watchlistMovies as Array<{ movieId: number }>).map((m) => m.movieId),
    watchlistSeriesIds: (watchlistSeries as Array<{ seriesId: number }>).map((s) => s.seriesId),
    ratings: (
      ratings as Array<{ itemId: number; itemType: "movie" | "series"; rating: number }>
    ).map((r) => ({
      itemId: r.itemId,
      itemType: r.itemType,
      rating: r.rating,
    })),
    recentItems: (
      recents as Array<{
        itemId: number;
        isMovie: boolean;
        poster_path?: string;
        backdrop_path?: string;
        title?: string;
        name?: string;
        updatedAt: Date;
      }>
    ).map((r) => ({
      itemId: r.itemId,
      isMovie: Boolean(r.isMovie),
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
      title: r.title ?? null,
      name: r.name ?? null,
      viewedAt: r.updatedAt,
    })),
    continueWatchingItems: (
      continueWatching as Array<{
        itemId: number;
        isMovie: boolean;
        poster_path?: string;
        backdrop_path?: string;
        title?: string;
        name?: string;
        watchLink: string;
        watchProviderName?: string;
        updatedAt: Date;
      }>
    ).map((item) => ({
      itemId: item.itemId,
      isMovie: Boolean(item.isMovie),
      poster_path: item.poster_path ?? null,
      backdrop_path: item.backdrop_path ?? null,
      title: item.title ?? null,
      name: item.name ?? null,
      watchLink: item.watchLink,
      watchProviderName: item.watchProviderName ?? null,
      updatedAt: item.updatedAt,
    })),
  };
}

// =============================================================================
// Watchlist
// =============================================================================

export async function getMovieWatchlistWithDates(userId: number) {
  await connectDB();
  const items = await MoviesWatchlist.find({ userId })
    .select("movieId createdAt -_id")
    .sort({ createdAt: -1 })
    .lean();
  return (items as Array<{ movieId: number; createdAt: Date }>).map((item) => ({
    movieId: item.movieId,
    addedAt: item.createdAt,
  }));
}

export async function getSeriesWatchlistWithDates(userId: number) {
  await connectDB();
  const items = await SeriesWatchlist.find({ userId })
    .select("seriesId createdAt -_id")
    .sort({ createdAt: -1 })
    .lean();
  return (items as Array<{ seriesId: number; createdAt: Date }>).map((item) => ({
    seriesId: item.seriesId,
    addedAt: item.createdAt,
  }));
}

export async function getMovieDetails(movieIds: number[]) {
  if (movieIds.length === 0) return [];
  await connectDB();
  const movies = await Movie.find({ id: { $in: movieIds } })
    .select(
      "id title poster_path backdrop_path genres vote_average overview release_date runtime"
    )
    .lean();
  return movies;
}

export async function getSeriesDetails(seriesIds: number[]) {
  if (seriesIds.length === 0) return [];
  await connectDB();
  const series = await Series.find({ id: { $in: seriesIds } })
    .select(
      "id name poster_path backdrop_path genres vote_average overview first_air_date status number_of_seasons next_episode_to_air last_episode_to_air"
    )
    .lean();
  return series;
}

export async function addMovieToWatchlist(userId: number, movieId: number) {
  await connectDB();
  await MoviesWatchlist.findOneAndUpdate(
    { userId, movieId },
    { userId, movieId, createdAt: new Date() },
    { upsert: true, new: true }
  );
}

export async function removeMovieFromWatchlist(userId: number, movieId: number) {
  await connectDB();
  await MoviesWatchlist.deleteOne({ userId, movieId });
}

export async function addSeriesToWatchlist(userId: number, seriesId: number) {
  await connectDB();
  await SeriesWatchlist.findOneAndUpdate(
    { userId, seriesId },
    { userId, seriesId, createdAt: new Date() },
    { upsert: true, new: true }
  );
}

export async function removeSeriesFromWatchlist(userId: number, seriesId: number) {
  await connectDB();
  await SeriesWatchlist.deleteOne({ userId, seriesId });
}

// =============================================================================
// Watched
// =============================================================================

export async function getWatchedMovieIdsWithDates(userId: number) {
  await connectDB();
  const items = await WatchedMovie.find({ userId })
    .select("movieId createdAt -_id")
    .sort({ createdAt: -1 })
    .lean();
  return (items as Array<{ movieId: number; createdAt: Date }>).map((item) => ({
    movieId: item.movieId,
    createdAt: item.createdAt,
  }));
}

export async function markMovieWatched(userId: number, movieId: number) {
  await connectDB();
  await WatchedMovie.findOneAndUpdate(
    { userId, movieId },
    { userId, movieId, createdAt: new Date() },
    { upsert: true, new: true }
  );
}

export async function unmarkMovieWatched(userId: number, movieId: number) {
  await connectDB();
  await WatchedMovie.deleteOne({ userId, movieId });
}

// =============================================================================
// Ratings
// =============================================================================

export async function getUserRatings(userId: number) {
  await connectDB();
  const items = await UserRating.find({ userId })
    .select("itemId itemType rating createdAt -_id")
    .sort({ createdAt: -1 })
    .lean();
  return (items as Array<{ itemId: number; itemType: string; rating: number; createdAt: Date }>).map(
    (r) => ({
      itemId: r.itemId,
      itemType: r.itemType as "movie" | "series",
      rating: r.rating,
      createdAt: r.createdAt,
    })
  );
}

export async function upsertRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series",
  rating: number
) {
  await connectDB();
  await UserRating.findOneAndUpdate(
    { userId, itemId, itemType },
    { userId, itemId, itemType, rating, createdAt: new Date() },
    { upsert: true, new: true }
  );
}

export async function deleteRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series"
) {
  await connectDB();
  await UserRating.deleteOne({ userId, itemId, itemType });
}

// =============================================================================
// Recents
// =============================================================================

const MAX_RECENTS = 20;

export async function getRecentItems(userId: number) {
  await connectDB();
  const items = await RecentItem.find({ userId })
    .select("-__v -userId")
    .sort({ updatedAt: -1 })
    .limit(MAX_RECENTS)
    .lean();

  return (
    items as Array<{
      itemId: number;
      isMovie: boolean;
      poster_path?: string;
      backdrop_path?: string;
      title?: string;
      name?: string;
      updatedAt: Date;
    }>
  ).map((r) => ({
    itemId: r.itemId,
    isMovie: Boolean(r.isMovie),
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    title: r.title,
    name: r.name,
    viewedAt: r.updatedAt,
  }));
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
) {
  await connectDB();
  await RecentItem.findOneAndUpdate(
    { userId, itemId: data.itemId, isMovie: data.isMovie },
    {
      userId,
      itemId: data.itemId,
      isMovie: data.isMovie,
      poster_path: data.poster_path,
      backdrop_path: data.backdrop_path,
      title: data.title,
      name: data.name,
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // Prune beyond MAX_RECENTS
  const all = await RecentItem.find({ userId }).sort({ updatedAt: -1 }).select("_id").lean();
  if (all.length > MAX_RECENTS) {
    const idsToDelete = all.slice(MAX_RECENTS).map((r) => r._id);
    await RecentItem.deleteMany({ _id: { $in: idsToDelete } });
  }
}

// =============================================================================
// Continue Watching
// =============================================================================

const MAX_CONTINUE_WATCHING = 10;

export async function getContinueWatchingItems(userId: number) {
  await connectDB();
  const items = await ContinueWatching.find({ userId })
    .select("-__v -userId")
    .sort({ updatedAt: -1 })
    .limit(MAX_CONTINUE_WATCHING)
    .lean();

  return (
    items as Array<{
      itemId: number;
      isMovie: boolean;
      poster_path?: string;
      backdrop_path?: string;
      title?: string;
      name?: string;
      watchLink: string;
      watchProviderName?: string;
      updatedAt: Date;
    }>
  ).map((item) => ({
    itemId: item.itemId,
    isMovie: Boolean(item.isMovie),
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    title: item.title,
    name: item.name,
    watchLink: item.watchLink,
    watchProviderName: item.watchProviderName,
    updatedAt: item.updatedAt,
  }));
}

export async function upsertContinueWatchingItem(
  userId: number,
  data: {
    itemId: number;
    isMovie: boolean;
    watchLink: string;
    watchProviderName?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    title?: string;
    name?: string;
  }
) {
  await connectDB();
  await ContinueWatching.deleteOne({ userId, itemId: data.itemId, isMovie: data.isMovie });
  await ContinueWatching.create({
    userId,
    itemId: data.itemId,
    isMovie: data.isMovie,
    poster_path: data.poster_path,
    backdrop_path: data.backdrop_path,
    title: data.title,
    name: data.name,
    watchLink: data.watchLink,
    watchProviderName: data.watchProviderName,
    updatedAt: new Date(),
  });

  // Prune beyond MAX_CONTINUE_WATCHING
  const all = await ContinueWatching.find({ userId })
    .sort({ updatedAt: -1 })
    .select("_id")
    .lean();
  if (all.length > MAX_CONTINUE_WATCHING) {
    const idsToDelete = all.slice(MAX_CONTINUE_WATCHING).map((item) => item._id);
    await ContinueWatching.deleteMany({ _id: { $in: idsToDelete } });
  }
}

export async function deleteContinueWatchingItem(
  userId: number,
  itemId: number,
  isMovie: boolean
) {
  await connectDB();
  await ContinueWatching.deleteOne({ userId, itemId, isMovie });
}

// =============================================================================
// AI Tools
// =============================================================================

export async function getUserItemStatus(
  userId: number,
  itemId: number,
  mediaType: "movie" | "series"
): Promise<{ inWatchlist: boolean; isWatched: boolean; userRating: number | null }> {
  await connectDB();
  const itemType = mediaType === "movie" ? "movie" : "series";

  const [watchlist, watched, rating] = await Promise.all([
    mediaType === "movie"
      ? MoviesWatchlist.findOne({ userId, movieId: itemId }).lean()
      : SeriesWatchlist.findOne({ userId, seriesId: itemId }).lean(),
    mediaType === "movie"
      ? WatchedMovie.findOne({ userId, movieId: itemId }).lean()
      : Promise.resolve(null),
    UserRating.findOne({ userId, itemId, itemType }).lean(),
  ]);

  return {
    inWatchlist: !!watchlist,
    isWatched: !!watched,
    userRating: (rating as { rating?: number } | null)?.rating ?? null,
  };
}

export async function getUserExclusions(
  userId: number,
  mediaType: "movie" | "series"
): Promise<{ watchedIds: number[]; watchlistIds: number[]; dislikedIds: number[] }> {
  await connectDB();
  const itemType = mediaType === "movie" ? "movie" : "series";

  const [watched, watchlist, ratings] = await Promise.all([
    mediaType === "movie"
      ? WatchedMovie.find({ userId }).select("movieId").lean()
      : Promise.resolve([]),
    mediaType === "movie"
      ? MoviesWatchlist.find({ userId }).select("movieId").lean()
      : SeriesWatchlist.find({ userId }).select("seriesId").lean(),
    UserRating.find({ userId, itemType, rating: -1 }).select("itemId").lean(),
  ]);

  return {
    watchedIds: (watched as Array<{ movieId: number }>).map((w) => w.movieId),
    watchlistIds: (watchlist as Array<{ movieId?: number; seriesId?: number }>).map(
      (w) => w.movieId ?? w.seriesId ?? 0
    ),
    dislikedIds: (ratings as Array<{ itemId: number }>).map((r) => r.itemId),
  };
}

// =============================================================================
// Admin
// =============================================================================

export async function getAdminUsersWithActivity() {
  const clientPromise = getMongoClient();
  if (!clientPromise) {
    throw new Error("Database not configured");
  }

  const client = await clientPromise;
  const db = client.db("test");

  const users = await db.collection("users").find().toArray();
  const userSubs = users.map((u) => u.sub).filter(Boolean);

  const collections = [
    { name: "continuewatchings", key: "ContinueWatching" },
    { name: "movieswatchlists", key: "MoviesWatchList" },
    { name: "watchedmovies", key: "WatchedMovies" },
    { name: "serieslists", key: "SeriesList" },
    { name: "recents", key: "recent" },
  ] as const;

  const activityData = await Promise.all(
    collections.map(async ({ name, key }) => {
      const items = await db
        .collection(name)
        .find({ userId: { $in: userSubs } })
        .project({ userId: 1, itemId: 1, title: 1, name: 1 })
        .sort({ updatedAt: -1 })
        .toArray();
      return { key, items };
    })
  );

  const usersWithActivity = users.map((user) => {
    const userData: Record<string, unknown> = {
      id: user._id.toString(),
      sub: user.sub,
      name: user.name,
      email: user.email,
      picture: user.picture,
      image: user.picture,
      createdAt: user.createdAt,
      lastVisited: user.lastVisited,
      location: user.location,
    };

    activityData.forEach(({ key, items }) => {
      const userItems = items.filter(
        (item) => item.userId?.toString() === user.sub?.toString()
      );
      userData[key] = userItems.length;
      userData[`${key}-items`] = userItems.slice(0, 10);
    });

    return userData;
  });

  usersWithActivity.sort((a, b) => {
    const dateA = a.lastVisited ? new Date(a.lastVisited as string).getTime() : 0;
    const dateB = b.lastVisited ? new Date(b.lastVisited as string).getTime() : 0;
    return dateB - dateA;
  });

  return usersWithActivity;
}
