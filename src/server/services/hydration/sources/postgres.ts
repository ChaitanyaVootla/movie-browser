/**
 * PostgreSQL Source for Hydration
 *
 * Checks PostgreSQL for fresh data and upserts merged data.
 *
 * ✅ KEEP FOREVER - PostgreSQL is our primary data store
 */

import { prisma } from "@/server/db/postgres";
import { isDataStale, parseDate } from "@/lib/data-freshness";
import type { MediaType, EnrichedData, EnrichedRatings, EnrichedExternalIds, ScrapedWatchLink } from "../types";
import type { TmdbMovieData, TmdbSeriesData } from "./tmdb";

// =============================================================================
// Types
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
// Fetch from PostgreSQL
// =============================================================================

/**
 * Fetch movie from PostgreSQL with all relations
 */
export async function fetchMovieFromPostgres(movieId: number): Promise<PostgresMovieData | null> {
  try {
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      include: {
        // Enriched data
        ratings: {
          include: { source: true },
        },
        externalIds: true,
        scrapedWatchLinks: true,
        // TMDB data
        genres: {
          include: { genre: true },
        },
        keywords: {
          include: { keyword: true },
        },
        companies: {
          include: { company: true },
        },
        countries: {
          include: { country: true },
        },
        languages: {
          include: { language: true },
        },
        certifications: true,
        videos: true,
        images: true,
        credits: {
          include: { person: true },
        },
        watchOptions: {
          include: { provider: true },
        },
        collection: true,
      },
    });

    return movie as PostgresMovieData | null;
  } catch (error: any) {
    // P2022 = column doesn't exist - schema out of sync, run `prisma db push`
    if (error?.code === "P2022") {
      console.warn(`[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Movie ${movieId}`);
    } else {
      console.error(`[Hydration/Postgres] Error fetching movie ${movieId}:`, error?.message || error);
    }
    return null;
  }
}

/**
 * Fetch series from PostgreSQL with all relations
 */
export async function fetchSeriesFromPostgres(seriesId: number): Promise<PostgresSeriesData | null> {
  try {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        // Enriched data
        ratings: {
          include: { source: true },
        },
        externalIds: true,
        scrapedWatchLinks: true,
        // TMDB data
        genres: {
          include: { genre: true },
        },
        keywords: {
          include: { keyword: true },
        },
        networks: {
          include: { network: true },
        },
        companies: {
          include: { company: true },
        },
        creators: {
          include: { person: true },
        },
        certifications: true,
        videos: true,
        images: true,
        credits: {
          include: { person: true },
        },
        watchOptions: {
          include: { provider: true },
        },
        seasons: {
          include: {
            episodes: true,
          },
          orderBy: { seasonNumber: "asc" },
        },
      },
    });

    return series as PostgresSeriesData | null;
  } catch (error: any) {
    if (error?.code === "P2022") {
      console.warn(`[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Series ${seriesId}`);
    } else {
      console.error(`[Hydration/Postgres] Error fetching series ${seriesId}:`, error?.message || error);
    }
    return null;
  }
}

/**
 * Check if PostgreSQL TMDB data is fresh
 */
export function isPostgresFresh(
  updatedAt: Date | null,
  releaseDate: Date | string | null
): boolean {
  if (!updatedAt) return false;
  const releaseDateObj = parseDate(releaseDate);
  return !isDataStale(updatedAt, releaseDateObj);
}

/**
 * Check if PostgreSQL has fresh enriched data (ratings, watch links)
 * Returns true if:
 * - Has ratings AND ratingsScrapedAt is fresh
 * - OR has scraped watch links AND watchLinksScrapedAt is fresh
 */
export function isPostgresEnrichedFresh(
  pgData: {
    ratings: unknown[];
    scrapedWatchLinks: unknown[];
    ratingsScrapedAt: Date | null;
    watchLinksScrapedAt: Date | null;
  } | null,
  releaseDate: Date | string | null
): boolean {
  if (!pgData) return false;

  const releaseDateObj = parseDate(releaseDate);

  // Check ratings freshness
  const hasRatings = pgData.ratings.length > 0;
  const ratingsScrapedAt = pgData.ratingsScrapedAt;
  const ratingsFresh = hasRatings && ratingsScrapedAt && !isDataStale(ratingsScrapedAt, releaseDateObj);

  // Check watch links freshness (optional - not all content has watch links)
  // const hasWatchLinks = pgData.scrapedWatchLinks.length > 0;
  // const watchLinksFresh = hasWatchLinks && pgData.watchLinksScrapedAt && !isDataStale(pgData.watchLinksScrapedAt, releaseDateObj);

  // Consider enriched data fresh if ratings are fresh
  // Watch links are less critical - they're also provided by TMDB
  return !!ratingsFresh;
}

// =============================================================================
// Upsert to PostgreSQL
// =============================================================================

/**
 * Upsert movie with all related data to PostgreSQL
 */
