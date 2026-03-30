/**
 * Shared utilities for the AI agent
 */

import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * Parse a Google sub string to numeric userId.
 * Used by tools that need to access user-specific data.
 */
export function parseGoogleSubToUserId(sub: string | undefined | null): number | null {
  if (!sub) return null;
  const parsed = parseInt(sub, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract numeric userId from LangGraph RunnableConfig.
 * The userId is injected into config.configurable by toolNodeWithContext.
 */
export function getUserIdFromConfig(config?: RunnableConfig): number | null {
  const userId = config?.configurable?.userId as string | undefined;
  return parseGoogleSubToUserId(userId);
}
