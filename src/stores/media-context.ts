import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// =============================================================================
// Types
// =============================================================================

export interface MediaContextState {
  /** Current media type on page */
  mediaType: "movie" | "series" | "person" | null;
  /** TMDB ID */
  itemId: number | null;
  /** Title or person name */
  title: string | null;
  /** Release year */
  year: string | null;
  /** Runtime in minutes (movies only) */
  runtime: number | null;
  /** TMDB rating (0-10) */
  rating: number | null;
  /** Number of votes */
  voteCount: number | null;
  /** Genre names */
  genres: string[] | null;
  /** AI-generated questions from enrichment */
  aiQuestions: string[] | null;
  /** Number of seasons (series only) */
  seasonCount: number | null;
  /** Series status (series only) */
  status: string | null;
}

interface MediaContextActions {
  /** Set media context when navigating to a media page */
  setMediaContext: (context: Partial<MediaContextState>) => void;
  /** Clear context when leaving media pages */
  clearMediaContext: () => void;
}

type MediaContextStore = MediaContextState & MediaContextActions;

// =============================================================================
// Initial State
// =============================================================================

const initialState: MediaContextState = {
  mediaType: null,
  itemId: null,
  title: null,
  year: null,
  runtime: null,
  rating: null,
  voteCount: null,
  genres: null,
  aiQuestions: null,
  seasonCount: null,
  status: null,
};

// =============================================================================
// Store
// =============================================================================

export const useMediaContext = create<MediaContextStore>((set) => ({
  ...initialState,

  setMediaContext: (context) =>
    set((state) => ({
      ...state,
      ...context,
    })),

  clearMediaContext: () => set(initialState),
}));

// =============================================================================
// Hooks with shallow comparison (prevents infinite loops in SSR)
// =============================================================================

/**
 * Use this hook to get the full media context state with shallow comparison.
 * Safe for SSR and prevents unnecessary re-renders.
 */
export function useMediaContextState(): MediaContextState {
  return useMediaContext(
    useShallow((state) => ({
      mediaType: state.mediaType,
      itemId: state.itemId,
      title: state.title,
      year: state.year,
      runtime: state.runtime,
      rating: state.rating,
      voteCount: state.voteCount,
      genres: state.genres,
      aiQuestions: state.aiQuestions,
      seasonCount: state.seasonCount,
      status: state.status,
    }))
  );
}

/**
 * Check if there's an active media context
 */
export function useHasMediaContext(): boolean {
  return useMediaContext((state) => state.mediaType !== null && state.itemId !== null);
}
