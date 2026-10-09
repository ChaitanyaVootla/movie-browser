"use client";

import { useCallback, useEffect, useState } from "react";
import type { HoverCardData } from "@/server/actions/hover-card";
import { evictHoverCardData, fetchHoverCardData } from "./hover-data-cache";

/** A server action that hasn't answered by now is treated as failed (ms). */
export const PREVIEW_FETCH_TIMEOUT_MS = 8000;

export type PreviewDataState =
  | { status: "loading" }
  | { status: "ready"; data: HoverCardData }
  | { status: "error" };

/**
 * Hover-preview data with an explicit failure state. The old preview and
 * drawer rendered the skeleton whenever `data` was null, so a fetch that
 * resolved `null` (unknown title, server error) or never resolved showed a
 * skeleton forever. Now: null / rejection / timeout → `error`, and `retry()`
 * evicts the cache entry and fetches again.
 */
export function usePreviewData(id: number | null, mediaType: "movie" | "series") {
  const [attempt, setAttempt] = useState(0);
  const key = id == null ? null : `${mediaType}:${id}:${attempt}`;
  const [result, setResult] = useState<{ key: string; state: PreviewDataState } | null>(null);

  useEffect(() => {
    if (id == null || key == null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setResult({ key, state: { status: "error" } });
    }, PREVIEW_FETCH_TIMEOUT_MS);

    fetchHoverCardData(id, mediaType).then((data) => {
      clearTimeout(timer);
      if (cancelled) return;
      setResult({ key, state: data ? { status: "ready", data } : { status: "error" } });
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, mediaType, key]);

  const retry = useCallback(() => {
    if (id == null) return;
    evictHoverCardData(id, mediaType);
    setAttempt((a) => a + 1);
  }, [id, mediaType]);

  const state: PreviewDataState =
    result && result.key === key ? result.state : { status: "loading" };

  return { state, retry };
}
