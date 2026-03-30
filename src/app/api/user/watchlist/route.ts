import { NextResponse } from "next/server";
import {
  getMovieWatchlistWithDates,
  getSeriesWatchlistWithDates,
  getMovieDetails,
  getSeriesDetails,
} from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

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

    // Get watchlist IDs with dates
    const [movieWatchlist, seriesWatchlist] = await Promise.all([
      getMovieWatchlistWithDates(userId),
      getSeriesWatchlistWithDates(userId),
    ]);

    const movieIds = movieWatchlist.map((m) => m.movieId);
    const seriesIds = seriesWatchlist.map((s) => s.seriesId);

    // Fetch full movie/series details
    const [movies, series] = await Promise.all([
      getMovieDetails(movieIds),
      getSeriesDetails(seriesIds),
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
          addedAt: item.addedAt,
        };
      })
      .filter(Boolean);

    const seriesWithDetails = seriesWatchlist
      .map((item) => {
        const seriesItem = seriesMap.get(item.seriesId);
        if (!seriesItem) return null;
        return {
          ...seriesItem,
          addedAt: item.addedAt,
        };
      })
      .filter(Boolean);

    // Categorize series by status for the watchlist page
    const categorizedSeries = categorizeSeries(seriesWithDetails as SeriesWithDetails[]);

    // Categorize movies by release status
    const categorizedMovies = categorizeMovies(moviesWithDetails as MovieWithDetails[]);

    return NextResponse.json({
      movies: categorizedMovies,
      series: categorizedSeries,
    });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/watchlist",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

interface SeriesWithDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  status: string | null;
  number_of_seasons: number | null;
  next_episode_to_air?: unknown;
  last_episode_to_air?: unknown;
  addedAt: Date;
  [key: string]: unknown;
}

interface MovieWithDetails {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string | null;
  vote_average: number | null;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  addedAt: Date;
  [key: string]: unknown;
}

function categorizeMovies(movies: MovieWithDetails[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 60 days ago for "new releases"
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const newAndUpcoming: MovieWithDetails[] = [];
  const collection: MovieWithDetails[] = [];

  for (const movie of movies) {
    if (!movie.release_date) {
      collection.push(movie);
      continue;
    }

    const releaseDate = new Date(movie.release_date);
    releaseDate.setHours(0, 0, 0, 0);

    if (releaseDate > today || releaseDate >= sixtyDaysAgo) {
      newAndUpcoming.push(movie);
    } else {
      collection.push(movie);
    }
  }

  // Sort New & Upcoming: upcoming first (by date asc), then new releases (by date desc)
  newAndUpcoming.sort((a, b) => {
    const dateA = new Date(a.release_date || "");
    const dateB = new Date(b.release_date || "");
    const isUpcomingA = dateA > today;
    const isUpcomingB = dateB > today;

    // Upcoming movies come first
    if (isUpcomingA && !isUpcomingB) return -1;
    if (!isUpcomingA && isUpcomingB) return 1;

    // Within upcoming: soonest first
    if (isUpcomingA && isUpcomingB) {
      return dateA.getTime() - dateB.getTime();
    }

    // Within new releases: most recent first
    return dateB.getTime() - dateA.getTime();
  });

  // Sort Collection by addedAt (most recent first)
  collection.sort((a, b) => {
    const dateA = new Date(a.addedAt).getTime();
    const dateB = new Date(b.addedAt).getTime();
    return dateB - dateA;
  });

  // Collect all unique genres from all movies
  const genreMap = new Map<number, { id: number; name: string }>();
  for (const movie of movies) {
    if (movie.genres) {
      for (const genre of movie.genres) {
        if (!genreMap.has(genre.id)) {
          genreMap.set(genre.id, genre);
        }
      }
    }
  }
  const allGenres = Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    newAndUpcoming,
    collection,
    allGenres,
    totalCount: movies.length,
  };
}

function categorizeSeries(series: SeriesWithDetails[]) {
  const currentlyAiring: SeriesWithDetails[] = [];
  const returning: SeriesWithDetails[] = [];
  const completed: SeriesWithDetails[] = [];

  for (const s of series) {
    const nextEp = s.next_episode_to_air as { air_date?: string } | null | undefined;
    const hasUpcoming = nextEp?.air_date;

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

  // Sort Currently Airing by next episode date (soonest first)
  currentlyAiring.sort((a, b) => {
    const nextA = a.next_episode_to_air as { air_date?: string } | null | undefined;
    const nextB = b.next_episode_to_air as { air_date?: string } | null | undefined;
    const dateA = nextA?.air_date || "";
    const dateB = nextB?.air_date || "";
    return dateA.localeCompare(dateB);
  });

  // Sort Returning by last air date (most recent first)
  returning.sort((a, b) => {
    const lastA = a.last_episode_to_air as { air_date?: string } | null | undefined;
    const lastB = b.last_episode_to_air as { air_date?: string } | null | undefined;
    const dateA = lastA?.air_date || "";
    const dateB = lastB?.air_date || "";
    return dateB.localeCompare(dateA);
  });

  // Sort Completed by last air date (most recent first)
  completed.sort((a, b) => {
    const lastA = a.last_episode_to_air as { air_date?: string } | null | undefined;
    const lastB = b.last_episode_to_air as { air_date?: string } | null | undefined;
    const dateA = lastA?.air_date || "";
    const dateB = lastB?.air_date || "";
    return dateB.localeCompare(dateA);
  });

  return {
    currentlyAiring,
    returning,
    completed,
    totalCount: series.length,
  };
}
