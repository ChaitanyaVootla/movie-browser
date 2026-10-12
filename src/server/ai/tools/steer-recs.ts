/**
 * steer_recs — re-rank the signed-in user's For-you picks with constraints
 * (shorter, darker, series only, older…) or ask for "more like X". The
 * constraint vocabulary is the CLOSED tune vocabulary of the home Tune bar
 * (lib/taste/recommend-types.ts TUNE_TOKENS + the user's own lifted g:/l:/m:
 * values), normalized through the shared converter (lib/taste/tune-tokens.ts).
 * The agent ends a reply that CHANGES the row with the returned `tuneTag`; the
 * chat renders it as a pill that applies the same tune to the home row.
 *
 * FULL scope, owner only. Calls the recs service (A's re-rank of the cached
 * pool / one ANN for a seed). No LLM, no embedding call.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { TasteSnapshot } from "@/lib/taste/profile";
import type { RecItemDTO, TuneParams } from "@/lib/taste/recommend-types";
import { tokensToTune, tuneToTokens } from "@/lib/taste/tune-tokens";
import { tuneValue } from "@/lib/taste/tune-filter";
import { getHomeRecsForUser, getMoreLikeThisForUser } from "@/server/services/taste/recommend";
import { getTasteProfile } from "@/server/services/taste";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";
import { toCueRec } from "./taste-summary";

export const SteerRecsSchema = z.object({
  media: z.enum(["movie", "series"]).optional().describe('Only movies or only series ("only series" → "series")'),
  maxRuntime: z.literal(100).optional().describe('100 = "shorter" / "under 100 minutes" (episode length for series)'),
  tone: z.enum(["light", "dark"]).optional().describe('"darker" → "dark", "lighter" / "something fun" → "light"'),
  era: z.enum(["classic", "recent"]).optional().describe('"older" / "classic" → "classic" (before 2000), "newer" → "recent" (2020+)'),
  genres: z.array(z.string().max(40)).max(3).optional().describe("Genre names from THEIR taste profile (others are ignored)"),
  languages: z.array(z.string().max(40)).max(3).optional().describe('Languages from their profile, name or ISO code ("Korean" / "ko")'),
  moods: z.array(z.string().max(60)).max(2).optional().describe("Moods/themes from their profile"),
  seedTitle: z
    .object({ mediaType: z.enum(["movie", "series"]), id: z.number().int().positive() })
    .optional()
    .describe('"More like X" — the seed title (id from a tool result)'),
  surprise: z.boolean().optional().describe('"surprise me" / "something different" → true'),
  limit: z.number().int().min(1).max(10).default(6).describe("How many picks (1-10). Default 6."),
});

type SteerInput = z.infer<typeof SteerRecsSchema>;

const norm = (s: string) => s.trim().toLowerCase();

/** A single prefixed token survives the shared converter (well-formed value). */
const tokenOk = (token: string) => tuneToTokens(tokensToTune([token])).length === 1;

/** Map the agent's free-text names onto the user's OWN lifted values; everything else is reported back. */
function resolveTune(input: SteerInput, snapshot: TasteSnapshot | null): { tune: TuneParams; ignored: string[] } {
  const ignored: string[] = [];
  const tune: TuneParams = {};
  if (input.media) tune.media = input.media;
  if (input.maxRuntime) tune.maxRuntime = input.maxRuntime;
  if (input.tone) tune.tone = input.tone;
  if (input.era) tune.era = input.era;

  const liftedGenres = snapshot?.facets.genre ?? [];
  for (const name of input.genres ?? []) {
    const hit = liftedGenres.find((f) => norm(f.label) === norm(name) || f.key === norm(name));
    // Same slug the home Tune bar chips use (`userTuneChips`): g:science-fiction.
    const v = hit ? tuneValue(hit.label) : "";
    if (v && tokenOk(`g:${v}`)) tune.genres = [...(tune.genres ?? []), v];
    else ignored.push(name);
  }

  const liftedLanguages = snapshot?.facets.language ?? [];
  for (const name of input.languages ?? []) {
    const hit = liftedLanguages.find((f) => norm(f.label) === norm(name) || norm(f.key) === norm(name));
    const v = hit ? tuneValue(hit.key) : "";
    if (v && tokenOk(`l:${v}`)) tune.languages = [...(tune.languages ?? []), v];
    else ignored.push(name);
  }

  const liftedMoods = snapshot?.moods ?? [];
  for (const name of input.moods ?? []) {
    const hit = liftedMoods.find((f) => norm(f.label) === norm(name) || f.key === norm(name));
    // tone:* moods are the `tone` param, not mood chips (mirrors userTuneChips).
    const v = hit && !hit.key.startsWith("tone:") ? tuneValue(hit.key) : "";
    if (v && tokenOk(`m:${v}`)) tune.moods = [...(tune.moods ?? []), v];
    else ignored.push(name);
  }

  // Round-trip through the ONE converter so only canonical values remain.
  return { tune: tokensToTune(tuneToTokens(tune)), ignored };
}

