/**
 * Server-side resolution of media tags without IDs
 *
 * When the agent mentions movies/series/persons from general knowledge (not from tool results),
 * it should skip the ID. This utility resolves those titles to TMDB IDs.
 */

import { searchMulti, searchPerson } from "@/server/services/tmdb";
import {
  parseContent,
  applyResolvedIds,
  applyResolvedPersonIds,
  getUnresolvedTitles,
  getUnresolvedPersonNames,
  type MediaType,
  type ParsedContent,
} from "@/lib/ai/parse-media-tags";

// Debug logging
const DEBUG = process.env.AI_DEBUG !== "false";

interface SearchResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  popularity: number;
  release_date?: string; // Movie release date
  first_air_date?: string; // TV first air date
}

/**
 * Extract year from a title if present
 * Supports formats: "Title (2024)", "Title [2024]", "Title - 2024"
 */
function extractYearFromTitle(title: string): { cleanTitle: string; year: number | null } {
  // Match (YYYY), [YYYY], or - YYYY at the end
  const yearMatch = title.match(/[\s]*[(\[]\s*(\d{4})\s*[)\]][\s]*$|[\s]*-\s*(\d{4})[\s]*$/);
  
  if (yearMatch) {
    const year = parseInt(yearMatch[1] || yearMatch[2], 10);
    // Validate year is reasonable (1800-2100)
    if (year >= 1800 && year <= 2100) {
      const cleanTitle = title.slice(0, title.lastIndexOf(yearMatch[0])).trim();
      return { cleanTitle, year };
    }
  }
  
  return { cleanTitle: title, year: null };
}

/**
 * Get release year from a search result
 */
function getResultYear(result: SearchResult): number | null {
  const dateStr = result.release_date || result.first_air_date;
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return isNaN(year) ? null : year;
}

/**
 * Search TMDB for a title and return the best matching ID
 * 
 * Supports optional year hints in the title for more deterministic matching:
 * - "Fight Club (1999)" → searches "Fight Club" and prefers 1999 result
 * - "The Batman (2022)" → distinguishes from older Batman films
 */
async function searchForTitle(
  title: string,
  expectedType: MediaType
): Promise<{ id: number; matchedTitle: string } | null> {
  try {
    // Extract year hint if present
    const { cleanTitle, year: hintYear } = extractYearFromTitle(title);
    const searchTitle = cleanTitle || title;
    
    if (DEBUG && hintYear) {
      console.log(`[resolve-tags] Extracted year ${hintYear} from "${title}" → searching "${searchTitle}"`);
    }
    
    const response = await searchMulti(searchTitle);
    const results = response.results as SearchResult[];

    if (results.length === 0) {
      if (DEBUG) console.log(`[resolve-tags] No results for "${searchTitle}"`);
      return null;
    }

    // Filter by expected type (movie or tv/series)
    const targetType = expectedType === "movie" ? "movie" : "tv";
    const typeMatches = results.filter((r) => r.media_type === targetType);

    if (typeMatches.length === 0) {
      // If no exact type match, check if there's content of other type
      const otherType = results.find(
        (r) => r.media_type === "movie" || r.media_type === "tv"
      );
      if (otherType) {
        if (DEBUG) {
          console.log(
            `[resolve-tags] "${searchTitle}" found as ${otherType.media_type} instead of ${expectedType}`
          );
        }
        // Use it anyway but note the type mismatch
        return {
          id: otherType.id,
          matchedTitle: otherType.title || otherType.name || searchTitle,
        };
      }
      return null;
    }

    // Matching priority:
    // 1. Exact title + exact year match
    // 2. Exact title match (any year)
    // 3. Year match (if year hint provided) + highest popularity
    // 4. Highest popularity
    
    const lowerSearchTitle = searchTitle.toLowerCase();
    
    // 1. Exact title + exact year match
    if (hintYear) {
      const exactTitleYearMatch = typeMatches.find((r) => {
        const resultTitle = (r.title || r.name || "").toLowerCase();
        const resultYear = getResultYear(r);
        return resultTitle === lowerSearchTitle && resultYear === hintYear;
      });
      
      if (exactTitleYearMatch) {
        if (DEBUG) {
          console.log(
            `[resolve-tags] "${title}" → exact title+year match: "${exactTitleYearMatch.title || exactTitleYearMatch.name}" (${exactTitleYearMatch.id}) [${hintYear}]`
          );
        }
        return {
          id: exactTitleYearMatch.id,
          matchedTitle: exactTitleYearMatch.title || exactTitleYearMatch.name || searchTitle,
        };
      }
    }
    
    // 2. Exact title match (any year)
    const exactTitleMatch = typeMatches.find(
      (r) => (r.title || r.name || "").toLowerCase() === lowerSearchTitle
    );

    if (exactTitleMatch) {
      // If we have a year hint and this doesn't match, log a warning but still use it
      const resultYear = getResultYear(exactTitleMatch);
      if (hintYear && resultYear && resultYear !== hintYear) {
        if (DEBUG) {
          console.log(
            `[resolve-tags] ⚠️ "${title}" → found "${exactTitleMatch.title || exactTitleMatch.name}" (${exactTitleMatch.id}) but year ${resultYear} ≠ hint ${hintYear}`
          );
        }
      }
      return {
        id: exactTitleMatch.id,
        matchedTitle: exactTitleMatch.title || exactTitleMatch.name || searchTitle,
      };
    }
    
    // 3. Year match (if year hint provided) among top results
    if (hintYear) {
      const yearMatches = typeMatches.filter((r) => getResultYear(r) === hintYear);
      if (yearMatches.length > 0) {
        const bestYearMatch = yearMatches.sort((a, b) => b.popularity - a.popularity)[0];
        if (DEBUG) {
          console.log(
            `[resolve-tags] "${title}" → year-matched: "${bestYearMatch.title || bestYearMatch.name}" (${bestYearMatch.id}) [${hintYear}, popularity: ${bestYearMatch.popularity.toFixed(1)}]`
          );
        }
        return {
          id: bestYearMatch.id,
          matchedTitle: bestYearMatch.title || bestYearMatch.name || searchTitle,
        };
      }
    }

    // 4. Fall back to most popular result
    const topResult = typeMatches.sort((a, b) => b.popularity - a.popularity)[0];
    if (DEBUG) {
      console.log(
        `[resolve-tags] "${title}" → popularity fallback: "${topResult.title || topResult.name}" (${topResult.id}) [popularity: ${topResult.popularity.toFixed(1)}]`
      );
    }

    return {
      id: topResult.id,
      matchedTitle: topResult.title || topResult.name || searchTitle,
    };
  } catch (error) {
    console.error(`[resolve-tags] Error searching for "${title}":`, error);
    return null;
  }
}

