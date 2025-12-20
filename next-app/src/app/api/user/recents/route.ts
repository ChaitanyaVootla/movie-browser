import { NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { RecentItem } from "@/server/db/models/user-library";
import { getUserIdForDb } from "@/lib/user-id";

const MAX_RECENTS = 20;

// GET /api/user/recents - Fetch user's recent items
export async function GET() {
  try {
    const userId = await getUserIdForDb();

    if (!userId) {
      return NextResponse.json({ items: [] });
    }

    await connectDB();

    const recents = await RecentItem.find({ userId })
      .select("-__v -userId")
      .sort({ updatedAt: -1 })
      .limit(MAX_RECENTS)
      .lean();

    const items = recents.map((recent) => ({
      id: recent.itemId,
      itemId: recent.itemId,
      isMovie: Boolean(recent.isMovie),
      poster_path: recent.poster_path,
      backdrop_path: recent.backdrop_path,
      title: recent.title,
      name: recent.name,
      viewedAt: recent.updatedAt,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching recents:", error);
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

    await connectDB();

    // Upsert the recent item
    await RecentItem.findOneAndUpdate(
      { userId, itemId, isMovie },
      {
        userId,
        itemId,
        isMovie,
        poster_path,
        backdrop_path,
        title,
        name,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Clean up old recents (keep only MAX_RECENTS)
    const allRecents = await RecentItem.find({ userId })
      .sort({ updatedAt: -1 })
      .select("_id")
      .lean();

    if (allRecents.length > MAX_RECENTS) {
      const idsToDelete = allRecents.slice(MAX_RECENTS).map((r) => r._id);
      await RecentItem.deleteMany({ _id: { $in: idsToDelete } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding to recents:", error);
    return NextResponse.json({ error: "Failed to add to recents" }, { status: 500 });
  }
}

