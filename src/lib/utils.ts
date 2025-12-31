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
