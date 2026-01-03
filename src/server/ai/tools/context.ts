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
        message: "User's current page is not available. Ask them what they're looking at.",
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
        title: pageContext.itemTitle || "Unknown",
      };
      response.context = `User is viewing a ${pageContext.mediaType} detail page: "${pageContext.itemTitle || "Unknown"}"`;
    } else if (pageType === "browse") {
      response.context = "User is browsing movies/series with filters";
    } else if (pageType === "topics") {
      response.context = "User is exploring curated topic collections";
    } else if (pageType === "watchlist") {
      response.context = "User is viewing their watchlist";
    } else if (pageType === "ratings") {
      response.context = "User is viewing their ratings (likes/dislikes)";
    } else if (pageType === "watched") {
      response.context = "User is viewing their watched movies";
    } else if (pageType === "" || pageType === "home") {
      response.context = "User is on the homepage";
    } else {
      response.context = `User is on the ${pageType} page`;
    }

    return JSON.stringify(response);
  },
  {
    name: "get_page_context",
    description: `Get information about the current page the user is viewing.
Use this to provide contextually relevant recommendations.

Examples:
- If they're on a movie page, you can suggest similar movies
- If they're browsing, you can ask about their current filters
- If they're on their watchlist, you can help them choose what to watch

Returns the page type, current item (if on a detail page), and helpful context.`,
    schema: pageContextSchema,
  }
);