function dedupe(items: RecItemDTO[]): RecItemDTO[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = `${it.mediaType}:${it.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function steerRecsHandler(input: SteerInput, config?: RunnableConfig): Promise<string> {
  const userId = getUserIdFromConfig(config);
  if (!userId) {
    return JSON.stringify({
      error: "Not logged in",
      hint: "Steering personal picks needs an account. Use smart_discover with the same constraints instead.",
    });
  }
  try {
    const snapshot = await getTasteProfile(userId, { scope: "full" });
    const { tune, ignored } = resolveTune(input, snapshot);
    const tokens = tuneToTokens(tune);

    let items: RecItemDTO[];
    let basis: string;
    if (input.seedTitle) {
      const row = await getMoreLikeThisForUser(userId, input.seedTitle);
      items = row?.items ?? [];
      basis = "seed";
    } else {
      const recs = await getHomeRecsForUser(userId, tune, input.surprise ? { shuffle: Math.floor(Math.random() * 1e9) + 1 } : {});
      if (recs.reason === "error") return JSON.stringify({ error: "Failed to load recommendations" });
      const forYou = recs.rows.filter((r) => r.kind === "for_you");
      const rest = recs.rows.filter((r) => r.kind !== "for_you");
      items = dedupe([...forYou, ...rest].flatMap((r) => r.items));
      basis = recs.reason;
    }

    const picks = items.slice(0, input.limit).map(toCueRec);
    return JSON.stringify({
      picks,
      tune: tokens,
      tuneTag: tokens.length ? `[TUNE:${tokens.join(",")}]` : null,
      ...(ignored.length ? { ignored } : {}),
      basis,
      ...(picks.length === 0
        ? { hint: "Nothing survives these constraints in their picks — loosen one, or use smart_discover with forMe: true." }
        : {}),
      note: "Picks exclude everything they've watched, saved or rated. End the reply with tuneTag ONLY if they asked to change their For-you row. ignored = names that aren't part of their profile (use smart_discover for those).",
    });
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "steer_recs",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to steer recommendations" });
  }
}

export const steerRecsTool = tool(steerRecsHandler, {
  name: "steer_recs",
  description: `Re-rank the signed-in user's personal For-you picks with simple constraints, or get "more like X" from their taste. Constraints: media (movie | series), maxRuntime 100 (shorter), tone (light | dark), era (classic | recent), up to 3 genres / 3 languages / 2 moods FROM THEIR PROFILE, surprise (novelty), seedTitle (more like this).

Use when: they tweak their picks — "something shorter", "darker", "only series", "older stuff", "tune my picks", "more like X but for me", "surprise me" — signed in.
Don't use when: the user is a guest (returns an error); the constraint is outside this vocabulary (an actor, a provider, a specific year, a genre not in their profile) → smart_discover with forMe: true; the ask is open-ended with no constraint → recommend_for_me.

Returns: picks [{id, mediaType, title, year, rating, genres, reason}], tune (normalized tokens), tuneTag ("[TUNE:…]" or null), ignored, basis. If they asked to CHANGE their For-you row, end your reply with tuneTag exactly as given.`,
  schema: SteerRecsSchema,
});
