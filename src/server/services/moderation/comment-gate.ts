/**
 * AI gate for comment submission (spec §5): toxicity + spoiler-scope
 * suggestion, user-adjustable pre-publish. aiLabels retained for audit.
 * Fable rule: classifies content, never characterizes users.
 */
import { z } from "zod";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { dataLogger } from "@/lib/logger";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";

export interface CommentGateInput {
  body: string;
  title: string;
  mediaType: "movie" | "series";
  /** thread position, so EPISODE suggestions default sensibly */
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export interface CommentGateResult {
  toxicity: "ok" | "flagged";
  toxicityReason: string | null;
  suggestedScope: SpoilerScopeValue;
  suggestedSeason: number | null;
  suggestedEpisode: number | null;
}

const GateResponseSchema = z.object({
  toxicity: z.enum(["ok", "flagged"]),
  toxicity_reason: z.string().nullable().optional(),
  spoiler_scope: z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]),
  scope_season: z.number().int().nullable().optional(),
  scope_episode: z.number().int().nullable().optional(),
});

const SYSTEM_PROMPT = `You are a content classifier for a movie/TV discussion board. Classify the COMMENT and respond with ONLY a JSON object, no prose:
{"toxicity":"ok"|"flagged","toxicity_reason":string|null,"spoiler_scope":"NONE"|"WATCHED"|"EPISODE"|"ENDING","scope_season":number|null,"scope_episode":number|null}

Rules:
- toxicity "flagged" = harassment, hate speech, slurs, sexualized minors, doxxing, credible threats, or spam/advertising. Strong negative opinions about the movie/show are "ok".
- spoiler_scope describes what the comment REVEALS about the title:
  "NONE" = safe for someone who has not watched anything.
  "EPISODE" = reveals events up to a specific episode of a series (always set scope_season and scope_episode).
  "WATCHED" = reveals movie plot, or assumes the whole series has been seen.
  "ENDING" = reveals how the story ends.
- Classify the content only. Never judge, profile, or characterize the comment's author.`;

/** Pure, exported for tests: parse + validate the LLM output. */
export function parseGateResponse(output: string): CommentGateResult | null {
  const stripped = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = GateResponseSchema.parse(JSON.parse(stripped));
    return {
      toxicity: parsed.toxicity,
      toxicityReason: parsed.toxicity_reason ?? null,
      suggestedScope: parsed.spoiler_scope,
      suggestedSeason: parsed.scope_season ?? null,
      suggestedEpisode: parsed.scope_episode ?? null,
    };
  } catch {
    return null;
  }
}

const GATE_TIMEOUT_MS = 8_000;

/** null = gate unavailable (timeout/parse/LLM error) → caller stores PENDING_REVIEW. */
export async function runCommentGate(input: CommentGateInput): Promise<CommentGateResult | null> {
  const threadContext =
    input.mediaType === "movie"
      ? "movie discussion"
      : input.seasonNumber !== null && input.episodeNumber !== null
        ? `episode thread for S${input.seasonNumber}E${input.episodeNumber}`
        : "series-level discussion";
  const userText = `TITLE: ${input.title} (${input.mediaType})\nTHREAD: ${threadContext}\nCOMMENT:\n${input.body}`;
  try {
    const result = await Promise.race([
      callBedrockFlex({
        messages: [{ role: "user", text: userText }],
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 150,
        temperature: 0,
        useFlex: false, // interactive submit — latency matters, cost is ~1e-4 USD
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("comment gate timeout")), GATE_TIMEOUT_MS)
      ),
    ]);
    const parsed = parseGateResponse(result.output);
    if (!parsed) {
      dataLogger.warn({ action: "commentGate", output: result.output.slice(0, 200) }, "unparseable gate output");
    }
    return parsed;
  } catch (error: unknown) {
    dataLogger.error(
      { action: "commentGate", error: error instanceof Error ? error.message : String(error) },
      "comment gate failed"
    );
    return null;
  }
}
