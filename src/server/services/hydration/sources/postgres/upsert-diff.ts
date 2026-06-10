/**
 * Change-detection helpers for hydration upserts.
 *
 * Hydration used to delete + reinsert every child row (credits, images,
 * episodes, …) on every freshness refresh even when nothing changed. At
 * crawler scale that meant hundreds of thousands of dead tuples per day,
 * starved autovacuum, and tables bloated to 60x their live size.
 *
 * The upsert functions now build the rows they WOULD insert, project the
 * existing rows to the same shape, and skip the delete+reinsert entirely when
 * the two sets are identical (the overwhelmingly common case). When they
 * differ, the original delete+reinsert runs unchanged.
 *
 * Canonicalization rules:
 * - undefined and null compare equal (Prisma stores undefined as NULL)
 * - Date compares by epoch millis (DB roundtrips JS dates exactly)
 * - row order is irrelevant (multiset compare)
 * - nested arrays/objects serialize with sorted keys; nested row arrays must
 *   be pre-sorted by the caller (e.g. episodes by episodeNumber)
 */

import { dataLogger } from "@/lib/logger";
import type { PrismaTx, SeasonWithEpisodes } from "./types";

type CanonicalPrimitive = string | number | boolean | bigint | null | undefined;

export type CanonicalValue =
  | CanonicalPrimitive
  | Date
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export type CanonicalRow = { [key: string]: CanonicalValue };

type MediaType = "movie" | "series";

function canonicalValue(value: CanonicalValue): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return `D:${value.getTime()}`;
  switch (typeof value) {
    case "string":
      return `S:${JSON.stringify(value)}`;
    case "number":
      return `N:${String(value)}`;
    case "boolean":
      return `B:${String(value)}`;
    case "bigint":
      return `I:${value.toString()}`;
    default:
      break;
  }
  if (Array.isArray(value)) {
    return `A:[${value.map(canonicalValue).join(",")}]`;
  }
  const obj = value as { [key: string]: CanonicalValue };
  const keys = Object.keys(obj).sort();
  return `O:{${keys.map((k) => `${JSON.stringify(k)}:${canonicalValue(obj[k])}`).join(",")}}`;
}

/** Stable, order-insensitive serialization of one row. */
export function canonicalRow(row: CanonicalRow): string {
  return canonicalValue(row);
}

/**
 * Multiset equality of two row arrays (order-insensitive, duplicates count).
 * Both sides MUST be projected to the same shape by the caller.
 */
export function sameRows(
  existing: ReadonlyArray<CanonicalRow>,
  incoming: ReadonlyArray<CanonicalRow>
): boolean {
  if (existing.length !== incoming.length) return false;
  const a = existing.map(canonicalRow).sort();
  const b = incoming.map(canonicalRow).sort();
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Set equality of id/key lists. Incoming is deduped (mirrors junction-table
 * composite PKs collapsing duplicate inserts); existing is unique by PK.
 */
export function sameIdSet(
  existing: ReadonlyArray<number | string>,
  incoming: ReadonlyArray<number | string>
): boolean {
  const inc = [...new Set(incoming.map(String))].sort();
  const ex = existing.map(String).sort();
  if (ex.length !== inc.length) return false;
  for (let i = 0; i < ex.length; i++) {
    if (ex[i] !== inc[i]) return false;
  }
  return true;
}

/**
 * Keep the first row per key — mirrors what `createMany({ skipDuplicates })`
 * or `.create().catch(ignore)` produce when a unique constraint collapses
 * duplicate incoming rows. Rows with a null key are kept verbatim (Postgres
 * unique constraints treat NULLs as distinct).
 */
export function dedupeBy<T>(rows: ReadonlyArray<T>, key: (row: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (k !== null) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(row);
  }
  return out;
}

/** Observability: every actual child-table rewrite is logged (churn tracking). */
export function logChildRewrite(table: string, mediaType: string, mediaId: number): void {
  dataLogger.debug({ table, mediaType, mediaId }, "hydration: child rows changed, rewriting");
}

function mediaWhere(mediaId: number, mediaType: MediaType): { movieId: number } | { seriesId: number } {
  return mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId };
}

// =============================================================================
// Table-specific comparators (used by shared-upserts / movie-upsert / series-upsert)
// =============================================================================

export async function externalIdsUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  incoming: ReadonlyArray<{ source: string; externalId: string }>
): Promise<boolean> {
  const existing = await tx.externalId.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: { source: true, externalId: true },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

export async function videosUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  incoming: ReadonlyArray<{
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    size: number | null;
    publishedAt: Date | null;
  }>
): Promise<boolean> {
  const existing = await tx.video.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      key: true,
      name: true,
      site: true,
      type: true,
      official: true,
      size: true,
      publishedAt: true,
    },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

export async function imagesUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  incoming: ReadonlyArray<{
    filePath: string;
    type: string;
    aspectRatio: number | null;
    width: number | null;
    height: number | null;
    voteAverage: number | null;
    voteCount: number | null;
    language: string | null;
  }>
): Promise<boolean> {
  const existing = await tx.image.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      filePath: true,
      type: true,
      aspectRatio: true,
      width: true,
      height: true,
      voteAverage: true,
      voteCount: true,
      language: true,
    },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

