/**
 * SSE Enrichment Status Endpoint
 *
 * GET /api/[mediaType]/[id]/enrich
 *
 * Streams enrichment status updates as Server-Sent Events.
 * Observes PG state changes (ratings timestamps, AI data existence)
 * and pushes updates to the client. Does NOT trigger enrichment directly —
 * the Server Component page render handles that via hydration.
 *
 * Events:
 * - { type: "status", refreshing: boolean }
 * - { type: "ratings", data: {...} }
 * - { type: "ai", data: {...} }
 * - { type: "done" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { getAIData, type AIDataResponse } from "@/server/services/ai-data-service";
import { apiLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

// =============================================================================
// Constants
// =============================================================================

/** Interval between PG polls (ms) */
const POLL_INTERVAL_MS = 3_000;

/** Maximum duration before closing the stream (ms) */
const MAX_POLL_DURATION_MS = 120_000;

// =============================================================================
// Validation
// =============================================================================

const ParamsSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  id: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().positive()),
});

// =============================================================================
// Helpers
// =============================================================================

const log = apiLogger.child({ route: "enrich-sse" });

interface RatingsSnapshot {
  ratingsScrapedAt: Date | null;
  ratings: RatingData[];
}

interface RatingData {
  score: number;
  voteCount: number | null;
  certified: boolean | null;
  consensus: string | null;
  sentiment: string | null;
  sourceUrl: string | null;
  source: {
    slug: string;
    name: string;
    maxScore: number | null;
  };
}

/**
 * Fetch current ratings state from PG
 */
async function getRatingsSnapshot(
  mediaType: "movie" | "series",
  id: number
): Promise<RatingsSnapshot> {
  const table = mediaType === "movie" ? "movie" : "series";
  const item = await (prisma[table] as typeof prisma.movie).findUnique({
    where: { id },
    select: {
      ratingsScrapedAt: true,
      ratings: {
        include: { source: true },
      },
    },
  });

  if (!item) {
    return { ratingsScrapedAt: null, ratings: [] };
  }

  return {
    ratingsScrapedAt: item.ratingsScrapedAt,
    ratings: item.ratings.map((r) => ({
      score: r.score,
      voteCount: r.voteCount,
      certified: r.certified,
      consensus: r.consensus,
      sentiment: r.sentiment,
      sourceUrl: r.sourceUrl,
      source: {
        slug: r.source.slug,
        name: r.source.name,
        maxScore: r.source.maxScore,
      },
    })),
  };
}

/**
 * Check if AI data exists for the item
 */
async function checkAIData(
  mediaType: "movie" | "series",
  id: number
): Promise<AIDataResponse | null> {
  return getAIData(id, mediaType);
}

// =============================================================================
// Route Handler
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaType: string; id: string }> }
) {
  // Validate params
  const resolvedParams = await params;
  const parsed = ParamsSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid media type or ID" }, { status: 400 });
  }

  const { mediaType, id } = parsed.data;

  log.debug({ mediaType, id }, "SSE enrichment stream opened");

  // Capture initial state
  const initialRatings = await getRatingsSnapshot(mediaType, id);
  const initialAI = await checkAIData(mediaType, id);

  // Ratings are "settled" once a scrape has been ATTEMPTED (ratingsScrapedAt set),
  // even if it returned zero ratings — many titles legitimately have none, and no
  // further ratings will appear without a new hydration cycle. Keying on the
  // timestamp (not ratings.length) avoids polling a pointless 120s and holding the
  // page in a "refreshing" state on every revisit to a no-ratings title.
  const ratingsSettled = initialRatings.ratingsScrapedAt !== null;
  const hasAI = initialAI !== null;

  if (ratingsSettled && hasAI) {
    log.debug({ mediaType, id }, "All data fresh, sending done immediately");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", refreshing: false })}\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Stream with polling
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      const abortSignal = request.signal;
      let closed = false;

      const close = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      };

      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Send initial status
      send({ type: "status", refreshing: true });

      // Track what we've already sent
      let sentRatings = ratingsSettled;
      let sentAI = hasAI;
      let lastRatingsScrapedAt = initialRatings.ratingsScrapedAt?.getTime() ?? 0;

      const startTime = Date.now();

      const poll = async () => {
        if (closed || abortSignal.aborted) {
          close();
          return;
        }

        // Check if we've exceeded max duration
        if (Date.now() - startTime >= MAX_POLL_DURATION_MS) {
          log.debug({ mediaType, id }, "SSE max duration reached, closing");
          send({ type: "done" });
          close();
          return;
        }

        try {
          // Check for ratings changes
          if (!sentRatings) {
            const currentRatings = await getRatingsSnapshot(mediaType, id);
            const currentScrapedAt = currentRatings.ratingsScrapedAt?.getTime() ?? 0;

            if (currentScrapedAt > lastRatingsScrapedAt && currentRatings.ratings.length > 0) {
              lastRatingsScrapedAt = currentScrapedAt;
              sentRatings = true;
              send({
                type: "ratings",
                data: {
                  ratings: currentRatings.ratings,
                  scrapedAt: currentRatings.ratingsScrapedAt?.toISOString() ?? null,
                },
              });
            }
          }

          // Check for AI data appearance
          if (!sentAI) {
            const currentAI = await checkAIData(mediaType, id);
            if (currentAI) {
              sentAI = true;
              send({
                type: "ai",
                data: {
                  hook: currentAI.hook,
                  mood: currentAI.mood,
                  insights: currentAI.insights,
                  generatedAt: currentAI.generatedAt?.toISOString() ?? null,
                },
              });
            }
          }

          // If both sent, we're done
          if (sentRatings && sentAI) {
            send({ type: "done" });
            close();
            return;
          }

          // Schedule next poll
          if (!closed && !abortSignal.aborted) {
            setTimeout(poll, POLL_INTERVAL_MS);
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          log.error({ mediaType, id, error: message }, "SSE poll error");
          send({ type: "done" });
          close();
        }
      };

      // Listen for client disconnect
      abortSignal.addEventListener("abort", () => {
        log.debug({ mediaType, id }, "SSE client disconnected");
        close();
      });

      // Start polling after initial delay
      setTimeout(poll, POLL_INTERVAL_MS);
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