export async function upsertMovieToPostgres(
  tmdb: TmdbMovieData,
  enriched: EnrichedData
): Promise<void> {
  try {
    // Increase timeout for large movies with lots of credits/images
    await prisma.$transaction(async (tx) => {
      // 0. Upsert collection if exists (must be done before movie due to FK constraint)
      if (tmdb.belongs_to_collection) {
        await tx.collection.upsert({
          where: { id: tmdb.belongs_to_collection.id },
          create: {
            id: tmdb.belongs_to_collection.id,
            name: tmdb.belongs_to_collection.name,
            posterPath: tmdb.belongs_to_collection.poster_path,
            backdropPath: tmdb.belongs_to_collection.backdrop_path,
          },
          update: {
            name: tmdb.belongs_to_collection.name,
            posterPath: tmdb.belongs_to_collection.poster_path,
            backdropPath: tmdb.belongs_to_collection.backdrop_path,
          },
        });
      }

      // 1. Upsert core movie
      await tx.movie.upsert({
        where: { id: tmdb.id },
        create: {
          id: tmdb.id,
          title: tmdb.title,
          originalTitle: tmdb.original_title,
          overview: tmdb.overview,
          adult: tmdb.adult,
          posterPath: tmdb.poster_path,
          backdropPath: tmdb.backdrop_path,
          releaseDate: tmdb.release_date ? new Date(tmdb.release_date) : null,
          runtime: tmdb.runtime,
          popularity: tmdb.popularity,
          status: tmdb.status,
          tagline: tmdb.tagline,
          budget: BigInt(tmdb.budget || 0),
          revenue: BigInt(tmdb.revenue || 0),
          homepage: tmdb.homepage,
          originalLanguage: tmdb.original_language,
          originCountry: tmdb.origin_country || [],
          collectionId: tmdb.belongs_to_collection?.id ?? null,
        },
        update: {
          title: tmdb.title,
          originalTitle: tmdb.original_title,
          overview: tmdb.overview,
          adult: tmdb.adult,
          posterPath: tmdb.poster_path,
          backdropPath: tmdb.backdrop_path,
          releaseDate: tmdb.release_date ? new Date(tmdb.release_date) : null,
          runtime: tmdb.runtime,
          popularity: tmdb.popularity,
          status: tmdb.status,
          tagline: tmdb.tagline,
          budget: BigInt(tmdb.budget || 0),
          revenue: BigInt(tmdb.revenue || 0),
          homepage: tmdb.homepage,
          originalLanguage: tmdb.original_language,
          originCountry: tmdb.origin_country || [],
          collectionId: tmdb.belongs_to_collection?.id ?? null,
          updatedAt: new Date(),
        },
      });

      // 2. Upsert ratings
      await upsertRatings(tx, tmdb.id, "movie", tmdb, enriched.ratings);

      // 3. Upsert external IDs
      await upsertExternalIds(tx, tmdb.id, "movie", tmdb, enriched.externalIds);

      // 4. Upsert videos
      await upsertVideos(tx, tmdb.id, "movie", tmdb.videos?.results || []);

      // 5. Upsert images
      await upsertImages(tx, tmdb.id, "movie", tmdb.images);

      // 6. Upsert scraped watch links
      await upsertScrapedWatchLinks(tx, tmdb.id, "movie", enriched.scrapedWatchLinks);

      // 7. Upsert certifications (from release_dates)
      if (tmdb.release_dates?.results) {
        await upsertMovieCertifications(tx, tmdb.id, tmdb.release_dates.results);
      }

      // 8. Upsert genres
      if (tmdb.genres?.length) {
        await upsertMovieGenres(tx, tmdb.id, tmdb.genres);
      }

      // 9. Upsert keywords
      if (tmdb.keywords?.keywords?.length) {
        await upsertMovieKeywords(tx, tmdb.id, tmdb.keywords.keywords);
      }

      // 10. Upsert credits (cast & crew)
      if (tmdb.credits) {
        await upsertCredits(tx, tmdb.id, "movie", tmdb.credits);
      }

      // 11. Upsert production companies
      if (tmdb.production_companies?.length) {
        await upsertMovieCompanies(tx, tmdb.id, tmdb.production_companies);
      }

      // 12. Upsert countries (both origin and production)
      if (tmdb.origin_country?.length || tmdb.production_countries?.length) {
        await upsertMovieCountries(tx, tmdb.id, tmdb.origin_country || [], tmdb.production_countries || []);
      }

      // 13. Upsert spoken languages
      if (tmdb.spoken_languages?.length) {
        await upsertMovieLanguages(tx, tmdb.id, tmdb.spoken_languages);
      }

      // 14. Upsert watch providers (TMDB)
      if (tmdb["watch/providers"]?.results) {
        await upsertWatchProviders(tx, tmdb.id, "movie", tmdb["watch/providers"].results);
      }

      // 15. Upsert reviews
      if (tmdb.reviews?.results?.length) {
        await upsertReviews(tx, tmdb.id, "movie", tmdb.reviews.results);
      }

      // 16. Update enrichment timestamps
      const hasEnrichedRatings = enriched.ratings && Object.keys(enriched.ratings).length > 0;
      const hasScrapedWatchLinks = enriched.scrapedWatchLinks && enriched.scrapedWatchLinks.length > 0;
      
      await tx.movie.update({
        where: { id: tmdb.id },
        data: {
          enrichmentSource: enriched.source || null,
          ...(hasEnrichedRatings && { ratingsScrapedAt: new Date() }),
          ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
        },
      });
    }, { timeout: 30000 }); // 30s timeout for large movies

    console.log(`[Hydration/Postgres] Upserted movie ${tmdb.id}: ${tmdb.title}`);
  } catch (error: any) {
    if (error?.code === "P2022") {
      console.warn(`[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Cannot upsert movie ${tmdb.id}`);
    } else {
      console.error(`[Hydration/Postgres] Error upserting movie ${tmdb.id}:`, error?.message || error);
    }
    // Don't throw - let the hydration continue with TMDB data
  }
}

/**
 * Upsert series with all related data to PostgreSQL
 */
