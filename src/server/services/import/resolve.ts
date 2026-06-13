/**
 * Batch resolution of TitleRefs/EpisodeRefs against the local catalog.
 * Order: tmdbId (movies/series PKs ARE tmdb ids) -> imdbId (external_ids) ->
 * lower(title)+year (highest popularity wins).
 * Episodes: tmdbEpisodeId FIRST; natural keys derived from it; fall back to
 * (season, episode) natural keys and backfill tmdbEpisodeId from our rows.
 */
import { prisma } from "@/server/db/postgres";
import type { EpisodeRef, TitleRef } from "./types";

export interface ResolvedTitle {
  kind: "movie" | "series";
  id: number;
}

export interface ResolvedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId: number | null;
}

function refKey(ref: TitleRef): string {
  return [ref.kind, ref.tmdbId ?? "", ref.imdbId ?? "", (ref.title ?? "").toLowerCase(), ref.year ?? ""].join("|");
}

export class TitleResolver {
  private cache = new Map<string, ResolvedTitle | null>();

  /** Pre-resolves a batch; subsequent resolve() calls are map lookups. */
  async prime(refs: TitleRef[]): Promise<void> {
    const todo = refs.filter((r) => !this.cache.has(refKey(r)));
    if (todo.length === 0) return;

    // 1. tmdb ids: PKs are TMDB ids — existence check.
    const movieTmdbIds = [...new Set(todo.filter((r) => r.kind === "movie" && r.tmdbId).map((r) => r.tmdbId as number))];
    const seriesTmdbIds = [...new Set(todo.filter((r) => r.kind === "series" && r.tmdbId).map((r) => r.tmdbId as number))];
    const [movies, series] = await Promise.all([
      movieTmdbIds.length > 0
        ? prisma.movie.findMany({ where: { id: { in: movieTmdbIds } }, select: { id: true } })
        : Promise.resolve([]),
      seriesTmdbIds.length > 0
        ? prisma.series.findMany({ where: { id: { in: seriesTmdbIds } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const movieIdSet = new Set(movies.map((m) => m.id));
    const seriesIdSet = new Set(series.map((s) => s.id));

    // 2. imdb ids via external_ids.
    const imdbIds = [...new Set(todo.filter((r) => r.imdbId).map((r) => r.imdbId as string))];
    const externals =
      imdbIds.length > 0
        ? await prisma.externalId.findMany({
            where: { source: "imdb", externalId: { in: imdbIds } },
            select: { externalId: true, movieId: true, seriesId: true },
          })
        : [];
    const byImdb = new Map(externals.map((e) => [e.externalId, e]));

    // 3. title+year (movies and series separately), highest popularity wins.
    const titleRefs = todo.filter((r) => r.title && !r.tmdbId && !byImdb.has(r.imdbId ?? ""));
    const titles = [...new Set(titleRefs.map((r) => (r.title as string).toLowerCase()))];
    const titleRows =
      titles.length > 0
        ? await prisma.$queryRaw<
            Array<{ kind: string; id: number; title: string; year: number | null; popularity: number | null }>
          >`
            SELECT 'movie' AS kind, id, lower(title) AS title,
                   EXTRACT(YEAR FROM release_date)::int AS year, popularity
            FROM movies WHERE lower(title) = ANY(${titles}::text[])
            UNION ALL
            SELECT 'series' AS kind, id, lower(name) AS title,
                   EXTRACT(YEAR FROM first_air_date)::int AS year, popularity
            FROM series WHERE lower(name) = ANY(${titles}::text[])
          `
        : [];

    for (const ref of todo) {
      const key = refKey(ref);
      if (this.cache.has(key)) continue;

      if (ref.tmdbId !== undefined) {
        const hit = ref.kind === "movie" ? movieIdSet.has(ref.tmdbId) : seriesIdSet.has(ref.tmdbId);
        this.cache.set(key, hit ? { kind: ref.kind, id: ref.tmdbId } : null);
        continue;
      }
      const ext = ref.imdbId !== undefined ? byImdb.get(ref.imdbId) : undefined;
      if (ext) {
        const id = ref.kind === "movie" ? ext.movieId : ext.seriesId;
        if (id !== null && id !== undefined) {
          this.cache.set(key, { kind: ref.kind, id });
          continue;
        }
      }
      if (ref.title !== undefined) {
        const lowered = ref.title.toLowerCase();
        const candidates = titleRows.filter(
          (t) =>
            t.kind === ref.kind &&
            t.title === lowered &&
            (ref.year == null || t.year === null || Math.abs(t.year - ref.year) <= 1)
        );
        candidates.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        this.cache.set(key, candidates[0] ? { kind: ref.kind, id: candidates[0].id } : null);
        continue;
      }
      this.cache.set(key, null);
    }
  }

  resolve(ref: TitleRef): ResolvedTitle | null {
    return this.cache.get(refKey(ref)) ?? null;
  }
}

/**
 * Per-series episode resolver. tmdbEpisodeId first (stable across
 * renumbering); natural keys derived from it. Falls back to natural keys and
 * backfills tmdbEpisodeId from our episodes table.
 */
export class EpisodeResolver {
  private bySeries = new Map<
    number,
    { byTmdbId: Map<number, ResolvedEpisode>; byNatural: Map<string, ResolvedEpisode> }
  >();

  async prime(seriesIds: number[]): Promise<void> {
    const todo = seriesIds.filter((id) => !this.bySeries.has(id));
    if (todo.length === 0) return;
    const rows = await prisma.episode.findMany({
      where: { season: { seriesId: { in: todo } } },
      select: {
        episodeNumber: true,
        tmdbEpisodeId: true,
        season: { select: { seriesId: true, seasonNumber: true } },
      },
    });
    for (const id of todo) {
      this.bySeries.set(id, { byTmdbId: new Map(), byNatural: new Map() });
    }
    for (const row of rows) {
      const entry = this.bySeries.get(row.season.seriesId);
      if (!entry) continue;
      const resolved: ResolvedEpisode = {
        seasonNumber: row.season.seasonNumber,
        episodeNumber: row.episodeNumber,
        tmdbEpisodeId: row.tmdbEpisodeId,
      };
      if (row.tmdbEpisodeId !== null) entry.byTmdbId.set(row.tmdbEpisodeId, resolved);
      entry.byNatural.set(`${row.season.seasonNumber}:${row.episodeNumber}`, resolved);
    }
  }

  resolve(seriesId: number, ref: EpisodeRef): ResolvedEpisode | null {
    const entry = this.bySeries.get(seriesId);
    if (!entry) return null;
    if (ref.tmdbEpisodeId !== undefined) {
      const byId = entry.byTmdbId.get(ref.tmdbEpisodeId);
      if (byId) return byId;
    }
    if (ref.seasonNumber !== undefined && ref.episodeNumber !== undefined) {
      const byNatural = entry.byNatural.get(`${ref.seasonNumber}:${ref.episodeNumber}`);
      if (byNatural) return byNatural;
      // Episode not hydrated locally yet: keep the import's natural keys +
      // tmdbEpisodeId verbatim; the post-hydration reconcile pass heals drift.
      return {
        seasonNumber: ref.seasonNumber,
        episodeNumber: ref.episodeNumber,
        tmdbEpisodeId: ref.tmdbEpisodeId ?? null,
      };
    }
    return null;
  }
}
