/**
 * Navigation Tool
 *
 * Returns navigation intent for client-side routing.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Schema for navigation
const navigationSchema = z.object({
  type: z
    .enum(["movie", "series", "person", "browse", "topics", "home"])
    .describe("Type of page to navigate to"),
  id: z.number().optional().describe("ID of the movie/series/person (required for detail pages)"),
});

type NavigationInput = z.infer<typeof navigationSchema>;

/**
 * Navigate to a page in the app
 *
 * Note: This tool doesn't actually navigate - it returns a navigation intent
 * that the client will handle after receiving the response.
 */
export const navigateTool = tool(
  async (input: NavigationInput) => {
    // Build the path based on type
    let path: string;

    switch (input.type) {
      case "movie":
        if (!input.id) {
          return JSON.stringify({ error: "Movie ID is required" });
        }
        path = `/movie/${input.id}`;
        break;

      case "series":
        if (!input.id) {
          return JSON.stringify({ error: "Series ID is required" });
        }
        path = `/series/${input.id}`;
        break;

      case "person":
        if (!input.id) {
          return JSON.stringify({ error: "Person ID is required" });
        }
        path = `/person/${input.id}`;
        break;

      case "browse":
        path = "/browse";
        break;

      case "topics":
        path = "/topics";
        break;

      case "home":
        path = "/";
        break;

      default:
        path = "/";
    }

    // Return navigation intent as JSON
    return JSON.stringify({
      action: "navigate",
      path,
      id: input.id,
      type: input.type,
      message: `Navigating to ${input.type}${input.id ? ` #${input.id}` : ""}`,
    });
  },
  {
    name: "navigate_to",
    description: `Take user to a detail page. Tell them where you're sending them!`,
    schema: navigationSchema,
  }
);
