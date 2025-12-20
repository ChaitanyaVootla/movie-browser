import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { SeriesWatchlist } from "@/server/db/models/user-library";
import { requireUserIdForDb } from "@/lib/user-id";

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

    await connectDB();

    // Upsert to handle potential duplicates gracefully
    await SeriesWatchlist.findOneAndUpdate(
      { userId, seriesId: seriesIdNum },
      { userId, seriesId: seriesIdNum, createdAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, seriesId: seriesIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error adding series to watchlist:", error);
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

    await connectDB();

    await SeriesWatchlist.deleteOne({ userId, seriesId: seriesIdNum });

    return NextResponse.json({ success: true, seriesId: seriesIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error removing series from watchlist:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}


