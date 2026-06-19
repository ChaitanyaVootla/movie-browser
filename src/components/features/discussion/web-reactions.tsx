import { z } from "zod";
import { Globe, ThumbsUp } from "lucide-react";

/**
 * videos.top_comments JSON shape (prisma Video.topComments comment):
 * { author, authorChannel, text, likeCount, publishedAt, isCreatorHeart }.
 * No avatar URL is stored, so reactions render text-only.
 */
const TopCommentSchema = z.object({
  author: z.string().optional(),
  text: z.string().optional(),
  likeCount: z.number().optional(),
});

export function parseTopComments(raw: unknown, limit = 3): Array<z.infer<typeof TopCommentSchema>> {
  if (!Array.isArray(raw)) return [];
  const parsed: Array<z.infer<typeof TopCommentSchema>> = [];
  for (const item of raw) {
    const result = TopCommentSchema.safeParse(item);
    if (result.success && result.data.text) parsed.push(result.data);
    if (parsed.length >= limit) break;
  }
  return parsed;
}

/** "Reactions from the web" — trailer top comments as cold-thread decoration. */
export function WebReactions({ raw }: { raw: unknown }) {
  const comments = parseTopComments(raw);
  if (comments.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Globe className="h-3 w-3" /> Reactions from the web
      </p>
      <div className="space-y-2">
        {comments.map((c, i) => (
          <div key={i} className="flex gap-2.5 rounded-lg bg-muted/30 px-3 py-2">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-foreground/80 line-clamp-3">{c.text}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {c.author ?? "YouTube viewer"}
                {typeof c.likeCount === "number" && c.likeCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <ThumbsUp className="h-2.5 w-2.5" /> {c.likeCount}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
