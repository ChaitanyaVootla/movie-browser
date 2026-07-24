/**
 * Community Buzz Tool
 *
 * What THIS site's community thinks of a title: rating histogram, public
 * reviews, and discussion activity. Reads ONLY the anon-safe tier
 * (PUBLISHED + public + spoilerScope NONE) — never spoiler-gated bodies.
 * Cheap PG reads; no AI, no external APIs, no credits.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPublicReviews } from "@/server/db/postgres/social/reviews";
import { getRatingHistogram, getScoresForUsers } from "@/server/db/postgres/social/ratings";
import { getPublishedCommentCountsForType } from "@/server/db/postgres/comments";
import { aiToolLogger } from "@/lib/logger";

const REVIEW_LIMIT = 5;
const EXCERPT_LENGTH = 280;

/**
 * Strip rich-text tokens for LLM consumption:
 * - `[spoiler]...[/spoiler]` inline marks → redacted (belt-and-braces; the
 *   NONE-scope tier shouldn't carry plot spoilers, but inline marks can)
 * - `[[movie:123|Name]]` entity mentions → plain Name
 */
function sanitizeReviewBody(body: string): string {
  const cleaned = body
    .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, "[spoiler hidden]")
    .replace(/\[\[[\w]+:[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= EXCERPT_LENGTH) return cleaned;
  return cleaned.slice(0, EXCERPT_LENGTH).trimEnd() + "...";
}

const communitySchema = z.object({
  id: z.number().describe("TMDB movie or series ID (from search/discover/get_page_context)"),
  mediaType: z.enum(["movie", "series"]).describe("Content type"),
  seasonNumber: z
    .number()
    .optional()
    .describe("Season number for season-level reviews (series only, omit for the whole series)"),
});

type CommunityInput = z.infer<typeof communitySchema>;

export const getCommunityBuzzTool = tool(
  async (input: CommunityInput) => {
    try {
      const anchor =
        input.mediaType === "movie"
          ? { movieId: input.id }
          : { seriesId: input.id, seasonNumber: input.seasonNumber ?? null };

      const [histogram, reviewPage, commentCounts] = await Promise.all([
        getRatingHistogram(anchor),
        getPublicReviews({ ...anchor, limit: REVIEW_LIMIT }),
        getPublishedCommentCountsForType(input.mediaType, [input.id]),
      ]);

      // Attach each reviewer's canonical score (reviews and ratings are separate records)
      const reviewerIds = reviewPage.reviews.map((r) => r.userId);
      const scores = await getScoresForUsers(reviewerIds, input.id, input.mediaType);

      const reviews = reviewPage.reviews.map((r) => {
        const score = scores.get(r.userId);
        return {
          author: r.user.username || r.user.name || "Anonymous",
          ...(score ? { stars: score / 2 } : {}),
          ...(r.title ? { title: r.title } : {}),
          excerpt: sanitizeReviewBody(r.body),
          likes: r.likeCount,
        };
      });

      const discussionComments = commentCounts[input.id] ?? 0;

      if (histogram.total === 0 && reviews.length === 0 && discussionComments === 0) {
        return JSON.stringify({
          id: input.id,
          mediaType: input.mediaType,
          activity: "none",
          hint: "No community activity on this title yet. Fall back to external ratings ([RATINGS] tag) or your own take.",
        });
      }

      return JSON.stringify({
        id: input.id,
        mediaType: input.mediaType,
        ...(input.seasonNumber != null ? { seasonNumber: input.seasonNumber } : {}),
        communityRating:
          histogram.total > 0
            ? {
                // buckets are 1-10 half-star scores; present as /5 stars for readability
                averageStars: histogram.average ? Math.round((histogram.average / 2) * 10) / 10 : null,
                ratingsCount: histogram.total,
              }
            : null,
        reviews,
        discussionComments,
        hint:
          discussionComments > 0
            ? "There's an active discussion — offer to take them there with navigate_to (movie_discussions/series_discussions)."
            : undefined,
      });
    } catch (error: unknown) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "get_community_buzz",
        id: input.id,
        mediaType: input.mediaType,
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Failed to fetch community activity",
        hint: "Fall back to external ratings via the [RATINGS] tag.",
      });
    }
  },
  {
    name: "get_community_buzz",
    description: `What THIS app's community thinks of a title: member ratings, written reviews, and discussion activity.

Use when: "What do people think of X?", "Any reviews for X?", "Is X worth watching?" (alongside get_details), or to add social proof to a recommendation.
Don't use when: You need professional critic scores (IMDb/RT — use get_details + [RATINGS] tag) or external news/reception (web_search).

Prefer this over web_search for audience reception — it's free, instant, and it's OUR community.

Parameters:
- id + mediaType: from search/discover/get_page_context
- seasonNumber: optional, for season-level reviews of a series

Returns: communityRating (average stars out of 5 + count), up to 5 public spoiler-free reviews (author, stars, excerpt, likes), discussionComments count.
If there's an active discussion, mention it and offer to navigate them there (navigate_to movie_discussions/series_discussions).
Quote or paraphrase the best review lines — with attribution — to make recs feel alive.`,
    schema: communitySchema,
  }
);
