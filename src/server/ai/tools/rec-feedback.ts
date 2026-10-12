/**
 * record_rec_feedback — "don't show me X again" from chat. Writes through the
 * SAME rec_feedback path as the For-you "Not for me" button (source "cue"), so
 * the UI's Undo also undoes it. ONLY on an explicit user instruction, and at
 * most REC_FEEDBACK_PER_TURN writes per turn (per-invocation budget).
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { RecFeedbackInput } from "@/lib/taste/recommend-types";
import { recordRecFeedbackFor, undoRecFeedbackFor } from "@/server/services/taste/rec-feedback";
import { aiToolLogger } from "@/lib/logger";
import { consumeInvocationBudget } from "../invocation-budget";
import { getUserIdFromConfig } from "../utils";

export const REC_FEEDBACK_PER_TURN = 5;

export const RecordRecFeedbackSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  id: z.number().int().positive().describe("TMDB id from a tool result"),
  kind: z
    .enum(["dismiss", "undo_dismiss"])
    .describe('"dismiss" = never recommend it again; "undo_dismiss" = they changed their mind'),
});

export async function recordRecFeedbackHandler(
  input: z.infer<typeof RecordRecFeedbackSchema>,
  config?: RunnableConfig
): Promise<string> {
  const userId = getUserIdFromConfig(config);
  if (!userId) {
    return JSON.stringify({ error: "Not logged in", hint: "Hiding picks needs an account." });
  }
  const invocationId = config?.configurable?.invocationId as string | undefined;
  if (!consumeInvocationBudget(invocationId, "record_rec_feedback", REC_FEEDBACK_PER_TURN)) {
    return JSON.stringify({
      error: "limit_reached",
      hint: `At most ${REC_FEEDBACK_PER_TURN} per message. Tell them which ones were hidden and ask them to send the rest in a new message (or use Not for me on the cards).`,
    });
  }
  const payload: RecFeedbackInput = { mediaType: input.mediaType, id: input.id, kind: "DISMISS" };
  try {
    const result =
      input.kind === "dismiss"
        ? await recordRecFeedbackFor(userId, payload, "cue")
        : await undoRecFeedbackFor(userId, payload);
    if (!result.ok) return JSON.stringify({ error: result.error });
    return JSON.stringify({ ok: true, kind: input.kind, mediaType: input.mediaType, id: input.id });
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "record_rec_feedback",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to save that preference" });
  }
}

export const recordRecFeedbackTool = tool(recordRecFeedbackHandler, {
  name: "record_rec_feedback",
  description: `Hide a title from the signed-in user's recommendations for good ("dismiss"), or bring it back ("undo_dismiss"). Same effect as the "Not for me" button on their For-you row.

Use when: the user EXPLICITLY says so about a specific title — "don't show me X again", "I'm not interested in X", "stop recommending X", "actually, bring X back".
Don't use when: they are only lukewarm, asked a question, or you infer dislike yourself — never on your own initiative; the user is a guest (returns an error); rating a title (you can't rate — point them to the buttons).

Max ${REC_FEEDBACK_PER_TURN} per message. Returns { ok: true } or { error }. Confirm briefly what you hid.`,
  schema: RecordRecFeedbackSchema,
});
