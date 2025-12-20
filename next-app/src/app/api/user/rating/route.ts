import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db";
import { UserRating } from "@/server/db/models/user-library";
import { requireUserIdForDb } from "@/lib/user-id";
import { z } from "zod";

const RatingSchema = z.object({
  itemId: z.number(),
  itemType: z.enum(["movie", "series"]),
  rating: z.number().min(-1).max(1), // -1 = dislike, 0 = neutral, 1 = like
});

/**
 * POST /api/user/rating
 * Set or update a rating for a movie/series
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserIdForDb();
    const body = await request.json();

    const parsed = RatingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { itemId, itemType, rating } = parsed.data;

    await connectDB();

    // Upsert the rating
    await UserRating.findOneAndUpdate(
      { userId, itemId, itemType },
      { userId, itemId, itemType, rating, createdAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, itemId, itemType, rating });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error setting rating:", error);
    return NextResponse.json({ error: "Failed to set rating" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/rating
 * Remove a rating for a movie/series
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserIdForDb();

    const { searchParams } = new URL(request.url);
    const itemId = parseInt(searchParams.get("itemId") || "", 10);
    const itemType = searchParams.get("itemType");

    if (isNaN(itemId) || !itemType || !["movie", "series"].includes(itemType)) {
      return NextResponse.json(
        { error: "Invalid itemId or itemType" },
        { status: 400 }
      );
    }

    await connectDB();

    await UserRating.deleteOne({ userId, itemId, itemType });

    return NextResponse.json({ success: true, itemId, itemType });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error removing rating:", error);
    return NextResponse.json({ error: "Failed to remove rating" }, { status: 500 });
  }
}


