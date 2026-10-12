/**
 * Distance-free recommendation fallbacks (spec 2026-10-09 §3 fallback table):
 * cold start (popular in the user's genres) and the no-HNSW-index TMDB
 * /recommendations merge. Moved out of recommend.ts (800-line rule).
 */
import { REC_ALGO_VERSION, REC_FOR_YOU_SIZE, REC_MIN_VOTES_MOVIE, REC_MIN_VOTES_SERIES } from "@/lib/taste/recommend-constants";
import { facetLabel, genreDistribution, mergeRankedLists, type LiftedFacets, type RecAnchor, type RecCandidate } from "@/lib/taste/recommend";
import type { RecItemDTO, RecsDTO } from "@/lib/taste/recommend-types";
import type { TasteMediaType } from "@/lib/taste/types";
import { fetchPopularCandidates, type RecExclusions } from "@/server/db/postgres/social/taste-recs";
import type { VectorTable } from "@/server/db/postgres/vector-index";
import { getRecommendations as getTmdbRecommendations } from "@/server/services/tmdb";
import type { TasteSnapshot } from "./index";
import { exclusionKeys, forYouRow, toItem } from "./rec-dto";

export const REC_TABLES: Array<{ table: VectorTable; mediaType: TasteMediaType; minVotes: number }> = [
  { table: "movies", mediaType: "movie", minVotes: REC_MIN_VOTES_MOVIE },
  { table: "series", mediaType: "series", minVotes: REC_MIN_VOTES_SERIES },
];

export function excludedFor(ex: RecExclusions, table: VectorTable): number[] {
  return table === "movies" ? ex.movieIds : ex.seriesIds;
}

export interface UserContext {
  snapshot: TasteSnapshot | null;
  anchors: RecAnchor[];
  exclusions: RecExclusions;
}

export async function coldStart(ctx: UserContext, limit = REC_FOR_YOU_SIZE): Promise<RecsDTO> {
  const dist = genreDistribution(ctx.anchors.map((a) => ({ genres: a.genres, weight: a.weight })));
  const topGenres = [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  const per = Math.ceil(limit / 2) + 4;
  const fetchAll = (genres: string[] | null) =>
    Promise.all(
      REC_TABLES.map(({ table, minVotes }) =>
        fetchPopularCandidates(table, { genres, excludeIds: excludedFor(ctx.exclusions, table), minVotes, limit: per })
      )
    );
  let [movies, series] = await fetchAll(topGenres.length ? topGenres : null);
  if (movies.length + series.length < 6 && topGenres.length) [movies, series] = await fetchAll(null);
  // Interleave media types so the row is mixed.
  const mixed: RecCandidate[] = [];
  for (let i = 0; mixed.length < limit && (i < movies.length || i < series.length); i++) {
    if (movies[i]) mixed.push(movies[i]);
    if (series[i] && mixed.length < limit) mixed.push(series[i]);
  }
  const lifted: LiftedFacets = { genres: topGenres, languages: [] };
  const items = mixed.map((c) => {
    const label = topGenres.length ? facetLabel(c, lifted) : null;
    return toItem(c, "popular", label ? { kind: "facet", label, facets: [] } : null);
  });
  return { rows: items.length ? [forYouRow(items)] : [], reason: "cold_start", algo: REC_ALGO_VERSION };
}

interface TmdbListItem {
  id: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  adult: boolean;
}

function parseTmdbItem(raw: unknown, mediaType: TasteMediaType): TmdbListItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const id = num(r.id);
  const title = str(mediaType === "movie" ? r.title : r.name);
  if (id === null || title === null) return null;
  return {
    id,
    title,
    posterPath: str(r.poster_path),
    backdropPath: str(r.backdrop_path),
    releaseDate: str(mediaType === "movie" ? r.release_date : r.first_air_date),
    voteAverage: num(r.vote_average),
    voteCount: num(r.vote_count),
    popularity: num(r.popularity),
    adult: r.adult === true,
  };
}

/** No HNSW index: TMDB /recommendations for the top 3 positives, RRF-merged. */
export async function tmdbFallback(ctx: UserContext, limit = REC_FOR_YOU_SIZE): Promise<RecsDTO> {
  const seeds = ctx.anchors.slice(0, 3);
  const excluded = exclusionKeys(ctx.exclusions);
  const lists = await Promise.all(
    seeds.map(async (seed) => {
      const seedRef = { mediaType: seed.mediaType, id: seed.id, title: seed.title };
      try {
        const res = await getTmdbRecommendations(seed.id, seed.mediaType);
        const minVotes = seed.mediaType === "movie" ? REC_MIN_VOTES_MOVIE : REC_MIN_VOTES_SERIES;
        const items = res.results
          .map((r) => parseTmdbItem(r, seed.mediaType))
          .filter((r): r is TmdbListItem => r !== null && !r.adult && (r.voteCount ?? 0) >= minVotes)
          .map((r) => ({ ...r, key: `${seed.mediaType === "movie" ? "m" : "s"}:${r.id}`, mediaType: seed.mediaType }))
          .filter((r) => !excluded.has(r.key));
        return { seed: seedRef, items };
      } catch {
        return { seed: seedRef, items: [] };
      }
    })
  );
  const posters = new Map(seeds.map((s) => [`${s.mediaType}:${s.id}`, s.posterPath ?? null]));
  const merged = mergeRankedLists(lists).slice(0, limit);
  if (merged.length === 0) return coldStart(ctx, limit);
  const items: RecItemDTO[] = merged.map(({ item, seed }) => ({
    mediaType: item.mediaType,
    id: item.id,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    voteCount: item.voteCount,
    popularity: item.popularity,
    genres: [],
    source: "tmdb",
    explanation: {
      kind: "because",
      anchor: { ...seed, posterPath: posters.get(`${seed.mediaType}:${seed.id}`) ?? null },
      alsoNear: [],
      facets: [],
    },
  }));
  return { rows: [forYouRow(items)], reason: "no_index", algo: REC_ALGO_VERSION };
}
