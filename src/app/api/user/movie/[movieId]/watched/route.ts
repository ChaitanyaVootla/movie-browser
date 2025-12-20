import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { WatchedMovie } from "@/server/db/models/user-library";
import { requireUserIdForDb } from "@/lib/user-id";

interface RouteParams {
  params: Promise<{ movieId: string }>;
}

/**
 * POST /api/user/movie/[movieId]/watched
 * Mark movie as watched
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
    await WatchedMovie.findOneAndUpdate(
      { userId, movieId: movieIdNum },
      { userId, movieId: movieIdNum, createdAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error marking as watched:", error);
    return NextResponse.json({ error: "Failed to mark as watched" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/movie/[movieId]/watched
 * Remove watched status from movie
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

    await WatchedMovie.deleteOne({ userId, movieId: movieIdNum });

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error removing watched status:", error);
    return NextResponse.json({ error: "Failed to remove watched status" }, { status: 500 });
  }
}


