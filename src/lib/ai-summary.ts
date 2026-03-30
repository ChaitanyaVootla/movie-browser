/**
 * AI Summary Reader
 *
 * Reads AI-generated movie/series summaries from PostgreSQL.
 * PostgreSQL is the source of truth (migrated from file system Jan 2026).
 */

import type { AISummary } from "@/types";
import { getAIDataLegacy } from "@/server/services/ai-data-service";

/**
 * Get AI summary for a movie or series from PostgreSQL
 *
 * Returns data in legacy AISummary format for backward compatibility.
 * New code should use getAIData() from ai-data-service for the structured format.
 *
 * @param tmdbId - The TMDB movie/series ID
 * @param mediaType - "movie" or "series" (defaults to "movie" for backwards compatibility)
 * @returns The AI summary or null if not found
 */
export async function getAISummary(
  tmdbId: number,
  mediaType: "movie" | "series" = "movie"
): Promise<AISummary | null> {
  return getAIDataLegacy(tmdbId, mediaType);
}

