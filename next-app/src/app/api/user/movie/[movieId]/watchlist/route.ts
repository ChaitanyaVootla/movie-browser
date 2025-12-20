import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { MoviesWatchlist } from "@/server/db/models/user-library";
import { requireUserIdForDb } from "@/lib/user-id";

interface RouteParams {
  params: Promise<{ movieId: string }>;
}

/**
 * POST /api/user/movie/[movieId]/watchlist
 * Add movie to watchlist
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireUserIdForDb();
    const { movieId } = await params;
    const movieIdNum = parseInt(movieId, 10);

    if (isNaN(movieIdNum)) {
      return NextResponse.json({ error: "Invalid movie ID" }, { status: 400 });
    }

    await connectDB();

    // Upsert to handle potential duplicates gracefully
    await MoviesWatchlist.findOneAndUpdate(
      { userId, movieId: movieIdNum },
      { userId, movieId: movieIdNum, createdAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error adding to watchlist:", error);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/movie/[movieId]/watchlist
 * Remove movie from watchlist
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireUserIdForDb();
    const { movieId } = await params;
    const movieIdNum = parseInt(movieId, 10);

    if (isNaN(movieIdNum)) {
      return NextResponse.json({ error: "Invalid movie ID" }, { status: 400 });
    }

    await connectDB();

    await MoviesWatchlist.deleteOne({ userId, movieId: movieIdNum });

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error removing from watchlist:", error);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}


