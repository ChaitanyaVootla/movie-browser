/**
 * PostgreSQL Movie Upsert Functions
 *
 * Movie-specific upsert logic including:
 * - Core movie upsert
 * - Movie genres, keywords, companies
 * - Movie certifications (from release_dates)
 * - Movie countries and languages
 */

import { prisma } from "@/server/db/postgres";
import type { EnrichedData } from "../../types";
import type { TmdbMovieData } from "../tmdb";
import type { PrismaTx, UpsertOutcome } from "./types";
import { isPrismaError, getErrorMessage } from "./error-utils";
import {
  ensureCompanies,
  ensureCountries,
  ensureGenres,
  ensureKeywords,
  ensureLanguages,
  resolveIds,
} from "./lookup-upserts";
import { upsertRatings, upsertScrapedWatchLinks } from "./rating-upserts";
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
  movieCertificationsUnchanged,
  movieGenresUnchanged,
  movieKeywordsUnchanged,
  movieCompaniesUnchanged,
  movieCountriesUnchanged,
  movieLanguagesUnchanged,
} from "./upsert-diff";

// =============================================================================
// Main Movie Upsert
// =============================================================================

/**
 * Upsert movie with all related data to PostgreSQL
 */
export async function upsertMovieToPostgres(
  tmdb: TmdbMovieData,
  enriched: EnrichedData
): Promise<UpsertOutcome> {
  // Set inside the transaction, read only after it COMMITS (a rolled-back
  // write must never trigger a purge).
  let displayedChanged = 0;
  try {
    // Increase timeout for large movies with lots of credits/images
    await prisma.$transaction(
      async (tx) => {
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
        displayedChanged += await upsertRatings(tx, tmdb.id, "movie", tmdb, enriched.ratings);

        // 3. Upsert external IDs
        await upsertExternalIds(tx, tmdb.id, "movie", tmdb, enriched.externalIds);

        // 4. Upsert videos
        await upsertVideos(tx, tmdb.id, "movie", tmdb.videos?.results || []);

        // 5. Upsert images
        await upsertImages(tx, tmdb.id, "movie", tmdb.images);

        // 6. Upsert scraped watch links
        displayedChanged += await upsertScrapedWatchLinks(
          tx,
          tmdb.id,
          "movie",
          enriched.scrapedWatchLinks,
          enriched.watchLinkCountries
        );

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
          await upsertMovieCountries(
            tx,
            tmdb.id,
            tmdb.origin_country || [],
            tmdb.production_countries || []
          );
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

        // 16. Update enrichment timestamps and tmdbUpdatedAt
        const hasEnrichedRatings = enriched.ratings && Object.keys(enriched.ratings).length > 0;
        const hasScrapedWatchLinks =
          enriched.scrapedWatchLinks && enriched.scrapedWatchLinks.length > 0;

        // Record the scrape time on every real enrichment ATTEMPT, not only when
        // ratings were found. Lambda/Mongo set `enriched.scrapedAt` even with zero
        // ratings; the empty/partial-hydration path leaves it null. Stamping the
        // attempt lets isPostgresEnrichedFresh serve repeat visits from PG instead
        // of re-invoking Lambda (which blocks render) on every page load.
        const scrapeAttempted = !!enriched.scrapedAt || hasEnrichedRatings;

        await tx.movie.update({
          where: { id: tmdb.id },
          data: {
            tmdbUpdatedAt: new Date(), // Track when TMDB data was last fetched
            enrichmentSource: enriched.source || null,
            ...(scrapeAttempted && { ratingsScrapedAt: enriched.scrapedAt ?? new Date() }),
            ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
          },
        });
      },
      { timeout: 30000 }
    ); // 30s timeout for large movies

    console.log(`[Hydration/Postgres] Upserted movie ${tmdb.id}: ${tmdb.title}`);
    return { written: true, contentChanged: displayedChanged > 0 };
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2022") {
      console.warn(
        `[Hydration/Postgres] Schema out of sync - run 'prisma db push'. Cannot upsert movie ${tmdb.id}`
      );
    } else {
      console.error(
        `[Hydration/Postgres] Error upserting movie ${tmdb.id}:`,
        getErrorMessage(error)
      );
    }
    // Don't throw - let the hydration continue with TMDB data
    return { written: false, contentChanged: false };
  }
}

// =============================================================================
// Movie-Specific Upsert Helpers
// =============================================================================

/**
 * Upsert movie certifications (from release_dates)
 */
async function upsertMovieCertifications(
  tx: PrismaTx,
  movieId: number,
  releaseDates: TmdbMovieData["release_dates"]["results"]
): Promise<void> {
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

  // Get valid country codes from the database (filter out obsolete codes like SU)
  let filteredCerts: typeof certsToCreate = [];
  if (certsToCreate.length > 0) {
    const validCountries = await tx.country.findMany({
      where: { code: { in: certsToCreate.map((c) => c.countryCode) } },
      select: { code: true },
    });
    const validCodes = new Set(validCountries.map((c) => c.code));
    // The (movieId, countryCode, releaseType) unique constraint + skipDuplicates
    // keeps the first row per key (NULL releaseType rows never collapse).
    filteredCerts = dedupeBy(
      certsToCreate.filter((c) => validCodes.has(c.countryCode)),
      (c) => (c.releaseType === null ? null : `${c.countryCode}|${c.releaseType}`)
    );
  }

  if (
    await movieCertificationsUnchanged(
      tx,
      movieId,
      filteredCerts.map(({ movieId: _m, ...rest }) => rest)
    )
  ) {
    return;
  }
  logChildRewrite("movie_certifications", "movie", movieId);

  // Delete existing certifications
  await tx.movieCertification.deleteMany({ where: { movieId } });

  if (filteredCerts.length > 0) {
    // Use createMany with skipDuplicates for remaining duplicates (same country+releaseType)
    await tx.movieCertification.createMany({
      data: filteredCerts,
      skipDuplicates: true,
    });
  }
}

