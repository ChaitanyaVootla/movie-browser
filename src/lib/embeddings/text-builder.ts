/**
 * Embedding Text Builder
 *
 * Constructs optimized text representations for semantic embedding generation.
 * The order of content matters - most important information comes first
 * to survive potential truncation.
 */

// =============================================================================
// Types
// =============================================================================

export interface MovieEmbeddingInput {
  // Core TMDB data
  title: string;
  overview: string | null;
  genres: string[];
  keywords: string[];
  tagline?: string | null;

  // Credits
  director?: string | null;
  topCast?: string[];

  // AI-enriched data (from ai_data table)
  themes?: string[];
  mood?: {
    pacing?: string;
    intensity?: string;
    tone?: string;
    emotional?: string;
  };
  quickTake?: string[];
  hook?: string;
}

export interface SeriesEmbeddingInput {
  name: string;
  overview: string | null;
  genres: string[];
  keywords: string[];
  tagline?: string | null;
  creators?: string[];
  topCast?: string[];

  // AI-enriched data
  themes?: string[];
  mood?: {
    pacing?: string;
    intensity?: string;
    tone?: string;
    emotional?: string;
  };
  quickTake?: string[];
}

export interface PersonEmbeddingInput {
  name: string;
  knownFor: string | null;
  biography: string | null;
  notableWorks?: string[];
}

// =============================================================================
// Text Builders
// =============================================================================

/**
 * Build optimized text for movie embedding generation.
 * Order matters - most important content first (for potential truncation).
 *
 * @example
 * const text = buildMovieEmbeddingText({
 *   title: "The Shawshank Redemption",
 *   overview: "Imprisoned in the 1940s...",
 *   genres: ["Drama", "Crime"],
 *   keywords: ["prison", "friendship", "hope"],
 *   themes: ["Hope as defiance", "Institutional cruelty"],
 *   mood: { pacing: "steady", intensity: "high", tone: "mixed" },
 * });
 */
export function buildMovieEmbeddingText(input: MovieEmbeddingInput): string {
  const parts: string[] = [];

  // Cohere v4 handles positional encoding correctly, so title-first is fine
  // The asymmetric input_type (search_document vs search_query) handles semantic matching

  // 1. Title first for direct title searches
  parts.push(`Movie: ${input.title}`);

  // 2. Overview is the richest semantic content
  if (input.overview) {
    parts.push(input.overview);
  }

  // 3. Genres provide categorical context
  if (input.genres.length > 0) {
    parts.push(`Genres: ${input.genres.join(", ")}`);
  }

  // 4. Keywords capture specific themes and tropes
  if (input.keywords.length > 0) {
    parts.push(`Keywords: ${input.keywords.join(", ")}`);
  }

  // 5. Director (important for auteur matching)
  if (input.director) {
    parts.push(`Directed by ${input.director}`);
  }

  // 6. Top cast
  if (input.topCast && input.topCast.length > 0) {
    parts.push(`Starring ${input.topCast.slice(0, 5).join(", ")}`);
  }

  // 7. AI-enriched themes (high value if available)
  if (input.themes && input.themes.length > 0) {
    parts.push(`Themes: ${input.themes.join(", ")}`);
  }

  // 8. Mood descriptors
  if (input.mood) {
    const moodParts = Object.entries(input.mood)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`);
    if (moodParts.length > 0) {
      parts.push(`Mood: ${moodParts.join(", ")}`);
    }
  }

  // 9. Quick take / style descriptors
  if (input.quickTake && input.quickTake.length > 0) {
    parts.push(`Style: ${input.quickTake.join(", ")}`);
  }

  // 10. Hook (one-liner that captures essence)
  if (input.hook) {
    parts.push(input.hook);
  }

  // 11. Tagline (often captures essence)
  if (input.tagline) {
    parts.push(input.tagline);
  }

  return parts.join(". ");
}

/**
 * Build optimized text for series embedding generation.
 * Order matters - most important content first (for potential truncation).
 */
export function buildSeriesEmbeddingText(input: SeriesEmbeddingInput): string {
  const parts: string[] = [];

  // Cohere v4 handles positional encoding correctly, so title-first is fine
  // The asymmetric input_type (search_document vs search_query) handles semantic matching

  // 1. Title first for direct title searches
  parts.push(`TV Series: ${input.name}`);

  // 2. Overview is the richest semantic content
  if (input.overview) {
    parts.push(input.overview);
  }

  // 3. Genres provide categorical context
  if (input.genres.length > 0) {
    parts.push(`Genres: ${input.genres.join(", ")}`);
  }

  // 4. Keywords capture specific themes and tropes
  if (input.keywords.length > 0) {
    parts.push(`Keywords: ${input.keywords.join(", ")}`);
  }

  // 5. Creators (important for auteur matching)
  if (input.creators && input.creators.length > 0) {
    parts.push(`Created by ${input.creators.join(", ")}`);
  }

  // 6. Top cast
  if (input.topCast && input.topCast.length > 0) {
    parts.push(`Starring ${input.topCast.slice(0, 5).join(", ")}`);
  }

  // 7. AI-enriched themes (high value if available)
  if (input.themes && input.themes.length > 0) {
    parts.push(`Themes: ${input.themes.join(", ")}`);
  }

  // 8. Mood descriptors
  if (input.mood) {
    const moodParts = Object.entries(input.mood)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`);
    if (moodParts.length > 0) {
      parts.push(`Mood: ${moodParts.join(", ")}`);
    }
  }

  // 9. Quick take / style descriptors
  if (input.quickTake && input.quickTake.length > 0) {
    parts.push(`Style: ${input.quickTake.join(", ")}`);
  }

  // 10. Tagline (often captures essence)
  if (input.tagline) {
    parts.push(input.tagline);
  }

  return parts.join(". ");
}

/**
 * Build optimized text for person embedding generation.
 * Useful for "similar actors/directors" queries.
 */
export function buildPersonEmbeddingText(input: PersonEmbeddingInput): string {
  const parts: string[] = [];

  if (input.knownFor) {
    parts.push(`Known for: ${input.knownFor}`);
  }

  if (input.biography) {
    // Truncate biography to avoid too much noise
    const truncatedBio = input.biography.slice(0, 500);
    parts.push(truncatedBio);
  }

  if (input.notableWorks && input.notableWorks.length > 0) {
    parts.push(`Notable works: ${input.notableWorks.slice(0, 10).join(", ")}`);
  }

  return parts.join(". ");
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Estimate token count for budgeting API calls.
 * Rule of thumb: ~4 characters per token for English.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to approximately N tokens.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  // Truncate at sentence boundary if possible
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > maxChars * 0.8) {
    return truncated.slice(0, lastPeriod + 1);
  }

  return truncated + "...";
}

/**
 * Clean text for embedding (remove special characters, normalize whitespace).
 */
export function cleanTextForEmbedding(text: string): string {
  return text
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[^\w\s.,!?'-]/g, "") // Remove special chars except basic punctuation
    .trim();
}
