/**
 * API Route: Fetch data for AI chat tags
 *
 * Used by the chat UI to fetch ratings, watch options, and trailer data
 * for [RATINGS], [WATCH], and [TRAILER] tags.
 *
 * POST /api/ai/tag-data
 * Body: { movieIds?, seriesIds?, personIds?, trailerMovieIds?, trailerSeriesIds? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLightMovieDetails,
  getLightSeriesDetails,
  getLightPersonDetails,
  getCountryCode,
} from "@/server/utils";
import { fetchFromTMDB } from "@/server/services/tmdb";
import { CACHE_DURATIONS } from "@/lib/constants";

// =============================================================================
// Types
// =============================================================================

interface TagDataResponse {
  movies: Record<number, MovieTagData | null>;
  series: Record<number, SeriesTagData | null>;
  persons: Record<number, PersonTagData | null>;
  trailers: Record<string, TrailerData | null>; // key: "movie:id" or "series:id"
}

interface MovieTagData {
  id: number;
  title: string;
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }>;
}

interface SeriesTagData {
  id: number;
  name: string;
  ratings: {
    tmdb?: number;
    imdb?: number;
    rottenTomatoes?: number;
    audience?: number;
  };
  watchLinks: Array<{
    provider: string;
    type: string;
    link: string;
    hasDeepLink: boolean;
    logo: string;
  }>;
}

interface PersonTagData {
  id: number;
  name: string;
  knownFor: string;
  profilePath: string | null;
}

interface TrailerData {
  youtubeKey: string;
  name: string;
  official: boolean;
}

interface TMDBVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

interface VideosResponse {
  results: TMDBVideo[];
}

// =============================================================================
// Schema
// =============================================================================

const requestSchema = z.object({
  movieIds: z.array(z.number()).optional().default([]),
  seriesIds: z.array(z.number()).optional().default([]),
  personIds: z.array(z.number()).optional().default([]),
  trailerMovieIds: z.array(z.number()).optional().default([]),
  trailerSeriesIds: z.array(z.number()).optional().default([]),
});


// =============================================================================
// Route Handler
// =============================================================================

/**
 * Fetch the best trailer for a movie or series
 */
async function fetchTrailer(
  id: number,
  mediaType: "movie" | "series"
): Promise<TrailerData | null> {
  try {
    const endpoint = mediaType === "movie" ? `/movie/${id}/videos` : `/tv/${id}/videos`;
    const data = await fetchFromTMDB<VideosResponse>(endpoint, {
      cacheNamespace: mediaType,
      cacheTTL: mediaType === "movie" ? CACHE_DURATIONS.movie : CACHE_DURATIONS.series,
    });

    if (!data?.results?.length) return null;

    // Filter to YouTube trailers/teasers only
    const trailers = data.results
      .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
      .sort((a, b) => {
        // Prefer official first
        if (a.official !== b.official) return a.official ? -1 : 1;
        // Then prefer newer
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });

    if (trailers.length === 0) return null;

    const best = trailers[0];
    return {
      youtubeKey: best.key,
      name: best.name,
      official: best.official,
    };
  } catch (error) {
    console.error(`Failed to fetch trailer for ${mediaType}:${id}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movieIds, seriesIds, personIds, trailerMovieIds, trailerSeriesIds } =
      requestSchema.parse(body);

    // Limit batch size to prevent abuse
    const MAX_BATCH = 10;
    const limitedMovieIds = movieIds.slice(0, MAX_BATCH);
    const limitedSeriesIds = seriesIds.slice(0, MAX_BATCH);
    const limitedPersonIds = personIds.slice(0, MAX_BATCH);
    const limitedTrailerMovieIds = trailerMovieIds.slice(0, MAX_BATCH);
    const limitedTrailerSeriesIds = trailerSeriesIds.slice(0, MAX_BATCH);

    // Get country code for watch options
    const countryCode = await getCountryCode();

    // Fetch all data in parallel
    const [movies, series, persons, movieTrailers, seriesTrailers] = await Promise.all([
      Promise.all(
        limitedMovieIds.map(async (id) => {
          const data = await getLightMovieDetails(id, countryCode);
          if (!data) return [id, null] as const;

          return [
            id,
            {
              id: data.id,
              title: data.title,
              ratings: data.ratings,
              watchLinks: data.watchLinks,
            } satisfies MovieTagData,
          ] as const;
        })
      ),
      Promise.all(
        limitedSeriesIds.map(async (id) => {
          const data = await getLightSeriesDetails(id, countryCode);
          if (!data) return [id, null] as const;

          return [
            id,
            {
              id: data.id,
              name: data.name,
              ratings: data.ratings,
              watchLinks: data.watchLinks,
            } satisfies SeriesTagData,
          ] as const;
        })
      ),
      Promise.all(
        limitedPersonIds.map(async (id) => {
          const data = await getLightPersonDetails(id);
          if (!data) return [id, null] as const;

          return [
            id,
            {
              id: data.id,
              name: data.name,
              knownFor: data.knownFor,
              profilePath: data.profilePath,
            } satisfies PersonTagData,
          ] as const;
        })
      ),
      // Fetch movie trailers
      Promise.all(
        limitedTrailerMovieIds.map(async (id) => {
          const trailer = await fetchTrailer(id, "movie");
          return [`movie:${id}`, trailer] as const;
        })
      ),
      // Fetch series trailers
      Promise.all(
        limitedTrailerSeriesIds.map(async (id) => {
          const trailer = await fetchTrailer(id, "series");
          return [`series:${id}`, trailer] as const;
        })
      ),
    ]);

    // Convert to records
    const response: TagDataResponse = {
      movies: Object.fromEntries(movies),
      series: Object.fromEntries(series),
      persons: Object.fromEntries(persons),
      trailers: Object.fromEntries([...movieTrailers, ...seriesTrailers]),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Tag data API error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch tag data" },
      { status: 500 }
    );
  }
}

