import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { MoviesWatchlist, SeriesWatchlist } from "@/server/db/models/user-library";
import { Movie } from "@/server/db/models/movie";
import { Series } from "@/server/db/models/series";
import { getUserIdForDb } from "@/lib/user-id";

/**
 * GET /api/user/watchlist
 *
 * Returns full watchlist items with movie/series details.
 * Used by the watchlist page.
 */
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ movies: [], series: [] }, { status: 200 });
    }

    await connectDB();

    // Get watchlist IDs
    const [movieWatchlist, seriesWatchlist] = await Promise.all([
      MoviesWatchlist.find({ userId })
        .select("movieId createdAt -_id")
        .sort({ createdAt: -1 })
        .lean(),
      SeriesWatchlist.find({ userId })
        .select("seriesId createdAt -_id")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const movieIds = movieWatchlist.map((m) => m.movieId);
    const seriesIds = seriesWatchlist.map((s) => s.seriesId);

    // Fetch full movie/series details
    const [movies, series] = await Promise.all([
      movieIds.length > 0
        ? Movie.find({ id: { $in: movieIds } })
            .select(
              "id title poster_path backdrop_path genres vote_average overview release_date runtime"
            )
            .lean()
        : [],
      seriesIds.length > 0
        ? Series.find({ id: { $in: seriesIds } })
            .select(
              "id name poster_path backdrop_path genres vote_average overview first_air_date status number_of_seasons next_episode_to_air last_episode_to_air"
            )
            .lean()
        : [],
    ]);

    // Create lookup maps
    const movieMap = new Map(movies.map((m) => [m.id, m]));
    const seriesMap = new Map(series.map((s) => [s.id, s]));

    // Merge watchlist data with full details, preserving order
    const moviesWithDetails = movieWatchlist
      .map((item) => {
        const movie = movieMap.get(item.movieId);
        if (!movie) return null;
        return {
          ...movie,
          addedAt: item.createdAt,
        };
      })
      .filter(Boolean);

    const seriesWithDetails = seriesWatchlist
      .map((item) => {
        const seriesItem = seriesMap.get(item.seriesId);
        if (!seriesItem) return null;
        return {
          ...seriesItem,
          addedAt: item.createdAt,
        };
      })
      .filter(Boolean);

    // Categorize series by status for the watchlist page
    const categorizedSeries = categorizeSeries(seriesWithDetails as SeriesWithDetails[]);

    return NextResponse.json({
      movies: moviesWithDetails,
      series: categorizedSeries,
    });
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

interface SeriesWithDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  status: string;
  number_of_seasons: number;
  next_episode_to_air?: { air_date: string } | null;
  last_episode_to_air?: { air_date: string } | null;
  addedAt: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function categorizeSeries(series: SeriesWithDetails[]) {
  const currentlyAiring: SeriesWithDetails[] = [];
  const returning: SeriesWithDetails[] = [];
  const completed: SeriesWithDetails[] = [];

  for (const s of series) {
    const hasUpcoming = s.next_episode_to_air?.air_date;

    if (hasUpcoming) {
      currentlyAiring.push(s);
    } else if (
      s.status === "Returning Series" ||
      s.status === "In Production" ||
      s.status === "Planned"
    ) {
      returning.push(s);
    } else {
      completed.push(s);
    }
  }

  return {
    currentlyAiring,
    returning,
    completed,
    totalCount: series.length,
  };
}