/**
 * Upsert movie genres. Lookups + junction via ON CONFLICT DO NOTHING — a
 * `.create().catch()` inside the transaction aborts the WHOLE upsert (25P02);
 * see lookup-upserts.ts.
 */
async function upsertMovieGenres(
  tx: PrismaTx,
  movieId: number,
  genres: Array<{ id: number; name: string }>
): Promise<void> {
  if (await movieGenresUnchanged(tx, movieId, genres.map((g) => g.id))) return;
  logChildRewrite("movie_genres", "movie", movieId);
  const ids = await ensureGenres(tx, genres);
  await tx.movieGenre.deleteMany({ where: { movieId } });
  const genreIds = resolveIds(genres.map((g) => g.id), ids);
  if (genreIds.length > 0) {
    await tx.movieGenre.createMany({
      data: genreIds.map((genreId) => ({ movieId, genreId })),
      skipDuplicates: true,
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
): Promise<void> {
  if (await movieKeywordsUnchanged(tx, movieId, keywords.map((k) => k.id))) return;
  logChildRewrite("movie_keywords", "movie", movieId);
  const ids = await ensureKeywords(tx, keywords);
  await tx.movieKeyword.deleteMany({ where: { movieId } });
  const keywordIds = resolveIds(keywords.map((k) => k.id), ids);
  if (keywordIds.length > 0) {
    await tx.movieKeyword.createMany({
      data: keywordIds.map((keywordId) => ({ movieId, keywordId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Upsert movie production companies
 */
async function upsertMovieCompanies(
  tx: PrismaTx,
  movieId: number,
  companies: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>
): Promise<void> {
  if (await movieCompaniesUnchanged(tx, movieId, companies.map((c) => c.id))) return;
  logChildRewrite("movie_companies", "movie", movieId);
  const ids = await ensureCompanies(tx, companies);
  await tx.movieCompany.deleteMany({ where: { movieId } });
  const companyIds = resolveIds(companies.map((c) => c.id), ids);
  if (companyIds.length > 0) {
    await tx.movieCompany.createMany({
      data: companyIds.map((companyId) => ({ movieId, companyId })),
      skipDuplicates: true,
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
): Promise<void> {
  const incomingPairs = [
    ...(originCountries || []).map((code) => ({ countryCode: code, type: "ORIGIN" })),
    ...(productionCountries || []).map((c) => ({ countryCode: c.iso_3166_1, type: "PRODUCTION" })),
  ];
  if (await movieCountriesUnchanged(tx, movieId, incomingPairs)) return;
  logChildRewrite("movie_countries", "movie", movieId);

  // Production entries first so a missing country is created with its real
  // name rather than the bare code origin_country gives us.
  await ensureCountries(tx, [
    ...(productionCountries || []).map((c) => ({ code: c.iso_3166_1, name: c.name })),
    ...(originCountries || []).map((code) => ({ code, name: code })),
  ]);
  await tx.movieCountry.deleteMany({ where: { movieId } });
  const rows = dedupeBy(
    [
      ...(originCountries || []).map((code) => ({ movieId, countryCode: code, type: "ORIGIN" as const })),
      ...(productionCountries || []).map((c) => ({
        movieId,
        countryCode: c.iso_3166_1,
        type: "PRODUCTION" as const,
      })),
    ].filter((r) => r.countryCode),
    (r) => `${r.countryCode}|${r.type}`
  );
  if (rows.length > 0) {
    await tx.movieCountry.createMany({ data: rows, skipDuplicates: true });
  }
}

/**
 * Upsert spoken languages for a movie
 */
async function upsertMovieLanguages(
  tx: PrismaTx,
  movieId: number,
  languages: Array<{ iso_639_1: string; name: string; english_name: string }>
): Promise<void> {
  if (!languages.length) return;

  if (await movieLanguagesUnchanged(tx, movieId, languages.map((l) => l.iso_639_1))) return;
  logChildRewrite("movie_languages", "movie", movieId);

  await ensureLanguages(
    tx,
    languages.map((l) => ({ code: l.iso_639_1, name: l.english_name || l.name }))
  );
  await tx.movieLanguage.deleteMany({ where: { movieId } });
  const rows = dedupeBy(
    languages.filter((l) => l.iso_639_1),
    (l) => l.iso_639_1
  ).map((l) => ({ movieId, languageCode: l.iso_639_1, type: "SPOKEN" as const }));
  if (rows.length > 0) {
    await tx.movieLanguage.createMany({ data: rows, skipDuplicates: true });
  }
}
