/**
 * DTOs for taste recommendations + taste match (client-safe: types only, no
 * server imports). Spec docs/superpowers/specs/2026-10-09-taste-recommendations-design.md.
 */
import type { TasteMediaType } from "./types";
import type { RecExplanation } from "./recommend";

export type { RecExplanation };

/** taste = ANN over the user's vectors; popular = cold start; tmdb = no-index fallback. */
export type RecSource = "taste" | "popular" | "tmdb";
export type RecReason = "ok" | "cold_start" | "no_index" | "error";

export interface RecItemDTO {
  mediaType: TasteMediaType;
  id: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  genres: string[];
  source: RecSource;
  explanation: RecExplanation | null;
}

export interface RecRowDTO {
  /** "for-you" | "cluster-<n>" — stable analytics key. */
  id: string;
  kind: "for_you" | "because";
  /** For "because" rows: the cluster medoid the row is anchored on. */
  anchor: { mediaType: TasteMediaType; id: number; title: string; posterPath: string | null } | null;
  label: string | null;
  items: RecItemDTO[];
}

export interface RecsDTO {
  rows: RecRowDTO[];
  reason: RecReason;
  algo: number;
}

export interface TasteMatchTitleDTO {
  mediaType: TasteMediaType;
  id: number;
  title: string;
  posterPath: string | null;
  /** The viewer's / the profile owner's 1-10 score (null = heart only). */
  viewerScore: number | null;
  ownerScore: number | null;
}

export interface TasteMatchDTO {
  score: number;
  components: { scoreSim: number | null; likedSim: number | null; tasteSim: number | null };
  sharedFavorites: TasteMatchTitleDTO[];
  fightAbout: TasteMatchTitleDTO[];
  evidence: { sharedRated: number; sharedLiked: number; hasTaste: boolean };
}

export interface TasteTwinDTO {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** 0–100 ("NN% taste match"). */
  match: number;
}
