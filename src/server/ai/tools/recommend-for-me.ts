/**
 * recommend_for_me — personalised picks from the taste recommender
 * (src/server/services/taste/recommend.ts): HNSW retrieval from the user's taste
 * clusters + centroid, re-ranked, diversified and genre-calibrated, each with a
 * deterministic reason ("because they loved X"). Signed-in users only. No LLM
 * inside; results are cached per taste version, so repeat calls are cheap.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { getRecommendationList } from "@/server/services/taste/recommend";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";
import { toCueRec } from "./taste-summary";

export const RecommendForMeSchema = z.object({
  mediaType: z
    .enum(["movie", "series", "all"])
    .default("all")
    .describe('"movie", "series", or "all" (mixed). Default "all".'),
  limit: z.number().int().min(1).max(10).default(6).describe("How many picks (1-10). Default 6."),
});

export async function recommendForMeHandler(
  input: z.infer<typeof RecommendForMeSchema>,
  config?: RunnableConfig
): Promise<string> {
  const userId = getUserIdFromConfig(config);
  if (!userId) {
    return JSON.stringify({
      error: "Not logged in",
      hint: "Personal picks need an account. Ask what they loved recently, or recommend with smart_discover.",
    });
  }
  try {
    const { items, reason } = await getRecommendationList(userId, {
      mediaType: input.mediaType,
      limit: input.limit,
    });
    if (items.length === 0) {
      return JSON.stringify({
        picks: [],
        reason,
        hint: "Not enough rating history for personal picks yet — call get_user_profile or ask one sharp question, then use smart_discover.",
      });
    }
    return JSON.stringify({
      picks: items.map(toCueRec),
      // ok = taste-based; cold_start = popular in their genres (thin history);
      // no_index = TMDB recommendations for their favourites.
      basis: reason,
      note: "All picks are unwatched, not on their watchlist and not rated. Use the ids exactly.",
    });
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "recommend_for_me",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to load recommendations" });
  }
}

export const recommendForMeTool = tool(recommendForMeHandler, {
  name: "recommend_for_me",
  description: `Personal picks for the signed-in user from their taste profile (ratings, hearts, Four Favorites, watch history). Each pick carries a reason such as "because they loved Arrival" — use it in your reply.

Use when: open-ended "what should I watch?", "recommend something for me", "surprise me", "something I'd like" — FIRST, before smart_discover.
Don't use when: the user gave constraints the picks can't honour (a specific genre, actor, provider, year, mood) — use smart_discover with hideWatched instead; or the user is a guest (returns an error).

Returns: picks [{id, mediaType, title, year, rating, genres, reason}], basis ("ok" taste-based | "cold_start" popular in their genres | "no_index" TMDB-based). Already excludes watched, watchlisted and rated titles.`,
  schema: RecommendForMeSchema,
});