/**
 * Search TMDB for a person and return the best matching ID
 */
async function searchForPerson(
  name: string
): Promise<{ id: number; matchedName: string } | null> {
  try {
    const response = await searchPerson(name);
    const results = response.results as Array<{
      id: number;
      name: string;
      popularity: number;
    }>;

    if (results.length === 0) {
      if (DEBUG) console.log(`[resolve-tags] No person results for "${name}"`);
      return null;
    }

    // Find best match - prefer exact name match, then most popular
    const lowerName = name.toLowerCase();
    const exactMatch = results.find(
      (r) => r.name.toLowerCase() === lowerName
    );

    if (exactMatch) {
      return {
        id: exactMatch.id,
        matchedName: exactMatch.name,
      };
    }

    // Fall back to most popular result
    const topResult = results.sort((a, b) => b.popularity - a.popularity)[0];
    if (DEBUG) {
      console.log(
        `[resolve-tags] Person "${name}" → "${topResult.name}" (${topResult.id}) [popularity: ${topResult.popularity.toFixed(1)}]`
      );
    }

    return {
      id: topResult.id,
      matchedName: topResult.name,
    };
  } catch (error) {
    console.error(`[resolve-tags] Error searching for person "${name}":`, error);
    return null;
  }
}

/**
 * Resolve all unresolved media tags in content
 * Returns content with IDs filled in
 */
export async function resolveMediaTags(content: string): Promise<string> {
  const unresolvedTitles = getUnresolvedTitles(content);
  const unresolvedPersons = getUnresolvedPersonNames(content);

  if (unresolvedTitles.length === 0 && unresolvedPersons.length === 0) {
    return content;
  }

  if (DEBUG) {
    if (unresolvedTitles.length > 0) {
      console.log(
        `[resolve-tags] Resolving ${unresolvedTitles.length} titles:`,
        unresolvedTitles.map((t) => `${t.type}:${t.title}`).join(", ")
      );
    }
    if (unresolvedPersons.length > 0) {
      console.log(
        `[resolve-tags] Resolving ${unresolvedPersons.length} persons:`,
        unresolvedPersons.join(", ")
      );
    }
  }

  // Search for all titles and persons in parallel
  const [titleResults, personResults] = await Promise.all([
    Promise.all(
      unresolvedTitles.map(async ({ type, title }) => {
        const result = await searchForTitle(title, type);
        return { type, title, result };
      })
    ),
    Promise.all(
      unresolvedPersons.map(async (name) => {
        const result = await searchForPerson(name);
        return { name, result };
      })
    ),
  ]);

  // Build resolution map for media
  const mediaResolutions = new Map<string, { id: number; type: MediaType }>();
  for (const { type, title, result } of titleResults) {
    if (result) {
      const key = `${type}:${title.toLowerCase()}`;
      mediaResolutions.set(key, { id: result.id, type });
    }
  }

  // Build resolution map for persons
  const personResolutions = new Map<string, number>();
  for (const { name, result } of personResults) {
    if (result) {
      const key = name.toLowerCase();
      personResolutions.set(key, result.id);
    }
  }

  if (DEBUG) {
    console.log(
      `[resolve-tags] Resolved ${mediaResolutions.size}/${unresolvedTitles.length} titles, ${personResolutions.size}/${unresolvedPersons.length} persons`
    );
  }

  // Apply resolutions to content
  let resolved = content;
  if (mediaResolutions.size > 0) {
    resolved = applyResolvedIds(resolved, mediaResolutions);
  }
  if (personResolutions.size > 0) {
    resolved = applyResolvedPersonIds(resolved, personResolutions);
  }
  
  return resolved;
}

/**
 * Parse and resolve content in one step
 * Returns parsed content with resolved IDs
 */
export async function parseAndResolveContent(content: string): Promise<ParsedContent> {
  const resolvedContent = await resolveMediaTags(content);
  return parseContent(resolvedContent);
}

/**
 * Check if content needs resolution (has tags without IDs)
 */
export function needsResolution(content: string): boolean {
  const unresolvedTitles = getUnresolvedTitles(content);
  return unresolvedTitles.length > 0;
}

