import { NextRequest, NextResponse } from "next/server";
import { markMovieWatched, unmarkMovieWatched } from "@/server/db/user-data";
import { requireUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

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

    await markMovieWatched(userId, movieIdNum);

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/movie/[movieId]/watched",
      method: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
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

    await unmarkMovieWatched(userId, movieIdNum);

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/movie/[movieId]/watched",
      method: "DELETE",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to remove watched status" }, { status: 500 });
  }
}
