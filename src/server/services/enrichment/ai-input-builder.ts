/**
 * TMDB-Only AI Input Builder
 *
 * Builds a lightweight AI input markdown string from hydrated TMDB data.
 * Used by the progressive enrichment service for real-time enrichment
 * on page visits — no web scraping, no external API calls.
 *
 * Produces ~150 tokens of input (vs ~2,000 with full Wikipedia/IMDb enrichment).
 * Sufficient for generating all 9 insight categories.
 */

import type { Movie, Series } from "@/types";

// =============================================================================
// Types
// =============================================================================

/** Unified input for building AI markdown from either movie or series data */
export type TMDBData = Movie | Series;

// =============================================================================
// Helpers
// =============================================================================

function getTitle(data: TMDBData): string {
  return "title" in data ? data.title : data.name;
}

function getReleaseYear(data: TMDBData): string {
  const dateStr = "release_date" in data ? data.release_date : data.first_air_date;
  if (!dateStr) return "Unknown";
  return dateStr.slice(0, 4);
}

function getRuntime(data: TMDBData): string {
  if ("runtime" in data && data.runtime) {
    return `${data.runtime} minutes`;
  }
  if ("episode_run_time" in data && data.episode_run_time?.length) {
    return `~${data.episode_run_time[0]} min/episode`;
  }
  return "Unknown";
}

function getDirectorOrCreator(data: TMDBData): string {
  if ("created_by" in data && data.created_by?.length) {
    return data.created_by.map((c) => c.name).join(", ");
  }
  if (data.credits?.crew) {
    const directors = data.credits.crew
      .filter((c) => c.job === "Director")
      .map((c) => c.name);
    if (directors.length > 0) return directors.join(", ");
  }
  return "Unknown";
}

function getTopCast(data: TMDBData, limit = 6): string {
  if (!data.credits?.cast?.length) return "Unknown";
  return data.credits.cast
    .slice(0, limit)
    .map((c) => `${c.name} as ${c.character}`)
    .join(", ");
}

function getKeywords(data: TMDBData): string[] {
  if (!data.keywords) return [];
  // Movies use { keywords: [...] }, series use { results: [...] }
  const kws = "keywords" in data.keywords
    ? data.keywords.keywords
    : "results" in data.keywords
      ? data.keywords.results
      : [];
  return kws.map((k) => k.name);
}

function getSeriesInfo(data: TMDBData): string | null {
  if (!("number_of_seasons" in data)) return null;
  const parts: string[] = [];
  parts.push(`${data.number_of_seasons} season${data.number_of_seasons !== 1 ? "s" : ""}`);
  parts.push(`${data.number_of_episodes} episodes`);
  if (data.status) parts.push(`Status: ${data.status}`);
  return parts.join(", ");
}

// =============================================================================
// Main Builder
// =============================================================================

/**
 * Build AI input markdown from hydrated TMDB data.
 *
 * Produces a concise markdown string (~150 tokens) with:
 * - Title, year, tagline
 * - Overview
 * - Genres, keywords, cast (top 6), director/creator
 * - Ratings, runtime
 * - Series info (seasons/episodes) if applicable
 *
 * @param tmdbData - Hydrated movie or series data from the hydration service
 * @returns Formatted markdown string for LLM consumption
 */
export function buildAIInputFromTMDB(tmdbData: TMDBData): string {
  const title = getTitle(tmdbData);
  const year = getReleaseYear(tmdbData);
  const tagline = tmdbData.tagline;
  const genres = tmdbData.genres?.map((g) => g.name) ?? [];
  const keywords = getKeywords(tmdbData);
  const director = getDirectorOrCreator(tmdbData);
  const cast = getTopCast(tmdbData);
  const runtime = getRuntime(tmdbData);
  const seriesInfo = getSeriesInfo(tmdbData);
  const mediaType = "title" in tmdbData ? "Movie" : "Series";

  const lines: string[] = [];

  // Header
  lines.push(`# ${title} (${year})`);
  if (tagline) {
    lines.push(`> "${tagline}"`);
  }
  lines.push("");

  // Overview
  if (tmdbData.overview) {
    lines.push("## Overview");
    lines.push(tmdbData.overview);
    lines.push("");
  }

  // Details
  lines.push("## Details");
  lines.push(`- **Type:** ${mediaType}`);
  lines.push(`- **Genres:** ${genres.length > 0 ? genres.join(", ") : "Unknown"}`);
  lines.push(`- **Runtime:** ${runtime}`);
  if (seriesInfo) {
    lines.push(`- **Series:** ${seriesInfo}`);
  }
  lines.push(
    `- **Rating:** TMDB ${tmdbData.vote_average.toFixed(1)}/10 (${tmdbData.vote_count.toLocaleString()} votes)`
  );
  lines.push(`- **Director${mediaType === "Series" ? "/Creator" : ""}:** ${director}`);
  lines.push(`- **Cast:** ${cast}`);
  lines.push("");

  // Keywords
  if (keywords.length > 0) {
    lines.push("## Keywords");
    lines.push(keywords.join(", "));
    lines.push("");
  }

  return lines.join("\n");
}
