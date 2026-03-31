/**
 * Bedrock Flex Tier Helper
 *
 * Shared helper for calling AWS Bedrock with optional Flex pricing (50% off).
 * Uses raw `BedrockRuntimeClient` + `ConverseCommand` since LangChain's
 * `@langchain/aws` does NOT expose the `serviceTier` field.
 *
 * Flex tier uses `serviceTier: { type: "flex" }` (NOT performanceConfig.latency
 * which is a separate latency optimization feature).
 *
 * Used by both the summarize script and the progressive enrichment service.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";

// =============================================================================
// Types
// =============================================================================

export interface BedrockFlexParams {
  /** Conversation messages (user/assistant turns) */
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  /** System prompt text */
  systemPrompt: string;
  /** Max tokens for response */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Whether to use Flex tier pricing (50% off, may have higher latency) */
  useFlex?: boolean;
  /** Model ID override (defaults to Kimi K2.5) */
  modelId?: string;
  /** Region override (defaults to ap-south-1) */
  region?: string;
}

export interface BedrockFlexResult {
  /** Generated text output */
  output: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MODEL_ID = "moonshotai.kimi-k2.5";
const DEFAULT_REGION = "ap-south-1";

// =============================================================================
// Client (lazy singleton per region)
// =============================================================================

const clientCache = new Map<string, BedrockRuntimeClient>();

function getClient(region: string): BedrockRuntimeClient {
  const existing = clientCache.get(region);
  if (existing) return existing;

  // If explicit credentials are set, use them (local dev).
  // Otherwise, omit — the AWS SDK resolves credentials from the
  // EC2 instance profile automatically.
  const credentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined;

  const client = new BedrockRuntimeClient({
    region,
    ...(credentials && { credentials }),
  });

  clientCache.set(region, client);
  return client;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Call Bedrock with optional Flex tier pricing.
 *
 * Uses raw `ConverseCommand` to support the `serviceTier` field which
 * LangChain's ChatBedrockConverse does not expose.
 */
export async function callBedrockFlex(
  params: BedrockFlexParams
): Promise<BedrockFlexResult> {
  const {
    messages,
    systemPrompt,
    maxTokens,
    temperature,
    modelId = DEFAULT_MODEL_ID,
    region = DEFAULT_REGION,
  } = params;

  const client = getClient(region);

  // Convert to Bedrock message format
  const bedrockMessages: Message[] = messages.map((msg) => ({
    role: msg.role,
    content: [{ text: msg.text }],
  }));

  const command = new ConverseCommand({
    modelId,
    messages: bedrockMessages,
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      maxTokens,
      temperature,
    },
    ...(params.useFlex && {
      serviceTier: {
        type: "flex",
      },
    }),
  });

  const response = await client.send(command);

  // Extract text from response
  const outputContent = response.output?.message?.content;
  let output = "";
  if (outputContent) {
    for (const block of outputContent) {
      if ("text" in block && block.text) {
        output += block.text;
      }
    }
  }

  return {
    output,
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
  };
}
