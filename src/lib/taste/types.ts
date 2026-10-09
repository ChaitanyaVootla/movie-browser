/**
 * Shared types for the taste profile (pure layer). The DB layer
 * (`server/db/postgres/social/taste.ts`) produces these; the math in this
 * directory consumes them. No Prisma imports here on purpose.
 */

/** "full" = everything the owner did (private recs). "public" = only what /u/* may show. */
export type TasteScope = "full" | "public";

export type TasteMediaType = "movie" | "series";

/** "m:<tmdbId>" | "s:<tmdbId>" — movie and series ids are separate namespaces. */
export type TitleKey = string;

export function titleKey(mediaType: TasteMediaType, id: number): TitleKey {
  return `${mediaType === "movie" ? "m" : "s"}:${id}`;
}

export type SeriesStatusLite =
  | "WATCHING"
  | "CAUGHT_UP"
  | "COMPLETED"
  | "DROPPED"
  | "PAUSED"
  | "REWATCHING";

/** Per-scope pair: `public` counts only non-private rows, `all` counts every row. */
export interface ScopedPair<T> {
  public: T;
  all: T;
}

/** Every raw signal a user has on ONE title, before weighting. */
export interface TitleSignals {
  key: TitleKey;
  mediaType: TasteMediaType;
  id: number;
  isFavorite: boolean;
  /** Title-level canonical rating row (movie, or series with no season/episode). */
  rating: {
    score: number | null;
    thumb: number | null;
    liked: boolean;
    ratedAt: Date;
  } | null;
  /** kind='WATCH' events only. */
  watches: {
    count: ScopedPair<number>;
    /** Max rewatch-cycle ordinal (1 = first watch-through). */
    maxCycle: ScopedPair<number>;
    lastAt: ScopedPair<Date | null>;
  };
  progress: { status: SeriesStatusLite; updatedAt: Date } | null;
  watchlistedAt: Date | null;
}

/** A title after folding its signals into one weight for a scope. */
export interface WeightedTitle {
  key: TitleKey;
  mediaType: TasteMediaType;
  id: number;
  weight: number;
  /** Watched in this scope (≥1 WATCH event visible to the scope). */
  watched: boolean;
  /** Title-level 1-10 score visible to this scope (null if none). */
  score: number | null;
}

export type FacetType =
  | "genre"
  | "keyword"
  | "theme"
  | "mood"
  | "director"
  | "cast"
  | "country"
  | "language"
  | "decade";

export const FACET_TYPES: readonly FacetType[] = [
  "genre",
  "keyword",
  "theme",
  "mood",
  "director",
  "cast",
  "country",
  "language",
  "decade",
];

export interface FacetValue {
  type: FacetType;
  key: string;
  label: string;
}

/** Display reference to a title (enough to render a poster link). */
export interface TitleRef {
  mediaType: TasteMediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export interface PersonInfo {
  tmdbId: number;
  name: string;
  profilePath: string | null;
}

/** Catalog metadata for one title (facets + axis inputs). */
export interface TitleMeta {
  key: TitleKey;
  ref: TitleRef;
  year: number | null;
  popularity: number | null;
  /** TMDB vote_average (0-10), null when unknown. */
  tmdbAvg: number | null;
  facets: FacetValue[];
  /** AI MOOD values for the "Light ↔ Heavy" axis. */
  mood: { emotional: string | null; tone: string | null };
}

/** Baseline lookup: how common a facet value is in its reference population. */
export interface FacetBaseline {
  count(type: FacetType, key: string): number;
  size(type: FacetType): number;
}

/** Catalog quantiles (101 points, p0..p100) for percentile axes. */
export interface CatalogQuantiles {
  popularity: number[];
  year: number[];
}
