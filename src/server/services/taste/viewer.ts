/**
 * The signed-in viewer's PG user id for taste actions, or null (guest / no PG
 * user data source). Shared by the taste action modules — it lives outside the
 * `"use server"` files because those may only export server actions.
 */
import { auth } from "@/lib/auth";
import { requirePgUserId } from "@/lib/user-id";

export async function viewerId(): Promise<number | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;
    return await requirePgUserId();
  } catch {
    return null;
  }
}
