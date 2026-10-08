import type { IntentAnalysis } from "@/lib/search/intent";
import type { FilterChip, QueryUnderstanding } from "./search-types";

/**
 * Pure query-understanding helpers for /search (moved verbatim out of
 * client.tsx, Oct 2026 — behaviour unchanged).
 */

/** Build the chip/summary model shown above results from the search intent. */
export function buildUnderstanding(originalQuery: string, intent: IntentAnalysis): QueryUnderstanding {
  const filters: FilterChip[] = [];
  const extracted = intent.extractedFilters;

  // Add genre filters (content category)
  if (extracted?.genres?.length) {
    for (const genre of extracted.genres) {
      filters.push({
        type: "genre",
        label: genre.charAt(0).toUpperCase() + genre.slice(1),
        value: genre,
        removable: true,
        category: "content",
      });
    }
  }

  // Add keywords filters (content category)
  if (extracted?.keywords?.length) {
    for (const keyword of extracted.keywords) {
      filters.push({
        type: "keywords",
        label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        value: keyword,
        removable: true,
        category: "content",
      });
    }
  }

  // Add year/decade filters (time category)
  if (extracted?.decade) {
    filters.push({
      type: "decade",
      label: extracted.decade.toUpperCase(),
      value: extracted.decade,
      removable: true,
      category: "time",
    });
  } else if (extracted?.yearRange) {
    const [start, end] = extracted.yearRange;
    filters.push({
      type: "year",
      label: start === end ? `${start}` : `${start}-${end}`,
      value: `${start}-${end}`,
      removable: true,
      category: "time",
    });
  } else if (extracted?.year) {
    filters.push({
      type: "year",
      label: `${extracted.year}`,
      value: `${extracted.year}`,
      removable: true,
      category: "time",
    });
  }

  // Add similar to filter
  if (extracted?.similarTo) {
    filters.push({
      type: "similar",
      label: `Like "${extracted.similarTo.title}"`,
      value: extracted.similarTo.title,
      removable: true,
    });
  }

  // Add person filter (person category)
  if (extracted?.person) {
    filters.push({
      type: "person",
      label: extracted.person,
      value: extracted.person,
      removable: true,
      category: "person",
    });
  }

  // Add cast filters (person category)
  if (extracted?.cast?.length) {
    for (const castMember of extracted.cast) {
      filters.push({
        type: "cast",
        label: `Starring ${castMember}`,
        value: castMember,
        removable: true,
        category: "person",
      });
    }
  }

  // Add director filter (person category)
  if (extracted?.director) {
    filters.push({
      type: "director",
      label: `Directed by ${extracted.director}`,
      value: extracted.director,
      removable: true,
      category: "person",
    });
  }

  // Add streaming service filter (platform category)
  if (extracted?.streamingService) {
    filters.push({
      type: "streaming",
      label: `On ${extracted.streamingService}`,
      value: extracted.streamingService,
      removable: true,
      category: "platform",
    });
  }

  // Add network filter (platform category)
  if (extracted?.network) {
    filters.push({
      type: "network",
      label: `On ${extracted.network}`,
      value: extracted.network,
      removable: true,
      category: "platform",
    });
  }

  // Add country filter (location category)
  if (extracted?.country) {
    filters.push({
      type: "country",
      label: extracted.country,
      value: extracted.country,
      removable: true,
      category: "location",
    });
  }

  // Add language filter (location category)
  if (extracted?.language) {
    filters.push({
      type: "language",
      label: extracted.language,
      value: extracted.language,
      removable: true,
      category: "location",
    });
  }

  // Add runtime filter (time category)
  if (extracted?.runtime) {
    const { min, max } = extracted.runtime;
    let label = "";
    if (min && max) {
      label = `${min}-${max} min`;
    } else if (min) {
      label = `>${min} min`;
    } else if (max) {
      label = `<${max} min`;
    }
    if (label) {
      filters.push({
        type: "runtime",
        label,
        value: `${min || ""}-${max || ""}`,
        removable: true,
        category: "time",
      });
    }
  }

  // Add rating filter (quality category)
  if (extracted?.minRating) {
    filters.push({
      type: "rating",
      label: `${extracted.minRating}+ rating`,
      value: `${extracted.minRating}`,
      removable: true,
      category: "quality",
    });
  }

  // Add collection filter
  if (extracted?.collection) {
    filters.push({
      type: "collection",
      label: extracted.collection,
      value: extracted.collection,
      removable: true,
    });
  }

  // Add bestFor filter
  if (extracted?.bestFor) {
    filters.push({
      type: "bestFor",
      label: `Best for ${extracted.bestFor}`,
      value: extracted.bestFor,
      removable: true,
    });
  }

  // Add content warnings filter (warning category)
  if (extracted?.contentWarnings?.length) {
    for (const warning of extracted.contentWarnings) {
      filters.push({
        type: "contentWarnings",
        label: `No ${warning}`,
        value: warning,
        removable: true,
        category: "warning",
      });
    }
  }

  // Add mood filter
  if (extracted?.mood) {
    const { pacing, intensity, tone } = extracted.mood;
    const moodParts: string[] = [];
    if (pacing) moodParts.push(pacing);
    if (intensity) moodParts.push(intensity);
    if (tone) moodParts.push(tone);
    if (moodParts.length > 0) {
      filters.push({
        type: "mood",
        label: moodParts.join(", "),
        value: moodParts.join(","),
        removable: true,
      });
    }
  }

  // Add series status filter
  if (extracted?.seriesStatus) {
    const statusLabels: Record<string, string> = {
      returning: "Ongoing",
      ended: "Completed",
      cancelled: "Cancelled",
    };
    filters.push({
      type: "seriesStatus",
      label: statusLabels[extracted.seriesStatus] || extracted.seriesStatus,
      value: extracted.seriesStatus,
      removable: true,
    });
  }

  // Add season count filter
  if (extracted?.seasonCount) {
    const { min, max } = extracted.seasonCount;
    let label = "";
    if (min && max) {
      label = `${min}-${max} seasons`;
    } else if (min) {
      label = `${min}+ seasons`;
    } else if (max) {
      label = `Up to ${max} seasons`;
    }
    if (label) {
      filters.push({
        type: "seasonCount",
        label,
        value: `${min || ""}-${max || ""}`,
        removable: true,
      });
    }
  }

  // Build summary
  let summary: string | undefined;
  if (filters.length > 0) {
    const parts: string[] = [];
    if (extracted?.genres?.length) {
      parts.push(extracted.genres.join(", "));
    }
    if (extracted?.decade) {
      parts.push(`from the ${extracted.decade}`);
    } else if (extracted?.yearRange) {
      const [start, end] = extracted.yearRange;
      if (start === end) {
        parts.push(`from ${start}`);
      } else {
        parts.push(`from ${start} to ${end}`);
      }
    }
    if (extracted?.similarTo) {
      parts.push(`similar to "${extracted.similarTo.title}"`);
    }
    if (extracted?.streamingService) {
      parts.push(`on ${extracted.streamingService}`);
    }
    if (extracted?.country) {
      parts.push(`from ${extracted.country}`);
    }
    if (extracted?.language) {
      parts.push(`in ${extracted.language}`);
    }
    if (extracted?.director) {
      parts.push(`directed by ${extracted.director}`);
    }
    if (parts.length > 0) {
      summary = `Searching for ${parts.join(" ")}`;
    }
  }

  return {
    originalQuery,
    cleanedQuery: intent.cleanedQuery,
    filters,
    summary,
  };
}

