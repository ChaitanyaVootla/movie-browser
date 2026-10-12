/**
 * DTOs for taste recommendations + taste match (client-safe: types + closed
 * constant vocabularies only, no server imports). Specs
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md and (v2)
 * docs/superpowers/specs/2026-10-12-taste-experience-v2-design.md §3, §5.2, §6.
 */
import type { TasteMediaType, TitleRef } from "./types";
import type { RecTitleRef } from "./recommend";

export type { RecTitleRef };

/** A title ref that can render a thumb (heading anchors, why-sheet rows). */
export interface RecThumbRef extends RecTitleRef {
  /** Optional until workstream A populates it everywhere; null = no poster. */
  posterPath?: string | null;
}

/**
 * Why an item is in a row (v2 §3.1). Invariant: in a because/seed row the
 * explanation's anchor/seed is a member of `row.anchors`.
 */
export type RecExplanation =
  | {
      kind: "because";
      anchor: RecThumbRef;
      /** Centered-space cosine to the anchor (3 dp). Absent only for the TMDB no-index fallback. */
      cos?: number;
      /** Other anchors (same set) the item is also close to (≤ 2). Always set by the recs service. */
      alsoNear?: RecThumbRef[];
      /** Facets the item carries that are lifted for the user (≤ 2 labels). Always set by the recs service. */
      facets?: string[];
    }
  | {
      kind: "facet";
      label: string;
      /** Lifted facets the item carries (≤ 2 labels). */
      facets?: string[];
    }
  /** "More like X" rows — the heading carries the seed, so no card tag. */
  | { kind: "seed"; seed: RecThumbRef; cos: number }
  /** Cold-start / tune top-up ("Popular Thrillers"). */
  | { kind: "popular"; label: string };

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

export type RecRowKind = "for_you" | "because" | "seed" | "calibration";

export interface RecRowDTO {
  /** "for-you" | "cluster-<n>" | "seed-<m|s>:<id>" | "calibration" — stable analytics key. */
  id: string;
  kind: RecRowKind;
  /**
   * The heading's SET of anchors (because: ≤ 3 cluster members ordered by
   * items anchored, ties by weight; seed: [seed]; otherwise []). Invariant:
   * every because-explanation in a because row names one of these.
   */
  anchors: RecThumbRef[];
  /** Cluster facet label (fallback heading). */
  label: string | null;
  items: RecItemDTO[];
  /** The tune that produced this row (for_you only, else null). */
  tune: TuneParams | null;
  /** because rows: cluster size (the why sheet's "and N more titles in this group"). */
  groupSize?: number;
  /** because rows: ≤ 12 member posters (FULL scope — owner's own home only). */
  members?: RecThumbRef[];
}

export interface RecsDTO {
  rows: RecRowDTO[];
  reason: RecReason;
  algo: number;
}

// ---------------------------------------------------------------------------
// Tune (v2 §3.5) — closed vocabulary shared by the Tune bar (A), `steer_recs`
// and the `[TUNE:…]` chat bridge (C). No free text crosses the bridge.
// ---------------------------------------------------------------------------

export interface TuneParams {
  /** Single-select. */
  media?: "movie" | "series";
  /** "Under 100 min" (movies: runtime; series: episode runtime). */
  maxRuntime?: 100;
  /** Single-select; from ai_data mood tone. */
  tone?: "light" | "dark";
  /** classic = before 2000, recent = 2020 or later. Single-select. */
  era?: "classic" | "recent";
  /** OR; ids of the user's top-3 LIFTED genres (chips are per-user). Token `g:<id>`. */
  genres?: string[];
  /** OR; lifted non-English ISO 639-1 codes. Token `l:<iso>`. */
  languages?: string[];
  /** OR; top-2 lifted mood/theme keys. Token `m:<key>`. */
  moods?: string[];
  /** Nonce → novelty mode ("Surprise me"). Never cached, never a token. */
  shuffle?: number;
}

/** Fixed tune tokens → the TuneParams field each one sets. */
export const TUNE_TOKENS = {
  movies: { media: "movie" },
  series: { media: "series" },
  under100: { maxRuntime: 100 },
  lighter: { tone: "light" },
  darker: { tone: "dark" },
  classic: { era: "classic" },
  recent: { era: "recent" },
} as const satisfies Record<string, Partial<TuneParams>>;

