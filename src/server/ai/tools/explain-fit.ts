/**
 * explain_title_fit — "would I like X?" against the signed-in user's FULL taste
 * profile (services/taste/explain-fit.ts). Deterministic: stored vectors and
 * catalog joins only, no LLM and no embedding call.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { explainTitleFitForUser } from "@/server/services/taste/explain-fit";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";

export const ExplainTitleFitSchema = z.object({
  mediaType: z.enum(["movie", "series"]).describe('"movie" or "series"'),
  id: z.number().int().positive().describe("TMDB id from a tool result (search / get_page_context / get_details)"),
});

const HINTS = {
  no_profile:
    "No taste profile yet (too few ratings). Say so lightly, judge from what they told you, and suggest rating a few favourites.",
  not_found:
    "This title isn't in the catalog yet. Use get_details for its genres and answer from those, without inventing numbers.",
} as const;

export async function explainTitleFitHandler(
  input: z.infer<typeof ExplainTitleFitSchema>,
  config?: RunnableConfig
): Promise<string> {
  const userId = getUserIdFromConfig(config);
  if (!userId) {
    return JSON.stringify({
      error: "Not logged in",
      hint: "Taste fit needs an account. Ask what they loved recently and compare from that.",
    });
  }
  try {
    const result = await explainTitleFitForUser(userId, { mediaType: input.mediaType, id: input.id });
    if (!result.ok) return JSON.stringify({ error: result.error, hint: HINTS[result.error] });
    return JSON.stringify({
      ...result.fit,
      note:
        "Cite a number (tasteCos, closerThanFavouritesPct) and 1-2 anchor titles. verdictBucket describes the title's distance — never label the person. excluded ≠ null means they already watched/rated/saved/dismissed it: acknowledge that first.",
    });
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "explain_title_fit",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to compare this title with their taste" });
  }
}

export const explainTitleFitTool = tool(explainTitleFitHandler, {
  name: "explain_title_fit",
  description: `How close ONE title is to the signed-in user's taste profile, as numbers: cosine to their taste centroid, the share of their own favourites it beats, the nearest taste cluster, the 3 favourites it sits closest to, lifted genres/moods/keywords/people it shares, and where it lands on their axes (Mainstream↔Niche, Classic↔New, Light↔Heavy).

Use when: "would I like X?", "is X my kind of thing?", "why would I like this?", "how does X compare to what I usually love?" — signed in. Get the id first (search, or get_page_context for "this").
Don't use when: the user is a guest (returns an error); they want general quality ("is X good?" → get_details + [RATINGS]); they want new picks (recommend_for_me / steer_recs).

Returns: { title, excluded (null | watched | rated | watchlisted | dismissed), tasteCos, closerThanFavouritesPct, nearestCluster {label, cos}, anchors [{title, cos}], sharedFacets {genres, moods, keywords, people}, axes [{axis, low, high, title, you}], negativeCos, verdictBucket ("very close" | "close" | "near" | "far" | "off") }.`,
  schema: ExplainTitleFitSchema,
});
