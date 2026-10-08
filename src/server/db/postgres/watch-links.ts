/**
 * PostgreSQL Watch Links Queries
 *
 * Provides functions to fetch scraped deep links from PostgreSQL — per-title,
 * per-country links straight to the streaming player (JustWatch via the
 * enrichment Lambda; India-only before Oct 2026).
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
 * Get scraped watch links (deep links) for a movie or series in one country.
 */
export async function getScrapedWatchLinksFromPostgres(
  id: number,
  mediaType: "movie" | "series",
  countryCode = "IN"
): Promise<ScrapedWatchLink[]> {
  try {
    const where =
      mediaType === "movie" ? { movieId: id, countryCode } : { seriesId: id, countryCode };

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
