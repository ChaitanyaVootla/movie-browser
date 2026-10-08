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
 * Stale-HTML self-heal (Oct 2026): the page HTML is ISR + Cloudflare cached
 * for up to ~2h, so it can be OLDER than PG (e.g. it was cached before the
 * background refresh wrote ratings that this very stream then showed live).
 * Every stream therefore opens with a `ratings` snapshot of what PG holds now
 * (one indexed read we already do), and the client swaps it in when it
 * differs from the HTML. AI is bigger and only sent on request:
 * `?once=1&ai=1` = one-shot snapshot (ratings + AI if present), no polling —
 * opened by LiveAISections/LiveAIHook only when the HTML had no AI.
 * Neither path triggers hydration/scrapes; both are pure PG reads.
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

function ratingsEvent(snapshot: RatingsSnapshot): Record<string, unknown> | null {
  if (snapshot.ratings.length === 0) return null;
  return {
    type: "ratings",
    data: {
      ratings: snapshot.ratings,
      scrapedAt: snapshot.ratingsScrapedAt?.toISOString() ?? null,
    },
  };
}

function aiEvent(ai: AIDataResponse): Record<string, unknown> {
  return {
    type: "ai",
    data: {
      hook: ai.hook,
      mood: ai.mood,
      insights: ai.insights,
      generatedAt: ai.generatedAt?.toISOString() ?? null,
    },
  };
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
  const once = request.nextUrl.searchParams.get("once") === "1";
  const wantAI = request.nextUrl.searchParams.get("ai") === "1";

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
  const snapshotEvent = ratingsEvent(initialRatings);

  if (once || (ratingsSettled && hasAI)) {
    log.debug({ mediaType, id, once }, "Sending PG snapshot + done immediately");
    const encoder = new TextEncoder();
    const events: Record<string, unknown>[] = [];
    if (snapshotEvent) events.push(snapshotEvent);
    if (wantAI && initialAI) events.push(aiEvent(initialAI));
    events.push({ type: "done", refreshing: false });
    const stream = new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
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
      // Current PG ratings up front — corrects a stale cached HTML copy even
      // when no further change arrives during this stream.
      if (snapshotEvent) send(snapshotEvent);

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
              const ev = ratingsEvent(currentRatings);
              if (ev) send(ev);
            }
          }

          // Check for AI data appearance
          if (!sentAI) {
            const currentAI = await checkAIData(mediaType, id);
            if (currentAI) {
              sentAI = true;
              send(aiEvent(currentAI));
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
