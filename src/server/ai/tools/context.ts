/**
 * Page Context Tool
 *
 * Provides context about the current page the user is viewing.
 * Includes media metadata (genres, rating, year) and user status (watched, watchlisted, rated).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { getUserItemStatus } from "@/server/db/user-data";
import { getUserIdFromConfig } from "../utils";
import type { PageContext } from "../state";

export type { PageContext };

// =============================================================================
// Tool Definition
// =============================================================================

const pageContextSchema = z
  .object({})
  .describe("No parameters needed — page context is automatically injected from the user's current page.");

/**
 * Get information about the current page the user is viewing.
 * Includes media metadata and user status for the current item.
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
      const item: Record<string, unknown> = {
        type: pageContext.mediaType,
        id: pageContext.itemId,
        title: pageContext.itemTitle || null,
      };

      // Include media metadata from frontend if available
      if (pageContext.genres?.length) item.genres = pageContext.genres;
      if (pageContext.rating) item.rating = pageContext.rating;
      if (pageContext.year) item.year = pageContext.year;
      if (pageContext.status) item.status = pageContext.status;

      response.currentItem = item;

      // Fetch user status if logged in
      const userId = getUserIdFromConfig(config);
      if (userId && (pageContext.mediaType === "movie" || pageContext.mediaType === "series")) {
        const userStatus = await getUserItemStatus(userId, pageContext.itemId, pageContext.mediaType);
        response.userStatus = {
          isWatched: userStatus.isWatched,
          inWatchlist: userStatus.inWatchlist,
          userRating: userStatus.userRating,
        };
      }

      // Build a rich hint
      const parts: string[] = [];
      if (pageContext.itemTitle) {
        parts.push(`User is viewing "${pageContext.itemTitle}" (${pageContext.mediaType})`);
      } else {
        parts.push(`User is on a ${pageContext.mediaType} page`);
      }
      parts.push(`ID: ${pageContext.itemId}`);
      if (pageContext.genres?.length) parts.push(`Genres: ${pageContext.genres.join(", ")}`);
      if (pageContext.rating) parts.push(`Rating: ${pageContext.rating}/10`);

      response.hint = parts.join(". ") + ".";
    } else if (pageType === "browse") {
      response.hint = "User is browsing with filters. Ask what they're looking for.";
    } else if (pageType === "watchlist") {
      response.hint =
        "On their watchlist page. Use smart_discover({ fromWatchlist: true }) to see their saved items with full details.";
    } else if (pageType === "ratings") {
      response.hint =
        "Viewing their ratings page. You can suggest content based on what they've rated highly.";
    } else if (pageType === "watched") {
      response.hint =
        "Viewing their watched history. You can suggest similar content or use smart_discover with hideWatched: true to find fresh picks.";
    } else if (pageType === "library") {
      response.hint =
        "On their library page (watchlist + watched + ratings in one place). Use get_user_profile for their taste, or smart_discover({ fromWatchlist: true }) for saved items.";
    } else if (pageType === "diary") {
      response.hint =
        "On their watch diary. Use get_user_profile for recent watches — good moment for 'what next' recommendations.";
    } else if (pageType === "stats") {
      response.hint =
        "Viewing their watch stats. Use get_user_profile to talk about their taste (top genres, counts).";
    } else if (pageType === "discussions") {
      response.hint =
        "On the community discussions hub. They're in a social mood — get_community_buzz on titles works well here.";
    } else if (pageType === "u") {
      const username = pathParts[1];
      response.hint = username
        ? `Viewing ${username}'s public profile. You can discuss that member's public reviews/lists or find similar titles.`
        : "Viewing a member profile.";
    } else if (pageType === "topics") {
      const topicKey = pathParts[1];
      response.hint = topicKey
        ? `Browsing the "${topicKey}" topic. Use smart_discover with a matching semanticQuery for more of this vibe.`
        : "Browsing the topics index. Ask what mood they're in.";
    } else if (pageType === "search") {
      response.hint =
        "On the search results page. They're hunting for something specific — offer to refine with smart_discover.";
    } else {
      response.hint = `On the ${pageType || "home"} page.`;
    }

    return JSON.stringify(response);
  },
  {
    name: "get_page_context",
    description: `Understand what page the user is currently viewing, including their relationship with it.

CALL THIS when user says:
- "this movie", "this show", "the one I'm looking at"
- "more like this", "similar to this"
- "what about this one"
- Any implicit reference to current context

Returns: page type, current item (id, title, type, genres, rating), and user status (watched, watchlisted, rating).
Use the returned context to tailor your response — acknowledge if they've seen it, reference their rating, etc.`,
    schema: pageContextSchema,
  }
);
