/**
 * Hydration Service Types
 *
 * Shared types between MongoDB and Lambda enrichment sources.
 * Using the same type makes them interchangeable - key for removing MongoDB later.
 */

// =============================================================================
// Enriched Data (from MongoDB OR Lambda)
// =============================================================================

export interface RatingData {
  score: number;
  voteCount?: number;
  sourceUrl?: string;
}

export interface RTCriticRating extends RatingData {
  certified?: boolean;
  consensus?: string;
  sentiment?: string; // "Fresh", "Certified Fresh", "Rotten"
}

export interface RTAudienceRating extends RatingData {
  certified?: boolean;
  sentiment?: string; // "Upright", "Spilled"
}

export interface EnrichedRatings {
  tmdb?: RatingData;
  imdb?: RatingData;
  rtCritic?: RTCriticRating;
  rtAudience?: RTAudienceRating;
  metacritic?: RatingData;
  letterboxd?: RatingData;
  google?: RatingData;
}

export interface ScrapedWatchLink {
  provider: string;
  link: string;
  price: string;
}

export interface EnrichedExternalIds {
  rottentomatoes?: string;
  metacritic?: string;
  letterboxd?: string;
  netflix?: string;
  apple?: string;
  amazon?: string;
  hotstar?: string; // Major Indian streaming platform
  prime?: string; // Amazon Prime (alternative key)
  wikidata?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
}

/**
 * Enriched data from MongoDB or Lambda
 * Both sources return this exact same shape - interchangeable
 */
export interface EnrichedData {
  ratings: EnrichedRatings | null;
  scrapedWatchLinks: ScrapedWatchLink[];
  externalIds: EnrichedExternalIds;

  /** Where this enriched data came from */
  source: "mongodb" | "lambda" | "postgres";
  /** When the enriched data was scraped */
  scrapedAt: Date | null;
}

// =============================================================================
// Hydration Result
// =============================================================================

export type HydrationSource =
  | "postgres_fresh" // Data was fresh in PostgreSQL
  | "hydrated_mongo" // Used MongoDB enriched data
  | "hydrated_lambda"; // Called Lambda for enriched data

export interface HydrationResult<T> {
  data: T;
  /** Enriched data (ratings, watch links, external IDs) */
  enriched: EnrichedData;
  /** Where the final data came from */
  source: HydrationSource;
  /** Where the enriched data (ratings, watch links) came from */
  enrichedSource: EnrichedSource | null;
}

export type EnrichedSource = "mongodb" | "lambda" | "postgres" | "none";

// =============================================================================
// Media Type
// =============================================================================

export type MediaType = "movie" | "series";

// =============================================================================
// MongoDB Document Shape (for type safety when reading)
// =============================================================================

export interface MongoEnrichedDocument {
  id: number;
  updatedAt?: string | Date;
  shallowUpdatedAt?: string | Date;
  migratedToPostgres?: boolean;
  migratedAt?: string | Date;

  external_data?: {
    ratings?: {
      imdb?: {
        rating?: number;
        ratingCount?: number;
        sourceUrl?: string;
        error?: string | null;
      };
      rottenTomatoes?: {
        critic?: {
          score?: number;
          ratingCount?: number;
          certified?: boolean;
          sentiment?: string;
          consensus?: string;
        };
        audience?: {
          score?: number;
          ratingCount?: number;
          certified?: boolean;
          sentiment?: string;
        };
        sourceUrl?: string;
        error?: string | null;
      };
    };
    externalIds?: {
      imdb_id?: string;
      tmdb_id?: string;
      rottentomatoes_id?: string;
      metacritic_id?: string;
      letterboxd_id?: string;
      netflix_id?: string;
      apple_id?: string;
      amazon_id?: string;
      hotstar_id?: string;
      prime_id?: string;
    };
  };

  googleData?: {
    ratings?: Array<{
      rating: string;
      name: string;
      link: string;
    }>;
    allWatchOptions?: Array<{
      link: string;
      name: string;
      price: string;
    }>;
    imdbId?: string;
    directorName?: string;
  };
}

// =============================================================================
// Lambda Response Shape
// =============================================================================

export interface LambdaEnrichmentResponse {
  success: boolean;
  ratings?: {
    imdb?: {
      rating: number;
      ratingCount: number;
      sourceUrl?: string;
    };
    rottenTomatoes?: {
      critic?: {
        score: number;
        ratingCount: number;
        certified?: boolean;
        consensus?: string;
        sentiment?: string;
      };
      audience?: {
        score: number;
        ratingCount: number;
        certified?: boolean;
        sentiment?: string;
      };
      sourceUrl?: string;
    };
  };
  watchLinks?: Array<{
    provider: string;
    link: string;
    price: string;
  }>;
  externalIds?: {
    rottentomatoes?: string;
    metacritic?: string;
    letterboxd?: string;
  };
  error?: string;
}
