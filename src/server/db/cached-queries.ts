/**
 * Cached Enrichment Queries (PostgreSQL)
 *
 * Serves scraped ratings + watch links from PostgreSQL (`ratings`,
 * `scraped_watch_links` tables) in the legacy MongoDB document shape
 * (`googleData` / `external_data`) so downstream consumers — `combineRatings`
 * and `getWatchOptionsForCountry` — are unchanged.
 *
 * History: this module used to read MongoDB `movies.googleData`. The Mongo
 * read path was removed for GA (June 2026) so the app runs fully on PostgreSQL
 * with the legacy Mongo box decommissioned.
 *
 * Uses Next.js unstable_cache (1hr TTL, tag-based revalidation), with uncached
 * fallback versions for use outside the Next.js runtime (test scripts, tools).
 */

import { unstable_cache as cache } from "next/cache";
import { prisma } from "@/server/db/postgres";

// =============================================================================
// Types (legacy MongoDB document shape, preserved for consumers)
// =============================================================================

interface LegacyGoogleRating {
  rating: string;
  name: string;
  link: string;
}

interface LegacyWatchOption {
  name: string;
  link: string;
  price?: string;
}

interface DetailedRtScore {
  score: number | null;
  ratingCount: number | null;
  certified: boolean | null;
  sentiment: string | null;
}

/**
 * Enrichment document in the legacy MongoDB shape.
 * `googleData.allWatchOptions` carries India-only scraped deep links;
 * `external_data.ratings` carries detailed IMDb/RT ratings.
 */
export interface EnrichmentDoc {
  id: number;
  homepage?: string | null;
  googleData?: {
    ratings?: LegacyGoogleRating[];
    allWatchOptions?: LegacyWatchOption[];
  };
  external_data?: {
    ratings?: {
      imdb?: { rating: number | null; ratingCount: number | null; sourceUrl?: string };
      rottenTomatoes?: {
        critic?: DetailedRtScore;
        audience?: DetailedRtScore;
        sourceUrl?: string;
      };
    };
  };
}

// Row shapes returned by the Prisma selects below
interface RatingRow {
  score: number;
  voteCount: number | null;
  certified: boolean | null;
  sentiment: string | null;
  sourceUrl: string | null;
  source: { slug: string };
}

interface WatchLinkRow {
  providerName: string;
  link: string;
  price: string | null;
  countryCode: string;
}

// =============================================================================
// Row → Legacy Doc Mapping
// =============================================================================

/**
 * Normalize PG sentiment strings ("Fresh", "Rotten", "Upright", "Spilled")
 * to the POSITIVE/NEGATIVE values the rating icons expect.
 */
function normalizeSentiment(sentiment: string | null): string | null {
  if (!sentiment) return null;
  const s = sentiment.toLowerCase();
  if (s.includes("fresh") || s.includes("upright") || s.includes("positive")) return "POSITIVE";
  if (s.includes("rotten") || s.includes("spilled") || s.includes("negative")) return "NEGATIVE";
  return null;
}

function buildEnrichmentDoc(
  id: number,
  homepage: string | null,
  ratingRows: RatingRow[],
  watchLinkRows: WatchLinkRow[]
): EnrichmentDoc {
  const googleRatings: LegacyGoogleRating[] = [];
  let imdb: { rating: number | null; ratingCount: number | null; sourceUrl?: string } | undefined;
  let rtCritic: DetailedRtScore | undefined;
  let rtAudience: DetailedRtScore | undefined;
  let rtSourceUrl: string | undefined;

  for (const r of ratingRows) {
    const slug = r.source.slug.toLowerCase();

    if (slug === "imdb") {
      // PG stores IMDb on its native 0-10 scale (combineRatings multiplies by 10)
      imdb = {
        rating: r.score,
        ratingCount: r.voteCount,
        sourceUrl: r.sourceUrl ?? undefined,
      };
    } else if (slug === "rt_critic" || slug === "rottentomatoes_critic") {
      rtCritic = {
        score: r.score, // 0-100
        ratingCount: r.voteCount,
        certified: r.certified,
        sentiment: normalizeSentiment(r.sentiment),
      };
      rtSourceUrl = r.sourceUrl ?? rtSourceUrl;
    } else if (slug === "rt_audience" || slug === "rottentomatoes_audience") {
      rtAudience = {
        score: r.score, // 0-100
        ratingCount: r.voteCount,
        certified: r.certified,
        sentiment: normalizeSentiment(r.sentiment),
      };
      rtSourceUrl = rtSourceUrl ?? (r.sourceUrl ?? undefined);
    } else if (slug === "google") {
      // Legacy googleData path: combineRatings parses the string score (0-100)
      googleRatings.push({
        name: "Google",
        rating: String(Math.round(r.score)),
        link: r.sourceUrl ?? "https://www.google.com",
      });
    }
    // tmdb/metacritic/letterboxd rows are intentionally ignored: TMDB comes
    // from the API response; the others are excluded from display.
  }

  // googleData.allWatchOptions is India-only by contract (see lib/watch-options.ts)
  const indiaWatchOptions: LegacyWatchOption[] = watchLinkRows
    .filter((l) => l.countryCode === "IN")
    .map((l) => ({
      name: l.providerName,
      link: l.link,
      price: l.price ?? undefined,
    }));

  const hasRt = rtCritic || rtAudience;
  const externalRatings =
    imdb || hasRt
      ? {
          ...(imdb ? { imdb } : {}),
          ...(hasRt
            ? {
                rottenTomatoes: {
                  ...(rtCritic ? { critic: rtCritic } : {}),
                  ...(rtAudience ? { audience: rtAudience } : {}),
                  ...(rtSourceUrl ? { sourceUrl: rtSourceUrl } : {}),
                },
              }
            : {}),
        }
      : undefined;

  return {
    id,
    homepage,
    googleData: {
      ...(googleRatings.length > 0 ? { ratings: googleRatings } : {}),
      ...(indiaWatchOptions.length > 0 ? { allWatchOptions: indiaWatchOptions } : {}),
    },
    ...(externalRatings ? { external_data: { ratings: externalRatings } } : {}),
  };
}

