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
    await prisma.$transaction(async (tx) => {
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

      // 12. Upsert watch providers (TMDB)
      if (tmdb["watch/providers"]?.results) {
        await upsertWatchProviders(tx, tmdb.id, "movie", tmdb["watch/providers"].results);
      }

      // 13. Update enrichment timestamps
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
    });

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
      if (tmdb.credits) {
        await upsertCredits(tx, tmdb.id, "series", tmdb.credits);
      }

      // 12. Upsert networks
      if (tmdb.networks?.length) {
        await upsertSeriesNetworks(tx, tmdb.id, tmdb.networks);
      }

      // 13. Upsert watch providers (TMDB)
      if (tmdb["watch/providers"]?.results) {
        await upsertWatchProviders(tx, tmdb.id, "series", tmdb["watch/providers"].results);
      }

      // 14. Update enrichment timestamps
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
    });

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

async function upsertRatings(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  tmdb: { vote_average: number; vote_count: number },
  enrichedRatings: EnrichedRatings | null
): Promise<void> {
  // Delete existing ratings
  if (mediaType === "movie") {
    await tx.rating.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.rating.deleteMany({ where: { seriesId: mediaId } });
  }

  const ratingsToCreate: Array<{
    movieId: number | null;
    seriesId: number | null;
    sourceId: number;
    score: number;
    voteCount: number | null;
    certified: boolean | null;
    consensus: string | null;
    sentiment: string | null;
    sourceUrl: string | null;
  }> = [];

  const baseRating = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  // TMDB rating (always available)
  if (tmdb.vote_average > 0) {
    ratingsToCreate.push({
      ...baseRating,
      sourceId: await getOrCreateSource(tx, "tmdb"),
      score: tmdb.vote_average,
      voteCount: tmdb.vote_count,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: null,
    });
  }

  // Enriched ratings
  if (enrichedRatings) {
    if (enrichedRatings.imdb?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "imdb"),
        score: enrichedRatings.imdb.score,
        voteCount: enrichedRatings.imdb.voteCount ?? null,
        certified: null,
        consensus: null,
        sentiment: null,
        sourceUrl: enrichedRatings.imdb.sourceUrl ?? null,
      });
    }

    if (enrichedRatings.rtCritic?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "rt_critic"),
        score: enrichedRatings.rtCritic.score,
        voteCount: enrichedRatings.rtCritic.voteCount ?? null,
        certified: enrichedRatings.rtCritic.certified ?? null,
        consensus: enrichedRatings.rtCritic.consensus ?? null,
        sentiment: enrichedRatings.rtCritic.sentiment ?? null,
        sourceUrl: enrichedRatings.rtCritic.sourceUrl ?? null,
      });
    }

    if (enrichedRatings.rtAudience?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "rt_audience"),
        score: enrichedRatings.rtAudience.score,
        voteCount: enrichedRatings.rtAudience.voteCount ?? null,
        certified: enrichedRatings.rtAudience.certified ?? null,
        consensus: null,
        sentiment: enrichedRatings.rtAudience.sentiment ?? null,
        sourceUrl: null,
      });
    }

    if (enrichedRatings.metacritic?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "metacritic"),
        score: enrichedRatings.metacritic.score,
        voteCount: enrichedRatings.metacritic.voteCount ?? null,
        certified: null,
        consensus: null,
        sentiment: null,
        sourceUrl: enrichedRatings.metacritic.sourceUrl ?? null,
      });
    }

    if (enrichedRatings.letterboxd?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "letterboxd"),
        score: enrichedRatings.letterboxd.score,
        voteCount: null,
        certified: null,
        consensus: null,
        sentiment: null,
        sourceUrl: null,
      });
    }

    if (enrichedRatings.google?.score) {
      ratingsToCreate.push({
        ...baseRating,
        sourceId: await getOrCreateSource(tx, "google"),
        score: enrichedRatings.google.score,
        voteCount: null,
        certified: null,
        consensus: null,
        sentiment: null,
        sourceUrl: null,
      });
    }
  }

  if (ratingsToCreate.length > 0) {
    await tx.rating.createMany({ data: ratingsToCreate });
  }
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

