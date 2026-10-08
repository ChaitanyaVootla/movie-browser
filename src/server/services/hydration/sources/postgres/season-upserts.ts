/**
 * Seasons + episodes, reconciled IN PLACE (Oct 2026).
 *
 * The old upsert compared seasons+episodes as one unit and, on ANY difference,
 * deleted every season (cascading to episodes and their images) and
 * reinserted the lot. TMDB's per-episode vote_average/vote_count move on
 * nearly every fetch of a popular series (measured: Stranger Things 42/42,
 * Silo 24/31, Lioness 24/24 episodes differed from PG only in votes), so
 * every real refresh of a watched series rewrote it wholesale — prod
 * ~120 episode inserts AND deletes per minute after the summary-wipe fix.
 *
 * Now: seasons keyed by season_number and episodes by episode_number go
 * through `diffChildRows`; unchanged rows are not written, changed rows are
 * UPDATEd in place (ids survive), and episode votes compare with the same
 * tolerance as images (`imageVotesEquivalent`). A season whose incoming entry
 * carries no `episodes` array (failed per-season fetch) keeps its episodes.
 */

import type { PrismaTx, SeasonWithEpisodes } from "./types";
import { diffChildRows, imageVotesEquivalent, sameDate } from "./diff-reconcile";

export interface SeasonRow {
  tmdbSeasonId: number | null;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  airDate: Date | null;
  episodeCount: number | null;
}

export interface EpisodeRow {
  tmdbEpisodeId: number | null;
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
}

type Episodes = NonNullable<SeasonWithEpisodes["episodes"]>;

export function projectSeason(s: SeasonWithEpisodes): SeasonRow {
  return {
    tmdbSeasonId: s.id ?? null,
    seasonNumber: s.season_number,
    name: s.name ?? null,
    overview: s.overview || null,
    posterPath: s.poster_path ?? null,
    airDate: s.air_date ? new Date(s.air_date) : null,
    episodeCount: s.episode_count ?? null,
  };
}

export function projectEpisode(ep: Episodes[number]): EpisodeRow {
  return {
    tmdbEpisodeId: ep.id ?? null,
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
  };
}

export function seasonSame(a: SeasonRow, b: SeasonRow): boolean {
  return (
    a.tmdbSeasonId === b.tmdbSeasonId &&
    a.name === b.name &&
    a.overview === b.overview &&
    a.posterPath === b.posterPath &&
    sameDate(a.airDate, b.airDate) &&
    a.episodeCount === b.episodeCount
  );
}

/** Episode equality; vote drift alone is not a change (nothing displays it from PG). */
export function episodeSame(a: EpisodeRow, b: EpisodeRow): boolean {
  return (
    a.tmdbEpisodeId === b.tmdbEpisodeId &&
    a.name === b.name &&
    a.overview === b.overview &&
    a.stillPath === b.stillPath &&
    sameDate(a.airDate, b.airDate) &&
    a.runtime === b.runtime &&
    a.episodeType === b.episodeType &&
    a.productionCode === b.productionCode &&
    imageVotesEquivalent(a, b)
  );
}

const bySeason = (r: { seasonNumber: number }) => String(r.seasonNumber);
const byEpisode = (r: { episodeNumber: number }) => String(r.episodeNumber);

/** Dedupe incoming by natural key (keep first) — the unique indexes would. */
function uniqBy<T>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface SeasonWriteStats {
  seasonsInserted: number;
  seasonsUpdated: number;
  seasonsDeleted: number;
  episodesInserted: number;
  episodesUpdated: number;
  episodesDeleted: number;
}

export function hasSeasonWrites(s: SeasonWriteStats): boolean {
  return Object.values(s).some((n) => n > 0);
}

/**
 * Reconcile a series' seasons + episodes against complete TMDB data.
 * Callers must already have rejected summary-only input (see isSummaryOnly).
 */
