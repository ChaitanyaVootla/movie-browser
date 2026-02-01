/**
 * AI Summary Reader
 *
 * Reads AI-generated movie/series summaries from PostgreSQL.
 * PostgreSQL is the source of truth (migrated from file system Jan 2026).
 */

import { readFile } from "fs/promises";
import { join } from "path";
import type { AISummary } from "@/types";
import { getAIDataLegacy } from "@/server/services/ai-data-service";

const ENRICHED_DIR = join(process.cwd(), "data", "enriched");

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

/**
 * Get enriched AI input markdown for a movie by TMDB ID
 * Reads from data/enriched/<tmdb_id>/ai-input.md
 *
 * This contains the full enriched content (plot, themes, reception, etc.)
 * used by the AI agent for contextual answers.
 *
 * TODO: Strip down to single summary/synopsis instance to reduce token usage.
 * Currently returns the full markdown which may include duplicate content
 * from multiple sources (Wikipedia, IMDb, Fandom, etc.)
 *
 * @param tmdbId - The TMDB movie ID
 * @returns The markdown content or null if not found
 */
export async function getAIInputMarkdown(tmdbId: number): Promise<string | null> {
  const filePath = join(ENRICHED_DIR, String(tmdbId), "ai-input.md");

  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch {
    // File doesn't exist or couldn't be read - this is expected for most movies
    return null;
  }
}
