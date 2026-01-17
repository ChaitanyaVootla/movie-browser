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
import type { PrismaTx } from "./types";
import { isPrismaError, getErrorMessage } from "./error-utils";
import {
  upsertRatings,
  upsertExternalIds,
  upsertVideos,
  upsertImages,
  upsertScrapedWatchLinks,
  upsertWatchProviders,
  upsertReviews,
  upsertCredits,
} from "./shared-upserts";

// =============================================================================
// Main Movie Upsert
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

        await tx.movie.update({
          where: { id: tmdb.id },
          data: {
            tmdbUpdatedAt: new Date(), // Track when TMDB data was last fetched
            enrichmentSource: enriched.source || null,
            ...(hasEnrichedRatings && { ratingsScrapedAt: new Date() }),
            ...(hasScrapedWatchLinks && { watchLinksScrapedAt: new Date() }),
          },
        });
      },
      { timeout: 30000 }
    ); // 30s timeout for large movies

    console.log(`[Hydration/Postgres] Upserted movie ${tmdb.id}: ${tmdb.title}`);
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

/**
 * Upsert movie genres
 */
async function upsertMovieGenres(
  tx: PrismaTx,
  movieId: number,
  genres: Array<{ id: number; name: string }>
): Promise<void> {
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
    await tx.movieGenre
      .create({
        data: {
          movieId,
          genreId: dbGenre.id,
        },
      })
      .catch(() => {
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
): Promise<void> {
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
    await tx.movieKeyword
      .create({
        data: {
          movieId,
          keywordId: dbKeyword.id,
        },
      })
      .catch(() => {
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
  companies: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>
): Promise<void> {
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
    await tx.movieCountry
      .create({
        data: {
          movieId,
          countryCode: code,
          type: "ORIGIN",
        },
      })
      .catch(() => {});
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
    await tx.movieCountry
      .create({
        data: {
          movieId,
          countryCode: country.iso_3166_1,
          type: "PRODUCTION",
        },
      })
      .catch(() => {});
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
    await tx.movieLanguage
      .create({
        data: {
          movieId,
          languageCode: lang.iso_639_1,
          type: "SPOKEN",
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}