export async function upsertSeriesToPostgres(
  tmdb: TmdbSeriesData,
  enriched: EnrichedData
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Upsert core series
      await tx.series.upsert({
        where: { id: tmdb.id },
        create: {
          id: tmdb.id,
          name: tmdb.name,
          originalName: tmdb.original_name,
          overview: tmdb.overview,
          adult: tmdb.adult,
          posterPath: tmdb.poster_path,
          backdropPath: tmdb.backdrop_path,
          firstAirDate: tmdb.first_air_date ? new Date(tmdb.first_air_date) : null,
          lastAirDate: tmdb.last_air_date ? new Date(tmdb.last_air_date) : null,
          popularity: tmdb.popularity,
          status: tmdb.status,
          tagline: tmdb.tagline,
          type: tmdb.type,
          inProduction: tmdb.in_production,
          numberOfSeasons: tmdb.number_of_seasons,
          numberOfEpisodes: tmdb.number_of_episodes,
          episodeRunTime: tmdb.episode_run_time || [],
          homepage: tmdb.homepage,
          originalLanguage: tmdb.original_language,
          originCountry: tmdb.origin_country || [],
          // Denormalized episode info
          lastEpisodeSeasonNum: tmdb.last_episode_to_air?.season_number ?? null,
          lastEpisodeNum: tmdb.last_episode_to_air?.episode_number ?? null,
          lastEpisodeAirDate: tmdb.last_episode_to_air?.air_date
            ? new Date(tmdb.last_episode_to_air.air_date)
            : null,
          nextEpisodeSeasonNum: tmdb.next_episode_to_air?.season_number ?? null,
          nextEpisodeNum: tmdb.next_episode_to_air?.episode_number ?? null,
          nextEpisodeAirDate: tmdb.next_episode_to_air?.air_date
            ? new Date(tmdb.next_episode_to_air.air_date)
            : null,
        },
        update: {
          name: tmdb.name,
          originalName: tmdb.original_name,
          overview: tmdb.overview,
          adult: tmdb.adult,
          posterPath: tmdb.poster_path,
          backdropPath: tmdb.backdrop_path,
          firstAirDate: tmdb.first_air_date ? new Date(tmdb.first_air_date) : null,
          lastAirDate: tmdb.last_air_date ? new Date(tmdb.last_air_date) : null,
          popularity: tmdb.popularity,
          status: tmdb.status,
          tagline: tmdb.tagline,
          type: tmdb.type,
          inProduction: tmdb.in_production,
          numberOfSeasons: tmdb.number_of_seasons,
          numberOfEpisodes: tmdb.number_of_episodes,
          episodeRunTime: tmdb.episode_run_time || [],
          homepage: tmdb.homepage,
          originalLanguage: tmdb.original_language,
          originCountry: tmdb.origin_country || [],
          lastEpisodeSeasonNum: tmdb.last_episode_to_air?.season_number ?? null,
          lastEpisodeNum: tmdb.last_episode_to_air?.episode_number ?? null,
          lastEpisodeAirDate: tmdb.last_episode_to_air?.air_date
            ? new Date(tmdb.last_episode_to_air.air_date)
            : null,
          nextEpisodeSeasonNum: tmdb.next_episode_to_air?.season_number ?? null,
          nextEpisodeNum: tmdb.next_episode_to_air?.episode_number ?? null,
          nextEpisodeAirDate: tmdb.next_episode_to_air?.air_date
            ? new Date(tmdb.next_episode_to_air.air_date)
            : null,
          updatedAt: new Date(),
        },
      });

      // 2. Upsert ratings (same pattern as movies)
      await upsertRatings(tx, tmdb.id, "series", tmdb, enriched.ratings);

      // 3. Upsert external IDs
      await upsertExternalIds(tx, tmdb.id, "series", tmdb, enriched.externalIds);

      // 4. Upsert videos
      await upsertVideos(tx, tmdb.id, "series", tmdb.videos?.results || []);

      // 5. Upsert images
      await upsertImages(tx, tmdb.id, "series", tmdb.images);

      // 6. Upsert scraped watch links
      await upsertScrapedWatchLinks(tx, tmdb.id, "series", enriched.scrapedWatchLinks);

      // 7. Upsert seasons
      await upsertSeasons(tx, tmdb.id, tmdb.seasons || []);

      // 8. Upsert certifications (from content_ratings)
      if (tmdb.content_ratings?.results) {
        await upsertSeriesCertifications(tx, tmdb.id, tmdb.content_ratings.results);
      }

      // 9. Upsert genres
      if (tmdb.genres?.length) {
        await upsertSeriesGenres(tx, tmdb.id, tmdb.genres);
      }

      // 10. Upsert keywords
      if (tmdb.keywords?.results?.length) {
        await upsertSeriesKeywords(tx, tmdb.id, tmdb.keywords.results);
      }

      // 11. Upsert credits (cast & crew)
      // Store BOTH regular credits (top-billed main cast) and aggregate credits (all-time)
      // UI can choose which to display via isAggregate flag
      if (tmdb.credits) {
        await upsertCredits(tx, tmdb.id, "series", tmdb.credits);
      }
      if (tmdb.aggregate_credits) {
        await upsertSeriesAggregateCredits(tx, tmdb.id, tmdb.aggregate_credits);
      }

      // 12. Upsert creators (created_by)
      if (tmdb.created_by?.length) {
        await upsertSeriesCreators(tx, tmdb.id, tmdb.created_by);
      }

      // 14. Upsert networks
      if (tmdb.networks?.length) {
        await upsertSeriesNetworks(tx, tmdb.id, tmdb.networks);
      }

      // 15. Upsert watch providers (TMDB)
      if (tmdb["watch/providers"]?.results) {
        await upsertWatchProviders(tx, tmdb.id, "series", tmdb["watch/providers"].results);
      }

      // 16. Upsert reviews
      if (tmdb.reviews?.results?.length) {
        await upsertReviews(tx, tmdb.id, "series", tmdb.reviews.results);
      }

      // 17. Upsert countries (origin countries)
      if (tmdb.origin_country?.length) {
        await upsertSeriesCountries(tx, tmdb.id, tmdb.origin_country);
      }

      // 18. Update enrichment timestamps
      const hasEnrichedRatings = enriched.ratings && Object.keys(enriched.ratings).length > 0;
      const hasScrapedWatchLinks = enriched.scrapedWatchLinks && enriched.scrapedWatchLinks.length > 0;
      
      await tx.series.update({
        where: { id: tmdb.id },
        data: {
          enrichmentSource: enriched.source || null,
          ...(hasEnrichedRatings && { ratingsScrapedAt: new Date() }),
          ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
        },
      });
    }, { timeout: 60000 }); // 60s timeout for large series with many seasons/episodes

    console.log(`[Hydration/Postgres] Upserted series ${tmdb.id}: ${tmdb.name}`);
  } catch (error: any) {
    if (error?.code === "P2022") {
      console.warn(`[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Cannot upsert series ${tmdb.id}`);
    } else {
      console.error(`[Hydration/Postgres] Error upserting series ${tmdb.id}:`, error?.message || error);
    }
    // Don't throw - let the hydration continue with TMDB data
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function getOrCreateSource(tx: PrismaTx, slug: string): Promise<number> {
  const sourceNames: Record<string, string> = {
    tmdb: "TMDB",
    imdb: "IMDb",
    rt_critic: "Rotten Tomatoes (Critics)",
    rt_audience: "Rotten Tomatoes (Audience)",
    metacritic: "Metacritic",
    letterboxd: "Letterboxd",
    google: "Google",
  };

  const source = await tx.dataSource.upsert({
    where: { slug },
    create: { slug, name: sourceNames[slug] || slug, providesRatings: true },
    update: {},
  });

  return source.id;
}

/**
 * Upsert ratings - UPDATE existing or CREATE new, but NEVER delete existing
 * 
 * This ensures that if Lambda fails to return a rating (e.g., Google), the 
 * existing one is preserved instead of being deleted.
 */
async function upsertRatings(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  tmdb: { vote_average: number; vote_count: number },
  enrichedRatings: EnrichedRatings | null
): Promise<void> {
  // DO NOT delete existing ratings - we want to preserve them if Lambda doesn't return new ones
  // Instead, upsert each rating individually
  
  const baseData = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  console.log(`[Hydration/Postgres] Upserting ratings for ${mediaType} ${mediaId}:`);

  // TMDB rating (always available)
  if (tmdb.vote_average > 0) {
    const sourceId = await getOrCreateSource(tx, "tmdb");
    console.log(`  → TMDB: ${tmdb.vote_average} (${tmdb.vote_count} votes)`);
    await tx.rating.upsert({
      where: mediaType === "movie" 
        ? { movieId_sourceId: { movieId: mediaId, sourceId } }
        : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
      create: {
        ...baseData,
        sourceId,
        score: tmdb.vote_average,
        voteCount: tmdb.vote_count,
      },
      update: {
        score: tmdb.vote_average,
        voteCount: tmdb.vote_count,
        updatedAt: new Date(),
      },
    });
  }

  // Enriched ratings - only upsert what we have, preserve existing for sources we don't have
  if (enrichedRatings) {
    // IMDb
    if (enrichedRatings.imdb?.score) {
      const sourceId = await getOrCreateSource(tx, "imdb");
      console.log(`  → IMDb: ${enrichedRatings.imdb.score} (${enrichedRatings.imdb.voteCount ?? 'N/A'} votes)`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.imdb.score,
          voteCount: enrichedRatings.imdb.voteCount ?? null,
          sourceUrl: enrichedRatings.imdb.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.imdb.score,
          voteCount: enrichedRatings.imdb.voteCount ?? null,
          sourceUrl: enrichedRatings.imdb.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // RT Critic
    if (enrichedRatings.rtCritic?.score) {
      const sourceId = await getOrCreateSource(tx, "rt_critic");
      console.log(`  → RT Critic: ${enrichedRatings.rtCritic.score}% (certified: ${enrichedRatings.rtCritic.certified ?? 'N/A'})`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.rtCritic.score,
          voteCount: enrichedRatings.rtCritic.voteCount ?? null,
          certified: enrichedRatings.rtCritic.certified ?? null,
          consensus: enrichedRatings.rtCritic.consensus ?? null,
          sentiment: enrichedRatings.rtCritic.sentiment ?? null,
          sourceUrl: enrichedRatings.rtCritic.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.rtCritic.score,
          voteCount: enrichedRatings.rtCritic.voteCount ?? null,
          certified: enrichedRatings.rtCritic.certified ?? null,
          consensus: enrichedRatings.rtCritic.consensus ?? null,
          sentiment: enrichedRatings.rtCritic.sentiment ?? null,
          sourceUrl: enrichedRatings.rtCritic.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // RT Audience
    if (enrichedRatings.rtAudience?.score) {
      const sourceId = await getOrCreateSource(tx, "rt_audience");
      console.log(`  → RT Audience: ${enrichedRatings.rtAudience.score}%`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.rtAudience.score,
          voteCount: enrichedRatings.rtAudience.voteCount ?? null,
          certified: enrichedRatings.rtAudience.certified ?? null,
          sentiment: enrichedRatings.rtAudience.sentiment ?? null,
        },
        update: {
          score: enrichedRatings.rtAudience.score,
          voteCount: enrichedRatings.rtAudience.voteCount ?? null,
          certified: enrichedRatings.rtAudience.certified ?? null,
          sentiment: enrichedRatings.rtAudience.sentiment ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // Metacritic
    if (enrichedRatings.metacritic?.score) {
      const sourceId = await getOrCreateSource(tx, "metacritic");
      console.log(`  → Metacritic: ${enrichedRatings.metacritic.score}`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.metacritic.score,
          voteCount: enrichedRatings.metacritic.voteCount ?? null,
          sourceUrl: enrichedRatings.metacritic.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.metacritic.score,
          voteCount: enrichedRatings.metacritic.voteCount ?? null,
          sourceUrl: enrichedRatings.metacritic.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // Letterboxd
    if (enrichedRatings.letterboxd?.score) {
      const sourceId = await getOrCreateSource(tx, "letterboxd");
      console.log(`  → Letterboxd: ${enrichedRatings.letterboxd.score}`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.letterboxd.score,
        },
        update: {
          score: enrichedRatings.letterboxd.score,
          updatedAt: new Date(),
        },
      });
    }

    // Google
    if (enrichedRatings.google?.score) {
      const sourceId = await getOrCreateSource(tx, "google");
      console.log(`  → Google: ${enrichedRatings.google.score}%`);
      await tx.rating.upsert({
        where: mediaType === "movie" 
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.google.score,
        },
        update: {
          score: enrichedRatings.google.score,
          updatedAt: new Date(),
        },
      });
    }
  }
  
  console.log(`[Hydration/Postgres] Ratings upsert complete for ${mediaType} ${mediaId}`);
}

async function upsertExternalIds(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  tmdb: { external_ids?: Record<string, string | number | null>; imdb_id?: string | null },
  enrichedIds: EnrichedExternalIds
): Promise<void> {
  // Delete existing external IDs
  if (mediaType === "movie") {
    await tx.externalId.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.externalId.deleteMany({ where: { seriesId: mediaId } });
  }

  const idsToCreate: Array<{
    movieId: number | null;
    seriesId: number | null;
    source: string;
    externalId: string;
  }> = [];

  const baseId = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  // TMDB external IDs
  const tmdbExtIds = tmdb.external_ids || {};
  const tmdbIdMapping: Record<string, string> = {
    imdb_id: "imdb",
    wikidata_id: "wikidata",
    facebook_id: "facebook",
    instagram_id: "instagram",
    twitter_id: "twitter",
    tvdb_id: "tvdb",
    tvrage_id: "tvrage",
    freebase_mid: "freebase_mid",
    freebase_id: "freebase_id",
  };

  for (const [key, source] of Object.entries(tmdbIdMapping)) {
    const value = tmdbExtIds[key];
    if (value) {
      idsToCreate.push({
        ...baseId,
        source,
        externalId: String(value),
      });
    }
  }

  // Fallback: imdb_id from root level
  if (!tmdbExtIds.imdb_id && tmdb.imdb_id) {
    idsToCreate.push({
      ...baseId,
      source: "imdb",
      externalId: tmdb.imdb_id,
    });
  }

  // Enriched external IDs - explicitly check each known key
  const enrichedIdEntries: Array<[keyof EnrichedExternalIds, string]> = [
    ["rottentomatoes", "rottentomatoes"],
    ["metacritic", "metacritic"],
    ["letterboxd", "letterboxd"],
    ["netflix", "netflix"],
    ["apple", "apple"],
    ["amazon", "amazon"],
    ["hotstar", "hotstar"],
    ["prime", "prime"],
    ["wikidata", "wikidata"],
    ["facebook", "facebook"],
    ["instagram", "instagram"],
    ["twitter", "twitter"],
  ];

  for (const [key, source] of enrichedIdEntries) {
    const value = enrichedIds[key];
    if (value) {
      idsToCreate.push({
        ...baseId,
        source,
        externalId: value,
      });
    }
  }

  if (idsToCreate.length > 0) {
    await tx.externalId.createMany({ data: idsToCreate, skipDuplicates: true });
  }
}

async function upsertVideos(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  videos: Array<{
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    size?: number;
    published_at?: string;
  }>
): Promise<void> {
  // Delete existing videos
  if (mediaType === "movie") {
    await tx.video.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.video.deleteMany({ where: { seriesId: mediaId } });
  }

  const videosToCreate = videos.map((v) => ({
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
    key: v.key,
    name: v.name,
    site: v.site,
    type: v.type,
    official: v.official,
    size: v.size ?? null,
    publishedAt: v.published_at ? new Date(v.published_at) : null,
  }));

  if (videosToCreate.length > 0) {
    await tx.video.createMany({ data: videosToCreate });
  }
}

async function upsertImages(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  images: {
    backdrops?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
    posters?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
    logos?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
  }
): Promise<void> {
  // Delete existing images
  if (mediaType === "movie") {
    await tx.image.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.image.deleteMany({ where: { seriesId: mediaId } });
  }

  const imagesToCreate: Array<{
    movieId: number | null;
    seriesId: number | null;
    filePath: string;
    type: "POSTER" | "BACKDROP" | "LOGO";
    aspectRatio: number | null;
    width: number | null;
    height: number | null;
    voteAverage: number | null;
    voteCount: number | null;
    language: string | null;
  }> = [];

  const baseImage = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  const addImages = (
    list: typeof images.backdrops,
    type: "POSTER" | "BACKDROP" | "LOGO"
  ) => {
    for (const img of list || []) {
      imagesToCreate.push({
        ...baseImage,
        filePath: img.file_path,
        type,
        aspectRatio: img.aspect_ratio ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        voteAverage: img.vote_average ?? null,
        voteCount: img.vote_count ?? null,
        language: img.iso_639_1 ?? null,
      });
    }
  };

  addImages(images.backdrops, "BACKDROP");
  addImages(images.posters, "POSTER");
  addImages(images.logos, "LOGO");

  if (imagesToCreate.length > 0) {
    await tx.image.createMany({ data: imagesToCreate });
  }
}

/**
 * Upsert scraped watch links - UPDATE existing or CREATE new, but NEVER delete existing
 * 
 * This ensures that if Lambda fails to return watch links, the existing ones are preserved.
 */
async function upsertScrapedWatchLinks(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  links: ScrapedWatchLink[]
): Promise<void> {
  // DO NOT delete existing links - preserve them if Lambda doesn't return new ones
  // Only upsert the links we have
  
  if (links.length === 0) {
    console.log(`[Hydration/Postgres] No watch links to upsert for ${mediaType} ${mediaId}`);
    return;
  }

  console.log(`[Hydration/Postgres] Upserting ${links.length} watch links for ${mediaType} ${mediaId}:`);

  const baseData = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };
  
  const countryCode = "IN"; // Scraped links are currently India-only

  for (const link of links) {
    console.log(`  → ${link.provider}: ${link.link} (${link.price || 'Free'})`);
    
    try {
      await tx.scrapedWatchLink.upsert({
        where: mediaType === "movie"
          ? { movieId_providerName_countryCode: { movieId: mediaId, providerName: link.provider, countryCode } }
          : { seriesId_providerName_countryCode: { seriesId: mediaId, providerName: link.provider, countryCode } },
        create: {
          ...baseData,
          providerName: link.provider,
          link: link.link,
          price: link.price || null,
          countryCode,
        },
        update: {
          link: link.link,
          price: link.price || null,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Log but don't fail - some links might have issues
      console.warn(`[Hydration/Postgres] Failed to upsert watch link ${link.provider}:`, error);
    }
  }
  
  console.log(`[Hydration/Postgres] Watch links upsert complete for ${mediaType} ${mediaId}`);
}

interface SeasonWithEpisodes {
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

async function upsertSeasons(
  tx: PrismaTx,
  seriesId: number,
  seasons: SeasonWithEpisodes[]
): Promise<void> {
  // Delete existing seasons (cascades to episodes)
  await tx.season.deleteMany({ where: { seriesId } });

  // Create seasons first
  const seasonsToCreate = seasons.map((s) => ({
    seriesId,
    tmdbSeasonId: s.id,
    seasonNumber: s.season_number,
    name: s.name,
    overview: s.overview || null,
    posterPath: s.poster_path,
    airDate: s.air_date ? new Date(s.air_date) : null,
    episodeCount: s.episode_count,
  }));

  if (seasonsToCreate.length > 0) {
    await tx.season.createMany({ data: seasonsToCreate });
  }

  // Get created seasons to map season_number -> id
  const createdSeasons = await tx.season.findMany({
    where: { seriesId },
    select: { id: true, seasonNumber: true },
  });
  const seasonIdMap = new Map(createdSeasons.map((s) => [s.seasonNumber, s.id]));

  // Create episodes for each season
  const episodesToCreate: Array<{
    seasonId: number;
    tmdbEpisodeId: number;
    episodeNumber: number;
    name: string | null;
    overview: string | null;
    stillPath: string | null;
    airDate: Date | null;
    runtime: number | null;
    voteAverage: number | null;
    voteCount: number | null;
    episodeType: string | null;
    productionCode: string | null;
  }> = [];

  for (const season of seasons) {
    const seasonId = seasonIdMap.get(season.season_number);
    if (!seasonId || !season.episodes) continue;

    for (const ep of season.episodes) {
      episodesToCreate.push({
        seasonId,
        tmdbEpisodeId: ep.id,
        episodeNumber: ep.episode_number,
        name: ep.name || null,
        overview: ep.overview || null,
        stillPath: ep.still_path,
        airDate: ep.air_date ? new Date(ep.air_date) : null,
        runtime: ep.runtime ?? null,
        voteAverage: ep.vote_average ?? null,
        voteCount: ep.vote_count ?? null,
        episodeType: ep.episode_type || null,
        productionCode: ep.production_code || null,
      });
    }
  }

  if (episodesToCreate.length > 0) {
    await tx.episode.createMany({ data: episodesToCreate });
  }
}

async function upsertMovieCertifications(
  tx: PrismaTx,
  movieId: number,
  releaseDates: TmdbMovieData["release_dates"]["results"]
): Promise<void> {
  // Delete existing certifications
  await tx.movieCertification.deleteMany({ where: { movieId } });

  const certsToCreate: Array<{
    movieId: number;
    countryCode: string;
    certification: string;
    releaseDate: Date | null;
    releaseType: number | null;
    note: string | null;
  }> = [];

  for (const country of releaseDates) {
    for (const release of country.release_dates) {
      if (release.certification) {
        certsToCreate.push({
          movieId,
          countryCode: country.iso_3166_1,
          certification: release.certification,
          releaseDate: release.release_date ? new Date(release.release_date) : null,
          releaseType: release.type,
          note: release.note || null,
        });
      }
    }
  }

  if (certsToCreate.length > 0) {
    // Get valid country codes from the database (filter out obsolete codes like SU)
    const validCountries = await tx.country.findMany({
      where: { code: { in: certsToCreate.map((c) => c.countryCode) } },
      select: { code: true },
    });
    const validCodes = new Set(validCountries.map((c) => c.code));
    const filteredCerts = certsToCreate.filter((c) => validCodes.has(c.countryCode));

    if (filteredCerts.length > 0) {
      // Delete existing certifications for this movie first
      await tx.movieCertification.deleteMany({ where: { movieId } });

      // Use createMany with skipDuplicates for remaining duplicates (same country+releaseType)
      await tx.movieCertification.createMany({
        data: filteredCerts,
        skipDuplicates: true,
      });
    }
  }
}

async function upsertSeriesCertifications(
  tx: PrismaTx,
  seriesId: number,
  contentRatings: TmdbSeriesData["content_ratings"]["results"]
): Promise<void> {
  const certsToCreate = contentRatings
    .filter((r) => r.rating)
    .map((r) => ({
      seriesId,
      countryCode: r.iso_3166_1,
      certification: r.rating,
    }));

  if (certsToCreate.length > 0) {
    // Get valid country codes from the database (filter out obsolete codes like SU)
    const validCountries = await tx.country.findMany({
      where: { code: { in: certsToCreate.map((c) => c.countryCode) } },
      select: { code: true },
    });
    const validCodes = new Set(validCountries.map((c) => c.code));
    const filteredCerts = certsToCreate.filter((c) => validCodes.has(c.countryCode));

    if (filteredCerts.length > 0) {
      // Delete existing certifications
      await tx.seriesCertification.deleteMany({ where: { seriesId } });
      await tx.seriesCertification.createMany({ data: filteredCerts, skipDuplicates: true });
    }
  }
}

// =============================================================================
// Additional Upsert Helpers (Genres, Keywords, Credits, Companies, WatchProviders)
// =============================================================================

/**
 * Upsert movie genres
 */
async function upsertMovieGenres(
  tx: PrismaTx,
  movieId: number,
  genres: Array<{ id: number; name: string }>
) {
  // Delete existing genre associations
  await tx.movieGenre.deleteMany({ where: { movieId } });

  for (const genre of genres) {
    // Try to find existing genre first (fast, no lock contention)
    let dbGenre = await tx.genre.findUnique({
      where: { tmdbId: genre.id },
    });

    // Only create if it doesn't exist (rare - genres are pre-populated)
    if (!dbGenre) {
      dbGenre = await tx.genre.upsert({
        where: { tmdbId: genre.id },
        create: { tmdbId: genre.id, name: genre.name },
        update: { name: genre.name },
      });
    }

    // Create the junction using DB ID (not TMDB ID)
    await tx.movieGenre.create({
      data: {
        movieId,
        genreId: dbGenre.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert movie keywords
 */
async function upsertMovieKeywords(
  tx: PrismaTx,
  movieId: number,
  keywords: Array<{ id: number; name: string }>
) {
  // Delete existing keyword associations
  await tx.movieKeyword.deleteMany({ where: { movieId } });

  for (const keyword of keywords) {
    // Try to find existing keyword first (fast, no lock contention)
    let dbKeyword = await tx.keyword.findUnique({
      where: { tmdbId: keyword.id },
    });

    // Only create if it doesn't exist
    if (!dbKeyword) {
      dbKeyword = await tx.keyword.upsert({
        where: { tmdbId: keyword.id },
        create: { tmdbId: keyword.id, name: keyword.name },
        update: { name: keyword.name },
      });
    }

    // Create the junction using DB ID
    await tx.movieKeyword.create({
      data: {
        movieId,
        keywordId: dbKeyword.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert credits (cast and crew) - NON-AGGREGATE version
 * 
 * Stores ALL cast and ALL crew members (no arbitrary limits).
 * For series: This stores the "regular" credits (main cast), NOT aggregate_credits.
 * The isAggregate flag allows UI to choose which to display.
 */
async function upsertCredits(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  credits: { cast?: Array<any>; crew?: Array<any> }
) {
  // Delete existing non-aggregate credits only
  if (mediaType === "movie") {
    await tx.credit.deleteMany({ where: { movieId: mediaId } });
  } else {
    // For series: only delete non-aggregate credits (preserve aggregate)
    await tx.credit.deleteMany({ where: { seriesId: mediaId, isAggregate: false } });
  }

  const allCredits: Array<{
    personId: number;
    name: string;
    profilePath: string | null;
    knownFor: string | null;
    creditType: "CAST" | "CREW";
    character?: string;
    job?: string;
    department?: string;
    order?: number;
  }> = [];

  // Process ALL cast
  for (const cast of credits.cast || []) {
    allCredits.push({
      personId: cast.id,
      name: cast.name,
      profilePath: cast.profile_path,
      knownFor: cast.known_for_department,
      creditType: "CAST",
      character: cast.character,
      order: cast.order,
    });
  }

  // Process ALL crew (no job filter - store everything)
  for (const crew of credits.crew || []) {
    allCredits.push({
      personId: crew.id,
      name: crew.name,
      profilePath: crew.profile_path,
      knownFor: crew.known_for_department,
      creditType: "CREW",
      job: crew.job,
      department: crew.department,
    });
  }

  // Upsert persons and create credits (no limit - store everything)
  for (const credit of allCredits) {
    // Try to find existing person first (fast, no lock contention)
    let dbPerson = await tx.person.findUnique({
      where: { tmdbId: credit.personId },
    });

    // Only upsert if person doesn't exist
    if (!dbPerson) {
      dbPerson = await tx.person.upsert({
        where: { tmdbId: credit.personId },
        create: {
          tmdbId: credit.personId,
          name: credit.name,
          profilePath: credit.profilePath,
          knownFor: credit.knownFor,
        },
        update: {
          name: credit.name,
          profilePath: credit.profilePath,
          knownFor: credit.knownFor,
        },
      });
    }

    // Create credit using DB ID (non-aggregate)
    await tx.credit.create({
      data: {
        movieId: mediaType === "movie" ? mediaId : null,
        seriesId: mediaType === "series" ? mediaId : null,
        personId: dbPerson.id,
        creditType: credit.creditType,
        character: credit.character,
        job: credit.job,
        department: credit.department,
        creditOrder: credit.order,
        isAggregate: false,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert series aggregate credits (ALL cast/crew across all episodes)
 * 
 * aggregate_credits structure differs from regular credits:
 * - Cast has `roles` array (character per season) instead of single `character`
 * - Crew has `jobs` array instead of single `job`
 * - Each has `total_episode_count` for episode appearances
 * 
 * This allows UI to filter by episode count (e.g., only show actors in 10+ episodes)
 * and to choose between aggregate (all-time) vs regular (main/top-billed) credits.
 */
async function upsertSeriesAggregateCredits(
  tx: PrismaTx,
  seriesId: number,
  aggregateCredits: {
    cast?: Array<{
      id: number;
      name: string;
      profile_path: string | null;
      known_for_department: string;
      roles: Array<{ character: string; episode_count: number }>;
      total_episode_count: number;
      order: number;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      profile_path: string | null;
      known_for_department: string;
      department: string;
      jobs: Array<{ job: string; episode_count: number }>;
      total_episode_count: number;
    }>;
  }
) {
  // Delete existing AGGREGATE credits only (preserve non-aggregate regular credits)
  await tx.credit.deleteMany({ where: { seriesId, isAggregate: true } });

  // Process ALL cast (flatten roles into individual credits)
  for (const cast of aggregateCredits.cast || []) {
    // Upsert person first
    let dbPerson = await tx.person.findUnique({
      where: { tmdbId: cast.id },
    });

    if (!dbPerson) {
      dbPerson = await tx.person.upsert({
        where: { tmdbId: cast.id },
        create: {
          tmdbId: cast.id,
          name: cast.name,
          profilePath: cast.profile_path,
          knownFor: cast.known_for_department,
        },
        update: {
          name: cast.name,
          profilePath: cast.profile_path,
          knownFor: cast.known_for_department,
        },
      });
    }

    // Create credit with combined characters from all roles
    // Using combined characters to avoid duplicate person per series
    const combinedCharacter = cast.roles.map(r => r.character).filter(Boolean).join(" / ");
    
    await tx.credit.create({
      data: {
        seriesId,
        personId: dbPerson.id,
        creditType: "CAST",
        character: combinedCharacter || null,
        creditOrder: cast.order,
        isAggregate: true,
        totalEpisodeCount: cast.total_episode_count,
      },
    }).catch(() => {});
  }

  // Process ALL crew (flatten jobs into individual credits)
  for (const crew of aggregateCredits.crew || []) {
    // Upsert person first
    let dbPerson = await tx.person.findUnique({
      where: { tmdbId: crew.id },
    });

    if (!dbPerson) {
      dbPerson = await tx.person.upsert({
        where: { tmdbId: crew.id },
        create: {
          tmdbId: crew.id,
          name: crew.name,
          profilePath: crew.profile_path,
          knownFor: crew.known_for_department,
        },
        update: {
          name: crew.name,
          profilePath: crew.profile_path,
          knownFor: crew.known_for_department,
        },
      });
    }

    // Create credit for each job (a person can be both Director and Writer)
    for (const jobInfo of crew.jobs || []) {
      await tx.credit.create({
        data: {
          seriesId,
          personId: dbPerson.id,
          creditType: "CREW",
          job: jobInfo.job,
          department: crew.department,
          isAggregate: true,
          totalEpisodeCount: crew.total_episode_count,
        },
      }).catch(() => {});
    }
  }
}

/**
 * Upsert movie production companies
 */
async function upsertMovieCompanies(
  tx: PrismaTx,
  movieId: number,
  companies: Array<{ id: number; name: string; logo_path?: string | null; origin_country?: string | null }>
) {
  // Delete existing company associations
  await tx.movieCompany.deleteMany({ where: { movieId } });

  for (const company of companies) {
    // Try to find existing company first (fast, no lock contention)
    let dbCompany = await tx.productionCompany.findUnique({
      where: { tmdbId: company.id },
    });

    // Only create if it doesn't exist
    if (!dbCompany) {
      dbCompany = await tx.productionCompany.upsert({
        where: { tmdbId: company.id },
        create: {
          tmdbId: company.id,
          name: company.name,
          logoPath: company.logo_path,
          originCountry: company.origin_country,
        },
        update: {
          name: company.name,
          logoPath: company.logo_path,
          originCountry: company.origin_country,
        },
      });
    }

    // Create junction using DB ID (check first to avoid transaction abort on duplicate)
    const existingJunction = await tx.movieCompany.findUnique({
      where: { movieId_companyId: { movieId, companyId: dbCompany.id } },
    });
    if (!existingJunction) {
      await tx.movieCompany.create({
        data: {
          movieId,
          companyId: dbCompany.id,
        },
      });
    }
  }
}

/**
 * Upsert watch providers (TMDB data)
 */
async function upsertWatchProviders(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  providersByCountry: Record<string, {
    link?: string;
    flatrate?: Array<{ provider_id: number; provider_name: string; logo_path?: string; display_priority?: number }>;
    rent?: Array<{ provider_id: number; provider_name: string; logo_path?: string; display_priority?: number }>;
    buy?: Array<{ provider_id: number; provider_name: string; logo_path?: string; display_priority?: number }>;
  }>
) {
  // Delete existing watch options
  await tx.watchOption.deleteMany({
    where: mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId },
  });

  // Store ALL countries (no limit - TMDB provides 90+ countries)
  for (const [countryCode, data] of Object.entries(providersByCountry)) {

    const types: Array<{ type: "FLATRATE" | "RENT" | "BUY"; providers: typeof data.flatrate }> = [
      { type: "FLATRATE", providers: data.flatrate },
      { type: "RENT", providers: data.rent },
      { type: "BUY", providers: data.buy },
    ];

    for (const { type, providers } of types) {
      for (const provider of providers || []) {
        // Try to find existing provider first (fast, no lock contention)
        let dbProvider = await tx.streamingProvider.findUnique({
          where: { tmdbId: provider.provider_id },
        });

        // Only upsert if provider doesn't exist
        if (!dbProvider) {
          dbProvider = await tx.streamingProvider.upsert({
            where: { tmdbId: provider.provider_id },
            create: {
              tmdbId: provider.provider_id,
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: provider.display_priority || 100,
            },
            update: {
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: provider.display_priority || 100,
            },
          });
        }

        // Create watch option using DB ID
        await tx.watchOption.create({
          data: {
            movieId: mediaType === "movie" ? mediaId : null,
            seriesId: mediaType === "series" ? mediaId : null,
            providerId: dbProvider.id,
            type,
            countryCode,
            link: data.link,
          },
        }).catch(() => {
          // Ignore duplicates
        });
      }
    }
  }
}

/**
 * Upsert series genres
 */
async function upsertSeriesGenres(
  tx: PrismaTx,
  seriesId: number,
  genres: Array<{ id: number; name: string }>
) {
  // Delete existing genre associations
  await tx.seriesGenre.deleteMany({ where: { seriesId } });

  for (const genre of genres) {
    // Try to find existing genre first (fast, no lock contention)
    let dbGenre = await tx.genre.findUnique({
      where: { tmdbId: genre.id },
    });

    // Only create if it doesn't exist (rare - genres are pre-populated)
    if (!dbGenre) {
      dbGenre = await tx.genre.upsert({
        where: { tmdbId: genre.id },
        create: { tmdbId: genre.id, name: genre.name },
        update: { name: genre.name },
      });
    }

    // Create the junction using DB ID
    await tx.seriesGenre.create({
      data: {
        seriesId,
        genreId: dbGenre.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert series keywords
 */
async function upsertSeriesKeywords(
  tx: PrismaTx,
  seriesId: number,
  keywords: Array<{ id: number; name: string }>
) {
  // Delete existing keyword associations
  await tx.seriesKeyword.deleteMany({ where: { seriesId } });

  for (const keyword of keywords) {
    // Try to find existing keyword first (fast, no lock contention)
    let dbKeyword = await tx.keyword.findUnique({
      where: { tmdbId: keyword.id },
    });

    // Only create if it doesn't exist
    if (!dbKeyword) {
      dbKeyword = await tx.keyword.upsert({
        where: { tmdbId: keyword.id },
        create: { tmdbId: keyword.id, name: keyword.name },
        update: { name: keyword.name },
      });
    }

    // Create the junction using DB ID
    await tx.seriesKeyword.create({
      data: {
        seriesId,
        keywordId: dbKeyword.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert series networks
 */
async function upsertSeriesNetworks(
  tx: PrismaTx,
  seriesId: number,
  networks: Array<{ id: number; name: string; logo_path?: string | null; origin_country?: string | null }>
) {
  // Delete existing network associations
  await tx.seriesNetwork.deleteMany({ where: { seriesId } });

  for (const network of networks) {
    // Try to find existing network first (fast, no lock contention)
    let dbNetwork = await tx.network.findUnique({
      where: { tmdbId: network.id },
    });

    // Only create if it doesn't exist
    if (!dbNetwork) {
      dbNetwork = await tx.network.upsert({
        where: { tmdbId: network.id },
        create: {
          tmdbId: network.id,
          name: network.name,
          logoPath: network.logo_path,
          originCountry: network.origin_country,
        },
        update: {
          name: network.name,
          logoPath: network.logo_path,
          originCountry: network.origin_country,
        },
      });
    }

    // Create junction using DB ID
    await tx.seriesNetwork.create({
      data: {
        seriesId,
        networkId: dbNetwork.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert series creators (created_by from TMDB)
 */
async function upsertSeriesCreators(
  tx: PrismaTx,
  seriesId: number,
  creators: Array<{ id: number; name: string; profile_path: string | null }>
) {
  // Delete existing creator associations
  await tx.seriesCreator.deleteMany({ where: { seriesId } });

  for (const creator of creators) {
    // Try to find existing person first (fast, no lock contention)
    let dbPerson = await tx.person.findUnique({
      where: { tmdbId: creator.id },
    });

    // Only create if person doesn't exist
    if (!dbPerson) {
      dbPerson = await tx.person.upsert({
        where: { tmdbId: creator.id },
        create: {
          tmdbId: creator.id,
          name: creator.name,
          profilePath: creator.profile_path,
        },
        update: {
          name: creator.name,
          profilePath: creator.profile_path,
        },
      });
    }

    // Create junction using DB ID
    await tx.seriesCreator.create({
      data: {
        seriesId,
        personId: dbPerson.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert reviews from TMDB
 */
async function upsertReviews(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  reviews: TmdbMovieData["reviews"]["results"]
) {
  if (!reviews.length) return;

  // Get or create TMDB data source
  const tmdbSource = await tx.dataSource.upsert({
    where: { slug: "tmdb" },
    create: {
      slug: "tmdb",
      name: "TMDB",
      baseUrl: "https://www.themoviedb.org",
      providesReviews: true,
    },
    update: {},
  });

  // Delete existing TMDB reviews for this item
  if (mediaType === "movie") {
    await tx.review.deleteMany({
      where: { movieId: mediaId, sourceId: tmdbSource.id },
    });
  } else {
    await tx.review.deleteMany({
      where: { seriesId: mediaId, sourceId: tmdbSource.id },
    });
  }

  // Insert new reviews (use externalId for deduplication)
  for (const review of reviews) {
    await tx.review.create({
      data: {
        movieId: mediaType === "movie" ? mediaId : null,
        seriesId: mediaType === "series" ? mediaId : null,
        sourceId: tmdbSource.id,
        reviewType: "user",
        externalId: review.id, // TMDB review ID for uniqueness
        content: review.content,
        authorName: review.author_details?.name || review.author,
        authorUrl: review.author_details?.username
          ? `https://www.themoviedb.org/u/${review.author_details.username}`
          : null,
        authorImage: review.author_details?.avatar_path
          ? `https://image.tmdb.org/t/p/w45${review.author_details.avatar_path}`
          : null,
        score: review.author_details?.rating ?? null,
        reviewUrl: review.url,
        reviewDate: review.created_at ? new Date(review.created_at) : null,
        scrapedAt: new Date(),
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert countries for a movie (both origin and production)
 * 
 * @param originCountries - From TMDB origin_country (ISO codes array)
 * @param productionCountries - From TMDB production_countries (objects with name)
 */
async function upsertMovieCountries(
  tx: PrismaTx,
  movieId: number,
  originCountries: string[],
  productionCountries: Array<{ iso_3166_1: string; name: string }>
) {
  // Delete existing country associations
  await tx.movieCountry.deleteMany({ where: { movieId } });

  // Insert origin countries
  for (const code of originCountries || []) {
    // Upsert country lookup (name not available for origin, use code as fallback)
    await tx.country.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });

    // Create junction with ORIGIN type
    await tx.movieCountry.create({
      data: {
        movieId,
        countryCode: code,
        type: "ORIGIN",
      },
    }).catch(() => {});
  }

  // Insert production countries
  for (const country of productionCountries || []) {
    // Upsert country lookup with proper name
    await tx.country.upsert({
      where: { code: country.iso_3166_1 },
      create: {
        code: country.iso_3166_1,
        name: country.name,
      },
      update: {
        name: country.name,
      },
    });

    // Create junction with PRODUCTION type
    await tx.movieCountry.create({
      data: {
        movieId,
        countryCode: country.iso_3166_1,
        type: "PRODUCTION",
      },
    }).catch(() => {});
  }
}

/**
 * Upsert spoken languages for a movie
 */
async function upsertMovieLanguages(
  tx: PrismaTx,
  movieId: number,
  languages: Array<{ iso_639_1: string; name: string; english_name: string }>
) {
  if (!languages.length) return;

  // Delete existing language associations
  await tx.movieLanguage.deleteMany({ where: { movieId } });

  for (const lang of languages) {
    // Upsert language lookup
    await tx.language.upsert({
      where: { code: lang.iso_639_1 },
      create: {
        code: lang.iso_639_1,
        name: lang.english_name || lang.name,
      },
      update: {},
    });

    // Create junction (type: SPOKEN)
    await tx.movieLanguage.create({
      data: {
        movieId,
        languageCode: lang.iso_639_1,
        type: "SPOKEN",
      },
    }).catch(() => {
      // Ignore duplicates
    });
  }
}

/**
 * Upsert countries for a series (origin countries only - series don't have production_countries in TMDB)
 * 
 * @param originCountries - From TMDB origin_country (ISO codes array)
 */
async function upsertSeriesCountries(
  tx: PrismaTx,
  seriesId: number,
  originCountries: string[]
) {
  if (!originCountries?.length) return;

  // Delete existing country associations
  await tx.seriesCountry.deleteMany({ where: { seriesId } });

  // Insert origin countries
  for (const code of originCountries) {
    // Upsert country lookup
    await tx.country.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });

    // Create junction with ORIGIN type
    await tx.seriesCountry.create({
      data: {
        seriesId,
        countryCode: code,
        type: "ORIGIN",
      },
    }).catch(() => {});
  }
}
