"use server";

import {
  getTrendingMovies,
  getTrendingTV,
  getTrendingAll,
  getMovieImages,
  getSeriesImages,
} from "@/server/services/tmdb";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";
import type { MediaItem, MovieListItem, SeriesListItem } from "@/types";

/**
 * Map genre IDs to genre names
 */
function mapMovieGenres(item: Record<string, unknown>): MovieListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    title: item.title as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    release_date: item.release_date as string,
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: MOVIE_GENRES[id] || "Unknown" })),
    media_type: "movie",
  };
}

function mapTVGenres(item: Record<string, unknown>): SeriesListItem {
  const genreIds = (item.genre_ids as number[]) || [];
  return {
    id: item.id as number,
    name: item.name as string,
    poster_path: item.poster_path as string | null,
    backdrop_path: item.backdrop_path as string | null,
    vote_average: item.vote_average as number,
    vote_count: item.vote_count as number,
    first_air_date: item.first_air_date as string,
    overview: item.overview as string,
    popularity: item.popularity as number,
    adult: item.adult as boolean,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: TV_GENRES[id] || "Unknown" })),
    media_type: "tv",
  };
}

function mapMediaItem(item: Record<string, unknown>): MediaItem {
  const mediaType = item.media_type as string;
  if (mediaType === "movie") {
    return { ...mapMovieGenres(item), media_type: "movie" };
  } else {
    return { ...mapTVGenres(item), media_type: "tv" };
  }
}

/**
 * Fetch logo paths for hero items (best effort - failures don't block)
 */
async function fetchLogosForHeroItems(
  items: MediaItem[]
): Promise<Record<number, string | null>> {
  const logoMap: Record<number, string | null> = {};

  // Fetch logos in parallel with individual error handling
  await Promise.all(
    items.map(async (item) => {
      try {
        const isMovie = item.media_type === "movie";
        const images = isMovie
          ? await getMovieImages(item.id)
          : await getSeriesImages(item.id);

        // Get the first English logo, or first logo if no English available
        const logo = images.logos?.[0];
        logoMap[item.id] = logo?.file_path ?? null;
      } catch (error) {
        // Log but don't fail - logo is optional
        console.warn(`Failed to fetch logo for ${item.media_type} ${item.id}:`, error);
        logoMap[item.id] = null;
      }
    })
  );

  return logoMap;
}

export interface TrendingData {
  allItems: MediaItem[];
  movies: MovieListItem[];
  tv: SeriesListItem[];
  /** Map of item ID to TMDB logo path for hero carousel */
  logoMap: Record<number, string | null>;
}

/**
 * Get trending content for the homepage
 * Uses in-memory caching via the TMDB service
 */
export async function getTrending(): Promise<TrendingData> {
  try {
    // Fetch all trending data in parallel
    const [allTrending, moviesTrending, tvTrending] = await Promise.all([
      getTrendingAll("week"),
      getTrendingMovies("week"),
      getTrendingTV("week"),
    ]);

    // Map hero items (top 10 from all trending)
    const allItems = (allTrending.results as Record<string, unknown>[])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 10)
      .map(mapMediaItem);

    // Map movie and TV lists
    const movies = (moviesTrending.results as Record<string, unknown>[])
      .slice(0, 20)
      .map(mapMovieGenres);

    const tv = (tvTrending.results as Record<string, unknown>[])
      .slice(0, 20)
      .map(mapTVGenres);

    // Fetch logos for hero items (non-blocking)
    const logoMap = await fetchLogosForHeroItems(allItems);

    return {
      allItems,
      movies,
      tv,
      logoMap,
    };
  } catch (error) {
    console.error("Failed to fetch trending:", error);
    return {
      allItems: [],
      movies: [],
      tv: [],
      logoMap: {},
    };
  }
}