export type FixedTuneToken = keyof typeof TUNE_TOKENS;

/** Prefixes of the per-user token families (`g:878`, `l:ko`, `m:identity`). */
export const TUNE_TOKEN_PREFIX = { genre: "g:", language: "l:", mood: "m:" } as const;

/** A fixed token or a per-user prefixed one. Validate against the user's own sets before applying. */
export type TuneToken = FixedTuneToken | `g:${string}` | `l:${string}` | `m:${string}`;

/** Most tokens one `[TUNE:…]` tag / URL may carry (extra are dropped). */
export const TUNE_MAX_TOKENS = 8;

/** URL search-param key for the tune state on `/` (`/?tune=series,darker`). */
export const TUNE_URL_KEY = "tune";

// ---------------------------------------------------------------------------
// Action contracts (v2 §6.3) — implemented by workstream A
// ---------------------------------------------------------------------------

export interface GetHomeRecsInput {
  tune?: TuneParams;
  shuffle?: number;
  /** Title keys ("m:603") currently on screen — Surprise me never repeats them (≤ 40). */
  exclude?: string[];
}

/** `getHomeRecs` / `getHomeRecsForUser` result. */
export interface HomeRecsDTO extends RecsDTO {
  /** Survivors in the unfiltered pool per tune token (0 → chip disabled). populated by workstream A */
  tuneAvailable: Partial<Record<TuneToken, number>>;
  /**
   * The user's chip set in display order (fixed tokens first, then the
   * per-user g:/l:/m: chips with their labels). Empty without a pool.
   */
  tuneChips: Array<{ token: TuneToken; label: string }>;
  /** Titles the profile is built from (FULL scope; "Built from {N} titles"). */
  positiveCount: number;
}

export interface GetHomeRecsOptions {
  shuffle?: number;
  /** See GetHomeRecsInput.exclude. */
  exclude?: readonly string[];
}

/** `getMoreLikeThis` input — the seed title. */
export interface RecSeedInput {
  mediaType: TasteMediaType;
  id: number;
}

/** Client-safe mirror of the Prisma `RecFeedbackKind` enum. */
export type RecFeedbackKindDTO = "DISMISS" | "SKIP";
export type RecFeedbackSource = "ui" | "cue";

export interface RecFeedbackInput {
  mediaType: TasteMediaType;
  id: number;
  kind: RecFeedbackKindDTO;
  /** "for-you" | "cluster-1" | "seed-m:603" | "calibration". */
  rowId?: string;
  /** Anchor shown when dismissed, "m:603" (for eval). */
  anchorKey?: string;
}

export type RecFeedbackResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Calibration deck (v2 §3.6)
// ---------------------------------------------------------------------------

export type CalibrationMode = "start" | "sharpen";
export type CalibrationAnswer = "loved" | "liked" | "disliked" | "skip";

export interface CalibrationItemDTO {
  mediaType: TasteMediaType;
  id: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Display genres (≤ 2 shown). */
  genres: string[];
}

export interface CalibrationDeckDTO {
  items: CalibrationItemDTO[];
}

export interface CalibrationSubmitInput {
  answers: Array<{ mediaType: TasteMediaType; id: number; answer: CalibrationAnswer }>;
}

export interface CalibrationSubmitResult {
  positives: number;
  /** positives ≥ MIN_POSITIVES_FOR_CENTROID — the For-you row can render. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Taste match / twins
// ---------------------------------------------------------------------------

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
  /** ≤ 2 shared loves (PUBLIC both sides) for the chip's poster thumbs. populated by workstream B */
  shared?: TitleRef[];
}

/** One pick from `getCommonGroundPicks` (both PUBLIC centroids; `compare_taste`). */
export interface CommonGroundPickDTO {
  mediaType: TasteMediaType;
  id: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Nearest positive of each side, for "close to X (you), Y (them)". */
  viewerAnchor: RecTitleRef | null;
  targetAnchor: RecTitleRef | null;
}
