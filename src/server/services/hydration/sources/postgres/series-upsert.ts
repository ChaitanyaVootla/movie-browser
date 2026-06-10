/**
 * PostgreSQL Series Upsert Functions
 *
 * Series-specific upsert logic including:
 * - Core series upsert
 * - Seasons and episodes
 * - Series genres, keywords, networks, creators
 * - Series certifications (from content_ratings)
 * - Series countries
 * - Aggregate credits
 */

import { prisma, Prisma } from "@/server/db/postgres";
import type { EnrichedData } from "../../types";
import type { TmdbSeriesData } from "../tmdb";
import type { PrismaTx, SeasonWithEpisodes } from "./types";
import { isPrismaError, getErrorMessage } from "./error-utils";
import { upsertRatings, upsertScrapedWatchLinks } from "./rating-upserts";
import {
  upsertSeriesGenres,
  upsertSeriesKeywords,
  upsertSeriesNetworks,
  upsertSeriesCreators,
  upsertSeriesCountries,
  upsertSeriesCompanies,
  upsertSeriesLanguages,
} from "./series-junction-upserts";
import {
  upsertExternalIds,
  upsertVideos,
  upsertImages,
  upsertWatchProviders,
  upsertReviews,
  upsertCredits,
} from "./shared-upserts";
import {
  dedupeBy,
  logChildRewrite,
  seasonsUnchanged,
  seriesCertificationsUnchanged,
  aggregateCreditsUnchanged,
  type AggregateCreditProjection,
} from "./upsert-diff";

// =============================================================================
// Main Series Upsert
// =============================================================================

/**
 * Upsert series with all related data to PostgreSQL
 */
export async function upsertSeriesToPostgres(
  tmdb: TmdbSeriesData,
  enriched: EnrichedData
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
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
            lastEpisodeData: tmdb.last_episode_to_air
              ? (tmdb.last_episode_to_air as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            nextEpisodeSeasonNum: tmdb.next_episode_to_air?.season_number ?? null,
            nextEpisodeNum: tmdb.next_episode_to_air?.episode_number ?? null,
            nextEpisodeAirDate: tmdb.next_episode_to_air?.air_date
              ? new Date(tmdb.next_episode_to_air.air_date)
              : null,
            nextEpisodeData: tmdb.next_episode_to_air
              ? (tmdb.next_episode_to_air as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
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
            lastEpisodeData: tmdb.last_episode_to_air
              ? (tmdb.last_episode_to_air as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            nextEpisodeSeasonNum: tmdb.next_episode_to_air?.season_number ?? null,
            nextEpisodeNum: tmdb.next_episode_to_air?.episode_number ?? null,
            nextEpisodeAirDate: tmdb.next_episode_to_air?.air_date
              ? new Date(tmdb.next_episode_to_air.air_date)
              : null,
            nextEpisodeData: tmdb.next_episode_to_air
              ? (tmdb.next_episode_to_air as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
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

        // 18. Upsert production companies
        if (tmdb.production_companies?.length) {
          await upsertSeriesCompanies(tx, tmdb.id, tmdb.production_companies);
        }

        // 19. Upsert spoken languages
        if (tmdb.spoken_languages?.length) {
          await upsertSeriesLanguages(tx, tmdb.id, tmdb.spoken_languages);
        }

        // 20. Update enrichment timestamps and tmdbUpdatedAt
        const hasEnrichedRatings = enriched.ratings && Object.keys(enriched.ratings).length > 0;
        const hasScrapedWatchLinks =
          enriched.scrapedWatchLinks && enriched.scrapedWatchLinks.length > 0;

        // Record the scrape time on every real enrichment ATTEMPT, not only when
        // ratings were found (see movie-upsert.ts for rationale). Prevents a
        // synchronous Lambda re-scrape on every series detail-page revisit.
        const scrapeAttempted = !!enriched.scrapedAt || hasEnrichedRatings;

        await tx.series.update({
          where: { id: tmdb.id },
          data: {
            tmdbUpdatedAt: new Date(), // Track when TMDB data was last fetched
            enrichmentSource: enriched.source || null,
            ...(scrapeAttempted && { ratingsScrapedAt: enriched.scrapedAt ?? new Date() }),
            ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
          },
        });
      },
      { timeout: 60000 }
    ); // 60s timeout for large series with many seasons/episodes

    console.log(`[Hydration/Postgres] Upserted series ${tmdb.id}: ${tmdb.name}`);
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2022") {
      console.warn(
        `[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Cannot upsert series ${tmdb.id}`
      );
    } else {
      console.error(
        `[Hydration/Postgres] Error upserting series ${tmdb.id}:`,
        getErrorMessage(error)
      );
    }
    // Don't throw - let the hydration continue with TMDB data
  }
}

