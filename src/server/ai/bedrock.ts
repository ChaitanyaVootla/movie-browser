/**
 * AWS Bedrock Client Setup
 *
 * Configures the ChatBedrockConverse client for LLM inference.
 * Default: Kimi K2.5 model in ap-south-1 (Mumbai) region.
 *
 * IMPORTANT: Requires model access enabled in AWS Bedrock console.
 * See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k2-5.html
 */

import { ChatBedrockConverse } from "@langchain/aws";

// Default model: Kimi K2.5 (multimodal model from Moonshot AI)
// Supports Converse API, tool calling, and native image understanding.
const DEFAULT_MODEL_ID = "moonshotai.kimi-k2.5";

// Kimi K2.5 is available in ap-south-1 (Mumbai) — closest to Hyderabad EC2
const DEFAULT_REGION = "ap-south-1";

/**
 * Create a ChatBedrockConverse instance for the movie agent
 *
 * Environment variables:
 * - AWS_ACCESS_KEY_ID (optional — omit on EC2 to use instance profile)
 * - AWS_SECRET_ACCESS_KEY (optional — omit on EC2 to use instance profile)
 * - BEDROCK_REGION (defaults to ap-south-1 for Kimi K2.5)
 * - BEDROCK_MODEL_ID (defaults to moonshotai.kimi-k2.5)
 */
export function createBedrockChat() {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
  const region = process.env.BEDROCK_REGION || DEFAULT_REGION;

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

  return new ChatBedrockConverse({
    model: modelId,
    region,
    ...(credentials && { credentials }),
    // Budget for text + multiple [MOVIE:id:title|desc] tags + interactive tags
    maxTokens: 1536,
    temperature: 0.7,
  });
}

/**
 * Create a ChatBedrockConverse instance with tools bound
 */
export function createBedrockChatWithTools(
  tools: Parameters<ReturnType<typeof createBedrockChat>["bindTools"]>[0]
) {
  const model = createBedrockChat();
  return model.bindTools(tools);
}
