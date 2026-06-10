/**
 * useAnalytics Hook
 *
 * Client-side hook for tracking user actions and interactions.
 * Provides a simple API for tracking common user actions like
 * watchlist changes, ratings, clicks, etc.
 *
 * Features:
 * - Type-safe action tracking
 * - Automatic session handling
 * - Respects DNT
 * - Batches events for performance
 */

import { useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
// Import only from client-safe modules (avoid context.ts which imports server-only auth)
import type { ActionType } from "@/lib/analytics/types";

// =============================================================================
// Types
// =============================================================================

interface UserActionEvent {
  event_type: "user_action";
  action: ActionType;
  media_type: "movie" | "series" | null;
  item_id: number | null;
  item_title: string | null;
  metadata: Record<string, unknown>;
}

interface TrackActionOptions {
  action: ActionType;
  mediaType?: "movie" | "series";
  itemId?: number;
  itemTitle?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if Do Not Track is enabled
 */
function isDNTEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.doNotTrack === "1";
}

/**
 * Send batched events to the analytics API
 */
async function sendBatch(events: UserActionEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    await fetch("/api/analytics/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Automation signal: navigator.webdriver is true under Puppeteer/
        // Playwright/Selenium. Ingest marks such traffic as bot — UA strings
        // alone can't catch stealth headless browsers.
        "x-analytics-wd": typeof navigator !== "undefined" && navigator.webdriver ? "1" : "0",
      },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // Silently fail
  }
}

// =============================================================================
// Hook
// =============================================================================

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;

export function useAnalytics() {
  const { status } = useSession();
  const batchRef = useRef<UserActionEvent[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Flush pending events
   */
  const flush = useCallback(() => {
    if (batchRef.current.length > 0) {
      const events = [...batchRef.current];
      batchRef.current = [];
      sendBatch(events);
    }

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
  }, []);

  /**
   * Flush on unmount and visibility change
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, [flush]);

  /**
   * Track a user action
   */
  const trackAction = useCallback(
    (options: TrackActionOptions) => {
      // Respect Do Not Track
      if (isDNTEnabled()) return;

      // Wait for session to load
      if (status === "loading") return;

      const event: UserActionEvent = {
        event_type: "user_action",
        action: options.action,
        media_type: options.mediaType ?? null,
        item_id: options.itemId ?? null,
        item_title: options.itemTitle ?? null,
        metadata: options.metadata ?? {},
      };

      batchRef.current.push(event);

      // Flush if batch size reached
      if (batchRef.current.length >= BATCH_SIZE) {
        flush();
        return;
      }

      // Set up delayed flush if not already scheduled
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
      }
    },
    [status, flush]
  );

  // =============================================================================
  // Convenience Methods
  // =============================================================================

  const trackWatchlistAdd = useCallback(
    (itemId: number, mediaType: "movie" | "series", title?: string) => {
      trackAction({
        action: "watchlist_add",
        mediaType,
        itemId,
        itemTitle: title,
      });
    },
    [trackAction]
  );

  const trackWatchlistRemove = useCallback(
    (itemId: number, mediaType: "movie" | "series", title?: string) => {
      trackAction({
        action: "watchlist_remove",
        mediaType,
        itemId,
        itemTitle: title,
      });
    },
    [trackAction]
  );

  const trackRating = useCallback(
    (
      itemId: number,
      mediaType: "movie" | "series",
      rating: "like" | "dislike" | "remove",
      title?: string
    ) => {
      const actionMap = {
        like: "rate_like" as const,
        dislike: "rate_dislike" as const,
        remove: "rate_remove" as const,
      };

      trackAction({
        action: actionMap[rating],
        mediaType,
        itemId,
        itemTitle: title,
      });
    },
    [trackAction]
  );

  const trackWatched = useCallback(
    (itemId: number, mediaType: "movie" | "series", marked: boolean, title?: string) => {
      trackAction({
        action: marked ? "mark_watched" : "unmark_watched",
        mediaType,
        itemId,
        itemTitle: title,
      });
    },
    [trackAction]
  );

  const trackWatchClick = useCallback(
    (itemId: number, mediaType: "movie" | "series", provider: string, title?: string) => {
      trackAction({
        action: "watch_click",
        mediaType,
        itemId,
        itemTitle: title,
        metadata: { provider },
      });
    },
    [trackAction]
  );

  const trackTrailerPlay = useCallback(
    (itemId: number, mediaType: "movie" | "series", title?: string) => {
      trackAction({
        action: "trailer_play",
        mediaType,
        itemId,
        itemTitle: title,
      });
    },
    [trackAction]
  );

  const trackSearch = useCallback(
    (query: string, resultCount?: number) => {
      trackAction({
        action: "search_submit",
        metadata: {
          query: query.slice(0, 100), // Truncate long queries
          resultCount,
        },
      });
    },
    [trackAction]
  );

  const trackFilterApply = useCallback(
    (filters: Record<string, unknown>) => {
      trackAction({
        action: "filter_apply",
        metadata: filters,
      });
    },
    [trackAction]
  );

  const trackAIChatOpen = useCallback(() => {
    trackAction({
      action: "ai_chat_open",
    });
  }, [trackAction]);

  const trackAIChatSubmit = useCallback(
    (query: string) => {
      trackAction({
        action: "ai_chat_submit",
        metadata: {
          query: query.slice(0, 100),
        },
      });
    },
    [trackAction]
  );

  const trackShareClick = useCallback(
    (
      itemId: number,
      mediaType: "movie" | "series" | "person",
      platform: string,
      title?: string
    ) => {
      trackAction({
        action: "share_click",
        mediaType: mediaType === "person" ? undefined : mediaType,
        itemId,
        itemTitle: title,
        metadata: { platform },
      });
    },
    [trackAction]
  );

  const trackExternalLink = useCallback(
    (url: string, source?: string) => {
      trackAction({
        action: "external_link",
        metadata: {
          url: url.slice(0, 500),
          source,
        },
      });
    },
    [trackAction]
  );

  return {
    trackAction,
    trackWatchlistAdd,
    trackWatchlistRemove,
    trackRating,
    trackWatched,
    trackWatchClick,
    trackTrailerPlay,
    trackSearch,
    trackFilterApply,
    trackAIChatOpen,
    trackAIChatSubmit,
    trackShareClick,
    trackExternalLink,
    flush,
  };
}
