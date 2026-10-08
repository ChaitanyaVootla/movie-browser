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
import type { PrismaTx, SeasonWithEpisodes, UpsertOutcome, RowStamps } from "./types";
import { isPrismaError, getErrorMessage } from "./error-utils";
import { ensurePersons } from "./lookup-upserts";
import { hasSeasonWrites, reconcileSeasons } from "./season-upserts";
import { diffChildRows, hasChanges, keyPart } from "./diff-reconcile";
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
  seriesCertificationsUnchanged,
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
  enriched: EnrichedData,
  /**
   * The `tmdb` payload is PG's own (lossy) read transform, not a TMDB fetch:
   * write only the enrichment. Same rationale as upsertMovieToPostgres.
   */
  opts: { enrichmentOnly?: boolean } = {}
): Promise<UpsertOutcome> {
  const enrichmentOnly = opts.enrichmentOnly === true;
  // Set inside the transaction, read only after it COMMITS (a rolled-back
  // write must never trigger a purge).
  let displayedChanged = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Enrichment timestamps
        const hasEnrichedRatings = enriched.ratings && Object.keys(enriched.ratings).length > 0;
        const hasScrapedWatchLinks =
          enriched.scrapedWatchLinks && enriched.scrapedWatchLinks.length > 0;

        // Record the scrape time on every real enrichment ATTEMPT, not only when
        // ratings were found (see movie-upsert.ts for rationale). Prevents a
        // synchronous Lambda re-scrape on every series detail-page revisit.
        const scrapeAttempted = !!enriched.scrapedAt || hasEnrichedRatings;

        const stamps: RowStamps = {
          enrichmentSource: enriched.source || null,
          ...(scrapeAttempted && { ratingsScrapedAt: enriched.scrapedAt ?? new Date() }),
          ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
        };

        // ONE row write per refresh: with real TMDB data the stamps ride on the
        // core upsert (it rewrites the row anyway); enrichment-only writes just
        // the stamps, never tmdbUpdatedAt (no TMDB fetch happened).
        if (enrichmentOnly) {
          await tx.series.update({ where: { id: tmdb.id }, data: stamps });
        } else {
          await upsertSeriesCore(tx, tmdb, { ...stamps, tmdbUpdatedAt: new Date() });
        }

        // Ratings (same pattern as movies)
        displayedChanged += await upsertRatings(tx, tmdb.id, "series", tmdb, enriched.ratings);

        // External IDs — merge-only on an enrichment-only refresh
        await upsertExternalIds(tx, tmdb.id, "series", tmdb, enriched.externalIds, {
          mergeOnly: enrichmentOnly,
        });

        // Scraped watch links
        displayedChanged += await upsertScrapedWatchLinks(
          tx,
          tmdb.id,
          "series",
          enriched.scrapedWatchLinks,
          enriched.watchLinkCountries
        );

      },
      { timeout: 60000 }
    ); // 60s timeout for large series with many seasons/episodes

    console.log(`[Hydration/Postgres] Upserted series ${tmdb.id}: ${tmdb.name}`);
    return { written: true, contentChanged: displayedChanged > 0 };
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
    return { written: false, contentChanged: false };
  }
}

// =============================================================================
// Series-Specific Upsert Helpers
// =============================================================================

/**
 * Upsert seasons and episodes
 */
/**
 * TMDB-sourced part of the series upsert: the series row, seasons/episodes and
 * every child table only TMDB feeds. Requires a REAL TMDB payload.
 */
