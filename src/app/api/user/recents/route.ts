import { NextResponse } from "next/server";
import { getRecentItems, upsertRecentItem } from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

// GET /api/user/recents - Fetch user's recent items
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ items: [] });
    }

    const recents = await getRecentItems(userId);

    const items = recents.map((r) => ({
      id: r.itemId,
      itemId: r.itemId,
      isMovie: r.isMovie,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      title: r.title,
      name: r.name,
      viewedAt: r.viewedAt,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/recents",
      method: "GET",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch recents" }, { status: 500 });
  }
}

// POST /api/user/recents - Add item to recents
export async function POST(request: Request) {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, isMovie, poster_path, backdrop_path, title, name } = body;

    if (!itemId || typeof isMovie !== "boolean") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await upsertRecentItem(userId, {
      itemId,
      isMovie,
      poster_path,
      backdrop_path,
      title,
      name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/recents",
      method: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to add to recents" }, { status: 500 });
  }
}
