/**
 * Cached MongoDB Queries
 *
 * Uses Next.js unstable_cache for MongoDB query caching.
 * These functions are used by server actions to avoid repeated DB hits.
 *
 * Includes uncached fallback versions for use outside Next.js runtime
 * (e.g., test scripts, standalone tools).
 */

import { unstable_cache as cache } from "next/cache";
import { connectDB } from "./index";
import { Movie as MovieModel } from "./models/movie";
import { Series as SeriesModel } from "./models/series";

// =============================================================================
// Uncached Fallbacks (for use outside Next.js runtime)
// =============================================================================

/**
 * Direct MongoDB query for movie ratings (no caching)
 * Used as fallback when unstable_cache isn't available
 */
export async function getMovieRatingsDirect(id: number) {
  await connectDB();
  const movie = await MovieModel.findOne({ id })
    .select("googleData external_data homepage")
    .lean();
  return movie;
}

/**
 * Direct MongoDB query for series ratings (no caching)
 */
export async function getSeriesRatingsDirect(id: number) {
  await connectDB();
  const series = await SeriesModel.findOne({ id })
    .select("googleData external_data homepage")
    .lean();
  return series;
}

// =============================================================================
// Cached Queries (Next.js runtime only)
// =============================================================================

/**
 * Get movie ratings and watch options data from MongoDB
 * Includes googleData (scraped ratings + watch options) and external_data
 * Cached for 1 hour with tag-based revalidation
 */
export const getCachedMovieRatings = cache(
  async (id: number) => {
    await connectDB();
    const movie = await MovieModel.findOne({ id })
      .select("googleData external_data homepage")
      .lean();
    return movie;
  },
  ["movie-ratings"],
  {
    revalidate: 3600, // 1 hour
    tags: ["movies"],
  }
);

/**
 * Get series ratings and watch options data from MongoDB
 * Includes googleData (scraped ratings + watch options) and external_data
 * Cached for 1 hour with tag-based revalidation
 */
export const getCachedSeriesRatings = cache(
  async (id: number) => {
    await connectDB();
    const series = await SeriesModel.findOne({ id })
      .select("googleData external_data homepage")
      .lean();
    return series;
  },
  ["series-ratings"],
  {
    revalidate: 3600, // 1 hour
    tags: ["series"],
  }
);

/**
 * Get multiple movie ratings in a batch
 * Useful for topics/discover pages that need ratings for many items
 */
export const getCachedMovieRatingsBatch = cache(
  async (ids: number[]) => {
    await connectDB();
    const movies = await MovieModel.find({ id: { $in: ids } })
      .select("id googleData external_data")
      .lean();
    return movies;
  },
  ["movie-ratings-batch"],
  {
    revalidate: 3600,
    tags: ["movies"],
  }
);

/**
 * Get multiple series ratings in a batch
 */
export const getCachedSeriesRatingsBatch = cache(
  async (ids: number[]) => {
    await connectDB();
    const series = await SeriesModel.find({ id: { $in: ids } })
      .select("id googleData external_data")
      .lean();
    return series;
  },
  ["series-ratings-batch"],
  {
    revalidate: 3600,
    tags: ["series"],
  }
);


