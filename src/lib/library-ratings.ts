/**
 * Library → Ratings: shared shape + pure filter/sort logic for the
 * `/api/user/ratings` payload. Client-safe (no server imports).
 *
 * A canonical `user_ratings` title row can carry any mix of: the legacy thumb
 * (`thumb` ±1), the 1–10 `score` (shown as ½-stars = score/2) and the `liked`
 * heart. Before Oct 2026 the tab only knew thumbs, so star-rated and loved
 * titles from the newer rating/review flow never appeared there.
 */

export type RatedMediaType = "movie" | "series";

export interface RatedTitle {
  mediaType: RatedMediaType;
  id: number;
  /** Movie title or series name. */
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  /** Release / first-air date (YYYY-MM-DD) or "". */
  date: string;
  genres: { id: number; name: string }[];
  /** ISO timestamp — `rated_at` when known (imports), else row creation. */
  ratedAt: string;
  thumb: 1 | -1 | null;
  /** 1–10 canonical score, or null. */
  score: number | null;
  liked: boolean;
}

export interface RatingsPayload {
  items: RatedTitle[];
  totalCount: number;
}

export const RATING_FILTERS = ["all", "scored", "loved", "likes", "dislikes"] as const;
export type RatingFilter = (typeof RATING_FILTERS)[number];

export const RATING_FILTER_LABELS: Record<RatingFilter, string> = {
  all: "All",
  scored: "Rated",
  loved: "Loved",
  likes: "Liked",
  dislikes: "Disliked",
};

export function matchesRatingFilter(item: RatedTitle, filter: RatingFilter): boolean {
  switch (filter) {
    case "scored":
      return item.score !== null;
    case "loved":
      return item.liked;
    case "likes":
      return item.thumb === 1;
    case "dislikes":
      return item.thumb === -1;
    case "all":
    default:
      return true;
  }
}

export const RATING_SORTS = ["rated", "score", "rating", "date_desc", "date_asc", "title"] as const;
export type RatingSort = (typeof RATING_SORTS)[number];

/**
 * Sort a copy. "score" = YOUR score high→low; unscored titles go last, loved
 * before not-loved among them. "rated" keeps the API order (most recent first).
 */
export function sortRatedTitles(items: RatedTitle[], sort: RatingSort): RatedTitle[] {
  const out = [...items];
  switch (sort) {
    case "score":
      out.sort(
        (a, b) =>
          (b.score ?? -1) - (a.score ?? -1) ||
          Number(b.liked) - Number(a.liked) ||
          b.ratedAt.localeCompare(a.ratedAt)
      );
      break;
    case "rating":
      out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      break;
    case "date_desc":
      out.sort((a, b) => b.date.localeCompare(a.date));
      break;
    case "date_asc":
      out.sort((a, b) => a.date.localeCompare(b.date));
      break;
    case "title":
      out.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "rated":
    default:
      break;
  }
  return out;
}

/** Short text for the card subtitle — thumbs only (stars/heart render as glyphs). */
export function thumbLabel(item: RatedTitle): string | undefined {
  if (item.thumb === 1) return "Liked";
  if (item.thumb === -1) return "Disliked";
  return undefined;
}

export interface RatingCounts {
  movie: Record<RatingFilter, number>;
  series: Record<RatingFilter, number>;
}

export function countRatings(items: RatedTitle[]): RatingCounts {
  const empty = (): Record<RatingFilter, number> => ({
    all: 0,
    scored: 0,
    loved: 0,
    likes: 0,
    dislikes: 0,
  });
  const counts: RatingCounts = { movie: empty(), series: empty() };
  for (const item of items) {
    for (const f of RATING_FILTERS) {
      if (matchesRatingFilter(item, f)) counts[item.mediaType][f] += 1;
    }
  }
  return counts;
}

interface DetailBase {
  id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  genres: { id: number; name: string }[];
}

interface ResolvedDetail {
  detail: DetailBase;
  title: string;
  date: string | null;
}

/**
 * Join title-rating rows to catalog details, preserving row order. Rows whose
 * title is missing from the catalog are dropped (nothing to render or link).
 */
export function buildRatingsPayload(
  rows: {
    itemId: number;
    itemType: RatedMediaType;
    thumb: number | null;
    score: number | null;
    liked: boolean;
    ratedAt: Date;
  }[],
  movies: (DetailBase & { title: string; release_date: string | null })[],
  series: (DetailBase & { name: string; first_air_date: string | null })[],
): RatingsPayload {
  const resolved = new Map<string, ResolvedDetail>();
  for (const m of movies) {
    resolved.set(`movie:${m.id}`, { detail: m, title: m.title, date: m.release_date });
  }
  for (const s of series) {
    resolved.set(`series:${s.id}`, { detail: s, title: s.name, date: s.first_air_date });
  }
  const items: RatedTitle[] = [];
  for (const r of rows) {
    const base = resolved.get(`${r.itemType}:${r.itemId}`);
    if (!base) continue;
    items.push({
      mediaType: r.itemType,
      id: r.itemId,
      title: base.title,
      poster_path: base.detail.poster_path,
      backdrop_path: base.detail.backdrop_path,
      vote_average: base.detail.vote_average ?? 0,
      date: base.date ?? "",
      genres: base.detail.genres,
      ratedAt: r.ratedAt.toISOString(),
      thumb: r.thumb === 1 || r.thumb === -1 ? r.thumb : null,
      score: r.score !== null && r.score >= 1 && r.score <= 10 ? r.score : null,
      liked: r.liked,
    });
  }
  return { items, totalCount: items.length };
}
