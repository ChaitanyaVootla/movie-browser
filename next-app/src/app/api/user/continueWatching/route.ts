import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { ContinueWatching } from "@/server/db/models/user-library";
import { getUserIdForDb } from "@/lib/user-id";

const MAX_CONTINUE_WATCHING = 10;

// GET /api/user/continueWatching - Fetch user's continue watching items
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ items: [] });
    }

    await connectDB();

    const items = await ContinueWatching.find({ userId })
      .select("-__v -userId")
      .sort({ updatedAt: -1 })
      .limit(MAX_CONTINUE_WATCHING)
      .lean();

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
    console.error("Error fetching continue watching:", error);
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

    await connectDB();

    // Delete existing entry if exists
    await ContinueWatching.deleteOne({ userId, itemId, isMovie });

    // Create new entry
    await ContinueWatching.create({
      userId,
      itemId,
      isMovie,
      poster_path,
      backdrop_path,
      title,
      name,
      watchLink,
      watchProviderName,
      updatedAt: new Date(),
    });

    // Clean up old items (keep only MAX_CONTINUE_WATCHING)
    const allItems = await ContinueWatching.find({ userId })
      .sort({ updatedAt: -1 })
      .select("_id")
      .lean();

    if (allItems.length > MAX_CONTINUE_WATCHING) {
      const idsToDelete = allItems.slice(MAX_CONTINUE_WATCHING).map((item) => item._id);
      await ContinueWatching.deleteMany({ _id: { $in: idsToDelete } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding to continue watching:", error);
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

    await connectDB();
    await ContinueWatching.deleteOne({ userId, itemId: parseInt(itemId, 10), isMovie });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing from continue watching:", error);
    return NextResponse.json({ error: "Failed to remove from continue watching" }, { status: 500 });
  }
}

