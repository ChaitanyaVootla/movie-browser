/**
 * AWS Bedrock Client Setup
 *
 * Configures the ChatBedrockConverse client for LLM inference.
 * Default: Amazon Nova Pro via APAC cross-region inference profile.
 *
 * IMPORTANT: Requires model access enabled in AWS Bedrock console.
 * See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
 */

import { ChatBedrockConverse } from "@langchain/aws";

// Amazon Nova Pro with APAC cross-region inference profile
// See: https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html
// Note: Kimi K2 (moonshot.kimi-k2-thinking) has non-standard tool calling that outputs
// tool calls as text instead of structured API calls. Use Nova Pro for proper tool support.
const DEFAULT_MODEL_ID = "moonshot.kimi-k2-thinking";

// Source region for APAC inference profile
const DEFAULT_REGION = "ap-south-1";

/**
 * Create a ChatBedrockConverse instance for the movie agent
 *
 * Environment variables:
 * - AWS_ACCESS_KEY_ID (required)
 * - AWS_SECRET_ACCESS_KEY (required)
 * - BEDROCK_REGION (defaults to ap-south-1)
 * - BEDROCK_MODEL_ID (defaults to apac.amazon.nova-pro-v1:0)
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

