import { create } from "zustand";
import { persist } from "zustand/middleware";

// =============================================================================
// Types
// =============================================================================

export type CardDisplayMode = "poster" | "wide";

/** Background style - controls the overall aesthetic/vibe */
export type BackgroundStyle =
  | "default" // Pure black (OLED) for dark, pure white for light
  | "charcoal" // Softer dark grey
  | "slate" // Blue-tinted grey
  | "dim" // Very subtle, OLED-adjacent
  | "warm" // Warm sepia-tinted dark
  | "cool" // Cool blue-tinted dark
  | "cream"; // Warm white for light mode

/** Accent color palette - controls the brand/highlight color */
export type AccentColor =
  | "default" // Cinematic red/amber
  | "midnight" // Blue
  | "forest" // Green
  | "golden" // Yellow/gold
  | "ocean" // Teal/cyan
  | "sunset" // Orange
  | "violet" // Purple
  | "rose"; // Pink

interface PreferencesState {
  /** Card display mode: poster (default) or wide (OTT-style) */
  cardDisplayMode: CardDisplayMode;
  /** Background style: controls overall aesthetic */
  backgroundStyle: BackgroundStyle;
  /** Accent color: controls brand/highlight color */
  accentColor: AccentColor;
}

interface PreferencesActions {
  setCardDisplayMode: (mode: CardDisplayMode) => void;
  setBackgroundStyle: (style: BackgroundStyle) => void;
  setAccentColor: (color: AccentColor) => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

// =============================================================================
// Store
// =============================================================================

const initialState: PreferencesState = {
  cardDisplayMode: "poster",
  backgroundStyle: "default",
  accentColor: "default",
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCardDisplayMode: (mode) => {
        set({ cardDisplayMode: mode });
      },

      setBackgroundStyle: (style) => {
        set({ backgroundStyle: style });
        applyThemeClasses(style, undefined);
      },

      setAccentColor: (color) => {
        set({ accentColor: color });
        applyThemeClasses(undefined, color);
      },
    }),
    {
      name: "movie-browser-preferences",
      partialize: (state) => ({
        cardDisplayMode: state.cardDisplayMode,
        backgroundStyle: state.backgroundStyle,
        accentColor: state.accentColor,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          applyThemeClasses(state.backgroundStyle, state.accentColor);
        }
      },
    }
  )
);

// =============================================================================
// Theme Class Application
// =============================================================================

const STYLE_CLASSES = [
  "style-charcoal",
  "style-slate",
  "style-dim",
  "style-warm",
  "style-cool",
  "style-cream",
];

const ACCENT_CLASSES = [
  "accent-midnight",
  "accent-forest",
  "accent-golden",
  "accent-ocean",
  "accent-sunset",
  "accent-violet",
  "accent-rose",
];

function applyThemeClasses(style?: BackgroundStyle, accent?: AccentColor) {
  if (typeof document === "undefined") return;

  const html = document.documentElement;

  // Handle style classes
  if (style !== undefined) {
    // Remove all style classes
    STYLE_CLASSES.forEach((cls) => html.classList.remove(cls));
    // Add new style class (default doesn't need a class)
    if (style !== "default") {
      html.classList.add(`style-${style}`);
    }
  }

  // Handle accent classes
  if (accent !== undefined) {
    // Remove all accent classes
    ACCENT_CLASSES.forEach((cls) => html.classList.remove(cls));
    // Add new accent class (default doesn't need a class)
    if (accent !== "default") {
      html.classList.add(`accent-${accent}`);
    }
  }
}

// =============================================================================
// Selectors
// =============================================================================

export const selectCardDisplayMode = (state: PreferencesStore) => state.cardDisplayMode;
export const selectBackgroundStyle = (state: PreferencesStore) => state.backgroundStyle;
export const selectAccentColor = (state: PreferencesStore) => state.accentColor;
