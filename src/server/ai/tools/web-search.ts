/**
 * Web Search Tool
 *
 * Searches the live web via Tavily API for information that TMDB tools can't provide:
 * box office data, awards, reviews, industry news, events after the model's knowledge cutoff.
 *
 * Credit cost: 1 (basic) or 2 (advanced) per search.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { aiToolLogger } from "@/lib/logger";
import { tavilySearch, TavilyConfigError } from "./tavily-client";

const MAX_CONTENT_LENGTH = 200;
const MAX_RESULTS = 5;

const webSearchSchema = z.object({
  query: z.string().describe("Search query — be specific for best results"),
  searchDepth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe("'basic' (default, 1 credit) or 'advanced' (2 credits, deeper results). Use advanced sparingly."),
  topic: z
    .enum(["general", "news", "finance"])
    .optional()
    .describe("'general' (default), 'news' (for current events, awards, releases), 'finance' (box office)"),
  timeRange: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Limit results to this time range. Useful for 'latest' or 'recent' queries."),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Only search these domains (e.g., ['variety.com', 'deadline.com'])"),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe("Exclude these domains from results"),
});

type WebSearchInput = z.infer<typeof webSearchSchema>;

/**
 * Truncate content to a max length, appending ellipsis if truncated.
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trimEnd() + "...";
}

export const webSearchTool = tool(
  async (input: WebSearchInput) => {
    try {
      const response = await tavilySearch({
        query: input.query,
        searchDepth: input.searchDepth ?? "basic",
        topic: input.topic ?? "general",
        timeRange: input.timeRange,
        includeDomains: input.includeDomains,
        excludeDomains: input.excludeDomains,
      });

      // Format results for the LLM — truncate content to save tokens
      const results = (response.results || []).slice(0, MAX_RESULTS).map((r) => ({
        title: r.title,
        url: r.url,
        content: truncateContent(r.content || "", MAX_CONTENT_LENGTH),
        score: r.score,
        favicon: r.favicon,
      }));

      return JSON.stringify({
        query: input.query,
        answer: response.answer || null,
        resultCount: results.length,
        results,
        images: (response.images || []).slice(0, 5),
      });
    } catch (error: unknown) {
      if (error instanceof TavilyConfigError) {
        return JSON.stringify({
          error: error.message,
          query: input.query,
          results: [],
        });
      }

      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate limit");

      aiToolLogger.error({
        event: "tool_error",
        tool: "web_search",
        query: input.query,
        error: message,
      });

      return JSON.stringify({
        error: isRateLimit
          ? "Web search rate limit reached. Try again later or use TMDB tools instead."
          : "Web search failed. Try rephrasing your query or using TMDB tools.",
        query: input.query,
        results: [],
      });
    }
  },
  {
    name: "web_search",
    description: `Search the live web for information not available in TMDB.

Use when: Box office numbers, awards results, critical reviews, industry news, events after June 2025, cast/crew news, behind-the-scenes content, real-world context.
Don't use when: Movie/TV discovery, ratings, streaming availability, trending, upcoming — use TMDB tools instead (they're faster and free).

IMPORTANT: Default to basic searchDepth (1 credit). Only use advanced for complex queries needing deeper results.

Parameters:
- query: Be specific — "Best Picture Oscar 2026" not "oscars"
- topic: "news" for current events/awards, "finance" for box office, "general" for everything else
- timeRange: "day"/"week"/"month"/"year" — use for recency-sensitive queries
- includeDomains/excludeDomains: Filter specific sources

Returns: Up to 5 results with title, url, content snippet, relevance score, favicon, images (with descriptions). Plus a synthesized answer and top images.

Use [SOURCE:url|title] tags to cite 2-4 best sources in your response.
Use [WEB_IMAGE:url|description] tags to surface 0-2 relevant images (only when description indicates clear visual value).`,
    schema: webSearchSchema,
  }
);
