"use client";

import { useEffect } from "react";
import { useMediaContext } from "@/stores/media-context";

interface MediaContextUpdaterProps {
  mediaType: "movie" | "series" | "person";
  itemId: number;
  title: string;
  year?: string | null;
  runtime?: number | null;
  rating?: number | null;
  voteCount?: number | null;
  genres?: string[] | null;
  aiQuestions?: string[] | null;
  seasonCount?: number | null;
  status?: string | null;
}

/**
 * Client component that updates the global media context store.
 * Place this in movie/series/person pages to enable contextual chat prompts.
 * Renders nothing - just a side effect.
 */
export function MediaContextUpdater({
  mediaType,
  itemId,
  title,
  year,
  runtime,
  rating,
  voteCount,
  genres,
  aiQuestions,
  seasonCount,
  status,
}: MediaContextUpdaterProps) {
  const setMediaContext = useMediaContext((s) => s.setMediaContext);
  const clearMediaContext = useMediaContext((s) => s.clearMediaContext);

  useEffect(() => {
    setMediaContext({
      mediaType,
      itemId,
      title,
      year: year || null,
      runtime: runtime || null,
      rating: rating || null,
      voteCount: voteCount || null,
      genres: genres || null,
      aiQuestions: aiQuestions || null,
      seasonCount: seasonCount || null,
      status: status || null,
    });

    // Clear context when unmounting (navigating away)
    return () => {
      clearMediaContext();
    };
  }, [
    mediaType,
    itemId,
    title,
    year,
    runtime,
    rating,
    voteCount,
    genres,
    aiQuestions,
    seasonCount,
    status,
    setMediaContext,
    clearMediaContext,
  ]);

  return null;
}
