"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

/**
 * Data structure for hero media fallback information.
 * This is provided by async content components after they fetch media data.
 */
export interface HeroMediaData {
  /** TMDB backdrop path for fallback when CDN fails */
  tmdbBackdropPath?: string | null;
  /** TMDB logo path for fallback when CDN fails */
  tmdbLogoPath?: string | null;
  /** Title/name for text fallback when both CDN and TMDB logo fail */
  title?: string;
}

interface HeroMediaContextValue {
  data: HeroMediaData | null;
  setData: (data: HeroMediaData) => void;
}

const HeroMediaContext = createContext<HeroMediaContextValue | null>(null);

/**
 * Provider for hero media fallback data.
 * Wrap detail page content with this to enable shells to receive
 * TMDB fallback data from async components.
 */
export function HeroMediaProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<HeroMediaData | null>(null);

  // Memoize setData to prevent context value from changing on every render
  const stableSetData = useCallback((newData: HeroMediaData) => {
    setData(newData);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ data, setData: stableSetData }),
    [data, stableSetData]
  );

  return (
    <HeroMediaContext.Provider value={contextValue}>
      {children}
    </HeroMediaContext.Provider>
  );
}

/**
 * Hook to access hero media context.
 * Used by shell components to get TMDB fallback data.
 */
export function useHeroMedia() {
  return useContext(HeroMediaContext);
}

/**
 * Component that updates the hero media context with TMDB fallback data.
 * Render this inside async content components to provide fallback data to shells.
 *
 * @example
 * ```tsx
 * async function HeroContentAsync({ movieId }) {
 *   const movie = await getMovie(movieId);
 *   return (
 *     <>
 *       <HeroMediaUpdater
 *         tmdbBackdropPath={movie.backdrop_path}
 *         tmdbLogoPath={movie.images?.logos?.[0]?.file_path}
 *         title={movie.title}
 *       />
 *       // ... rest of content
 *     </>
 *   );
 * }
 * ```
 */
export function HeroMediaUpdater({
  tmdbBackdropPath,
  tmdbLogoPath,
  title,
}: HeroMediaData) {
  const ctx = useHeroMedia();
  // Extract setData so we don't depend on the whole ctx object (which includes data)
  const setData = ctx?.setData;

  useEffect(() => {
    if (setData) {
      setData({ tmdbBackdropPath, tmdbLogoPath, title });
    }
  }, [setData, tmdbBackdropPath, tmdbLogoPath, title]);

  return null;
}