// =============================================================================
// PostgreSQL Queries
// =============================================================================

const ratingSelect = {
  score: true,
  voteCount: true,
  certified: true,
  sentiment: true,
  sourceUrl: true,
  source: { select: { slug: true } },
} as const;

const watchLinkSelect = {
  providerName: true,
  link: true,
  price: true,
  countryCode: true,
} as const;

async function queryMovieEnrichment(id: number): Promise<EnrichmentDoc | null> {
  const movie = await prisma.movie.findUnique({
    where: { id },
    select: {
      id: true,
      homepage: true,
      ratings: { select: ratingSelect },
      scrapedWatchLinks: { select: watchLinkSelect },
    },
  });
  if (!movie) return null;
  return buildEnrichmentDoc(movie.id, movie.homepage, movie.ratings, movie.scrapedWatchLinks);
}

async function querySeriesEnrichment(id: number): Promise<EnrichmentDoc | null> {
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      homepage: true,
      ratings: { select: ratingSelect },
      scrapedWatchLinks: { select: watchLinkSelect },
    },
  });
  if (!series) return null;
  return buildEnrichmentDoc(series.id, series.homepage, series.ratings, series.scrapedWatchLinks);
}

async function queryMovieEnrichmentBatch(ids: number[]): Promise<EnrichmentDoc[]> {
  const movies = await prisma.movie.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      homepage: true,
      ratings: { select: ratingSelect },
      scrapedWatchLinks: { select: watchLinkSelect },
    },
  });
  return movies.map((m) => buildEnrichmentDoc(m.id, m.homepage, m.ratings, m.scrapedWatchLinks));
}

async function querySeriesEnrichmentBatch(ids: number[]): Promise<EnrichmentDoc[]> {
  const series = await prisma.series.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      homepage: true,
      ratings: { select: ratingSelect },
      scrapedWatchLinks: { select: watchLinkSelect },
    },
  });
  return series.map((s) => buildEnrichmentDoc(s.id, s.homepage, s.ratings, s.scrapedWatchLinks));
}

// =============================================================================
// Uncached Fallbacks (for use outside Next.js runtime)
// =============================================================================

/**
 * Direct PostgreSQL query for movie ratings (no caching)
 * Used as fallback when unstable_cache isn't available
 */
export async function getMovieRatingsDirect(id: number): Promise<EnrichmentDoc | null> {
  return queryMovieEnrichment(id);
}

/**
 * Direct PostgreSQL query for series ratings (no caching)
 */
export async function getSeriesRatingsDirect(id: number): Promise<EnrichmentDoc | null> {
  return querySeriesEnrichment(id);
}

// =============================================================================
// Cached Queries (Next.js runtime only)
// =============================================================================

/**
 * Get movie ratings and watch options data from PostgreSQL
 * Includes googleData (scraped ratings + watch options) and external_data
 * Cached for 1 hour with tag-based revalidation
 */
export const getCachedMovieRatings = cache(
  async (id: number) => queryMovieEnrichment(id),
  ["movie-ratings"],
  {
    revalidate: 3600, // 1 hour
    tags: ["movies"],
  }
);

/**
 * Get series ratings and watch options data from PostgreSQL
 * Includes googleData (scraped ratings + watch options) and external_data
 * Cached for 1 hour with tag-based revalidation
 */
export const getCachedSeriesRatings = cache(
  async (id: number) => querySeriesEnrichment(id),
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
  async (ids: number[]) => queryMovieEnrichmentBatch(ids),
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
  async (ids: number[]) => querySeriesEnrichmentBatch(ids),
  ["series-ratings-batch"],
  {
    revalidate: 3600,
    tags: ["series"],
  }
);
