/**
 * Shared utilities for the AI agent
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import type { UserContext } from "./state";

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

/**
 * Extract userContext from LangGraph RunnableConfig.
 * Injected by toolNodeWithContext — contains name, region, timezone, currentTime.
 */
export function getUserContextFromConfig(config?: RunnableConfig): UserContext | null {
  return (config?.configurable?.userContext as UserContext | undefined) ?? null;
}

/**
 * Extract user's region from config, defaulting to "US".
 */
export function getRegionFromConfig(config?: RunnableConfig): string {
  const ctx = getUserContextFromConfig(config);
  return ctx?.region || "US";
}
