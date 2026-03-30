/**
 * OpenRouter Client Setup
 *
 * Configures the ChatOpenAI client for OpenRouter inference.
 * Default: Kimi K2.5 (moonshotai/kimi-k2.5)
 *
 * OpenRouter provides access to many models via an OpenAI-compatible API.
 * https://openrouter.ai/docs
 */

import { ChatOpenAI } from "@langchain/openai";

// Default model: Kimi K2.5 via OpenRouter
const DEFAULT_MODEL_ID = "moonshotai/kimi-k2.5";

/**
 * Create a ChatOpenAI instance configured for OpenRouter
 *
 * Environment variables:
 * - OPENROUTER_KEY (required)
 * - OPENROUTER_MODEL_ID (defaults to moonshotai/kimi-k2.5)
 */
export function createOpenRouterChat() {
  const apiKey = process.env.OPENROUTER_KEY;
  const modelId = process.env.OPENROUTER_MODEL_ID || DEFAULT_MODEL_ID;

  if (!apiKey) {
    throw new Error(
      "OpenRouter API key not configured. Set OPENROUTER_KEY in .env.local"
    );
  }

  return new ChatOpenAI({
    model: modelId,
    apiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000",
        "X-Title": "Movie Browser",
      },
    },
    // Budget for text + multiple [MOVIE:id:title|desc] tags + interactive tags
    maxTokens: 1536,
    temperature: 0.7,
  });
}

/**
 * Create a ChatOpenAI instance with tools bound
 */
export function createOpenRouterChatWithTools(
  tools: Parameters<ReturnType<typeof createOpenRouterChat>["bindTools"]>[0]
) {
  const model = createOpenRouterChat();
  return model.bindTools(tools);
}

/**
 * Get the currently configured OpenRouter model ID
 */
export function getOpenRouterModelId(): string {
  return process.env.OPENROUTER_MODEL_ID || DEFAULT_MODEL_ID;
}
