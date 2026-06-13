import { prisma } from "@/server/db/postgres";

/**
 * Username charset matches the Phase 0 claim flow: [a-z0-9_], 3-30 chars,
 * case-insensitive (raw UNIQUE INDEX ON lower(username)).
 */
const MENTION_RE = /(^|[^\w@])@([a-z0-9_]{3,30})\b/gi;
const MAX_MENTIONS = 5;

/** Pure: extract up to 5 unique lowercased usernames from a comment body. */
export function parseMentions(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const username = match[2].toLowerCase();
    if (seen.has(username)) continue;
    seen.add(username);
    found.push(username);
    if (found.length >= MAX_MENTIONS) break;
  }
  return found;
}

export interface MentionedUser {
  id: number;
  username: string;
}

/**
 * Resolve usernames → users, excluding the author and anyone with a BLOCK
 * either direction (spec blocks invariant: no mention across blocks).
 */
export async function resolveMentions(
  usernames: string[],
  authorId: number
): Promise<MentionedUser[]> {
  if (usernames.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: usernames, mode: "insensitive" } },
    select: { id: true, username: true },
  });
  const candidates = users.filter(
    (u): u is { id: number; username: string } => u.username !== null && u.id !== authorId
  );
  if (candidates.length === 0) return [];
  const ids = candidates.map((u) => u.id);
  const blocks = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: authorId, blockedId: { in: ids } },
        { blockedId: authorId, blockerId: { in: ids }, type: "BLOCK" },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set<number>();
  for (const b of blocks) {
    excluded.add(b.blockerId === authorId ? b.blockedId : b.blockerId);
  }
  return candidates.filter((u) => !excluded.has(u.id));
}
