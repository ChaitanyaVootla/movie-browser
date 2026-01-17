import { create } from "zustand";
import { persist } from "zustand/middleware";

// =============================================================================
// Types
// =============================================================================

export type CardDisplayMode = "poster" | "wide";

interface PreferencesState {
  /** Card display mode: poster (default) or wide (OTT-style) */
  cardDisplayMode: CardDisplayMode;
}

interface PreferencesActions {
  setCardDisplayMode: (mode: CardDisplayMode) => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

// =============================================================================
// Store
// =============================================================================

const initialState: PreferencesState = {
  cardDisplayMode: "poster",
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCardDisplayMode: (mode) => {
        set({ cardDisplayMode: mode });
      },
    }),
    {
      name: "movie-browser-preferences",
      // Persist all preferences to localStorage
      partialize: (state) => ({
        cardDisplayMode: state.cardDisplayMode,
      }),
    }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectCardDisplayMode = (state: PreferencesStore) => state.cardDisplayMode;
