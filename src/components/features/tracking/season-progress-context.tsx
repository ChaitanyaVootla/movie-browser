"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Episode } from "@/types";

interface SeasonProgressContextValue {
  seasonNumber: number;
  episodes: Episode[];
  /**
   * Episode number a viewer is hovering with "watched up to here", or null.
   * The season bar reads this to render its ghost-fill preview, and episode
   * cards read it to highlight everything that a click would mark.
   */
  previewEpisode: number | null;
  setPreviewEpisode: (episodeNumber: number | null) => void;
}

const SeasonProgressContext = createContext<SeasonProgressContextValue | null>(null);

export function useSeasonProgress(): SeasonProgressContextValue | null {
  return useContext(SeasonProgressContext);
}

interface SeasonProgressProviderProps {
  seasonNumber: number;
  episodes: Episode[];
  children: ReactNode;
}

/**
 * Scopes hover-preview state to the currently-displayed season so the season
 * progress bar (in the header) and the episode cards (in the scroller below)
 * stay in sync without prop-drilling through MediaScroller.
 */
export function SeasonProgressProvider({
  seasonNumber,
  episodes,
  children,
}: SeasonProgressProviderProps) {
  const [previewEpisode, setPreviewEpisode] = useState<number | null>(null);

  const value = useMemo<SeasonProgressContextValue>(
    () => ({ seasonNumber, episodes, previewEpisode, setPreviewEpisode }),
    [seasonNumber, episodes, previewEpisode]
  );

  return (
    <SeasonProgressContext.Provider value={value}>{children}</SeasonProgressContext.Provider>
  );
}