export async function watchProvidersUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  incoming: ReadonlyArray<{
    providerTmdbId: number;
    countryCode: string;
    type: string;
    link: string | null;
  }>
): Promise<boolean> {
  const existing = await tx.watchOption.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      countryCode: true,
      type: true,
      link: true,
      provider: { select: { tmdbId: true } },
    },
  });
  return sameRows(
    existing.map((r) => ({
      providerTmdbId: r.provider.tmdbId,
      countryCode: r.countryCode,
      type: r.type,
      link: r.link,
    })),
    incoming.map((r) => ({ ...r }))
  );
}

export async function reviewsUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  sourceId: number,
  incoming: ReadonlyArray<{
    externalId: string;
    content: string;
    authorName: string | null;
    authorUrl: string | null;
    authorImage: string | null;
    score: number | null;
    reviewUrl: string | null;
    reviewDate: Date | null;
  }>
): Promise<boolean> {
  const existing = await tx.review.findMany({
    where: { ...mediaWhere(mediaId, mediaType), sourceId },
    select: {
      externalId: true,
      content: true,
      authorName: true,
      authorUrl: true,
      authorImage: true,
      score: true,
      reviewUrl: true,
      reviewDate: true,
    },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

export interface CreditProjection {
  personTmdbId: number;
  creditType: string;
  character: string | null;
  job: string | null;
  department: string | null;
  creditOrder: number | null;
  [key: string]: CanonicalValue;
}

export async function creditsUnchanged(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  incoming: ReadonlyArray<CreditProjection>
): Promise<boolean> {
  const existing = await tx.credit.findMany({
    where:
      mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId, isAggregate: false },
    select: {
      creditType: true,
      character: true,
      job: true,
      department: true,
      creditOrder: true,
      person: { select: { tmdbId: true } },
    },
  });
  return sameRows(
    existing.map((r) => ({
      personTmdbId: r.person.tmdbId,
      creditType: r.creditType,
      character: r.character,
      job: r.job,
      department: r.department,
      creditOrder: r.creditOrder,
    })),
    incoming
  );
}

export interface AggregateCreditProjection extends CreditProjection {
  totalEpisodeCount: number | null;
}

export async function aggregateCreditsUnchanged(
  tx: PrismaTx,
  seriesId: number,
  incoming: ReadonlyArray<AggregateCreditProjection>
): Promise<boolean> {
  const existing = await tx.credit.findMany({
    where: { seriesId, isAggregate: true },
    select: {
      creditType: true,
      character: true,
      job: true,
      department: true,
      creditOrder: true,
      totalEpisodeCount: true,
      person: { select: { tmdbId: true } },
    },
  });
  return sameRows(
    existing.map((r) => ({
      personTmdbId: r.person.tmdbId,
      creditType: r.creditType,
      character: r.character,
      job: r.job,
      department: r.department,
      creditOrder: r.creditOrder,
      totalEpisodeCount: r.totalEpisodeCount,
    })),
    incoming
  );
}

function projectEpisodes(
  episodes: NonNullable<SeasonWithEpisodes["episodes"]>
): CanonicalRow[] {
  return episodes
    .map((ep) => ({
      tmdbEpisodeId: ep.id,
      episodeNumber: ep.episode_number,
      name: ep.name || null,
      overview: ep.overview || null,
      stillPath: ep.still_path ?? null,
      airDate: ep.air_date ? new Date(ep.air_date) : null,
      runtime: ep.runtime ?? null,
      voteAverage: ep.vote_average ?? null,
      voteCount: ep.vote_count ?? null,
      episodeType: ep.episode_type || null,
      productionCode: ep.production_code || null,
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

/**
 * Seasons + episodes compared as one canonical unit — when unchanged, the
 * whole delete-cascade (seasons → episodes → images) is skipped.
 */
export async function seasonsUnchanged(
  tx: PrismaTx,
  seriesId: number,
  seasons: ReadonlyArray<SeasonWithEpisodes>
): Promise<boolean> {
  const incoming: CanonicalRow[] = seasons.map((s) => ({
    tmdbSeasonId: s.id,
    seasonNumber: s.season_number,
    name: s.name,
    overview: s.overview || null,
    posterPath: s.poster_path ?? null,
    airDate: s.air_date ? new Date(s.air_date) : null,
    episodeCount: s.episode_count,
    episodes: projectEpisodes(s.episodes ?? []),
  }));

  const existing = await tx.season.findMany({
    where: { seriesId },
    select: {
      tmdbSeasonId: true,
      seasonNumber: true,
      name: true,
      overview: true,
      posterPath: true,
      airDate: true,
      episodeCount: true,
      episodes: {
        select: {
          tmdbEpisodeId: true,
          episodeNumber: true,
          name: true,
          overview: true,
          stillPath: true,
          airDate: true,
          runtime: true,
          voteAverage: true,
          voteCount: true,
          episodeType: true,
          productionCode: true,
        },
      },
    },
  });

  const existingProjected: CanonicalRow[] = existing.map((s) => ({
    tmdbSeasonId: s.tmdbSeasonId,
    seasonNumber: s.seasonNumber,
    name: s.name,
    overview: s.overview,
    posterPath: s.posterPath,
    airDate: s.airDate,
    episodeCount: s.episodeCount,
    episodes: s.episodes
      .map((ep) => ({ ...ep }))
      .sort((a, b) => a.episodeNumber - b.episodeNumber),
  }));

  return sameRows(existingProjected, incoming);
}

export async function movieCertificationsUnchanged(
  tx: PrismaTx,
  movieId: number,
  incoming: ReadonlyArray<{
    countryCode: string;
    certification: string;
    releaseDate: Date | null;
    releaseType: number | null;
    note: string | null;
  }>
): Promise<boolean> {
  const existing = await tx.movieCertification.findMany({
    where: { movieId },
    select: {
      countryCode: true,
      certification: true,
      releaseDate: true,
      releaseType: true,
      note: true,
    },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

export async function seriesCertificationsUnchanged(
  tx: PrismaTx,
  seriesId: number,
  incoming: ReadonlyArray<{ countryCode: string; certification: string }>
): Promise<boolean> {
  const existing = await tx.seriesCertification.findMany({
    where: { seriesId },
    select: { countryCode: true, certification: true },
  });
  return sameRows(existing, incoming.map((r) => ({ ...r })));
}

// =============================================================================
// Junction-table comparators (id-set equality)
// =============================================================================

export async function movieGenresUnchanged(
  tx: PrismaTx,
  movieId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.movieGenre.findMany({
    where: { movieId },
    select: { genre: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.genre.tmdbId),
    tmdbIds
  );
}

export async function movieKeywordsUnchanged(
  tx: PrismaTx,
  movieId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.movieKeyword.findMany({
    where: { movieId },
    select: { keyword: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.keyword.tmdbId),
    tmdbIds
  );
}

export async function movieCompaniesUnchanged(
  tx: PrismaTx,
  movieId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.movieCompany.findMany({
    where: { movieId },
    select: { company: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.company.tmdbId),
    tmdbIds
  );
}

export async function movieCountriesUnchanged(
  tx: PrismaTx,
  movieId: number,
  pairs: ReadonlyArray<{ countryCode: string; type: string }>
): Promise<boolean> {
  const existing = await tx.movieCountry.findMany({
    where: { movieId },
    select: { countryCode: true, type: true },
  });
  return sameIdSet(
    existing.map((r) => `${r.countryCode}|${r.type}`),
    pairs.map((p) => `${p.countryCode}|${p.type}`)
  );
}

export async function movieLanguagesUnchanged(
  tx: PrismaTx,
  movieId: number,
  codes: ReadonlyArray<string>
): Promise<boolean> {
  const existing = await tx.movieLanguage.findMany({
    where: { movieId },
    select: { languageCode: true },
  });
  return sameIdSet(
    existing.map((r) => r.languageCode),
    codes
  );
}

export async function seriesGenresUnchanged(
  tx: PrismaTx,
  seriesId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.seriesGenre.findMany({
    where: { seriesId },
    select: { genre: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.genre.tmdbId),
    tmdbIds
  );
}

export async function seriesKeywordsUnchanged(
  tx: PrismaTx,
  seriesId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.seriesKeyword.findMany({
    where: { seriesId },
    select: { keyword: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.keyword.tmdbId),
    tmdbIds
  );
}

export async function seriesNetworksUnchanged(
  tx: PrismaTx,
  seriesId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.seriesNetwork.findMany({
    where: { seriesId },
    select: { network: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.network.tmdbId),
    tmdbIds
  );
}

export async function seriesCreatorsUnchanged(
  tx: PrismaTx,
  seriesId: number,
  personTmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.seriesCreator.findMany({
    where: { seriesId },
    select: { person: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.person.tmdbId),
    personTmdbIds
  );
}

export async function seriesCompaniesUnchanged(
  tx: PrismaTx,
  seriesId: number,
  tmdbIds: ReadonlyArray<number>
): Promise<boolean> {
  const existing = await tx.seriesCompany.findMany({
    where: { seriesId },
    select: { company: { select: { tmdbId: true } } },
  });
  return sameIdSet(
    existing.map((r) => r.company.tmdbId),
    tmdbIds
  );
}

export async function seriesCountriesUnchanged(
  tx: PrismaTx,
  seriesId: number,
  codes: ReadonlyArray<string>
): Promise<boolean> {
  const existing = await tx.seriesCountry.findMany({
    where: { seriesId },
    select: { countryCode: true },
  });
  return sameIdSet(
    existing.map((r) => r.countryCode),
    codes
  );
}

export async function seriesLanguagesUnchanged(
  tx: PrismaTx,
  seriesId: number,
  codes: ReadonlyArray<string>
): Promise<boolean> {
  const existing = await tx.seriesLanguage.findMany({
    where: { seriesId },
    select: { languageCode: true },
  });
  return sameIdSet(
    existing.map((r) => r.languageCode),
    codes
  );
}