async function upsertSeriesCore(tx: PrismaTx, tmdb: TmdbSeriesData, stamps: RowStamps): Promise<void> {
  // 1. Upsert core series
  await tx.series.upsert({
    where: { id: tmdb.id },
    create: {
      ...stamps,
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
      ...stamps,
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

  // 4. Upsert videos
  await upsertVideos(tx, tmdb.id, "series", tmdb.videos?.results || []);

  // 5. Upsert images
  await upsertImages(tx, tmdb.id, "series", tmdb.images);

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
}

/**
 * True when any season lacks an `episodes` array — the payload is a season
 * summary (or a partly failed fetch), not authoritative episode data. A
 * season that genuinely has zero episodes after a successful fetch carries
 * `episodes: []`, which is authoritative.
 */
export function isSummaryOnly(seasons: ReadonlyArray<SeasonWithEpisodes>): boolean {
  return seasons.some((s) => s.episode_count > 0 && !Array.isArray(s.episodes));
}

async function upsertSeasons(
  tx: PrismaTx,
  seriesId: number,
  seasons: SeasonWithEpisodes[]
): Promise<void> {
  // SUMMARY-ONLY GUARD (Oct 2026): seasons without episodes (PG round-trip,
  // hover-card partials, a failed per-season fetch) are not authoritative.
  // They may only seed seasons for a series that has none; they never rewrite
  // existing ones (that used to wipe episodes: ~1,619 deletes/min).
  if (isSummaryOnly(seasons)) {
    const existingCount = await tx.season.count({ where: { seriesId } });
    if (existingCount > 0) return;
  }

  // In-place reconciliation (season-upserts.ts): zero writes when unchanged,
  // UPDATE-in-place for changed rows, episode vote drift ignored.
  const stats = await reconcileSeasons(tx, seriesId, seasons);
  if (hasSeasonWrites(stats)) {
    logChildRewrite("seasons", "series", seriesId);
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
  // Diff-reconciled IN PLACE (Oct 2026). This used to delete+reinsert EVERY
  // aggregate credit on any difference — aggregate total_episode_count / order
  // move whenever an episode airs, so each real refresh of a running series
  // rewrote hundreds of rows (prod: 93% of recent credits inserts were whole
  // aggregate sets, e.g. 891/891 rows for one series). Now only the delta is
  // written. The (series, person, type, character, is_aggregate) unique index
  // collapses duplicate non-NULL characters, so dedupe the same way.
  const deduped = dedupeBy(incoming, (c) =>
    c.character !== null ? `${c.creditType}|${c.personTmdbId}|${c.character}` : null
  );
  const existingRaw = await tx.credit.findMany({
    where: { seriesId, isAggregate: true },
    select: {
      id: true,
      creditType: true,
      character: true,
      job: true,
      department: true,
      creditOrder: true,
      totalEpisodeCount: true,
      person: { select: { tmdbId: true } },
    },
  });
  const existing = existingRaw.map((r) => ({
    id: r.id,
    personTmdbId: r.person.tmdbId,
    creditType: String(r.creditType),
    character: r.character,
    job: r.job,
    department: r.department,
    creditOrder: r.creditOrder,
    totalEpisodeCount: r.totalEpisodeCount,
  }));
  const diff = diffChildRows(
    existing,
    deduped,
    (r) =>
      `${r.creditType}|${r.personTmdbId}|${keyPart(r.character)}|${keyPart(r.job)}|${keyPart(r.department)}`,
    (a, b) => a.creditOrder === b.creditOrder && a.totalEpisodeCount === b.totalEpisodeCount
  );
  if (!hasChanges(diff)) return;
  logChildRewrite("credits_aggregate", "series", seriesId);

  if (diff.toDelete.length > 0) {
    await tx.credit.deleteMany({ where: { id: { in: diff.toDelete.map((r) => r.id) } } });
  }
  for (const { existing: row, incoming: inc } of diff.toUpdate) {
    await tx.credit.update({
      where: { id: row.id },
      data: { creditOrder: inc.creditOrder, totalEpisodeCount: inc.totalEpisodeCount },
    });
  }
  if (diff.toInsert.length === 0) return;

  // Persons for the inserted delta in one race-safe pass, then one ON CONFLICT
  // DO NOTHING insert (see lookup-upserts.ts for why never create().catch()).
  const insertTmdbIds = new Set(diff.toInsert.map((c) => c.personTmdbId));
  const personIds = await ensurePersons(
    tx,
    [...(aggregateCredits.cast || []), ...(aggregateCredits.crew || [])].filter((p) =>
      insertTmdbIds.has(p.id)
    )
  );
  const rows: Prisma.CreditCreateManyInput[] = [];
  for (const row of diff.toInsert) {
    const personId = personIds.get(row.personTmdbId);
    if (personId === undefined) continue;
    rows.push({
      seriesId,
      personId,
      creditType: row.creditType === "CAST" ? "CAST" : "CREW",
      character: row.character,
      job: row.job,
      department: row.department,
      creditOrder: row.creditOrder,
      isAggregate: true,
      totalEpisodeCount: row.totalEpisodeCount,
    });
  }
  if (rows.length > 0) {
    await tx.credit.createMany({ data: rows, skipDuplicates: true });
  }
}
