/**
 * Utilities for filtering and categorizing person credits
 */

import { EXCLUDED_TV_GENRES, LATEST_MONTHS } from "./constants";
import type { PersonCombinedCastCredit, PersonCombinedCrewCredit } from "@/types";

type Credit = PersonCombinedCastCredit | PersonCombinedCrewCredit;

/**
 * Check if a credit is a talk show or news program (should be excluded)
 */
export function isTalkShowOrNews(credit: Credit): boolean {
  // Only applies to TV shows
  if (credit.media_type !== "tv") return false;
  
  // Check if any of the genres are in the excluded list
  const genres = credit.genre_ids || [];
  return genres.some((genreId) => EXCLUDED_TV_GENRES.includes(genreId as typeof EXCLUDED_TV_GENRES[number]));
}

/**
 * Filter out talk shows and news programs from credits
 */
export function filterOutTalkShows<T extends Credit>(credits: T[]): T[] {
  return credits.filter((credit) => !isTalkShowOrNews(credit));
}

/**
 * Get the release/air date from a credit
 */
export function getCreditDate(credit: Credit): Date | null {
  const dateStr = credit.media_type === "movie" ? credit.release_date : credit.first_air_date;
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a credit is upcoming (release date in the future)
 */
export function isUpcoming(credit: Credit): boolean {
  const date = getCreditDate(credit);
  if (!date) return false;
  return date > new Date();
}

/**
 * Check if a credit is "latest" (released within the last LATEST_MONTHS)
 */
export function isLatest(credit: Credit): boolean {
  const date = getCreditDate(credit);
  if (!date) return false;
  
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - LATEST_MONTHS);
  
  // Must be in the past but within the cutoff
  return date <= now && date >= cutoffDate;
}

/**
 * Categorize credits into upcoming and latest
 * Excludes talk shows from both categories
 */
export function categorizeCredits<T extends Credit>(credits: T[]): {
  upcoming: T[];
  latest: T[];
} {
  const filtered = filterOutTalkShows(credits);
  
  const upcoming: T[] = [];
  const latest: T[] = [];
  
  filtered.forEach((credit) => {
    if (isUpcoming(credit)) {
      upcoming.push(credit);
    } else if (isLatest(credit)) {
      latest.push(credit);
    }
  });
  
  // Sort upcoming by date (soonest first)
  upcoming.sort((a, b) => {
    const dateA = getCreditDate(a);
    const dateB = getCreditDate(b);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });
  
  // Sort latest by date (most recent first)
  latest.sort((a, b) => {
    const dateA = getCreditDate(a);
    const dateB = getCreditDate(b);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.getTime() - dateA.getTime();
  });
  
  return { upcoming, latest };
}

/**
 * Deduplicate credits by ID (keep the one with most info - poster)
 */
export function deduplicateCredits<T extends Credit>(credits: T[]): T[] {
  const seen = new Map<number, T>();
  credits.forEach((credit) => {
    const existing = seen.get(credit.id);
    if (!existing || (credit.poster_path && !existing.poster_path)) {
      seen.set(credit.id, credit);
    }
  });
  return Array.from(seen.values());
}

