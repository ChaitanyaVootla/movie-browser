import { z } from "zod";

/** Typed anchor for a discussion surface (spec invariant 7: no generic itemId/itemType). */
export type DiscussionAnchor =
  | { type: "movie"; movieId: number }
  | {
      type: "series";
      seriesId: number;
      seasonNumber: number | null;
      episodeNumber: number | null;
    };

export const DiscussionAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("movie"), movieId: z.number().int().positive() }),
  z
    .object({
      type: z.literal("series"),
      seriesId: z.number().int().positive(),
      seasonNumber: z.number().int().min(0).nullable(),
      episodeNumber: z.number().int().min(1).nullable(),
    })
    .refine((a) => a.episodeNumber === null || a.seasonNumber !== null, {
      message: "episodeNumber requires seasonNumber",
    }),
]);

export const SpoilerScopeSchema = z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]);
export type SpoilerScopeValue = z.infer<typeof SpoilerScopeSchema>;

export const CreateCommentSchema = z
  .object({
    anchor: DiscussionAnchorSchema,
    parentId: z.number().int().positive().nullable().default(null),
    body: z.string().trim().min(2).max(4000),
    spoilerScope: SpoilerScopeSchema.default("NONE"),
    scopeSeason: z.number().int().min(0).nullable().default(null),
    scopeEpisode: z.number().int().min(1).nullable().default(null),
    /** true on resubmit after the user accepted/overrode the AI scope suggestion */
    confirmedScope: z.boolean().default(false),
  })
  .refine((i) => i.spoilerScope !== "EPISODE" || i.scopeSeason !== null, {
    message: "EPISODE scope requires scopeSeason",
  });
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const EditCommentSchema = z.object({
  commentId: z.number().int().positive(),
  body: z.string().trim().min(2).max(4000),
  spoilerScope: SpoilerScopeSchema,
  scopeSeason: z.number().int().min(0).nullable().default(null),
  scopeEpisode: z.number().int().min(1).nullable().default(null),
});

export const DeleteCommentSchema = z.object({ commentId: z.number().int().positive() });

export const ReportCommentSchema = z.object({
  commentId: z.number().int().positive(),
  // Substitute Phase 0's actual ReportReason members if they differ:
  reason: z.enum(["SPOILER", "HARASSMENT", "SPAM", "HATE_SPEECH", "OTHER"]),
  note: z.string().trim().max(500).optional(),
});

export const CommentCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.number().int().positive(),
});
export type CommentCursor = z.infer<typeof CommentCursorSchema>;

/** "movie:603" | "series:1396" | "series:1396:s2" | "series:1396:s2e5" */
export function anchorKey(anchor: DiscussionAnchor): string {
  if (anchor.type === "movie") return `movie:${anchor.movieId}`;
  let key = `series:${anchor.seriesId}`;
  if (anchor.seasonNumber !== null) key += `:s${anchor.seasonNumber}`;
  if (anchor.episodeNumber !== null) key += `e${anchor.episodeNumber}`;
  return key;
}
