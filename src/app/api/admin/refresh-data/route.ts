import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import { forceRefreshMovie, forceRefreshSeries } from "@/server/services/hydration/integration";

/**
 * POST /api/admin/refresh-data
 * Force refresh data from TMDB + MongoDB/Lambda → PostgreSQL.
 * Bypasses staleness checks. Admin-only endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    await requireAdmin();

    const { tmdbId, mediaType } = await request.json();

    if (!tmdbId || typeof tmdbId !== "number") {
      return NextResponse.json(
        { error: "tmdbId is required and must be a number" },
        { status: 400 }
      );
    }

    if (!mediaType || !["movie", "series"].includes(mediaType)) {
      return NextResponse.json(
        { error: "mediaType is required and must be 'movie' or 'series'" },
        { status: 400 }
      );
    }

    adminApiLogger.info({ event: "refresh_data_start", tmdbId, mediaType });

    const startTime = Date.now();
    let result;

    if (mediaType === "movie") {
      result = await forceRefreshMovie(tmdbId);
    } else {
      result = await forceRefreshSeries(tmdbId);
    }

    const durationMs = Date.now() - startTime;

    if (!result) {
      adminApiLogger.error({ event: "refresh_data_failed", tmdbId, mediaType });
      return NextResponse.json(
        { error: `Failed to refresh ${mediaType} data. Item may not exist.` },
        { status: 404 }
      );
    }

    adminApiLogger.info({
      event: "refresh_data_complete",
      tmdbId,
      mediaType,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      tmdbId,
      mediaType,
      durationMs,
      message: `${mediaType === "movie" ? "Movie" : "Series"} data refreshed from TMDB + MongoDB/Lambda`,
    });
  } catch (error) {
    // Check if it's an auth error
    if (error instanceof Error && error.message.includes("access required")) {
      adminApiLogger.warn({ event: "refresh_data_auth_denied", error: error.message });
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    adminApiLogger.error({
      event: "refresh_data_error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
