import { NextRequest, NextResponse } from "next/server";
import { addSeriesToWatchlist, removeSeriesFromWatchlist } from "@/server/db/user-data";
import { requireUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ seriesId: string }>;
}

/**
 * POST /api/user/series/[seriesId]/watchlist
 * Add series to watchlist
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireUserIdForDb();
    const { seriesId } = await params;
    const seriesIdNum = parseInt(seriesId, 10);

    if (isNaN(seriesIdNum)) {
      return NextResponse.json({ error: "Invalid series ID" }, { status: 400 });
    }

    await addSeriesToWatchlist(userId, seriesIdNum);

    return NextResponse.json({ success: true, seriesId: seriesIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/series/[seriesId]/watchlist",
      method: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/series/[seriesId]/watchlist
 * Remove series from watchlist
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireUserIdForDb();
    const { seriesId } = await params;
    const seriesIdNum = parseInt(seriesId, 10);

    if (isNaN(seriesIdNum)) {
      return NextResponse.json({ error: "Invalid series ID" }, { status: 400 });
    }

    await removeSeriesFromWatchlist(userId, seriesIdNum);

    return NextResponse.json({ success: true, seriesId: seriesIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/series/[seriesId]/watchlist",
      method: "DELETE",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}
