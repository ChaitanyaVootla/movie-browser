import { CommentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";

export const CUE_USERNAME = "cue";
export const CUE_METADATA = { bot: true, displayName: "Cue", aiAuthor: true } as const;

export interface TitleSeedState {
  /** title already has a Cue-authored title-level comment */
  hasCueSeed: boolean;
  /** title already has at least one human (non-Cue) comment */
  hasHumanComment: boolean;
}

/** Idempotency rule (spec §8): seed only virgin titles. */
export function shouldSkipTitle(state: TitleSeedState): boolean {
  return state.hasCueSeed || state.hasHumanComment;
}

/** Ensure the reserved Cue system user exists; returns its id. */
export async function ensureCueUser(): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { username: CUE_USERNAME }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: {
      googleId: "system:cue",
      email: "cue@system.themoviebrowser.com",
      name: "Cue",
      username: CUE_USERNAME,
      isPublic: true,
      metadata: CUE_METADATA as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return created.id;
}

export interface TitleAnchor {
  mediaType: "movie" | "series";
  id: number; // movieId or seriesId
}

/** Read the seed state for a title — one cheap existence query per side. */
export async function getTitleSeedState(cueUserId: number, anchor: TitleAnchor): Promise<TitleSeedState> {
  const anchorWhere: Prisma.CommentWhereInput =
    anchor.mediaType === "movie" ? { movieId: anchor.id } : { seriesId: anchor.id };
  const [cue, human] = await Promise.all([
    prisma.comment.findFirst({ where: { ...anchorWhere, userId: cueUserId }, select: { id: true } }),
    prisma.comment.findFirst({
      where: { ...anchorWhere, userId: { not: cueUserId } },
      select: { id: true },
    }),
  ]);
  return { hasCueSeed: cue !== null, hasHumanComment: human !== null };
}

/**
 * Insert ONE Cue opener at title level, spoilerScope=NONE, PUBLISHED, no toxicity
 * gate (trusted system author). Wrapped in auditedTransaction(cueUserId, …) for
 * actor attribution (invariant 5).
 */
export async function insertCueSeed(
  cueUserId: number,
  anchor: TitleAnchor,
  body: string
): Promise<number> {
  const created = await auditedTransaction(cueUserId, (tx) =>
    tx.comment.create({
      data: {
        userId: cueUserId,
        movieId: anchor.mediaType === "movie" ? anchor.id : null,
        seriesId: anchor.mediaType === "series" ? anchor.id : null,
        body,
        spoilerScope: "NONE",
        status: CommentStatus.PUBLISHED,
        aiLabels: { cueSeed: true, generatedAt: new Date().toISOString() } as object,
      },
      select: { id: true },
    })
  );
  return created.id;
}