export async function reconcileSeasons(
  tx: PrismaTx,
  seriesId: number,
  seasons: ReadonlyArray<SeasonWithEpisodes>,
): Promise<SeasonWriteStats> {
  const stats: SeasonWriteStats = {
    seasonsInserted: 0,
    seasonsUpdated: 0,
    seasonsDeleted: 0,
    episodesInserted: 0,
    episodesUpdated: 0,
    episodesDeleted: 0,
  };

  const existing = await tx.season.findMany({
    where: { seriesId },
    select: {
      id: true,
      tmdbSeasonId: true,
      seasonNumber: true,
      name: true,
      overview: true,
      posterPath: true,
      airDate: true,
      episodeCount: true,
      episodes: {
        select: {
          id: true,
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

  const incoming = uniqBy(
    seasons.map((s) => ({ row: projectSeason(s), episodes: s.episodes })),
    (s) => bySeason(s.row),
  );
  const seasonDiff = diffChildRows(
    existing,
    incoming.map((s) => s.row),
    bySeason,
    (e, i) => seasonSame(e, i),
  );

  // Seasons
  if (seasonDiff.toDelete.length > 0) {
    // cascades to their episodes (and images) — only seasons TMDB dropped
    await tx.season.deleteMany({ where: { id: { in: seasonDiff.toDelete.map((s) => s.id) } } });
    stats.seasonsDeleted = seasonDiff.toDelete.length;
  }
  for (const { existing: e, incoming: i } of seasonDiff.toUpdate) {
    await tx.season.update({ where: { id: e.id }, data: i });
  }
  stats.seasonsUpdated = seasonDiff.toUpdate.length;
  if (seasonDiff.toInsert.length > 0) {
    await tx.season.createMany({
      data: seasonDiff.toInsert.map((s) => ({ seriesId, ...s })),
      skipDuplicates: true,
    });
    stats.seasonsInserted = seasonDiff.toInsert.length;
  }

  // Season ids (new seasons need theirs re-read)
  const idBySeason = new Map(existing.map((s) => [s.seasonNumber, s.id]));
  if (seasonDiff.toInsert.length > 0) {
    const created = await tx.season.findMany({
      where: { seriesId, seasonNumber: { in: seasonDiff.toInsert.map((s) => s.seasonNumber) } },
      select: { id: true, seasonNumber: true },
    });
    for (const s of created) idBySeason.set(s.seasonNumber, s.id);
  }
  const existingEpisodes = new Map(existing.map((s) => [s.seasonNumber, s.episodes]));

  // Episodes, per season, only where TMDB gave us a complete list
  const toCreate: Array<EpisodeRow & { seasonId: number }> = [];
  const toDeleteIds: number[] = [];
  for (const s of incoming) {
    if (!Array.isArray(s.episodes)) continue; // unknown (failed fetch) — keep stored
    const seasonId = idBySeason.get(s.row.seasonNumber);
    if (seasonId === undefined) continue;
    const epDiff = diffChildRows(
      existingEpisodes.get(s.row.seasonNumber) ?? [],
      uniqBy(s.episodes.map(projectEpisode), byEpisode),
      byEpisode,
      (e, i) => episodeSame(e, i),
    );
    for (const ep of epDiff.toInsert) toCreate.push({ seasonId, ...ep });
    for (const ep of epDiff.toDelete) toDeleteIds.push(ep.id);
    for (const { existing: e, incoming: i } of epDiff.toUpdate) {
      await tx.episode.update({ where: { id: e.id }, data: i });
    }
    stats.episodesUpdated += epDiff.toUpdate.length;
  }
  if (toDeleteIds.length > 0) {
    await tx.episode.deleteMany({ where: { id: { in: toDeleteIds } } });
    stats.episodesDeleted = toDeleteIds.length;
  }
  if (toCreate.length > 0) {
    await tx.episode.createMany({ data: toCreate, skipDuplicates: true });
    stats.episodesInserted = toCreate.length;
  }
  return stats;
}
