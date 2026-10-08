import type { SourceResult } from "./result";

export type MediaType = "movie" | "tv";

/** Lambda input (direct invoke payload). */
export interface EnrichInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  imdbId?: string;
  wikidataId?: string;
  /** Countries to fetch JustWatch deep links for. */
  countries: string[];
}

export interface ExternalIds {
  wikidata?: string;
  imdb?: string;
  rottentomatoes?: string;
  metacritic?: string;
  letterboxd?: string;
  netflix?: string;
  amazon?: string;
  apple?: string;
  hotstar?: string;
  justwatch?: string;
}

export interface RtScore {
  score: number | null;
  ratingCount: number | null;
  certified: boolean | null;
  sentiment: string | null;
  consensus: string | null;
}

export interface RtData {
  critic: RtScore | null;
  audience: RtScore | null;
  sourceUrl: string;
}

export interface SimpleRating {
  score: number;
  voteCount: number | null;
  sourceUrl: string;
}

export interface WatchLink {
  country: string;
  provider: string;
  link: string;
  /** "Subscription" | "Free" | "Rent ₹99" | "Buy $9.99" */
  price: string;
  monetization: string;
}

export type SourceName = "wikidata" | "rt" | "metacritic" | "letterboxd" | "justwatch";

export interface EnrichResponse {
  version: 2;
  tmdbId: number;
  mediaType: MediaType;
  externalIds: ExternalIds;
  ratings: {
    rtCritic?: RtScore & { sourceUrl: string };
    rtAudience?: RtScore & { sourceUrl: string };
    metacritic?: SimpleRating;
    letterboxd?: SimpleRating;
  };
  /** Deep links per country; only countries JustWatch answered for are present. */
  watchLinks: WatchLink[];
  /** Countries whose watch-link set is authoritative (JustWatch answered) — safe to replace. */
  watchLinkCountries: string[];
  sources: Record<SourceName, SourceResult>;
  durationMs: number;
}
