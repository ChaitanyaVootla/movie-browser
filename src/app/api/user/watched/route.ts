import { NextResponse } from "next/server";
import { getWatchedMovieIdsWithDates, getMovieDetails } from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

/**
 * GET /api/user/watched
 *
 * Returns all watched movies with full details.
 * Sorted by most recently marked as watched.
 */
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ movies: [], totalCount: 0, allGenres: [] }, { status: 200 });
    }

    // Get all watched movie IDs sorted by most recent
    const watchedItems = await getWatchedMovieIdsWithDates(userId);

    const movieIds = watchedItems.map((w) => w.movieId);

    if (movieIds.length === 0) {
      return NextResponse.json({ movies: [], totalCount: 0, allGenres: [] }, { status: 200 });
    }

    // Create a map for watchedAt dates
    const watchedDates = new Map(watchedItems.map((w) => [w.movieId, w.createdAt]));

    // Fetch full movie details
    const movies = await getMovieDetails(movieIds);

    // Create movie map for lookup
    const movieMap = new Map(movies.map((m) => [m.id, m]));

    // Build result preserving order from watchedItems
    const moviesWithDetails = watchedItems
      .map((item) => {
        const movie = movieMap.get(item.movieId);
        if (!movie) return null;
        return {
          ...movie,
          watchedAt: watchedDates.get(item.movieId),
        };
      })
      .filter(Boolean);

    // Collect all unique genres
    const genreMap = new Map<number, { id: number; name: string }>();
    for (const movie of moviesWithDetails) {
      if (movie?.genres) {
        for (const genre of movie.genres) {
          if (!genreMap.has(genre.id)) {
            genreMap.set(genre.id, genre);
          }
        }
      }
    }
    const allGenres = Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      movies: moviesWithDetails,
      totalCount: moviesWithDetails.length,
      allGenres,
    });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/watched",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch watched movies" }, { status: 500 });
  }
}
