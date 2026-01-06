/**
 * AI Summary File Reader
 *
 * Reads AI-generated movie summaries from the enriched data files.
 * This is a file-system based approach for the in-progress AI enrichment feature.
 * Gracefully returns null if the file doesn't exist.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import type { AISummary } from "@/types";

const ENRICHED_DIR = join(process.cwd(), "data", "enriched");

/**
 * Get AI summary for a movie by TMDB ID
 * Reads from data/enriched/<tmdb_id>/ai-summary.json
 *
 * @param tmdbId - The TMDB movie ID
 * @returns The AI summary or null if not found/invalid
 */
export async function getAISummary(tmdbId: number): Promise<AISummary | null> {
  const filePath = join(ENRICHED_DIR, String(tmdbId), "ai-summary.json");

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);

    // Basic validation - ensure required fields exist
    if (
      typeof parsed.hook !== "string" ||
      !Array.isArray(parsed.quickTake) ||
      !Array.isArray(parsed.themes) ||
      !parsed.mood ||
      !Array.isArray(parsed.aiQuestions)
    ) {
      console.warn(`[AI Summary] Invalid structure for movie ${tmdbId}`);
      return null;
    }

    return parsed as AISummary;
  } catch {
    // File doesn't exist or couldn't be read - this is expected for most movies
    return null;
  }
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

