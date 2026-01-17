/**
 * Watch Providers API - Lazy load watch options for specific country
 *
 * GET /api/watch-providers/[mediaType]/[id]?country=XX
 *
 * This endpoint is called when a user changes their country preference.
 * Instead of serializing watch providers for all 90+ countries in the initial
 * page load, we fetch on demand.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMovieWatchProviders, getSeriesWatchProviders } from "@/server/services/tmdb";
import { getWatchOptionsForCountry, type ProcessedWatchOptions } from "@/lib/watch-options";
import { getScrapedWatchLinksFromPostgres } from "@/server/db/postgres/watch-links";

// =============================================================================
// Types
// =============================================================================

const ParamsSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  id: z.string().regex(/^\d+$/).transform(Number),
});

const QuerySchema = z.object({
  country: z.string().length(2).toUpperCase(),
});

// =============================================================================
// Route Handler
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaType: string; id: string }> }
) {
  try {
    // Validate params
    const resolvedParams = await params;
    const parsedParams = ParamsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid media type or ID" }, { status: 400 });
    }

    // Validate query
    const { searchParams } = new URL(request.url);
    const parsedQuery = QuerySchema.safeParse({
      country: searchParams.get("country"),
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid or missing country code" }, { status: 400 });
    }

    const { mediaType, id } = parsedParams.data;
    const { country } = parsedQuery.data;

    // Fetch watch providers from TMDB (cached)
    const watchProvidersResponse =
      mediaType === "movie" ? await getMovieWatchProviders(id) : await getSeriesWatchProviders(id);

    const tmdbWatchProviders = watchProvidersResponse?.results;

    // Get scraped deep links for India (if requesting India)
    let scrapedWatchLinksMap = undefined;
    if (country === "IN") {
      const scrapedLinks = await getScrapedWatchLinksFromPostgres(id, mediaType);
      if (scrapedLinks && scrapedLinks.length > 0) {
        scrapedWatchLinksMap = {
          IN: scrapedLinks.map((l) => ({
            name: l.provider,
            link: l.link,
            price: l.price ?? undefined,
          })),
        };
      }
    }

    // Process watch options for the requested country
    const watchOptions: ProcessedWatchOptions = getWatchOptionsForCountry(
      country,
      undefined, // Legacy MongoDB googleData - no longer used
      tmdbWatchProviders,
      scrapedWatchLinksMap
    );

    return NextResponse.json(watchOptions, {
      headers: {
        // Cache for 1 hour (watch providers don't change frequently)
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[API/watch-providers] Error:", error);
    return NextResponse.json({ error: "Failed to fetch watch providers" }, { status: 500 });
  }
}
