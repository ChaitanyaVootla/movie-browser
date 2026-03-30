import { NextResponse } from "next/server";
import { getUserRatings, getMovieDetails, getSeriesDetails } from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

/**
 * GET /api/user/ratings
 *
 * Returns all ratings with full movie/series details.
 * Grouped by: likes (rating=1) and dislikes (rating=-1)
 * Each group contains: movies[] and series[]
 */
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json(
        {
          likes: { movies: [], series: [] },
          dislikes: { movies: [], series: [] },
          totalCount: 0,
        },
        { status: 200 }
      );
    }

    // Get all ratings sorted by most recent
    const ratings = await getUserRatings(userId);

    // Separate by type and rating
    const likedMovieIds: number[] = [];
    const dislikedMovieIds: number[] = [];
    const likedSeriesIds: number[] = [];
    const dislikedSeriesIds: number[] = [];
    const ratingDates = new Map<string, Date>();

    for (const r of ratings) {
      const key = `${r.itemType}:${r.itemId}`;
      ratingDates.set(key, r.createdAt);

      if (r.itemType === "movie") {
        if (r.rating === 1) {
          likedMovieIds.push(r.itemId);
        } else if (r.rating === -1) {
          dislikedMovieIds.push(r.itemId);
        }
      } else if (r.itemType === "series") {
        if (r.rating === 1) {
          likedSeriesIds.push(r.itemId);
        } else if (r.rating === -1) {
          dislikedSeriesIds.push(r.itemId);
        }
      }
    }

    // Fetch all movie/series details in parallel
    const allMovieIds = [...likedMovieIds, ...dislikedMovieIds];
    const allSeriesIds = [...likedSeriesIds, ...dislikedSeriesIds];

    const [allMovies, allSeries] = await Promise.all([
      getMovieDetails(allMovieIds),
      getSeriesDetails(allSeriesIds),
    ]);

    // Create lookup maps
    const movieMap = new Map(allMovies.map((m) => [m.id, m]));
    const seriesMap = new Map(allSeries.map((s) => [s.id, s]));

    // Helper to enrich items with ratedAt date and preserve order
    const enrichMovies = (ids: number[]) =>
      ids
        .map((id) => {
          const movie = movieMap.get(id);
          if (!movie) return null;
          return {
            ...movie,
            ratedAt: ratingDates.get(`movie:${id}`),
          };
        })
        .filter(Boolean);

    const enrichSeries = (ids: number[]) =>
      ids
        .map((id) => {
          const series = seriesMap.get(id);
          if (!series) return null;
          return {
            ...series,
            ratedAt: ratingDates.get(`series:${id}`),
          };
        })
        .filter(Boolean);

    return NextResponse.json({
      likes: {
        movies: enrichMovies(likedMovieIds),
        series: enrichSeries(likedSeriesIds),
      },
      dislikes: {
        movies: enrichMovies(dislikedMovieIds),
        series: enrichSeries(dislikedSeriesIds),
      },
      totalCount: ratings.length,
    });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/ratings",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
