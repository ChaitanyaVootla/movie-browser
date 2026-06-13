"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

const RESERVED = new Set(["admin", "api", "settings", "import", "export", "me", "u"]);

const ClaimUsernameSchema = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 characters: letters, numbers, underscore"),
});

export async function claimUsername(input: z.infer<typeof ClaimUsernameSchema>) {
  try {
    const { username } = ClaimUsernameSchema.parse(input);
    if (RESERVED.has(username.toLowerCase())) {
      return { success: false as const, error: "Username not available" };
    }
    const userId = await requirePgUserId();
    await prisma.user.update({ where: { id: userId }, data: { username } });
    return { success: true as const, username };
  } catch (error: unknown) {
    // P2002 covers both the Prisma @unique and the raw lower(username) unique
    // (PG 23505 maps to P2002).
    if (isPrismaError(error) && error.code === "P2002") {
      return { success: false as const, error: "Username already taken" };
    }
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "claimUsername", error: message });
    return { success: false as const, error: message };
  }
}

export async function getMyProfile() {
  try {
    const userId = await requirePgUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        isPublic: true,
        metadata: true,
      },
    });
    return { success: true as const, user };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getMyProfile", error: message });
    return { success: false as const, error: message };
  }
}
