/**
 * Normalized import payload. Parsers (letterboxd/trakt/imdb) emit this;
 * resolve.ts + runner.ts consume it. tmdbEpisodeId-FIRST episode resolution
 * (spec §4.1 invariant 2); natural keys derived from it.
 */
import type { ImportSource } from "@prisma/client";

export interface TitleRef {
  kind: "movie" | "series";
  tmdbId?: number;
  imdbId?: string;
  title?: string;
  year?: number | null;
}

export interface EpisodeRef {
  tmdbEpisodeId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface NormalizedWatch {
  ref: TitleRef;
  episode?: EpisodeRef;
  /** Full ISO datetime (DATETIME), YYYY-MM-DD (DATE), or null (UNKNOWN). */
  watchedAt: string | null;
  precision: "DATETIME" | "DATE" | "UNKNOWN";
  isRewatch: boolean;
  tags: string[];
  note: string | null;
}

export interface NormalizedRating {
  ref: TitleRef;
  score: number | null; // 1-10
  thumb: 1 | -1 | null;
  ratedAt: string | null; // YYYY-MM-DD
}

export interface NormalizedReview {
  ref: TitleRef;
  body: string;
  containsSpoilers: boolean;
  watchedAt: string | null; // links review to the diary entry when possible
}

export interface NormalizedWatchlistItem {
  ref: TitleRef;
  addedAt: string | null;
  note: string | null;
}

export interface NormalizedList {
  name: string;
  description: string | null;
  items: Array<{ ref: TitleRef; position: number }>;
}

export interface UnmappableRow {
  file: string;
  line: number;
  reason: string;
}

export interface NormalizedImport {
  source: ImportSource;
  watches: NormalizedWatch[];
  ratings: NormalizedRating[];
  reviews: NormalizedReview[];
  watchlist: NormalizedWatchlistItem[];
  lists: NormalizedList[];
  /** Counted, never silently dropped (spec §4.2 import_jobs). */
  unmappable: UnmappableRow[];
}

export function emptyImport(source: ImportSource): NormalizedImport {
  return { source, watches: [], ratings: [], reviews: [], watchlist: [], lists: [], unmappable: [] };
}

export interface ImportStats {
  rowsTotal: number;
  imported: number;
  skipped: number;
  errors: string[];
}
