/**
 * AI Provider Abstraction
 *
 * Allows switching between different LLM providers (Bedrock, OpenRouter)
 * via the AI_PROVIDER environment variable.
 *
 * Providers:
 * - "bedrock": AWS Bedrock with Kimi K2 Thinking
 * - "openrouter" (default): OpenRouter with Kimi K2.5
 *
 * Environment variables:
 * - AI_PROVIDER: "bedrock" | "openrouter" (defaults to "openrouter")
 *
 * Provider-specific config:
 * - Bedrock: BEDROCK_MODEL_ID, BEDROCK_REGION, AWS credentials
 * - OpenRouter: OPENROUTER_KEY, OPENROUTER_MODEL_ID
 */

import { createBedrockChat } from "./bedrock";
import { createOpenRouterChat, getOpenRouterModelId } from "./openrouter";

export type AIProvider = "bedrock" | "openrouter";

/**
 * Get the currently configured AI provider
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "bedrock") return "bedrock";
  // Default to openrouter since that's what we're switching to
  return "openrouter";
}

/**
 * Create a chat model instance based on the configured provider
 * Returns a model that supports bindTools()
 */
export function createChatModel() {
  const provider = getAIProvider();

  switch (provider) {
    case "bedrock":
      return createBedrockChat();
    case "openrouter":
      return createOpenRouterChat();
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = provider;
      throw new Error(`Unknown AI provider: ${_exhaustive}`);
  }
}

/**
 * Get the currently configured model ID (for pricing/logging)
 */
export function getCurrentModelId(): string {
  const provider = getAIProvider();

  switch (provider) {
    case "bedrock":
      return process.env.BEDROCK_MODEL_ID || "moonshot.kimi-k2-thinking";
    case "openrouter":
      return getOpenRouterModelId();
    default:
      return "unknown";
  }
}
