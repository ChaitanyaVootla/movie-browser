/**
 * Small DTO builders shared by the recs services (recommend / tune /
 * more-like-this / fallbacks). Pure.
 */
import type { RecAnchor, RecCandidate } from "@/lib/taste/recommend";
import type { RecItemDTO, RecRowDTO, RecSource, RecThumbRef, TuneParams } from "@/lib/taste/recommend-types";
import type { RecExclusions } from "@/server/db/postgres/social/taste-recs";

export function toItem(c: RecCandidate, source: RecSource, explanation: RecItemDTO["explanation"]): RecItemDTO {
  return {
    mediaType: c.mediaType,
    id: c.id,
    title: c.title,
    posterPath: c.posterPath,
    backdropPath: c.backdropPath,
    releaseDate: c.releaseDate,
    voteAverage: c.voteAverage,
    voteCount: c.voteCount,
    popularity: c.popularity,
    genres: c.genres,
    source,
    explanation,
  };
}

export function forYouRow(items: RecItemDTO[], tune: TuneParams | null = null): RecRowDTO {
  return { id: "for-you", kind: "for_you", anchors: [], label: null, items, tune };
}

export function thumbOf(a: Pick<RecAnchor, "mediaType" | "id" | "title" | "posterPath">): RecThumbRef {
  return { mediaType: a.mediaType, id: a.id, title: a.title, posterPath: a.posterPath ?? null };
}

/** "m:603" / "s:1399". */
export function itemKey(it: { mediaType: "movie" | "series"; id: number }): string {
  return `${it.mediaType === "movie" ? "m" : "s"}:${it.id}`;
}

export function exclusionKeys(ex: RecExclusions): Set<string> {
  return new Set([...ex.movieIds.map((id) => `m:${id}`), ...ex.seriesIds.map((id) => `s:${id}`)]);
}

/** A tune without its shuffle nonce (the row's `tune` is the filter state, not a one-off draw). */
export function stripShuffle(tune: TuneParams | undefined): TuneParams | null {
  if (!tune) return null;
  const { shuffle: _s, ...rest } = tune;
  return Object.keys(rest).length ? rest : null;
}
