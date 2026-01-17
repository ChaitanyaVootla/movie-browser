/**
 * PostgreSQL Source Types
 *
 * Shared type definitions and interfaces for PostgreSQL operations.
 */

import { prisma } from "@/server/db/postgres";

// =============================================================================
// Prisma Transaction Type
// =============================================================================

/**
 * Type for Prisma transaction client
 * Used throughout upsert functions to ensure transactional consistency
 */
export type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// =============================================================================
// PostgreSQL Data Types
// =============================================================================

export interface PostgresMovieData {
  id: number;
  title: string;
  releaseDate: Date | null;
  updatedAt: Date;
  // Enriched data freshness tracking
  ratingsScrapedAt: Date | null;
  watchLinksScrapedAt: Date | null;
  enrichmentSource: string | null;
  // ... other fields populated by include
  ratings: Array<{
    score: number;
    voteCount: number | null;
    certified: boolean | null;
    consensus: string | null;
    sentiment: string | null;
    sourceUrl: string | null;
    source: { slug: string; name: string };
  }>;
  externalIds: Array<{
    source: string;
    externalId: string;
  }>;
  scrapedWatchLinks: Array<{
    providerName: string;
    link: string;
    price: string | null;
  }>;
}

export interface PostgresSeriesData {
  id: number;
  name: string;
  firstAirDate: Date | null;
  updatedAt: Date;
  // Enriched data freshness tracking
  ratingsScrapedAt: Date | null;
  watchLinksScrapedAt: Date | null;
  enrichmentSource: string | null;
  ratings: PostgresMovieData["ratings"];
  externalIds: PostgresMovieData["externalIds"];
  scrapedWatchLinks: PostgresMovieData["scrapedWatchLinks"];
}

// =============================================================================
// Season/Episode Types
// =============================================================================

export interface SeasonWithEpisodes {
  id: number;
  season_number: number;
  name: string;
  overview?: string | null;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  episodes?: Array<{
    id: number;
    episode_number: number;
    name: string;
    overview?: string | null;
    still_path: string | null;
    air_date: string | null;
    runtime?: number | null;
    vote_average?: number;
    vote_count?: number;
    episode_type?: string;
    production_code?: string;
  }>;
}
