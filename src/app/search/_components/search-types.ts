/**
 * Shared types for the /search page (split out of client.tsx, Oct 2026).
 */

export type FilterType = "all" | "movie" | "series" | "person";
export const FILTER_TYPES: readonly FilterType[] = ["all", "movie", "series", "person"];

// All supported filter types for query understanding
export type FilterChipType =
  | "genre"
  | "year"
  | "decade"
  | "similar"
  | "person"
  | "streaming"
  | "country"
  | "language"
  | "runtime"
  | "rating"
  | "network"
  | "collection"
  | "keywords"
  | "bestFor"
  | "contentWarnings"
  | "mood"
  | "seriesStatus"
  | "seasonCount"
  | "cast"
  | "director";

// Filter chip for query understanding UI
export interface FilterChip {
  type: FilterChipType;
  label: string;
  value: string;
  removable: boolean;
  /** Category for color-coding chips */
  category?: "content" | "time" | "person" | "location" | "platform" | "quality" | "warning";
}

// Query understanding derived from IntentAnalysis
export interface QueryUnderstanding {
  originalQuery: string;
  cleanedQuery: string;
  filters: FilterChip[];
  summary?: string;
}

export interface SearchFilters {
  genres?: number[];
  yearRange?: [number, number];
  minRating?: number;
}

