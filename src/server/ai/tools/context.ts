/**
 * Page Context Tool
 *
 * Provides context about the current page the user is viewing.
 * This enables contextual recommendations based on what they're looking at.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";

// =============================================================================
// Types
// =============================================================================

export interface PageContext {
  path: string;
  mediaType?: "movie" | "series" | "person";
  itemId?: number;
  itemTitle?: string;
}

// =============================================================================
// Tool Definition
// =============================================================================

const pageContextSchema = z.object({});

/**
 * Get information about the current page the user is viewing.
 * This is populated by the client and injected via config.
 */
export const getPageContextTool = tool(
  async (_input: z.infer<typeof pageContextSchema>, config?: RunnableConfig) => {
    const pageContext = config?.configurable?.pageContext as PageContext | undefined;

    if (!pageContext || !pageContext.path) {
      return JSON.stringify({
        page: "unknown",
        context: null,
        hint: "Page context not available. Ask user what they're looking at or use search.",
      });
    }

    // Parse the path to extract meaningful info
    const pathParts = pageContext.path.split("/").filter(Boolean);
    const pageType = pathParts[0] || "home";

    // Build response based on page type
    const response: Record<string, unknown> = {
      page: pageType,
      path: pageContext.path,
    };

    if (pageContext.mediaType && pageContext.itemId) {
      response.currentItem = {
        type: pageContext.mediaType,
        id: pageContext.itemId,
        title: pageContext.itemTitle || null,
      };
      // If title is available, include it. Otherwise, tell agent they have the ID and can proceed.
      if (pageContext.itemTitle) {
        response.hint = `User is viewing "${pageContext.itemTitle}" (${pageContext.mediaType}). ID: ${pageContext.itemId}.`;
      } else {
        response.hint = `User is on a ${pageContext.mediaType} page. ID: ${pageContext.itemId}. You can use this ID directly with get_details or in tags like [MOVIE:${pageContext.itemId}:Title].`;
      }
    } else if (pageType === "browse") {
      response.hint = "User is browsing with filters. Ask what they're looking for.";
    } else if (pageType === "watchlist") {
      response.hint = "On their watchlist. Use get_user_data(include: ['watchlist']) to see it.";
    } else if (pageType === "ratings") {
      response.hint = "Viewing their ratings. Use get_user_data(include: ['ratings']) to see them.";
    } else if (pageType === "watched") {
      response.hint = "Viewing watched history. Use get_user_data(include: ['watched']) to see it.";
    } else {
      response.hint = `On the ${pageType || "home"} page.`;
    }

    return JSON.stringify(response);
  },
  {
    name: "get_page_context",
    description: `Understand what page the user is currently viewing.

CALL THIS when user says:
- "this movie", "this show", "the one I'm looking at"
- "more like this", "similar to this"
- "what about this one"
- Any implicit reference to current context

Returns: page type, current item (id, title, type) if on a detail page.
If they're on a movie/series page, you'll get the ID to use with get_details.`,
    schema: pageContextSchema,
  }
);
