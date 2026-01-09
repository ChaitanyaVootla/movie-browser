/**
 * Item Analytics API
 *
 * Admin-only endpoint for fetching analytics data for a specific item.
 *
 * GET /api/admin/item-analytics?id=550&type=movie&range=30
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import {
  getItemAnalytics,
  getItemLambdaHistory,
  getItemBotStats,
  getItemDeviceStats,
  getItemDailyTrend,
} from "@/lib/analytics";
import { prisma } from "@/server/db/postgres";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = parseInt(searchParams.get("id") || "0", 10);
  const mediaType = searchParams.get("type") as "movie" | "series";
  const days = parseInt(searchParams.get("range") || "30", 10);

  if (!id || !mediaType || !["movie", "series"].includes(mediaType)) {
    return NextResponse.json(
      { error: "Missing required parameters: id, type (movie|series)" },
      { status: 400 }
    );
  }

  try {
    // Fetch PostgreSQL metadata with enrichment details
    let dbMetadata: {
      updatedAt: Date | null;
      tmdbUpdatedAt: Date | null;
      ratingsScrapedAt: Date | null;
      watchLinksScrapedAt: Date | null;
      enrichmentSource: string | null;
      title: string | null;
      ratingSources: string[];
      watchProviderCount: number;
    } = {
      updatedAt: null,
      tmdbUpdatedAt: null,
      ratingsScrapedAt: null,
      watchLinksScrapedAt: null,
      enrichmentSource: null,
      title: null,
      ratingSources: [],
      watchProviderCount: 0,
    };

    if (mediaType === "movie") {
      const movie = await prisma.movie.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          tmdbUpdatedAt: true,
          ratingsScrapedAt: true,
          watchLinksScrapedAt: true,
          enrichmentSource: true,
          title: true,
          ratings: { select: { source: { select: { name: true } } } },
          watchOptions: { select: { id: true } },
        },
      });
      if (movie) {
        dbMetadata = {
          updatedAt: movie.updatedAt,
          tmdbUpdatedAt: movie.tmdbUpdatedAt,
          ratingsScrapedAt: movie.ratingsScrapedAt,
          watchLinksScrapedAt: movie.watchLinksScrapedAt,
          enrichmentSource: movie.enrichmentSource,
          title: movie.title,
          ratingSources: [...new Set(movie.ratings.map((r) => r.source.name))],
          watchProviderCount: movie.watchOptions.length,
        };
      }
    } else {
      const series = await prisma.series.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          tmdbUpdatedAt: true,
          ratingsScrapedAt: true,
          watchLinksScrapedAt: true,
          enrichmentSource: true,
          name: true,
          ratings: { select: { source: { select: { name: true } } } },
          watchOptions: { select: { id: true } },
        },
      });
      if (series) {
        dbMetadata = {
          updatedAt: series.updatedAt,
          tmdbUpdatedAt: series.tmdbUpdatedAt,
          ratingsScrapedAt: series.ratingsScrapedAt,
          watchLinksScrapedAt: series.watchLinksScrapedAt,
          enrichmentSource: series.enrichmentSource,
          title: series.name,
          ratingSources: [...new Set(series.ratings.map((r) => r.source.name))],
          watchProviderCount: series.watchOptions.length,
        };
      }
    }

    // Fetch analytics from ClickHouse (all in parallel)
    const [analytics, lambdaHistory, botStats, deviceStats, dailyTrend] = await Promise.all([
      getItemAnalytics(id, mediaType, { days }).catch(() => null),
      getItemLambdaHistory(id, mediaType, 10).catch(() => []),
      getItemBotStats(id, mediaType, { days }, 5).catch(() => ({ totalBotViews: 0, topBots: [] })),
      getItemDeviceStats(id, mediaType, { days }).catch(() => ({ mobile: 0, desktop: 0, tablet: 0, other: 0, total: 0 })),
      getItemDailyTrend(id, mediaType, { days }).catch(() => []),
    ]);

    return NextResponse.json({
      tmdbId: id,
      mediaType,
      title: dbMetadata.title,
      database: {
        updatedAt: dbMetadata.updatedAt?.toISOString() || null,
        tmdbUpdatedAt: dbMetadata.tmdbUpdatedAt?.toISOString() || null,
        inPostgres: !!dbMetadata.updatedAt,
      },
      enrichment: {
        source: dbMetadata.enrichmentSource,
        ratingsScrapedAt: dbMetadata.ratingsScrapedAt?.toISOString() || null,
        watchLinksScrapedAt: dbMetadata.watchLinksScrapedAt?.toISOString() || null,
        ratingSources: dbMetadata.ratingSources,
        watchProviderCount: dbMetadata.watchProviderCount,
      },
      analytics,
      botStats,
      deviceStats,
      dailyTrend,
      lambdaHistory,
      range: days,
    });
  } catch (error) {
    adminApiLogger.error({
      event: "item_analytics_error",
      tmdbId: id,
      mediaType,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "Failed to fetch item analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
