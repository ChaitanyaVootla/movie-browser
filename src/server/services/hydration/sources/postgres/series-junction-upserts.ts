/**
 * Series Junction-Table Upserts
 *
 * Split out of series-upsert.ts (file size limit): genres, keywords,
 * networks, creators, countries, companies, languages. Each skips its
 * delete+reinsert when the id set is unchanged (June 2026 change-detection).
 *
 * All lookup + junction inserts are ON CONFLICT DO NOTHING (createMany
 * skipDuplicates). The old `.create().catch(() => {})` aborted the whole
 * series transaction on a duplicate (25P02) — see lookup-upserts.ts.
 */

import type { PrismaTx } from "./types";
import {
  ensureCompanies,
  ensureCountries,
  ensureGenres,
  ensureKeywords,
  ensureLanguages,
  ensureNetworks,
  ensurePersons,
  resolveIds,
} from "./lookup-upserts";
import {
  dedupeBy,
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
  const ids = await ensureGenres(tx, genres);
  await tx.seriesGenre.deleteMany({ where: { seriesId } });
  const genreIds = resolveIds(genres.map((g) => g.id), ids);
  if (genreIds.length > 0) {
    await tx.seriesGenre.createMany({
      data: genreIds.map((genreId) => ({ seriesId, genreId })),
      skipDuplicates: true,
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
  const ids = await ensureKeywords(tx, keywords);
  await tx.seriesKeyword.deleteMany({ where: { seriesId } });
  const keywordIds = resolveIds(keywords.map((k) => k.id), ids);
  if (keywordIds.length > 0) {
    await tx.seriesKeyword.createMany({
      data: keywordIds.map((keywordId) => ({ seriesId, keywordId })),
      skipDuplicates: true,
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
  const ids = await ensureNetworks(tx, networks);
  await tx.seriesNetwork.deleteMany({ where: { seriesId } });
  const networkIds = resolveIds(networks.map((n) => n.id), ids);
  if (networkIds.length > 0) {
    await tx.seriesNetwork.createMany({
      data: networkIds.map((networkId) => ({ seriesId, networkId })),
      skipDuplicates: true,
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
  const ids = await ensurePersons(tx, creators);
  await tx.seriesCreator.deleteMany({ where: { seriesId } });
  const personIds = resolveIds(creators.map((c) => c.id), ids);
  if (personIds.length > 0) {
    await tx.seriesCreator.createMany({
      data: personIds.map((personId) => ({ seriesId, personId })),
      skipDuplicates: true,
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
  await ensureCountries(tx, originCountries.map((code) => ({ code, name: code })));
  await tx.seriesCountry.deleteMany({ where: { seriesId } });
  const codes = dedupeBy(originCountries.filter(Boolean), (c) => c);
  if (codes.length > 0) {
    await tx.seriesCountry.createMany({
      data: codes.map((countryCode) => ({ seriesId, countryCode, type: "ORIGIN" as const })),
      skipDuplicates: true,
    });
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
  const ids = await ensureCompanies(tx, companies);
  await tx.seriesCompany.deleteMany({ where: { seriesId } });
  const companyIds = resolveIds(companies.map((c) => c.id), ids);
  if (companyIds.length > 0) {
    await tx.seriesCompany.createMany({
      data: companyIds.map((companyId) => ({ seriesId, companyId })),
      skipDuplicates: true,
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
  await ensureLanguages(
    tx,
    languages.map((l) => ({ code: l.iso_639_1, name: l.english_name || l.name }))
  );
  await tx.seriesLanguage.deleteMany({ where: { seriesId } });
  const rows = dedupeBy(
    languages.filter((l) => l.iso_639_1),
    (l) => l.iso_639_1
  ).map((l) => ({ seriesId, languageCode: l.iso_639_1, type: "SPOKEN" as const }));
  if (rows.length > 0) {
    await tx.seriesLanguage.createMany({ data: rows, skipDuplicates: true });
  }
}
