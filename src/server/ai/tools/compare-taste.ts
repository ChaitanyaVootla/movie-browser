/**
 * compare_taste — the signed-in user vs another member: taste match + both
 * sides' PUBLIC top genres/moods + optional common-ground picks.
 *
 * PRIVACY: PUBLIC scope on BOTH sides (taste-profile.md rule 1), gated by
 * `canViewTasteMatch` exactly like the profile match card: blocks/mutes, a
 * hidden taste profile or a private target always deny, and a mutual follow
 * never overrides the target's choice. On deny the agent must not speculate.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { canViewTasteMatch } from "@/lib/taste/compatibility";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { CommonGroundPickDTO } from "@/lib/taste/recommend-types";
import { fetchUserById, fetchUserByUsername, isMutualFollow } from "@/server/db/postgres/social/taste-recs";
import { getHiddenUserIds } from "@/server/db/postgres/social/blocks";
import { isAdultKeyword } from "@/server/db/postgres/social/taste";
import { getCommonGroundPicks, getTasteMatchFor } from "@/server/services/taste/match";
import { getTasteProfile } from "@/server/services/taste";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";

export const CompareTasteSchema = z.object({
  username: z.string().trim().min(1).max(40).describe("The other member's username (as on /u/<username>)"),
  picks: z
    .boolean()
    .optional()
    .describe("true → also return titles both would likely enjoy (\"find something for both of us\")"),
  limit: z.number().int().min(1).max(8).default(6).describe("How many picks (1-8). Default 6."),
});

const NOT_AVAILABLE = {
  error: "not_available",
  hint: "Taste comparison isn't available with this member. Do not speculate why. Suggest they ask the other person to share their ratings, or recommend for the user alone.",
} as const;

function sideSummary(s: TasteSnapshot | null) {
  const labels = (xs: ReadonlyArray<{ label: string }> | undefined) =>
    (xs ?? []).map((x) => x.label).filter((l) => !isAdultKeyword(l)).slice(0, 3);
  return { topGenres: labels(s?.facets.genre), topMoods: labels(s?.moods) };
}

function pickReason(p: CommonGroundPickDTO): string | null {
  if (p.viewerAnchor && p.targetAnchor) {
    return `close to both of your favourites: ${p.viewerAnchor.title} (you), ${p.targetAnchor.title} (them)`;
  }
  if (p.viewerAnchor) return `close to ${p.viewerAnchor.title} (you)`;
  if (p.targetAnchor) return `close to ${p.targetAnchor.title} (them)`;
  return null;
}

export async function compareTasteHandler(
  input: z.infer<typeof CompareTasteSchema>,
  config?: RunnableConfig
): Promise<string> {
  const viewerId = getUserIdFromConfig(config);
  if (!viewerId) {
    return JSON.stringify({ error: "Not logged in", hint: "Comparing taste needs an account." });
  }
  try {
    const username = input.username.replace(/^@/, "");
    const [target, viewer] = await Promise.all([fetchUserByUsername(username), fetchUserById(viewerId)]);
    if (!target || !viewer) return JSON.stringify(NOT_AVAILABLE);
    if (target.id === viewer.id) {
      return JSON.stringify({ error: "self", hint: "That's the user themselves — use get_taste_detail instead." });
    }
    const [hidden, mutualFollow] = await Promise.all([getHiddenUserIds(viewerId), isMutualFollow(viewerId, target.id)]);
    const gate = canViewTasteMatch({
      viewerId,
      targetId: target.id,
      hidden: hidden.has(target.id),
      viewerPublic: viewer.isPublic,
      targetPublic: target.isPublic,
      targetShowsTaste: target.showTaste,
      mutualFollow,
    });
    if (gate !== "allow") return JSON.stringify(NOT_AVAILABLE);

    const [match, you, them, picks] = await Promise.all([
      getTasteMatchFor(viewerId, target.username ?? username),
      getTasteProfile(viewerId, { scope: "public" }),
      getTasteProfile(target.id, { scope: "public" }),
      input.picks ? getCommonGroundPicks(viewerId, target.id, input.limit) : Promise.resolve(null),
    ]);
    const firstName = (target.name?.trim() || target.username || username).split(/\s+/)[0];
    return JSON.stringify({
      them: { username: target.username ?? username, firstName, ...sideSummary(them) },
      you: sideSummary(you),
      // null = not enough shared ratings yet for a score.
      match,
      ...(picks
        ? {
            picks: picks.map((p) => ({
              id: p.id,
              mediaType: p.mediaType,
              title: p.title,
              year: p.year,
              reason: pickReason(p),
            })),
          }
        : {}),
      note: "Public data only. match.score is 0-100. Talk about titles and shared favourites, never label either person. Use pick ids exactly.",
    });
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "compare_taste",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to compare taste" });
  }
}

export const compareTasteTool = tool(compareTasteHandler, {
  name: "compare_taste",
  description: `Compare the signed-in user's taste with another member (by username): match score 0-100 with its components, shared favourites, titles they disagree on, each side's top public genres/moods, and with picks: true, titles both would likely enjoy (each with a reason).

Use when: "{name} and I", "how does my taste compare to {username}?", "find something {name} and I would both enjoy", "movie night with {username}". Use picks: true when they want something to watch together.
Don't use when: the user is a guest (returns an error); the other person isn't a member here; they only want picks for themselves (recommend_for_me).

On { error: "not_available" }: do not guess why — suggest they ask the other person to share ratings. Uses public data only, for both people.`,
  schema: CompareTasteSchema,
});
