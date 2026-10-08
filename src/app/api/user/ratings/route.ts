import { NextResponse } from "next/server";
// Social data is Postgres-only, so read the PG implementation directly.
import { getMovieDetails, getSeriesDetails } from "@/server/db/postgres/user-queries";
import { getUserTitleRatings } from "@/server/db/postgres/social/ratings";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { buildRatingsPayload, type RatingsPayload } from "@/lib/library-ratings";

/**
 * GET /api/user/ratings — the viewer's title-level ratings for Library → Ratings.
 *
 * One flat list (most recent first) where each item carries every signal on
 * its canonical `user_ratings` row: legacy thumb (±1), 1–10 score (½-stars on
 * the client) and the `liked` heart. Read-only; Postgres-only (social data).
 * Private + per-user: never cached.
 */
export async function GET() {
  const empty: RatingsPayload = { items: [], totalCount: 0 };
  try {
    const userId = await getUserIdForDb();
    if (!userId) return NextResponse.json(empty, noStore());

    const rows = await getUserTitleRatings(userId);
    const movieIds = rows.filter((r) => r.itemType === "movie").map((r) => r.itemId);
    const seriesIds = rows.filter((r) => r.itemType === "series").map((r) => r.itemId);
    const [movies, series] = await Promise.all([
      getMovieDetails(movieIds),
      getSeriesDetails(seriesIds),
    ]);

    return NextResponse.json(buildRatingsPayload(rows, movies, series), noStore());
  } catch (error: unknown) {
    userApiLogger.error({
      route: "/api/user/ratings",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}

function noStore() {
  return { headers: { "Cache-Control": "private, no-store" } };
}
