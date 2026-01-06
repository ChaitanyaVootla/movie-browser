/**
 * AWS Bedrock Client Setup
 *
 * Configures the ChatBedrockConverse client for LLM inference.
 * Default: Kimi K2 Thinking model in us-east-1 region.
 *
 * IMPORTANT: Requires model access enabled in AWS Bedrock console.
 * See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
 */

import { ChatBedrockConverse } from "@langchain/aws";

// Default model: Kimi K2 Thinking (reasoning model from Moonshot AI)
// Note: Kimi K2 has non-standard tool calling that outputs tool calls as text
// instead of structured API calls. This is handled in shouldContinue() in agent.ts.
const DEFAULT_MODEL_ID = "moonshot.kimi-k2-thinking";

// IMPORTANT: Kimi K2 is only available in us-east-1 (not ap-south-1)
// Nova Pro uses APAC cross-region profile (apac.amazon.nova-pro-v1:0) in ap-south-1
const DEFAULT_REGION = "us-east-1";

/**
 * Create a ChatBedrockConverse instance for the movie agent
 *
 * Environment variables:
 * - AWS_ACCESS_KEY_ID (required)
 * - AWS_SECRET_ACCESS_KEY (required)
 * - BEDROCK_REGION (defaults to us-east-1 for Kimi K2)
 * - BEDROCK_MODEL_ID (defaults to moonshot.kimi-k2-thinking)
 */
export function createBedrockChat() {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
  // Use BEDROCK_REGION, AWS_REGION, or default
  const region = process.env.BEDROCK_REGION || DEFAULT_REGION;

  // Validate required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local"
    );
  }

  return new ChatBedrockConverse({
    model: modelId,
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // Optimize for conversational responses
    maxTokens: 1024,
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

