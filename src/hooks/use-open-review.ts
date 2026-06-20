"use client";

import { useEffect } from "react";
import type { MediaType } from "@/stores/user";

/**
 * Decoupled bridge so the action-bar "Write a review" entry (inside the Rate
 * panel) can open the review composer, which lives in `OwnReviewSlot` further
 * down the page. A window CustomEvent avoids threading composer state across
 * the whole detail render tree.
 */
const EVENT = "mb:open-review";

interface OpenReviewDetail {
  mediaType: MediaType;
  itemId: number;
}

export function emitOpenReview(mediaType: MediaType, itemId: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenReviewDetail>(EVENT, { detail: { mediaType, itemId } }));
}

/** Fires `onOpen` when an open-review event targets this (mediaType, itemId). */
export function useOpenReview(
  mediaType: MediaType,
  itemId: number,
  onOpen: () => void
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenReviewDetail>).detail;
      if (detail && detail.mediaType === mediaType && detail.itemId === itemId) onOpen();
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [mediaType, itemId, onOpen]);
}
