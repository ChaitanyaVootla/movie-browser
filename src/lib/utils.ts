import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate URL-safe slug from a title/name.
 * Used for SEO-friendly URLs.
 */
export function getSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Determines if an item is a movie based on its properties.
 * Movies have `title`, series have `name`.
 * 
 * This is the canonical way to determine media type from any item.
 * Use this instead of relying on `isMovie` boolean fields which may be stale.
 * 
 * @param item - Any object that may have title/name properties
 * @returns true if the item is a movie, false if it's a series
 */
export function isMovieItem(item: { title?: string; name?: string }): boolean {
  return Boolean(item.title);
}

/**
 * Gets the display title from a movie or series item.
 * Movies have `title`, series have `name`.
 * 
 * @param item - Any object that may have title/name properties
 * @returns The display title or "Untitled" as fallback
 */
export function getDisplayTitle(item: { title?: string; name?: string }): string {
  return item.title || item.name || "Untitled";
}

/**
 * Generate the correct media detail page URL.
 * Use this everywhere to ensure consistent routing.
 *
 * @param id - The media item ID
 * @param isMovie - Whether the item is a movie (true) or series (false)
 * @param title - The display title (movie.title or series.name)
 * @returns The formatted URL path e.g. /movie/123/fight-club or /series/456/breaking-bad
 */
export function getMediaHref(id: number, isMovie: boolean, title: string): string {
  const mediaType = isMovie ? "movie" : "series";
  return `/${mediaType}/${id}/${getSlug(title)}`;
}

/**
 * Generate the correct media detail page URL from an item.
 * Automatically determines movie vs series from item properties.
 * 
 * @param id - The media item ID
 * @param item - Any object that may have title/name properties
 * @returns The formatted URL path e.g. /movie/123/fight-club or /series/456/breaking-bad
 */
export function getMediaHrefFromItem(id: number, item: { title?: string; name?: string }): string {
  return getMediaHref(id, isMovieItem(item), getDisplayTitle(item));
}
