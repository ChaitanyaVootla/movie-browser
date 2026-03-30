import { NextResponse } from "next/server";
import { getLibraryData } from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

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

    const data = await getLibraryData(userId);

    return NextResponse.json({
      watchedMovies: data.watchedMovieIds,
      watchlistMovies: data.watchlistMovieIds,
      watchlistSeries: data.watchlistSeriesIds,
      ratings: data.ratings,
      recents: data.recentItems.map((r) => ({
        id: r.itemId,
        itemId: r.itemId,
        isMovie: r.isMovie,
        poster_path: r.poster_path,
        backdrop_path: r.backdrop_path,
        title: r.title,
        name: r.name,
        viewedAt: r.viewedAt,
      })),
      continueWatching: data.continueWatchingItems.map((item) => ({
        id: item.itemId,
        itemId: item.itemId,
        isMovie: item.isMovie,
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
    userApiLogger.error({
      route: "/api/user/library",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch user library" }, { status: 500 });
  }
}
