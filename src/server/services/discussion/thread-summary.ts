import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { anchorKey, type DiscussionAnchor, type SpoilerScopeValue } from "./comment-schemas";
import { isScopeVisible, scopeKeyFor, type ViewerGateContext } from "./spoiler-gate";
import { anchorWhere, PUBLIC_COMMENTS_WHERE } from "@/server/db/postgres/comments";

export interface SummaryInputComment {
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  status: string;
}

const MIN_COMMENTS = 5;
const MAX_INPUT_COMMENTS = 150;
const REGEN_MIN_AGE_MS = 6 * 60 * 60 * 1000; // don't re-burn tokens more than 4x/day per bucket

/**
 * Pure + exported for tests: the spoiler-safety property of the whole
 * feature lives in this filter — summary input ⊆ what the viewer may read.
 */
export function filterSummaryInput(
  comments: SummaryInputComment[],
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): SummaryInputComment[] {
  return comments.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      isScopeVisible(c.spoilerScope, c.scopeSeason, c.scopeEpisode, ctx, anchorKind)
  );
}

const SUMMARY_SYSTEM_PROMPT = `You summarize a discussion thread about a movie or TV episode in 3-5 neutral sentences.
Rules:
- Describe only what commenters discussed: recurring themes, debates, reactions.
- Never mention, quote by name, judge, or characterize any individual commenter.
- Do not add plot information that is not present in the comments.
- Plain prose, no lists, no headings, no preamble.`;

export type ThreadSummaryResult =
  | { status: "ok"; summary: string; commentCount: number; cached: boolean }
  | { status: "not_enough_comments" }
  | { status: "error" };

export async function getOrCreateThreadSummary(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  title: string
): Promise<ThreadSummaryResult> {
  const aKey = anchorKey(anchor);
  const sKey = scopeKeyFor(ctx, anchor.type);

  // Visible candidate set: newest first, bounded. The gate predicate is
  // re-applied in-memory by filterSummaryInput (single source of truth).
  const rows = await prisma.comment.findMany({
    where: { AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_INPUT_COMMENTS,
    select: {
      id: true,
      body: true,
      spoilerScope: true,
      scopeSeason: true,
      scopeEpisode: true,
      status: true,
    },
  });
  const visible = filterSummaryInput(
    rows.map((r) => ({ ...r, spoilerScope: r.spoilerScope as SpoilerScopeValue })),
    ctx,
    anchor.type
  );
  if (visible.length < MIN_COMMENTS) return { status: "not_enough_comments" };

  const newestVisibleId =
    rows.find((r) => visible.some((v) => v.body === r.body))?.id ?? rows[0].id;

  const cached = await prisma.threadSummary.findUnique({
    where: { anchorKey_scopeKey: { anchorKey: aKey, scopeKey: sKey } },
  });
  const fresh =
    cached &&
    (cached.newestCommentId === newestVisibleId ||
      Date.now() - cached.generatedAt.getTime() < REGEN_MIN_AGE_MS);
  if (cached && fresh) {
    return {
      status: "ok",
      summary: cached.summary,
      commentCount: cached.commentCount,
      cached: true,
    };
  }

  try {
    const input = visible.map((c) => `- [${c.spoilerScope}] ${c.body.slice(0, 400)}`).join("\n");
    const result = await callBedrockFlex({
      messages: [{ role: "user", text: `Thread: discussion of "${title}"\nComments:\n${input}` }],
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      maxTokens: 250,
      temperature: 0.2,
      useFlex: false,
    });
    const summary = result.output.trim();
    if (!summary) return { status: "error" };
    await prisma.threadSummary.upsert({
      where: { anchorKey_scopeKey: { anchorKey: aKey, scopeKey: sKey } },
      create: {
        anchorKey: aKey,
        scopeKey: sKey,
        summary,
        commentCount: visible.length,
        newestCommentId: newestVisibleId,
        modelId: "moonshotai.kimi-k2.5",
      },
      update: {
        summary,
        commentCount: visible.length,
        newestCommentId: newestVisibleId,
        generatedAt: new Date(),
      },
    });
    return { status: "ok", summary, commentCount: visible.length, cached: false };
  } catch (error: unknown) {
    dataLogger.error(
      {
        action: "threadSummary",
        anchorKey: aKey,
        error: error instanceof Error ? error.message : String(error),
      },
      "thread summary generation failed"
    );
    return { status: "error" };
  }
}
