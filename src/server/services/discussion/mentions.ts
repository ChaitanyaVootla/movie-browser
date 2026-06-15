import { prisma } from "@/server/db/postgres";

/** A typed @-entity reference parsed from a comment body (Phase B). */
export interface ParsedEntityMention {
  kind: "movie" | "series" | "person" | "episode";
  movieId: number | null;
  seriesId: number | null;
  personId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

const ENTITY_RE = /\[\[(movie|series|person|ep):([0-9]+)(?::([0-9]+):([0-9]+))?\|[^\]]{0,120}\]\]/g;
const MAX_ENTITY_MENTIONS = 8;

/** Pure: extract typed entity references (machine tokens emitted by the composer). */
export function parseEntityMentions(body: string): ParsedEntityMention[] {
  const out: ParsedEntityMention[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(ENTITY_RE)) {
    const tag = m[1];
    const id = Number(m[2]);
    if (!Number.isInteger(id)) continue;
    let mention: ParsedEntityMention;
    if (tag === "movie") {
      mention = { kind: "movie", movieId: id, seriesId: null, personId: null, seasonNumber: null, episodeNumber: null };
    } else if (tag === "series") {
      mention = { kind: "series", movieId: null, seriesId: id, personId: null, seasonNumber: null, episodeNumber: null };
    } else if (tag === "person") {
      mention = { kind: "person", movieId: null, seriesId: null, personId: id, seasonNumber: null, episodeNumber: null };
    } else {
      // ep: requires season + episode groups
      const season = m[3] !== undefined ? Number(m[3]) : NaN;
      const episode = m[4] !== undefined ? Number(m[4]) : NaN;
      if (!Number.isInteger(season) || !Number.isInteger(episode)) continue;
      mention = { kind: "episode", movieId: null, seriesId: id, personId: null, seasonNumber: season, episodeNumber: episode };
    }
    const key = `${mention.kind}:${mention.movieId}:${mention.seriesId}:${mention.personId}:${mention.seasonNumber}:${mention.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mention);
    if (out.length >= MAX_ENTITY_MENTIONS) break;
  }
  return out;
}

/**
 * Resolve parsed entity mentions to ones whose catalog parent EXISTS, so we never
 * store a dangling typed reference. Pure catalog reads — NO AI (invariant 6).
 * Returns CommentEntityMention create rows (commentId filled by the caller).
 */
export interface EntityMentionRow {
  movieId: number | null;
  seriesId: number | null;
  personId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export async function resolveEntityMentions(
  mentions: ParsedEntityMention[]
): Promise<EntityMentionRow[]> {
  if (mentions.length === 0) return [];
  const movieIds = mentions.filter((m) => m.movieId !== null).map((m) => m.movieId as number);
  const seriesIds = mentions
    .filter((m) => m.seriesId !== null)
    .map((m) => m.seriesId as number);
  const personIds = mentions.filter((m) => m.personId !== null).map((m) => m.personId as number);
  const [movies, series, persons] = await Promise.all([
    movieIds.length ? prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true } }) : Promise.resolve([]),
    seriesIds.length ? prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true } }) : Promise.resolve([]),
    personIds.length ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const movieSet = new Set(movies.map((m) => m.id));
  const seriesSet = new Set(series.map((s) => s.id));
  const personSet = new Set(persons.map((p) => p.id));
  const rows: EntityMentionRow[] = [];
  for (const m of mentions) {
    const exists =
      (m.movieId !== null && movieSet.has(m.movieId)) ||
      (m.seriesId !== null && seriesSet.has(m.seriesId)) ||
      (m.personId !== null && personSet.has(m.personId));
    if (!exists) continue;
    rows.push({
      movieId: m.movieId,
      seriesId: m.seriesId,
      personId: m.personId,
      seasonNumber: m.seasonNumber,
      episodeNumber: m.episodeNumber,
    });
  }
  return rows;
}

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
