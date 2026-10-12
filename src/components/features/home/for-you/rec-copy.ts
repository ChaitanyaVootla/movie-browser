/**
 * Pure copy + "why" helpers for the home rec rows (taste v2 spec 2026-10-12
 * §3.1–§3.3). The one-why model lives here on the client side: a card tag may
 * only name a title in its row's heading set (because/seed rows), and adds
 * information — it is never shown for the heading's first anchor.
 * Fable rule: copy is about titles and numbers, never about the person.
 */
import type { MovieListItem, SeriesListItem } from "@/types";
import type { RecItemDTO, RecRowDTO, RecThumbRef } from "@/lib/taste/recommend-types";

export const refKey = (r: { mediaType: "movie" | "series"; id: number }) =>
  `${r.mediaType === "movie" ? "m" : "s"}:${r.id}`;

/** RecItemDTO → the list-item shape MediaCard already renders. */
export function toListItem(it: RecItemDTO): MovieListItem | SeriesListItem {
  const common = {
    id: it.id,
    poster_path: it.posterPath,
    backdrop_path: it.backdropPath,
    vote_average: it.voteAverage ?? 0,
    vote_count: it.voteCount ?? 0,
    popularity: it.popularity ?? 0,
    adult: false,
  };
  return it.mediaType === "movie"
    ? { ...common, title: it.title, release_date: it.releaseDate ?? "", media_type: "movie" }
    : { ...common, name: it.title, first_air_date: it.releaseDate ?? "", media_type: "tv" };
}

export type CardTag =
  | { kind: "anchor"; anchor: RecThumbRef }
  | { kind: "facet"; label: string }
  | { kind: "popular"; label: string };

/**
 * The tag under a card, or null. because/seed rows: only an anchor that is in
 * the heading set and is NOT its first member (the heading already says that
 * one); a seed row never tags (its heading is the seed).
 */
export function tagFor(it: RecItemDTO, row: RecRowDTO): CardTag | null {
  const e = it.explanation;
  if (!e || e.kind === "seed") return null;
  if (e.kind === "facet") return row.kind === "for_you" ? { kind: "facet", label: e.label } : null;
  if (e.kind === "popular") return { kind: "popular", label: e.label };
  if (row.kind === "for_you") return { kind: "anchor", anchor: e.anchor };
  if (row.kind !== "because") return null;
  const k = refKey(e.anchor);
  if (row.anchors.length === 0 || refKey(row.anchors[0]) === k) return null;
  return row.anchors.some((a) => refKey(a) === k) ? { kind: "anchor", anchor: e.anchor } : null;
}

/** Heading title parts: all anchors (desktop) or first + "& N more" (mobile). */
export function headingTitles(anchors: readonly RecThumbRef[]): { all: string[]; first: string | null; more: number } {
  const all = anchors.map((a) => a.title);
  return { all, first: all[0] ?? null, more: Math.max(0, all.length - 1) };
}

/** "A", "A & B", "A, B & C". */
export function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} & ${titles[titles.length - 1]}`;
}

/** Centered-space cosine → a bucket label about the TITLE pair (spec §3.3). */
export function cosBucket(cos: number): string {
  if (cos >= 0.5) return "very close";
  if (cos >= 0.35) return "close";
  return "near";
}

export function builtFromLine(n: number): string {
  return `Built from ${n} ${n === 1 ? "title" : "titles"} you rated, hearted or logged`;
}

export function yearOf(it: { releaseDate: string | null }): number | null {
  const y = it.releaseDate ? Number(it.releaseDate.slice(0, 4)) : NaN;
  return Number.isFinite(y) ? y : null;
}

/** The Why sheet's Cue question. */
export function whyCueMessage(it: RecItemDTO): string {
  const y = yearOf(it);
  return `Why would I like ${it.title}${y ? ` (${y})` : ""}?`;
}