// =============================================================================
// Series-Specific Upsert Helpers
// =============================================================================

/**
 * Upsert seasons and episodes
 */
async function upsertSeasons(
  tx: PrismaTx,
  seriesId: number,
  seasons: SeasonWithEpisodes[]
): Promise<void> {
  // Change-detection: seasons+episodes compared as one canonical unit. When
  // unchanged (the common case), the whole delete cascade (seasons → episodes
  // → images) and reinsert is skipped.
  if (await seasonsUnchanged(tx, seriesId, seasons)) return;
  logChildRewrite("seasons", "series", seriesId);

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

/**
 * Upsert series certifications (from content_ratings)
 */
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
    // The (seriesId, countryCode) unique constraint + skipDuplicates keeps the
    // first row per country — mirror that before comparing.
    const filteredCerts = dedupeBy(
      certsToCreate.filter((c) => validCodes.has(c.countryCode)),
      (c) => c.countryCode
    );

    if (filteredCerts.length > 0) {
      if (
        await seriesCertificationsUnchanged(
          tx,
          seriesId,
          filteredCerts.map(({ seriesId: _s, ...rest }) => rest)
        )
      ) {
        return;
      }
      logChildRewrite("series_certifications", "series", seriesId);

      // Delete existing certifications
      await tx.seriesCertification.deleteMany({ where: { seriesId } });
      await tx.seriesCertification.createMany({ data: filteredCerts, skipDuplicates: true });
    }
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
): Promise<void> {
  // Change-detection: build the projection of what WOULD be inserted (same
  // flattening rules as below) and skip the delete+reinsert when identical.
  const incoming: AggregateCreditProjection[] = [];
  for (const cast of aggregateCredits.cast || []) {
    const combinedCharacter = cast.roles
      .map((r) => r.character)
      .filter(Boolean)
      .join(" / ");
    incoming.push({
      personTmdbId: cast.id,
      creditType: "CAST",
      character: combinedCharacter || null,
      job: null,
      department: null,
      creditOrder: cast.order ?? null,
      totalEpisodeCount: cast.total_episode_count ?? null,
    });
  }
  for (const crew of aggregateCredits.crew || []) {
    for (const jobInfo of crew.jobs || []) {
      incoming.push({
        personTmdbId: crew.id,
        creditType: "CREW",
        character: null,
        job: jobInfo.job,
        department: crew.department,
        creditOrder: null,
        totalEpisodeCount: crew.total_episode_count ?? null,
      });
    }
  }
  if (await aggregateCreditsUnchanged(tx, seriesId, incoming)) return;
  logChildRewrite("credits_aggregate", "series", seriesId);

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
    const combinedCharacter = cast.roles
      .map((r) => r.character)
      .filter(Boolean)
      .join(" / ");

    await tx.credit
      .create({
        data: {
          seriesId,
          personId: dbPerson.id,
          creditType: "CAST",
          character: combinedCharacter || null,
          creditOrder: cast.order,
          isAggregate: true,
          totalEpisodeCount: cast.total_episode_count,
        },
      })
      .catch(() => {});
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
      await tx.credit
        .create({
          data: {
            seriesId,
            personId: dbPerson.id,
            creditType: "CREW",
            job: jobInfo.job,
            department: crew.department,
            isAggregate: true,
            totalEpisodeCount: crew.total_episode_count,
          },
        })
        .catch(() => {});
    }
  }
}



