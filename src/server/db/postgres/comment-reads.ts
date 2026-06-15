import { prisma } from "@/server/db/postgres";

/** Pure: count rows strictly newer than the last-seen cursor (null = first visit). */
export function newSinceFromRows(rows: Array<{ createdAt: string }>, lastSeenAt: string | null): number {
  if (lastSeenAt === null) return rows.length;
  const cutoff = Date.parse(lastSeenAt);
  return rows.filter((r) => Date.parse(r.createdAt) > cutoff).length;
}

export async function getLastSeen(userId: number, anchorKey: string): Promise<string | null> {
  const row = await prisma.commentRead.findUnique({
    where: { userId_anchorKey: { userId, anchorKey } },
    select: { lastSeenAt: true },
  });
  return row?.lastSeenAt ? row.lastSeenAt.toISOString() : null;
}

export async function upsertLastSeen(userId: number, anchorKey: string, seenAt: Date): Promise<void> {
  await prisma.commentRead.upsert({
    where: { userId_anchorKey: { userId, anchorKey } },
    create: { userId, anchorKey, lastSeenAt: seenAt },
    update: { lastSeenAt: seenAt },
  });
}
