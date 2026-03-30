import { NextRequest, NextResponse } from "next/server";
import { addMovieToWatchlist, removeMovieFromWatchlist } from "@/server/db/user-data";
import { requireUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

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

    await addMovieToWatchlist(userId, movieIdNum);

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/movie/[movieId]/watchlist",
      method: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
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

    await removeMovieFromWatchlist(userId, movieIdNum);

    return NextResponse.json({ success: true, movieId: movieIdNum });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/movie/[movieId]/watchlist",
      method: "DELETE",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }
}
