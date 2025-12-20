"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getMovieDetails, getMovieCollection } from "@/server/services/tmdb";
import { getCachedMovieRatings } from "@/server/db/cached-queries";
import { combineRatings, type ProcessedRating } from "@/lib/ratings";
import {
  getWatchOptionsForCountry,
  getOptimizedWatchProviders,
} from "@/lib/watch-options";
import type { Movie, Collection, ExternalRating, WatchProviderData } from "@/types";

const GetMovieSchema = z.object({
  id: z.number().positive(),
});

/**
 * Get country code from request headers
 * Falls back to IN (India) if not available
 */
async function getCountryCode(): Promise<string> {
  try {
    const headersList = await headers();
    // Check for nginx-injected header or query param
    return headersList.get("x-country-code") || "IN";
  } catch {
    return "IN";
  }
}

/**
 * Get full movie details including credits, videos, images, keywords, recommendations, watch providers, and ratings
 * Fetches from MongoDB first (for ratings data), then enriches with fresh TMDB data
 */
export async function getMovie(id: number): Promise<Movie | null> {
  try {
    const validated = GetMovieSchema.parse({ id });

    // Fetch TMDB data, cached MongoDB ratings, and country code in parallel
    const [tmdbData, dbMovie, countryCode] = await Promise.all([
      getMovieDetails(validated.id),
      getCachedMovieRatings(validated.id), // Uses Next.js cache with 1hr TTL
      getCountryCode(),
    ]);

    if (!tmdbData || !tmdbData.id) {
      return null;
    }

    // Fetch collection details if movie belongs to a collection
    let collectionDetails: Collection | undefined;
    if (tmdbData.belongs_to_collection) {
      const collection = tmdbData.belongs_to_collection as { id: number };
      try {
        const collectionData = await getMovieCollection(collection.id);
        collectionDetails = {
          id: collectionData.id as number,
          name: collectionData.name as string,
          overview: collectionData.overview as string | undefined,
          poster_path: collectionData.poster_path as string | null,
          backdrop_path: collectionData.backdrop_path as string | null,
          parts: collectionData.parts as Collection["parts"],
        };
      } catch {
        // Collection fetch failed, continue without it
      }
    }

    // Combine ratings from multiple sources
    const googleData = dbMovie?.googleData as Record<string, unknown> | undefined;
    const externalData = dbMovie?.external_data as Record<string, unknown> | undefined;

    const processedRatings = combineRatings(
      googleData as Parameters<typeof combineRatings>[0],
      externalData as Parameters<typeof combineRatings>[1],
      tmdbData.vote_average as number,
      tmdbData.vote_count as number,
      validated.id,
      "movie"
    );

    // Convert ProcessedRating[] to ExternalRating[] for the Movie type
    const ratings: ExternalRating[] = processedRatings.map((r: ProcessedRating) => ({
      name: r.label,
      rating: r.score.toString(),
      link: r.link,
      certified: r.certified,
      sentiment: r.sentiment,
    }));

    // Process watch options for the user's country
    const tmdbWatchProviders = (tmdbData["watch/providers"] as Record<string, unknown>)
      ?.results as Record<string, WatchProviderData> | undefined;

    const watchOptions = getWatchOptionsForCountry(
      countryCode,
      googleData as { allWatchOptions?: Array<{ name: string; link: string; price?: string }> },
      tmdbWatchProviders
    );

    // Get optimized watch providers (only relevant countries, not all)
    const optimizedWatchProviders = getOptimizedWatchProviders(countryCode, tmdbWatchProviders);

    // Transform TMDB response to our Movie type with ratings
    return {
      id: tmdbData.id as number,
      title: tmdbData.title as string,
      original_title: tmdbData.original_title as string,
      overview: tmdbData.overview as string,
      poster_path: tmdbData.poster_path as string | null,
      backdrop_path: tmdbData.backdrop_path as string | null,
      release_date: tmdbData.release_date as string,
      runtime: tmdbData.runtime as number,
      vote_average: tmdbData.vote_average as number,
      vote_count: tmdbData.vote_count as number,
      popularity: tmdbData.popularity as number,
      adult: tmdbData.adult as boolean,
      genres: tmdbData.genres as Movie["genres"],
      production_companies: tmdbData.production_companies as Movie["production_companies"],
      homepage: tmdbData.homepage as string | undefined,
      imdb_id: tmdbData.imdb_id as string | undefined,
      tagline: tmdbData.tagline as string | undefined,
      status: tmdbData.status as string | undefined,
      budget: tmdbData.budget as number | undefined,
      revenue: tmdbData.revenue as number | undefined,
      original_language: tmdbData.original_language as string | undefined,
      origin_country: tmdbData.origin_country as string[] | undefined,
      spoken_languages: tmdbData.spoken_languages as Movie["spoken_languages"],
      credits: tmdbData.credits as Movie["credits"],
      videos: tmdbData.videos as Movie["videos"],
      images: tmdbData.images as Movie["images"],
      keywords: tmdbData.keywords as Movie["keywords"],
      recommendations: tmdbData.recommendations as Movie["recommendations"],
      similar: tmdbData.similar as Movie["similar"],
      watch_providers: optimizedWatchProviders,
      belongs_to_collection: tmdbData.belongs_to_collection as Movie["belongs_to_collection"],
      collectionDetails,
      ratings,
      watch_options: watchOptions,
    };
  } catch (error) {
    console.error("Error fetching movie:", error);
    return null;
  }
}

/**
 * Get minimal movie info (for cards, lists)
 */
export async function getMovieBasic(id: number) {
  const movie = await getMovie(id);
  if (!movie) return null;

  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    vote_average: movie.vote_average,
    release_date: movie.release_date,
    genres: movie.genres,
  };
}

