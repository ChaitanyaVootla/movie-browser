/**
 * Series Junction-Table Upserts
 *
 * Split out of series-upsert.ts (file size limit): genres, keywords,
 * networks, creators, countries, companies, languages. Each skips its
 * delete+reinsert when the id set is unchanged (June 2026 change-detection).
 */

import type { PrismaTx } from "./types";
import {
  logChildRewrite,
  seriesGenresUnchanged,
  seriesKeywordsUnchanged,
  seriesNetworksUnchanged,
  seriesCreatorsUnchanged,
  seriesCompaniesUnchanged,
  seriesCountriesUnchanged,
  seriesLanguagesUnchanged,
} from "./upsert-diff";

/**
 * Upsert series genres
 */
export async function upsertSeriesGenres(
  tx: PrismaTx,
  seriesId: number,
  genres: Array<{ id: number; name: string }>
): Promise<void> {
  if (await seriesGenresUnchanged(tx, seriesId, genres.map((g) => g.id))) return;
  logChildRewrite("series_genres", "series", seriesId);

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
    await tx.seriesGenre
      .create({
        data: {
          seriesId,
          genreId: dbGenre.id,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

/**
 * Upsert series keywords
 */
export async function upsertSeriesKeywords(
  tx: PrismaTx,
  seriesId: number,
  keywords: Array<{ id: number; name: string }>
): Promise<void> {
  if (await seriesKeywordsUnchanged(tx, seriesId, keywords.map((k) => k.id))) return;
  logChildRewrite("series_keywords", "series", seriesId);

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
    await tx.seriesKeyword
      .create({
        data: {
          seriesId,
          keywordId: dbKeyword.id,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

/**
 * Upsert series networks
 */
export async function upsertSeriesNetworks(
  tx: PrismaTx,
  seriesId: number,
  networks: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>
): Promise<void> {
  if (await seriesNetworksUnchanged(tx, seriesId, networks.map((n) => n.id))) return;
  logChildRewrite("series_networks", "series", seriesId);

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
    await tx.seriesNetwork
      .create({
        data: {
          seriesId,
          networkId: dbNetwork.id,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

/**
 * Upsert series creators (created_by from TMDB)
 */
export async function upsertSeriesCreators(
  tx: PrismaTx,
  seriesId: number,
  creators: Array<{ id: number; name: string; profile_path: string | null }>
): Promise<void> {
  if (await seriesCreatorsUnchanged(tx, seriesId, creators.map((c) => c.id))) return;
  logChildRewrite("series_creators", "series", seriesId);

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
    await tx.seriesCreator
      .create({
        data: {
          seriesId,
          personId: dbPerson.id,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

/**
 * Upsert countries for a series (origin countries only - series don't have production_countries in TMDB)
 *
 * @param originCountries - From TMDB origin_country (ISO codes array)
 */
export async function upsertSeriesCountries(
  tx: PrismaTx,
  seriesId: number,
  originCountries: string[]
): Promise<void> {
  if (!originCountries?.length) return;

  if (await seriesCountriesUnchanged(tx, seriesId, originCountries)) return;
  logChildRewrite("series_countries", "series", seriesId);

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
    await tx.seriesCountry
      .create({
        data: {
          seriesId,
          countryCode: code,
          type: "ORIGIN",
        },
      })
      .catch(() => {});
  }
}

/**
 * Upsert series production companies
 */
export async function upsertSeriesCompanies(
  tx: PrismaTx,
  seriesId: number,
  companies: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>
): Promise<void> {
  if (await seriesCompaniesUnchanged(tx, seriesId, companies.map((c) => c.id))) return;
  logChildRewrite("series_companies", "series", seriesId);

  // Delete existing company associations
  await tx.seriesCompany.deleteMany({ where: { seriesId } });

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

    // Create junction using DB ID
    await tx.seriesCompany
      .create({
        data: {
          seriesId,
          companyId: dbCompany.id,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

/**
 * Upsert spoken languages for a series
 */
export async function upsertSeriesLanguages(
  tx: PrismaTx,
  seriesId: number,
  languages: Array<{ iso_639_1: string; name: string; english_name?: string }>
): Promise<void> {
  if (!languages.length) return;

  if (await seriesLanguagesUnchanged(tx, seriesId, languages.map((l) => l.iso_639_1))) return;
  logChildRewrite("series_languages", "series", seriesId);

  // Delete existing language associations
  await tx.seriesLanguage.deleteMany({ where: { seriesId } });

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
    await tx.seriesLanguage
      .create({
        data: {
          seriesId,
          languageCode: lang.iso_639_1,
          type: "SPOKEN",
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}
