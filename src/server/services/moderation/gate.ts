/**
 * AI moderation gate: async gate(text) -> { status, aiLabels } via the
 * existing Bedrock Flex helper (same model/pricing path as progressive
 * enrichment). Reviews are the first consumer (phase 0); comments scale it
 * in phase 1.
 *
 * Failure mode: PENDING_REVIEW (fail-open). NEVER silent-publish.
 */
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { dataLogger } from "@/lib/logger";
import {
  decideStatus,
  parseGateOutput,
  type GateOutput,
  type GateStatus,
} from "./gate-policy";

export interface GateContext {
  title?: string;
  mediaType?: "movie" | "series";
}

export interface GateResult {
  status: GateStatus;
  /** Raw classification retained for audit (stored in aiLabels Json). */
  aiLabels: GateOutput | null;
}

const SYSTEM_PROMPT = `You are a content-moderation classifier for a movie/TV discussion site.
Classify the user text. Respond with ONLY minified JSON, no commentary:
{"toxicity":<number 0..1>,"labels":[<short reason tags>],"spoiler":{"scope":"NONE"|"WATCHED"|"EPISODE"|"ENDING","season":<int or null>,"episode":<int or null>}}
toxicity measures hate speech, harassment, threats, sexual content involving minors, or doxxing. Profanity alone or negative opinions about the work are NOT toxic.
spoiler.scope: NONE = safe for someone who has not watched; WATCHED = reveals plot; EPISODE = reveals events up to a specific episode (set season/episode); ENDING = reveals how it ends.
Classify the CONTENT only. Never characterize the author.`;

const MAX_INPUT_CHARS = 6000;

export async function gateText(text: string, context: GateContext = {}): Promise<GateResult> {
  try {
    const result = await callBedrockFlex({
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          text: `Title: ${context.title ?? "unknown"} (${context.mediaType ?? "unknown"})\n---\n${text.slice(0, MAX_INPUT_CHARS)}`,
        },
      ],
      maxTokens: 200,
      temperature: 0,
      useFlex: true,
    });
    const parsed = parseGateOutput(result.output);
    if (parsed === null) {
      dataLogger.warn({ service: "moderation-gate", event: "gate.parse-failed" });
    }
    return { status: decideStatus(parsed?.toxicity), aiLabels: parsed };
  } catch (error: unknown) {
    dataLogger.error({
      service: "moderation-gate",
      event: "gate.error",
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "PENDING_REVIEW", aiLabels: null };
  }
}