async function upsertScrapedWatchLinks(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  links: ScrapedWatchLink[]
): Promise<void> {
  // Delete existing scraped links
  if (mediaType === "movie") {
    await tx.scrapedWatchLink.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.scrapedWatchLink.deleteMany({ where: { seriesId: mediaId } });
  }

  if (links.length === 0) return;

  const linksToCreate = links.map((l) => ({
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
    providerName: l.provider,
    link: l.link,
    price: l.price || null,
    countryCode: "IN", // Scraped links are currently India-only
  }));

  await tx.scrapedWatchLink.createMany({ data: linksToCreate });
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
    // Use upsert logic via raw query to handle unique constraint
    for (const cert of certsToCreate) {
      try {
        await tx.movieCertification.create({ data: cert });
      } catch {
        // Ignore duplicates
      }
    }
  }
}

async function upsertSeriesCertifications(
  tx: PrismaTx,
  seriesId: number,
  contentRatings: TmdbSeriesData["content_ratings"]["results"]
): Promise<void> {
  // Delete existing certifications
  await tx.seriesCertification.deleteMany({ where: { seriesId } });

  const certsToCreate = contentRatings
    .filter((r) => r.rating)
    .map((r) => ({
      seriesId,
      countryCode: r.iso_3166_1,
      certification: r.rating,
    }));

  if (certsToCreate.length > 0) {
    await tx.seriesCertification.createMany({ data: certsToCreate, skipDuplicates: true });
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
    // Upsert the genre and get the DB ID back
    const dbGenre = await tx.genre.upsert({
      where: { tmdbId: genre.id },
      create: { tmdbId: genre.id, name: genre.name },
      update: { name: genre.name },
    });

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
    // Upsert the keyword and get DB ID
    const dbKeyword = await tx.keyword.upsert({
      where: { tmdbId: keyword.id },
      create: { tmdbId: keyword.id, name: keyword.name },
      update: { name: keyword.name },
    });

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
 * Upsert credits (cast and crew)
 */
async function upsertCredits(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  credits: { cast?: Array<any>; crew?: Array<any> }
) {
  // Delete existing credits
  if (mediaType === "movie") {
    await tx.credit.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.credit.deleteMany({ where: { seriesId: mediaId } });
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

  // Process cast
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

  // Process crew (limit to important roles)
  const importantJobs = ["Director", "Writer", "Screenplay", "Producer", "Executive Producer", "Composer", "Director of Photography"];
  for (const crew of credits.crew || []) {
    if (importantJobs.includes(crew.job)) {
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
  }

  // Upsert persons and create credits
  for (const credit of allCredits.slice(0, 50)) { // Limit to 50 credits
    // Upsert person and get DB ID
    const dbPerson = await tx.person.upsert({
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

    // Create credit using DB ID
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
      },
    }).catch(() => {
      // Ignore duplicates
    });
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
    // Upsert the company and get DB ID
    const dbCompany = await tx.productionCompany.upsert({
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

    // Create junction using DB ID
    await tx.movieCompany.create({
      data: {
        movieId,
        companyId: dbCompany.id,
      },
    }).catch(() => {
      // Ignore duplicates
    });
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

  // Only process a subset of countries to limit data size
  const priorityCountries = ["US", "GB", "IN", "CA", "AU", "DE", "FR", "JP", "KR", "BR"];

  for (const [countryCode, data] of Object.entries(providersByCountry)) {
    if (!priorityCountries.includes(countryCode)) continue;

    const types: Array<{ type: "FLATRATE" | "RENT" | "BUY"; providers: typeof data.flatrate }> = [
      { type: "FLATRATE", providers: data.flatrate },
      { type: "RENT", providers: data.rent },
      { type: "BUY", providers: data.buy },
    ];

    for (const { type, providers } of types) {
      for (const provider of providers || []) {
        // Upsert the streaming provider and get DB ID
        const dbProvider = await tx.streamingProvider.upsert({
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
    // Upsert the genre and get DB ID
    const dbGenre = await tx.genre.upsert({
      where: { tmdbId: genre.id },
      create: { tmdbId: genre.id, name: genre.name },
      update: { name: genre.name },
    });

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
    // Upsert the keyword and get DB ID
    const dbKeyword = await tx.keyword.upsert({
      where: { tmdbId: keyword.id },
      create: { tmdbId: keyword.id, name: keyword.name },
      update: { name: keyword.name },
    });

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
    // Upsert the network and get DB ID
    const dbNetwork = await tx.network.upsert({
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
