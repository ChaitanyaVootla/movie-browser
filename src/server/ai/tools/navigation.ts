/**
 * Navigation Tool
 *
 * Returns navigation intent for client-side routing.
 * Covers every user-facing surface: detail pages, discussions, discovery,
 * search results, and the user's own pages (watchlist, diary, stats, ...).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Destinations that require a TMDB id
const ID_REQUIRED = new Set(["movie", "series", "person", "movie_discussions", "series_discussions"]);

// User-specific pages (only meaningful when logged in)
const USER_PAGES: Record<string, string> = {
  watchlist: "/watchlist",
  diary: "/diary",
  stats: "/stats",
  library: "/library",
  lists: "/lists",
  ratings: "/ratings",
  watched: "/watched",
  notifications: "/notifications",
  settings: "/settings",
};

const navigationSchema = z.object({
  type: z
    .enum([
      // Detail pages (id required)
      "movie",
      "series",
      "person",
      // Per-title discussion pages (id required)
      "movie_discussions",
      "series_discussions",
      // Discovery & site pages
      "home",
      "browse",
      "topics", // topics index
      "topic", // a specific topic page (key required)
      "search", // search results page (query required)
      "discussions", // cross-site discussions hub
      // User pages (logged-in users)
      "watchlist",
      "diary",
      "stats",
      "library",
      "lists",
      "ratings",
      "watched",
      "notifications",
      "settings",
      // Public member profile (username required)
      "profile",
    ])
    .describe("Destination page type"),
  id: z
    .number()
    .optional()
    .describe("TMDB id — REQUIRED for movie/series/person/*_discussions. Get it from search or smart_discover first."),
  query: z.string().optional().describe("Search text — REQUIRED for type 'search'"),
  key: z
    .string()
    .optional()
    .describe("Topic key/slug — REQUIRED for type 'topic' (e.g. 'mind-bending', 'feel-good')"),
  username: z.string().optional().describe("Member username — REQUIRED for type 'profile'"),
});

type NavigationInput = z.infer<typeof navigationSchema>;

/**
 * Build the app path for a navigation intent.
 * Shared by the tool (result payload) and extractNavigation in agent.ts —
 * keep path logic in ONE place.
 */
export function buildNavigationPath(input: {
  type: string;
  id?: number;
  query?: string;
  key?: string;
  username?: string;
}): { path: string } | { error: string } {
  if (ID_REQUIRED.has(input.type) && !input.id) {
    return { error: `${input.type} navigation requires an id — use search or smart_discover to find it first` };
  }

  switch (input.type) {
    case "movie":
      return { path: `/movie/${input.id}` };
    case "series":
      return { path: `/series/${input.id}` };
    case "person":
      return { path: `/person/${input.id}` };
    case "movie_discussions":
      return { path: `/movie/${input.id}/discussions` };
    case "series_discussions":
      return { path: `/series/${input.id}/discussions` };
    case "home":
      return { path: "/" };
    case "browse":
      return { path: "/browse" };
    case "topics":
      return { path: "/topics" };
    case "topic":
      if (!input.key) return { error: "topic navigation requires a key (topic slug)" };
      return { path: `/topics/${encodeURIComponent(input.key)}` };
    case "search":
      if (!input.query?.trim()) return { error: "search navigation requires a query" };
      return { path: `/search?q=${encodeURIComponent(input.query.trim())}` };
    case "discussions":
      return { path: "/discussions" };
    case "profile":
      if (!input.username?.trim()) return { error: "profile navigation requires a username" };
      return { path: `/u/${encodeURIComponent(input.username.trim())}` };
    default: {
      const userPath = USER_PAGES[input.type];
      if (userPath) return { path: userPath };
      return { path: "/" };
    }
  }
}

/**
 * Navigate to a page in the app
 *
 * Note: This tool doesn't actually navigate - it returns a navigation intent
 * that the client will handle after receiving the response.
 */
export const navigateTool = tool(
  async (input: NavigationInput) => {
    const built = buildNavigationPath(input);

    if ("error" in built) {
      return JSON.stringify({ error: built.error });
    }

    return JSON.stringify({
      action: "navigate",
      path: built.path,
      id: input.id,
      type: input.type,
      message: `Navigating to ${built.path}`,
    });
  },
  {
    name: "navigate_to",
    description: `Navigate the user to any page in the app.

Use when: User explicitly asks to GO somewhere — "take me to Inception", "open my watchlist", "show me my stats", "go to the discussions", "search for heist movies" (as a page, not a chat answer).
Don't use when: User just asks ABOUT something — "tell me about Inception" (use get_details), "recommend thrillers" (use smart_discover).

Destinations:
- Detail pages: movie / series / person (id REQUIRED — call search or smart_discover first if you only have a name)
- Per-title discussion boards: movie_discussions / series_discussions (id REQUIRED)
- Site pages: home, browse, topics (index), topic (needs key), search (needs query — full results page), discussions (community hub)
- User pages (logged-in only): watchlist, diary, stats, library, lists, ratings, watched, notifications, settings
- Member profiles: profile (needs username)

This returns a navigation intent — the user confirms with one tap; the client routes.
Always tell the user where you're sending them in your text response.`,
    schema: navigationSchema,
  }
);
