/**
 * CDN Image Utilities
 *
 * Provides optimized image URLs from our CDN with fallback to TMDB.
 * CDN URL structure: https://image.themoviebrowser.com/{movie|series}/{id}/{type}.webp
 */

import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "./constants";

export enum ImageType {
  POSTER = "poster",
  LOGO = "logo",
  BACKDROP = "backdrop",
  WIDE_CARD = "widePoster",
}

export type MediaType = "movie" | "series";

interface ImageItem {
  id: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  // For determining media type
  title?: string; // Movies have title
  name?: string; // Series have name
}

/**
 * Determines if item is a movie (has title) or series (has name)
 */
export function getMediaType(item: ImageItem): MediaType {
  return "title" in item && item.title ? "movie" : "series";
}

/**
 * Get CDN image URL for a media item
 */
export function getCdnImageUrl(
  item: ImageItem,
  imageType: ImageType,
  mediaType?: MediaType
): string {
  if (!item?.id || typeof item.id !== "number") {
    return "";
  }

  const type = mediaType ?? getMediaType(item);
  return `${CDN_IMAGE_BASE}/${type}/${item.id}/${imageType}.webp`;
}

/**
 * Get TMDB fallback URL for a media item
 */
export function getTmdbImageUrl(
  item: ImageItem,
  imageType: ImageType,
  size?: string
): string {
  switch (imageType) {
    case ImageType.POSTER:
      return item.poster_path ? `${TMDB_IMAGE_BASE}/${size || "w500"}${item.poster_path}` : "";

    case ImageType.BACKDROP:
    case ImageType.WIDE_CARD:
      return item.backdrop_path
        ? `${TMDB_IMAGE_BASE}/${size || "w1280"}${item.backdrop_path}`
        : "";

    case ImageType.LOGO:
      // No direct TMDB logo URL - logos come from the images endpoint
      return "";

    default:
      return "";
  }
}

/**
 * Image source with CDN primary and TMDB fallback
 */
export interface ImageSources {
  primary: string;
  fallback: string | null;
}

/**
 * Get image sources with CDN as primary and TMDB as fallback
 */
export function getImageSources(
  item: ImageItem,
  imageType: ImageType,
  mediaType?: MediaType,
  tmdbSize?: string
): ImageSources {
  const primary = getCdnImageUrl(item, imageType, mediaType);
  const fallback = getTmdbImageUrl(item, imageType, tmdbSize) || null;

  return { primary, fallback };
}

/**
 * Get poster image sources
 */
export function getPosterSources(item: ImageItem, mediaType?: MediaType): ImageSources {
  return getImageSources(item, ImageType.POSTER, mediaType, "w500");
}

/**
 * Get backdrop image sources
 */
export function getBackdropSources(item: ImageItem, mediaType?: MediaType): ImageSources {
  return getImageSources(item, ImageType.BACKDROP, mediaType, "w1280");
}

/**
 * Get logo image URL (CDN only - TMDB logos need separate API call)
 */
export function getLogoUrl(item: ImageItem, mediaType?: MediaType): string {
  return getCdnImageUrl(item, ImageType.LOGO, mediaType);
}

/**
 * Build TMDB logo URL from a logo path (from images API)
 */
export function getTmdbLogoUrl(logoPath: string, size = "w500"): string {
  if (!logoPath) return "";
  return `${TMDB_IMAGE_BASE}/${size}${logoPath}`;
}


