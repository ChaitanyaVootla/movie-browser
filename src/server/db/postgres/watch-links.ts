/**
 * PostgreSQL Watch Links Queries
 *
 * Provides functions to fetch scraped deep links from PostgreSQL.
 * These are India-specific deep links that go directly to the streaming player.
 */

import { prisma } from "./index";

// ============================================
// Types
// ============================================

export interface ScrapedWatchLink {
  provider: string;
  link: string;
  price: string | null;
}

// ============================================
// Query Functions
// ============================================

/**
 * Get scraped watch links (deep links) for a movie or series
 * These are India-specific links scraped from Google search results
 */
export async function getScrapedWatchLinksFromPostgres(
  id: number,
  mediaType: "movie" | "series"
): Promise<ScrapedWatchLink[]> {
  try {
    const where =
      mediaType === "movie"
        ? { movieId: id, countryCode: "IN" }
        : { seriesId: id, countryCode: "IN" };

    const links = await prisma.scrapedWatchLink.findMany({
      where,
      select: {
        providerName: true,
        link: true,
        price: true,
      },
    });

    return links.map((link) => ({
      provider: link.providerName,
      link: link.link,
      price: link.price,
    }));
  } catch (error) {
    console.error("[PostgreSQL/watch-links] Error fetching scraped links:", error);
    return [];
  }
}
