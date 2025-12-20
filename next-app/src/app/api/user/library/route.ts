import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import {
  WatchedMovie,
  MoviesWatchlist,
  SeriesWatchlist,
  UserRating,
  RecentItem,
  ContinueWatching,
} from "@/server/db/models/user-library";
import { getUserIdForDb } from "@/lib/user-id";

/**
 * GET /api/user/library
 * 
 * Returns all user library data for efficient client-side state hydration.
 * Includes: watchlist IDs, watched IDs, ratings, recents, and continue watching.
 */
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json(
        {
          watchedMovies: [],
          watchlistMovies: [],
          watchlistSeries: [],
          ratings: [],
          recents: [],
          continueWatching: [],
        },
        { status: 200 }
      );
    }

    await connectDB();

    const [watchedMovies, watchlistMovies, watchlistSeries, ratings, recents, continueWatching] =
      await Promise.all([
        WatchedMovie.find({ userId }).select("movieId -_id").lean(),
        MoviesWatchlist.find({ userId }).select("movieId -_id").lean(),
        SeriesWatchlist.find({ userId }).select("seriesId -_id").lean(),
        UserRating.find({ userId }).select("itemId itemType rating -_id").lean(),
        RecentItem.find({ userId })
          .select("-__v -userId")
          .sort({ updatedAt: -1 })
          .limit(20)
          .lean(),
        ContinueWatching.find({ userId })
          .select("-__v -userId")
          .sort({ updatedAt: -1 })
          .limit(10)
          .lean(),
      ]);

    return NextResponse.json({
      watchedMovies: watchedMovies.map((m) => m.movieId),
      watchlistMovies: watchlistMovies.map((m) => m.movieId),
      watchlistSeries: watchlistSeries.map((s) => s.seriesId),
      ratings: ratings.map((r) => ({
        itemId: r.itemId,
        itemType: r.itemType,
        rating: r.rating,
      })),
      recents: recents.map((r) => ({
        id: r.itemId,
        itemId: r.itemId,
        isMovie: Boolean(r.isMovie),
        poster_path: r.poster_path,
        backdrop_path: r.backdrop_path,
        title: r.title,
        name: r.name,
        viewedAt: r.updatedAt,
      })),
      continueWatching: continueWatching.map((item) => ({
        id: item.itemId,
        itemId: item.itemId,
        isMovie: Boolean(item.isMovie),
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        title: item.title,
        name: item.name,
        watchLink: item.watchLink,
        watchProviderName: item.watchProviderName,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching user library:", error);
    return NextResponse.json(
      { error: "Failed to fetch user library" },
      { status: 500 }
    );
  }
}