/**
 * The query with one understood filter removed (the chip "x"). Falls back to
 * "movies" when nothing would be left.
 */
export function removeChipFromQuery(query: string, chip: FilterChip): string {
  // Build a new query without the filter
  let newQuery = query;

  // Escape special regex characters in the value
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedValue = escapeRegex(chip.value);

  switch (chip.type) {
    case "genre":
    case "keywords":
      // Remove genre/keyword term from query (try both the value and common variations)
      const genrePatterns = [
        new RegExp(`\\b${escapedValue}\\b`, "gi"),
        new RegExp(`\\b${escapedValue}s?\\b`, "gi"),
      ];
      for (const pattern of genrePatterns) {
        newQuery = newQuery.replace(pattern, "").trim();
      }
      break;
    case "year":
    case "decade":
      // Remove year/decade patterns
      newQuery = newQuery
        .replace(/\b(19[5-9]\d|20[0-2]\d)\s*[-–]\s*(19[5-9]\d|20[0-2]\d)\b/g, "")
        .replace(/\b(from|after|before)\s+(19[5-9]\d|20[0-2]\d)\b/gi, "")
        .replace(/\b(19[5-9]0s|20[0-2]0s)\b/gi, "")
        .replace(/\b(19[5-9]\d|20[0-2]\d)\b/g, "")
        .trim();
      break;
    case "similar":
      // Remove "similar to X" or "like X" patterns
      newQuery = newQuery
        .replace(/(?:similar\s+to|movies?\s+like|shows?\s+like|series\s+like|more\s+like|something\s+like)\s+["']?[^"']+["']?/gi, "")
        .trim();
      break;
    case "streaming":
    case "network":
      // Remove streaming/network service patterns
      newQuery = newQuery
        .replace(/(?:on|available\s+on|streaming\s+on|watch\s+on)\s+\w+(?:\s*\+)?/gi, "")
        .trim();
      break;
    case "person":
    case "cast":
      // Remove person/cast patterns
      newQuery = newQuery
        .replace(/(?:starring|featuring|with)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "")
        .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
        .trim();
      break;
    case "director":
      // Remove director patterns
      newQuery = newQuery
        .replace(/(?:directed\s+by|by)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "")
        .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
        .trim();
      break;
    case "country":
      // Remove country patterns
      newQuery = newQuery
        .replace(/(?:from|made\s+in)\s+\w+(?:\s+\w+)?/gi, "")
        .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
        .trim();
      break;
    case "language":
      // Remove language patterns
      newQuery = newQuery
        .replace(/(?:in)\s+(?:korean|french|japanese|spanish|german|italian|chinese|hindi|english)/gi, "")
        .replace(new RegExp(`\\b${escapedValue}\\b`, "gi"), "")
        .trim();
      break;
    case "runtime":
      // Remove runtime patterns
      newQuery = newQuery
        .replace(/(?:under|over|less\s+than|more\s+than|around|about)\s+\d+\s*(?:min(?:utes?)?|hours?|hrs?)/gi, "")
        .replace(/\b(?:short|long)\s+(?:movies?|films?)/gi, "")
        .trim();
      break;
    case "rating":
      // Remove rating patterns
      newQuery = newQuery
        .replace(/(?:rated?\s+)?(?:above|over|at\s+least|minimum)?\s*\d+(?:\.\d+)?\s*(?:\+|stars?|rating)?/gi, "")
        .replace(/\b(?:highly\s+rated|top\s+rated|best\s+rated)\b/gi, "")
        .trim();
      break;
    case "collection":
      // Remove collection/franchise patterns
      newQuery = newQuery
        .replace(new RegExp(`\\b${escapedValue}\\s*(?:franchise|collection|universe|series)?\\b`, "gi"), "")
        .trim();
      break;
    case "bestFor":
      // Remove "best for" patterns
      newQuery = newQuery
        .replace(/(?:best\s+for|good\s+for|perfect\s+for)\s+\w+(?:\s+\w+)*/gi, "")
        .trim();
      break;
    case "contentWarnings":
      // Remove content warning patterns
      newQuery = newQuery
        .replace(/(?:no|without|avoid)\s+\w+(?:\s+\w+)*/gi, "")
        .trim();
      break;
    case "mood":
      // Remove mood patterns
      newQuery = newQuery
        .replace(/\b(?:slow|fast|medium)\s*(?:paced?|burn)?\b/gi, "")
        .replace(/\b(?:dark|light|comedic|serious|gritty|intense)\b/gi, "")
        .trim();
      break;
    case "seriesStatus":
      // Remove series status patterns
      newQuery = newQuery
        .replace(/\b(?:ongoing|completed|finished|ended|cancelled|canceled|returning)\b/gi, "")
        .trim();
      break;
    case "seasonCount":
      // Remove season count patterns
      newQuery = newQuery
        .replace(/\b\d+\+?\s*seasons?\b/gi, "")
        .replace(/(?:at\s+least|up\s+to|more\s+than|less\s+than)\s+\d+\s*seasons?/gi, "")
        .trim();
      break;
  }

  // Clean up extra spaces and common filler words
  newQuery = newQuery
    .replace(/\s+/g, " ")
    .replace(/^\s*(movies?|films?|shows?|series)\s*$/i, "")
    .trim();

  // If query is empty after removal, keep a generic term
  if (!newQuery) {
    newQuery = "movies";
  }

  return newQuery;
}
