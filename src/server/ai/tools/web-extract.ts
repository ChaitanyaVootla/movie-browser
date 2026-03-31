/**
 * Web Extract Tool
 *
 * Extracts content from specific URLs via Tavily API.
 * Use after web_search finds relevant URLs that need full content (reviews, articles).
 *
 * Credit cost: 1 per 5 URLs (basic).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { aiToolLogger } from "@/lib/logger";
import { tavilyExtract, TavilyConfigError } from "./tavily-client";

const MAX_CONTENT_LENGTH = 2000;
const MAX_URLS = 5;

const webExtractSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .max(MAX_URLS)
    .describe(`URLs to extract content from (max ${MAX_URLS}). Get URLs from web_search results.`),
  extractDepth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe("'basic' (default, cheaper) or 'advanced' (better extraction for complex pages). Use advanced sparingly."),
});

type WebExtractInput = z.infer<typeof webExtractSchema>;

/**
 * Truncate extracted content to a max length.
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trimEnd() + "...";
}

export const webExtractTool = tool(
  async (input: WebExtractInput) => {
    try {
      const urls = input.urls.slice(0, MAX_URLS);

      const response = await tavilyExtract({
        urls,
        extractDepth: input.extractDepth ?? "basic",
      });

      // Format successful extractions — truncate content to save tokens
      const results = (response.results || []).map((r) => ({
        url: r.url,
        content: truncateContent(r.rawContent || "", MAX_CONTENT_LENGTH),
        images: r.images?.slice(0, 5),
        favicon: r.favicon,
      }));

      // Include failed URLs so the agent knows what didn't work
      const failedUrls = (response.failedResults || []).map((f) => ({
        url: f.url,
        error: f.error,
      }));

      return JSON.stringify({
        extracted: results,
        failed: failedUrls,
        totalRequested: urls.length,
        totalExtracted: results.length,
        totalFailed: failedUrls.length,
      });
    } catch (error: unknown) {
      if (error instanceof TavilyConfigError) {
        return JSON.stringify({
          error: error.message,
          extracted: [],
          failed: input.urls.map((url) => ({ url, error: "API not configured" })),
        });
      }

      const message = error instanceof Error ? error.message : String(error);

      aiToolLogger.error({
        event: "tool_error",
        tool: "web_extract",
        urls: input.urls,
        error: message,
      });

      return JSON.stringify({
        error: "Content extraction failed. The URL may be inaccessible or blocking extraction.",
        extracted: [],
        failed: input.urls.map((url) => ({ url, error: message })),
      });
    }
  },
  {
    name: "web_extract",
    description: `Extract full content from specific URLs. Use after web_search finds a URL with relevant content (article, review, interview).

Use when: You found a URL via web_search and need the full article content (reviews, interviews, detailed reports).
Don't use when: You just need quick facts — the web_search snippets and answer are usually sufficient.

IMPORTANT: Default to basic extractDepth. Only use advanced for pages with complex layouts.

Parameters:
- urls: 1-5 URLs to extract (get these from web_search results)
- extractDepth: "basic" (default) or "advanced" (for complex pages)

Returns: Extracted content per URL (truncated to ~2000 chars), images, favicon. Failed URLs are listed separately.

Use [SOURCE:url|title] to cite the extracted content in your response.`,
    schema: webExtractSchema,
  }
);
