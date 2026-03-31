"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// =============================================================================
// Types
// =============================================================================

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

interface RatingsEventData {
  ratings: RatingData[];
  scrapedAt: string | null;
}

interface MoodData {
  pacing: string | null;
  intensity: string | null;
  tone: string | null;
  emotional: string | null;
}

interface InsightItem {
  subcategory: string;
  text: string;
}

interface DeepDiveItem extends InsightItem {
  spoilerLevel: string;
}

interface AIEventData {
  hook: string | null;
  mood: MoodData | null;
  insights: {
    spoilerFree: {
      vibes: string[];
      themes: string[];
      bestFor: InsightItem[];
      highlights: InsightItem[];
      headsUp: InsightItem[];
      questions: string[];
    };
    spoilerContent: {
      questions: string[];
      deepDive: DeepDiveItem[];
    };
  };
  generatedAt: string | null;
}

interface SSEEvent {
  type: "status" | "ratings" | "ai" | "done";
  refreshing?: boolean;
  data?: RatingsEventData | AIEventData;
}

export interface EnrichmentStreamState {
  isRefreshing: boolean;
  latestRatings: RatingsEventData | null;
  latestAI: AIEventData | null;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for consuming SSE enrichment status updates.
 *
 * Connects to GET /api/[mediaType]/[id]/enrich and returns
 * reactive state as ratings and AI data become available.
 *
 * Uses EventSource (GET-only, simpler than fetch+ReadableStream).
 * Auto-closes on `done` event or component unmount.
 * No reconnection — if connection drops, data will be available on next visit.
 */
export function useEnrichmentStream(
  mediaType: "movie" | "series",
  id: number
): EnrichmentStreamState {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latestRatings, setLatestRatings] = useState<RatingsEventData | null>(null);
  const [latestAI, setLatestAI] = useState<AIEventData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const connectedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Guard: only connect once per mount
    if (connectedRef.current) return;
    connectedRef.current = true;

    const url = `/api/${mediaType}/${id}/enrich`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const parsed: SSEEvent = JSON.parse(event.data as string);

        switch (parsed.type) {
          case "status":
            setIsRefreshing(parsed.refreshing ?? true);
            break;

          case "ratings":
            setLatestRatings(parsed.data as RatingsEventData);
            break;

          case "ai":
            setLatestAI(parsed.data as AIEventData);
            // Re-render server components so all AI sections appear
            // (only LiveAIHook + LiveAISections update via state;
            // themes, mood, bestFor, highlights etc. are server-rendered)
            router.refresh();
            break;

          case "done":
            setIsRefreshing(false);
            cleanup();
            break;
        }
      } catch {
        // Ignore JSON parse errors
      }
    };

    es.onerror = () => {
      // EventSource errors are not recoverable in our design.
      // Data will be available on next page visit.
      setIsRefreshing(false);
      cleanup();
    };

    return () => {
      cleanup();
    };
  }, [mediaType, id, cleanup]);

  return { isRefreshing, latestRatings, latestAI };
}
