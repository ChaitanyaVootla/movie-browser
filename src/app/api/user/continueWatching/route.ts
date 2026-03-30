import { NextResponse } from "next/server";
import {
  getContinueWatchingItems,
  upsertContinueWatchingItem,
  deleteContinueWatchingItem,
} from "@/server/db/user-data";
import { getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";

// GET /api/user/continueWatching - Fetch user's continue watching items
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ items: [] });
    }

    const items = await getContinueWatchingItems(userId);

    const formattedItems = items.map((item) => ({
      id: item.itemId,
      itemId: item.itemId,
      isMovie: item.isMovie,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      title: item.title,
      name: item.name,
      watchLink: item.watchLink,
      watchProviderName: item.watchProviderName,
      updatedAt: item.updatedAt,
    }));

    return NextResponse.json({ items: formattedItems });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/continueWatching",
      method: "GET",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch continue watching" }, { status: 500 });
  }
}

// POST /api/user/continueWatching - Add item to continue watching
export async function POST(request: Request) {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const {
      itemId,
      isMovie,
      poster_path,
      backdrop_path,
      title,
      name,
      watchLink,
      watchProviderName,
    } = body;

    if (!itemId || typeof isMovie !== "boolean" || !watchLink) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await upsertContinueWatchingItem(userId, {
      itemId,
      isMovie,
      watchLink,
      watchProviderName,
      poster_path,
      backdrop_path,
      title,
      name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/continueWatching",
      method: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to add to continue watching" }, { status: 500 });
  }
}

// DELETE /api/user/continueWatching - Remove item from continue watching
export async function DELETE(request: Request) {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const isMovie = searchParams.get("isMovie") === "true";

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    await deleteContinueWatchingItem(userId, parseInt(itemId, 10), isMovie);

    return NextResponse.json({ success: true });
  } catch (error) {
    userApiLogger.error({
      route: "/api/user/continueWatching",
      method: "DELETE",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to remove from continue watching" }, { status: 500 });
  }
}
