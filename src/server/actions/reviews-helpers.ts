// Pure review helpers — NO "use server" (a server-action module may only export
// async functions, so these synchronous helpers must live outside reviews.ts).
// Imported by reviews.ts, the composer UI, and unit tests.

import { isStricterScope } from "@/server/services/discussion/spoiler-gate";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";
import type { GateOutput } from "@/server/services/moderation/gate-policy";

/**
 * Half-star rating (0.5–5) → canonical 1–10 score. null/0/undefined = unrated
 * (the user abstains from scoring). Callers that already hold an integer 1–10
 * `score` should pass it straight through — this helper is only the star→score
 * conversion the composer header does.
 */
export function starsToScore(stars: number | null | undefined): number | null {
  return stars && stars > 0 ? Math.round(stars * 2) : null;
}

/**
 * Resolve the final spoiler scope: start from the user's chosen scope, and adopt
 * the AI-suggested scope ONLY when it is strictly stricter (never weaker — we
 * never down-grade a user who chose to over-warn). Mirrors the comment flow.
 */
export function resolveReviewScope(
  chosen: SpoilerScopeValue,
  chosenSeason: number | null,
  chosenEpisode: number | null,
  aiSpoiler: GateOutput["spoiler"] | undefined
): { scope: SpoilerScopeValue; season: number | null; episode: number | null } {
  if (
    aiSpoiler &&
    isStricterScope(
      aiSpoiler.scope,
      aiSpoiler.season ?? null,
      aiSpoiler.episode ?? null,
      chosen,
      chosenSeason,
      chosenEpisode
    )
  ) {
    return {
      scope: aiSpoiler.scope,
      season: aiSpoiler.season ?? null,
      episode: aiSpoiler.episode ?? null,
    };
  }
  return { scope: chosen, season: chosenSeason, episode: chosenEpisode };
}
