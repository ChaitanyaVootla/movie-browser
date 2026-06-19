import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requireUserIdForDb } from "@/lib/user-id";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserIdForDb();
    const body = SubscribeSchema.parse(await request.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
      update: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const UnsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserIdForDb();
    const body = UnsubscribeSchema.parse(await request.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
